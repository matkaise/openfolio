"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { ProjectData, createEmptyProject } from '@/types/domain';
import { CurrencyService } from '@/lib/currencyService';
import {
    applySecurityPatches,
    removeLegacySplitTransactions,
    syncSecurityPatches,
    type MarketSyncProgress
} from '@/lib/marketDataService';
import { createRevisionTracker } from '@/lib/state/revisionTracker';
import { createBeforeUnloadHandler } from '@/lib/state/unloadGuard';
import {
    isSqliteFileName,
    openProjectFile,
    serializeProjectForFile,
    type ProjectEncryptionStatus,
    type SqliteProjectSession
} from '@/lib/projectPersistence';
import { createProjectKey, type ProjectEncryptionKey } from '@/lib/projectCrypto';
import { downloadFile, pickFileWithInput, supportsFileSystemAccess } from '@/lib/fileAccess';
import { useNotifications } from '@/components/ui/notifications';
import { createLogger } from '@/lib/logger';

const log = createLogger('Project');

const ensurePortfoliosFromData = (project: ProjectData): ProjectData => {
    if ((project.portfolios || []).length > 0) {
        return project;
    }

    const discoveredIds: string[] = [];
    const pushId = (id?: string) => {
        if (!id) return;
        if (!discoveredIds.includes(id)) discoveredIds.push(id);
    };

    (project.transactions || []).forEach((tx) => pushId(tx.portfolioId));
    (project.cashAccounts || []).forEach((account) => pushId(account.portfolioId));
    (project.cashMovements || []).forEach((movement) => pushId(movement.portfolioId));

    if (discoveredIds.length === 0) {
        return project;
    }

    const rebuiltPortfolios = discoveredIds.map((id, index) => ({
        id,
        name: `Depot ${index + 1}`
    }));

    log.warn(`Portfolios were missing in loaded data. Rebuilt ${rebuiltPortfolios.length} entries from transaction/cash references.`);

    return {
        ...project,
        portfolios: rebuiltPortfolios
    };
};

interface ProjectContextType {
    project: ProjectData | null;
    isLoaded: boolean;
    isModified: boolean;
    fileName: string | null;
    marketSyncProgress: MarketSyncProgress | null;
    isHydratingProject: boolean;
    /** 'legacy-unencrypted' means the file on disk is still plain text until the next save. */
    encryptionStatus: ProjectEncryptionStatus;
    /** When the project was last written to (or read from) its file in this session. */
    lastSavedAt: string | null;

    // Actions
    newProject: (options?: { name?: string; password?: string }) => Promise<void>;
    openProject: (options?: {
        requestPassword?: (reason: 'required' | 'invalid') => Promise<string | null>;
    }) => Promise<void>;
    saveProject: () => Promise<void>;
    saveProjectAs: () => Promise<void>;
    /** Resolves false if the user kept the project open. */
    closeProject: () => Promise<boolean>;

    // Data Mutation
    updateProject: (updater: (prev: ProjectData) => ProjectData) => void;

