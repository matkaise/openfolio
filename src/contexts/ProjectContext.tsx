"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ProjectData, createEmptyProject } from '@/types/domain';
import { CurrencyService } from '@/lib/currencyService';
import { applySecurityPatches, syncSecurityPatches } from '@/lib/marketDataService';
import { createProjectStore, type ProjectState, type ProjectStore } from '@/lib/state/projectStore';
import { createBeforeUnloadHandler } from '@/lib/state/unloadGuard';
import {
    isSqliteFileName,
    openProjectFile,
    serializeProjectForFile,
    type SqliteProjectSession
} from '@/lib/projectPersistence';
import { createProjectKey, type ProjectEncryptionKey } from '@/lib/projectCrypto';
import { downloadFile, pickFileWithInput, supportsFileSystemAccess } from '@/lib/fileAccess';
import { useNotifications } from '@/components/ui/notifications';
import { createLogger } from '@/lib/logger';
import { bookingPortfolioIds } from '@/lib/domain/ledger/store';

const log = createLogger('Project');

const ensurePortfoliosFromData = (project: ProjectData): ProjectData => {
    if ((project.portfolios || []).length > 0) {
        return project;
    }

    const discoveredIds = bookingPortfolioIds(project);
    (project.cashAccounts || []).forEach((account) => {
        if (account.portfolioId && !discoveredIds.includes(account.portfolioId)) discoveredIds.push(account.portfolioId);
    });

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

export interface ProjectActions {
    newProject: (options?: { name?: string; password?: string; data?: ProjectData; fileName?: string }) => Promise<void>;
    openProject: (options?: {
        requestPassword?: (reason: 'required' | 'invalid') => Promise<string | null>;
    }) => Promise<void>;
    saveProject: () => Promise<void>;
    saveProjectAs: () => Promise<void>;
    /** Resolves false if the user kept the project open. */
    closeProject: () => Promise<boolean>;
    updateProject: (updater: (prev: ProjectData) => ProjectData) => void;
    syncFx: () => Promise<void>;
    syncMarket: (force?: boolean, options?: { full?: boolean; projectOverride?: ProjectData }) => Promise<void>;
    syncAll: (forceMarket?: boolean) => Promise<void>;
}

const ProjectStoreContext = createContext<ProjectStore | null>(null);
const ProjectActionsContext = createContext<ProjectActions | null>(null);

const useStoreInstance = (): ProjectStore => {
    const store = useContext(ProjectStoreContext);
    if (!store) throw new Error('Project hooks must be used within a ProjectProvider');
    return store;
};

/** Reads a slice of the project state; the component re-renders only when the slice changes. */
export const useProjectStore = <T,>(selector: (state: ProjectState) => T): T => useStore(useStoreInstance(), selector);

/** Like useProjectStore for selectors that build an object or array (compared shallowly). */
export const useProjectStoreShallow = <T,>(selector: (state: ProjectState) => T): T => (
    useStore(useStoreInstance(), useShallow(selector))
);

export const useProjectData = (): ProjectData | null => useProjectStore((state) => state.project);

/** File and sync workflows. Stable: using them never re-renders a component. */
export const useProjectActions = (): ProjectActions => {
    const actions = useContext(ProjectActionsContext);
    if (!actions) throw new Error('useProjectActions must be used within a ProjectProvider');
    return actions;
};

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const { notify, confirm } = useNotifications();
    const [store] = useState(createProjectStore);

    const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
    const sqliteSessionRef = useRef<SqliteProjectSession | null>(null);
    // Derived AES key (non-extractable). The password itself is never kept.
    const encryptionKeyRef = useRef<ProjectEncryptionKey | null>(null);

    // Ask before closing the tab with unsaved changes. No autosave draft in browser storage:
    // it would keep a plain-text copy of encrypted projects.
    useEffect(() => {
        const handler = createBeforeUnloadHandler(() => store.getState().isModified);
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [store]);

    const setSqliteSession = useCallback((nextSession: SqliteProjectSession | null) => {
        if (sqliteSessionRef.current === nextSession) return;
        if (sqliteSessionRef.current) {
            sqliteSessionRef.current.close();
        }
        sqliteSessionRef.current = nextSession;
    }, []);

    const serializeForSave = useCallback(async (targetName: string, data: ProjectData) => {
        if (encryptionKeyRef.current && !isSqliteFileName(targetName)) {
            throw new Error('Verschlüsselte Projekte können nur als .openfolio/.sqlite gespeichert werden.');
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

        const writable = await handle.createWritable();
        try {
            if (typeof serializedData === 'string') {
                await writable.write(serializedData);
            } else {
                const bytes = new Uint8Array(serializedData.byteLength);
                bytes.set(serializedData);
                await writable.write(new Blob([bytes]));
            }
            await writable.close();
        } catch (error) {
            // Discard the partial write; the file keeps its previous content.
            await writable.abort().catch(() => undefined);
            throw error;
        }
        store.getState().setStatus({ encryptionStatus: encryptionKeyRef.current ? 'encrypted' : 'none' });
    }, [serializeForSave, store]);

    const performSync = useCallback(async (currentProject: ProjectData) => {
        const { setStatus, updateProject } = store.getState();
        setStatus({ isSyncing: true });
        try {
            log.info('Auto-syncing FX rates...');
            const newFxData = await CurrencyService.syncRates(currentProject.fxData);

            if (newFxData.lastUpdated !== currentProject.fxData.lastUpdated) {
                updateProject((prev) => ({ ...prev, fxData: newFxData, modified: new Date().toISOString() }));
                log.info('FX Sync completed. Updated to:', newFxData.lastUpdated);
            } else {
                log.info('FX Sync completed. No new data.');
            }
        } catch (e) {
            log.error('FX Sync failed', e);
        } finally {
            setStatus({ isSyncing: false });
        }
    }, [store]);

    const performMarketSync = useCallback(async (currentProject: ProjectData, force: boolean = false, full: boolean = false) => {
        const { setStatus, updateProject } = store.getState();
        setStatus({ isMarketSyncing: true, marketSyncProgress: { current: 0, total: 0, stage: 'start' } });
        try {
            log.info('Auto-syncing market data...');
            const patches = await syncSecurityPatches(currentProject, force, (progress) => {
                setStatus({ marketSyncProgress: progress });
            }, full ? { maxPerRun: 0, maxTimeMs: 0 } : undefined);
            if (Object.keys(patches).length > 0) {
                // A full sync can take minutes: apply the results to the current state so edits
                // made meanwhile (new transactions, ticker mappings) survive.
                updateProject((prev) => (prev.id !== currentProject.id ? prev : {
                    ...applySecurityPatches(prev, patches, currentProject.securities),
                    modified: new Date().toISOString()
                }));
                log.info('Market sync completed.');
            } else {
                log.info('Market sync completed. No new data.');
            }
        } catch (e) {
            log.error('Market sync failed', e);
        } finally {
            setStatus({ isMarketSyncing: false, marketSyncProgress: null });
        }
    }, [store]);

    const newProject = useCallback(async (options?: { name?: string; password?: string; data?: ProjectData; fileName?: string }) => {
        const created = options?.data ?? createEmptyProject(options?.name || 'Mein Portfolio');
        const password = options?.password?.trim();
        encryptionKeyRef.current = password ? await createProjectKey(password) : null;
        fileHandleRef.current = null;
        setSqliteSession(null);
        store.getState().loadProject(created, {
            fileName: options?.fileName || 'Unbenannt.openfolio',
            isModified: true,
            encryptionStatus: password ? 'encrypted' : 'none'
        });

        void performSync(created);
    }, [performSync, setSqliteSession, store]);

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

            const data = ensurePortfoliosFromData(opened.project);
            const lazy = Boolean(opened.hasLazyPayload && opened.sqliteSession);

            setSqliteSession(opened.sqliteSession);
            encryptionKeyRef.current = opened.encryptionKey;
            fileHandleRef.current = handle;
            store.getState().loadProject(data, {
                fileName: file.name,
                lastSavedAt: new Date(file.lastModified).toISOString(),
                isModified: data !== opened.project,
                encryptionStatus: opened.encryption,
                isHydratingProject: lazy
            });

            if (lazy && opened.sqliteSession) {
                void opened.sqliteSession
                    .hydrateHeavyData(data)
                    .then((hydratedProject) => {
                        // Loading the rest of the file is no edit
                        store.getState().touchProject((prev) => {
                            if (prev.id !== data.id) return prev;

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
                        store.getState().setStatus({ isHydratingProject: false });
                    });
            } else {
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
    }, [notify, performSync, setSqliteSession, store]);

    /** Records a finished save: timestamp on the project, and "saved" unless it changed meanwhile. */
    const markSaved = useCallback((modified: string, clean: boolean, file?: { name: string }) => {
        const { touchProject, setStatus } = store.getState();
        // Keep edits made while writing; only the timestamp comes from the save.
        touchProject((prev) => ({ ...prev, modified }));
        setStatus({
            lastSavedAt: modified,
            ...(file ? { fileName: file.name } : {}),
            ...(clean ? { isModified: false } : {})
        });
    }, [store]);

    const saveProjectAs = useCallback(async () => {
        const { project, fileName, revisions, setStatus } = store.getState();
        if (!project) return;
        try {
            if (!supportsFileSystemAccess()) {
                // Firefox/Safari: save as a download
                const suggested = fileName || 'Portfolio.openfolio';
                const downloadName = isSqliteFileName(suggested) ? suggested : `${suggested.replace(/\.[^.]+$/, '')}.openfolio`;
                const modified = new Date().toISOString();
                const { clean } = await revisions.save(async () => {
                    downloadFile(await serializeForSave(downloadName, { ...project, modified }), downloadName);
                });
                setStatus({ encryptionStatus: encryptionKeyRef.current ? 'encrypted' : 'none' });
                markSaved(modified, clean, { name: downloadName });
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
            const { clean } = await revisions.save(() => writeToHandle(handle, { ...project, modified }));
            fileHandleRef.current = handle;
            markSaved(modified, clean, { name: handle.name });
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
                return;
            }
            const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
            log.error('Failed to save project:', err);
            notify({ tone: 'error', title: 'Speichern fehlgeschlagen', message });
        }
    }, [markSaved, notify, serializeForSave, store, writeToHandle]);

    const saveProject = useCallback(async () => {
        const { project, revisions } = store.getState();
        if (!project) return;

        const fileHandle = fileHandleRef.current;
        if (!fileHandle) {
            return saveProjectAs();
        }

        try {
            const modified = new Date().toISOString();
            const { clean } = await revisions.save(() => writeToHandle(fileHandle, { ...project, modified }));
            markSaved(modified, clean);
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
    }, [markSaved, notify, saveProjectAs, store, writeToHandle]);

    const closeProject = useCallback(async () => {
        if (store.getState().isModified) {
            const ok = await confirm({
                title: 'Projekt schließen?',
                message: 'Es gibt ungespeicherte Änderungen. Sie gehen beim Schließen verloren.',
                confirmLabel: 'Ohne Speichern schließen',
                tone: 'danger'
            });
            if (!ok) return false;
        }
        fileHandleRef.current = null;
        encryptionKeyRef.current = null;
        setSqliteSession(null);
        store.getState().closeProject();
        return true;
    }, [confirm, setSqliteSession, store]);

    const updateProject = useCallback((updater: (prev: ProjectData) => ProjectData) => {
        store.getState().updateProject(updater);
    }, [store]);

    const syncFx = useCallback(async () => {
        const { project } = store.getState();
        if (project) {
            await performSync(project);
        } else {
            log.warn('Could not sync FX: No project loaded.');
        }
    }, [performSync, store]);

    const syncMarket = useCallback(async (force: boolean = false, options?: { full?: boolean; projectOverride?: ProjectData }) => {
        const target = options?.projectOverride || store.getState().project;
        if (target) {
            await performMarketSync(target, force, Boolean(options?.full));
        } else {
            log.warn('Could not sync market data: No project loaded.');
        }
    }, [performMarketSync, store]);

    const syncAll = useCallback(async (forceMarket: boolean = false) => {
        const { project } = store.getState();
        if (!project) {
            log.warn('Could not sync: No project loaded.');
            return;
        }
        await Promise.all([
            performSync(project),
            performMarketSync(project, forceMarket, true)
        ]);
    }, [performMarketSync, performSync, store]);

    const actions = useMemo<ProjectActions>(() => ({
        newProject,
        openProject,
        saveProject,
        saveProjectAs,
        closeProject,
        updateProject,
        syncFx,
        syncMarket,
        syncAll
    }), [newProject, openProject, saveProject, saveProjectAs, closeProject, updateProject, syncFx, syncMarket, syncAll]);

    return (
        <ProjectStoreContext.Provider value={store}>
            <ProjectActionsContext.Provider value={actions}>
                {children}
            </ProjectActionsContext.Provider>
        </ProjectStoreContext.Provider>
    );
};