    // Sync
    syncFx: () => Promise<void>;
    syncMarket: (force?: boolean, options?: { full?: boolean; projectOverride?: ProjectData }) => Promise<void>;
    syncAll: (forceMarket?: boolean) => Promise<void>;
    isSyncing: boolean;
    isMarketSyncing: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const { notify, confirm } = useNotifications();
    const [project, setProject] = useState<ProjectData | null>(null);
    const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isModified, setIsModified] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isMarketSyncing, setIsMarketSyncing] = useState(false);
    const [marketSyncProgress, setMarketSyncProgress] = useState<MarketSyncProgress | null>(null);
    const [isHydratingProject, setIsHydratingProject] = useState(false);
    const [encryptionStatus, setEncryptionStatus] = useState<ProjectEncryptionStatus>('none');
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

    const sqliteSessionRef = useRef<SqliteProjectSession | null>(null);
    // Derived AES key (non-extractable). The password itself is never kept.
    const encryptionKeyRef = useRef<ProjectEncryptionKey | null>(null);
    // Counts changes so a save that overlaps an edit does not mark the project as saved.
    const revisionsRef = useRef(createRevisionTracker());

    // Ask before closing the tab with unsaved changes. No autosave draft in browser storage:
    // it would keep a plain-text copy of encrypted projects.
    useEffect(() => {
        if (!isModified) return;
        const handler = createBeforeUnloadHandler(() => true);
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isModified]);

    const markChanged = useCallback(() => {
        revisionsRef.current.bump();
        setIsModified(true);
    }, []);

    const setSqliteSession = useCallback((nextSession: SqliteProjectSession | null) => {
        if (sqliteSessionRef.current === nextSession) return;
        if (sqliteSessionRef.current) {
            sqliteSessionRef.current.close();
        }
        sqliteSessionRef.current = nextSession;
    }, []);

    const setEncryptionKey = useCallback((nextKey: ProjectEncryptionKey | null) => {
        encryptionKeyRef.current = nextKey;
    }, []);

    const serializeForSave = useCallback(async (targetName: string, data: ProjectData) => {
        if (encryptionKeyRef.current && !isSqliteFileName(targetName)) {
            throw new Error('Verschluesselte Projekte koennen nur als .openfolio/.sqlite gespeichert werden.');
        }
        const serialized = await serializeProjectForFile(
            targetName,
            data,
            sqliteSessionRef.current,
            encryptionKeyRef.current
        );
        setSqliteSession(serialized.sqliteSession);
        return serialized.data;
    }, [setSqliteSession]);

    const writeToHandle = useCallback(async (handle: FileSystemFileHandle, data: ProjectData) => {
        // Serialize before opening the file, so a serialization error leaves the file untouched.
        const serializedData = await serializeForSave(handle.name, data);
        const serialized = { data: serializedData };

        const writable = await handle.createWritable();
        try {
            if (typeof serialized.data === 'string') {
                await writable.write(serialized.data);
            } else {
                const bytes = new Uint8Array(serialized.data.byteLength);
                bytes.set(serialized.data);
                await writable.write(new Blob([bytes]));
            }
            await writable.close();
        } catch (error) {
            // Discard the partial write; the file keeps its previous content.
            await writable.abort().catch(() => undefined);
            throw error;
        }
        setEncryptionStatus(encryptionKeyRef.current ? 'encrypted' : 'none');
    }, [serializeForSave]);

    // Helper to perform sync on a given project data state
    const performSync = useCallback(async (currentProject: ProjectData) => {
        setIsSyncing(true);
        try {
            log.info('Auto-syncing FX rates...');
            const newFxData = await CurrencyService.syncRates(currentProject.fxData);

            if (newFxData.lastUpdated !== currentProject.fxData.lastUpdated) {
                setProject((prev) => prev ? ({
                    ...prev,
                    fxData: newFxData,
                    modified: new Date().toISOString()
                }) : null);
                markChanged();
                log.info('FX Sync completed. Updated to:', newFxData.lastUpdated);
            } else {
                log.info('FX Sync completed. No new data.');
            }
        } catch (e) {
            log.error('FX Sync failed', e);
        } finally {
            setIsSyncing(false);
        }
    }, [markChanged]);

    const performMarketSync = useCallback(async (currentProject: ProjectData, force: boolean = false, full: boolean = false) => {
        setIsMarketSyncing(true);
        setMarketSyncProgress({ current: 0, total: 0, stage: 'start' });
        try {
            log.info('Auto-syncing market data...');
            const patches = await syncSecurityPatches(currentProject, force, (progress) => {
                setMarketSyncProgress(progress);
            }, full ? { maxPerRun: 0, maxTimeMs: 0 } : undefined);
            if (Object.keys(patches).length > 0) {
                // A full sync can take minutes: apply the results to the current state so edits
                // made meanwhile (new transactions, ticker mappings) survive.
                setProject((prev) => {
                    if (!prev || prev.id !== currentProject.id) return prev;
                    return {
                        ...applySecurityPatches(prev, patches, currentProject.securities),
                        modified: new Date().toISOString()
                    };
                });
                markChanged();
                log.info('Market sync completed.');
            } else {
                log.info('Market sync completed. No new data.');
            }
        } catch (e) {
            log.error('Market sync failed', e);
        } finally {
            setIsMarketSyncing(false);
            setMarketSyncProgress(null);
        }
    }, [markChanged]);

    const newProject = useCallback(async (options?: { name?: string; password?: string }) => {
        const created = createEmptyProject(options?.name || 'Mein Portfolio');
        setProject(created);
        setLastSavedAt(null);
        setFileHandle(null);
        setFileName('Unbenannt.openfolio');
        setIsModified(true);
        setIsHydratingProject(false);
        setSqliteSession(null);

        const password = options?.password?.trim();
        setEncryptionKey(password ? await createProjectKey(password) : null);
        setEncryptionStatus(password ? 'encrypted' : 'none');

        void performSync(created);
    }, [performSync, setEncryptionKey, setSqliteSession]);

    const openProject = useCallback(async (options?: {
        requestPassword?: (reason: 'required' | 'invalid') => Promise<string | null>;
    }) => {
        try {
            let handle: FileSystemFileHandle | null = null;
            let file: File;
            if (supportsFileSystemAccess()) {
                // @ts-expect-error File System Access API types might need polyfill
                [handle] = await window.showOpenFilePicker({
                    types: [
                        {
                            description: 'Openfolio Projekt',
                            accept: { 'application/x-openfolio-project': ['.openfolio'] }
                        }
                    ],
                    excludeAcceptAllOption: true,
                    multiple: false
                });
                file = await handle!.getFile();
            } else {
                // Firefox/Safari: no file handles; saving downloads a new copy
                const picked = await pickFileWithInput('.openfolio,.sqlite,.sqlite3,.db,.json');
                if (!picked) return;
                file = picked;
            }

            let opened;
            let passwordAttempt: string | undefined;

            while (true) {
                try {
                    opened = await openProjectFile(file, passwordAttempt);
                    break;
                } catch (error) {
                    const message = error instanceof Error ? error.message : '';
                    if (message === 'PASSWORD_REQUIRED' || message === 'INVALID_PASSWORD') {
                        const reason: 'required' | 'invalid' = message === 'INVALID_PASSWORD' ? 'invalid' : 'required';
                        if (!options?.requestPassword) throw new Error('Dieses Projekt braucht ein Passwort.');
                        const next = await options.requestPassword(reason);
                        if (next === null) {
                            return;
                        }
                        passwordAttempt = next;
                        continue;
                    }
                    throw error;
                }
            }

            const loaded = ensurePortfoliosFromData(opened.project);
            const data = removeLegacySplitTransactions(loaded);

            // Basic validation
            if (!data.version || !data.transactions) {
                throw new Error('Ungueltiges Dateiformat');
            }

            setSqliteSession(opened.sqliteSession);
            setEncryptionKey(opened.encryptionKey);
            setEncryptionStatus(opened.encryption);
            setProject(data);
            setFileHandle(handle);
            setFileName(file.name);
            setLastSavedAt(new Date(file.lastModified).toISOString());
            // A legacy file is still plain text on disk; flag it so the user saves (= encrypts) it.
            setIsModified(opened.encryption === 'legacy-unencrypted' || data !== loaded);

            if (opened.hasLazyPayload && opened.sqliteSession) {
                setIsHydratingProject(true);
                void opened.sqliteSession
                    .hydrateHeavyData(data)
                    .then((hydratedProject) => {
                        setProject((prev) => {
                            if (!prev || prev.id !== data.id) return prev;

                            const mergedSecurities = { ...prev.securities };
                            Object.entries(hydratedProject.securities || {}).forEach(([isin, hydratedSec]) => {
                                const currentSec = mergedSecurities[isin];
                                if (!currentSec) {
                                    mergedSecurities[isin] = hydratedSec;
                                    return;
                                }

                                const hasCurrentHistory = Boolean(
                                    currentSec.priceHistory && Object.keys(currentSec.priceHistory).length > 0
                                );

                                mergedSecurities[isin] = {
                                    ...hydratedSec,
                                    ...currentSec,
                                    priceHistory: hasCurrentHistory
                                        ? currentSec.priceHistory
                                        : (hydratedSec.priceHistory || currentSec.priceHistory || {})
                                };
                            });

                            const hasCurrentFxRates = Object.keys(prev.fxData?.rates || {}).length > 0;
                            return {
                                ...prev,
                                securities: mergedSecurities,
                                fxData: {
                                    ...hydratedProject.fxData,
                                    ...prev.fxData,
                                    rates: hasCurrentFxRates ? prev.fxData.rates : hydratedProject.fxData.rates
                                }
                            };
                        });
                        void performSync(hydratedProject);
                    })
                    .catch((error) => {
                        log.error('Failed to hydrate SQLite heavy payload', error);
                        void performSync(data);
                    })
                    .finally(() => {
                        setIsHydratingProject(false);
                    });
            } else {
                setIsHydratingProject(false);
                void performSync(data);
            }

        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
                return;
            }
            const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
            log.error('Failed to open project:', err);
            notify({ tone: 'error', title: 'Datei konnte nicht geöffnet werden', message });
        }
    }, [notify, performSync, setEncryptionKey, setSqliteSession]);

    const saveProjectAs = useCallback(async () => {
        if (!project) return;
        try {
            if (!supportsFileSystemAccess()) {
                // Firefox/Safari: save as a download
                const suggested = fileName || 'Portfolio.openfolio';
                const downloadName = isSqliteFileName(suggested) ? suggested : `${suggested.replace(/\.[^.]+$/, '')}.openfolio`;
                const modified = new Date().toISOString();
                const { clean } = await revisionsRef.current.save(async () => {
                    downloadFile(await serializeForSave(downloadName, { ...project, modified }), downloadName);
                });
                setFileName(downloadName);
                setEncryptionStatus(encryptionKeyRef.current ? 'encrypted' : 'none');
                setProject((prev) => prev ? { ...prev, modified } : prev);
                setLastSavedAt(modified);
                if (clean) setIsModified(false);
                return;
            }

            // @ts-expect-error File System Access API types might need polyfill
            const handle = await window.showSaveFilePicker({
                types: [
                    {
                        description: 'OpenFolio Projekt',
                        accept: { 'application/x-openfolio-project': ['.openfolio'] }
                    }
                ],
                excludeAcceptAllOption: true,
                suggestedName: fileName || 'Portfolio.openfolio'
            });

            const modified = new Date().toISOString();
            const { clean } = await revisionsRef.current.save(() => writeToHandle(handle, { ...project, modified }));

            setFileHandle(handle);
            setFileName(handle.name);
            // Keep edits made while writing; only the timestamp comes from the save.
            setProject((prev) => prev ? { ...prev, modified } : prev);
            setLastSavedAt(modified);
            if (clean) setIsModified(false);
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
                return;
            }
            const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
            log.error('Failed to save project:', err);
            notify({ tone: 'error', title: 'Speichern fehlgeschlagen', message });
        }
    }, [notify, project, fileName, writeToHandle, serializeForSave]);

    const saveProject = useCallback(async () => {
        if (!project) return;

        if (!fileHandle) {
            return saveProjectAs();
        }

        try {
            const modified = new Date().toISOString();
            const { clean } = await revisionsRef.current.save(() => writeToHandle(fileHandle, { ...project, modified }));

            setProject((prev) => prev ? { ...prev, modified } : prev);
            setLastSavedAt(modified);
            if (clean) setIsModified(false);
        } catch (err) {
            log.error('Failed to save directly:', err);
            const name = err && typeof err === 'object' && 'name' in err ? (err as { name?: string }).name : '';
            if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError' || name === 'InvalidStateError') {
                // Permission lost or file moved: ask for a new location
                void saveProjectAs();
                return;
            }
            const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
            notify({ tone: 'error', title: 'Speichern fehlgeschlagen', message });
        }
    }, [notify, project, fileHandle, saveProjectAs, writeToHandle]);

    const closeProject = useCallback(async () => {
        if (isModified) {
            const ok = await confirm({
                title: 'Projekt schließen?',
                message: 'Es gibt ungespeicherte Änderungen. Sie gehen beim Schließen verloren.',
                confirmLabel: 'Ohne Speichern schließen',
                tone: 'danger'
            });
            if (!ok) return false;
        }
        setProject(null);
        setFileHandle(null);
        setFileName(null);
        setIsModified(false);
        setIsHydratingProject(false);
        setSqliteSession(null);
        setEncryptionKey(null);
        setEncryptionStatus('none');
        return true;
    }, [confirm, isModified, setEncryptionKey, setSqliteSession]);

    const updateProject = useCallback((updater: (prev: ProjectData) => ProjectData) => {
        setProject((prev) => {
            if (!prev) return null;
            const newData = updater(prev);
            return newData;
        });
        markChanged();
    }, [markChanged]);

    // Public Sync Function (useCallback to keep stable reference)
    const syncFx = useCallback(async () => {
        if (project) {
            await performSync(project);
        } else {
            log.warn('Could not sync FX: No project loaded.');
        }
    }, [project, performSync]);

    const syncMarket = useCallback(async (force: boolean = false, options?: { full?: boolean; projectOverride?: ProjectData }) => {
        const target = options?.projectOverride || project;
        if (target) {
            await performMarketSync(target, force, Boolean(options?.full));
        } else {
            log.warn('Could not sync market data: No project loaded.');
        }
    }, [project, performMarketSync]);

    const syncAll = useCallback(async (forceMarket: boolean = false) => {
        if (!project) {
            log.warn('Could not sync: No project loaded.');
            return;
        }
        await Promise.all([
            performSync(project),
            performMarketSync(project, forceMarket, true)
        ]);
    }, [project, performSync, performMarketSync]);

    return (
        <ProjectContext.Provider value={{
            project,
            isLoaded: !!project,
            isModified,
            fileName,
            marketSyncProgress,
            isHydratingProject,
            encryptionStatus,
            lastSavedAt,
            newProject,
            openProject,
            saveProject,
            saveProjectAs,
            closeProject,
            updateProject,
            syncFx,
            syncMarket,
            syncAll,
            isSyncing,
            isMarketSyncing
        }}>
            {children}
        </ProjectContext.Provider>
    );
};
