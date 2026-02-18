"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { ProjectData, createEmptyProject } from '@/types/domain';
import { CurrencyService } from '@/lib/currencyService';
import { syncProjectQuotes, type MarketSyncProgress } from '@/lib/marketDataService';
import { normalizeProjectWealthGoal } from '@/lib/wealthGoalUtils';

interface ProjectContextType {
    project: ProjectData | null;
    isLoaded: boolean;
    isModified: boolean;
    fileName: string | null;
    marketSyncProgress: MarketSyncProgress | null;

    // Actions
    newProject: () => void;
    openProject: () => Promise<void>;
    saveProject: () => Promise<void>;
    saveProjectAs: () => Promise<void>;
    closeProject: () => void;

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
    const [project, setProject] = useState<ProjectData | null>(null);
    const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isModified, setIsModified] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isMarketSyncing, setIsMarketSyncing] = useState(false);
    const [marketSyncProgress, setMarketSyncProgress] = useState<MarketSyncProgress | null>(null);

    // Helper to perform sync on a given project data state
    const performSync = useCallback(async (currentProject: ProjectData) => {
        setIsSyncing(true);
        try {
            console.log("Auto-syncing FX rates...");
            const newFxData = await CurrencyService.syncRates(currentProject.fxData);

            // Only update if changes found or just to update timestamp? 
            // ECB sync returns same if no new data, but let's assume it returns formatted data.
            // Check if lastUpdated changed to avoid unnecessary re-renders/modified flag if nothing changed?
            // For now, simple:
            if (newFxData.lastUpdated !== currentProject.fxData.lastUpdated) {
                setProject(prev => prev ? ({
                    ...prev,
                    fxData: newFxData,
                    modified: new Date().toISOString()
                }) : null);
                setIsModified(true);
                console.log("FX Sync completed. Updated to:", newFxData.lastUpdated);
            } else {
                console.log("FX Sync completed. No new data.");
            }
        } catch (e) {
            console.error("FX Sync failed", e);
        } finally {
            setIsSyncing(false);
        }
    }, []);

    const performMarketSync = useCallback(async (currentProject: ProjectData, force: boolean = false, full: boolean = false) => {
        setIsMarketSyncing(true);
        setMarketSyncProgress({ current: 0, total: 0, stage: 'start' });
        try {
            console.log("Auto-syncing market data...");
            const updated = await syncProjectQuotes(currentProject, force, (progress) => {
                setMarketSyncProgress(progress);
            }, full ? { maxPerRun: 0, maxTimeMs: 0 } : undefined);
            if (updated !== currentProject) {
                setProject(prev => prev ? ({
                    ...prev,
                    securities: updated.securities,
                    transactions: updated.transactions,
                    modified: updated.modified
                }) : null);
                setIsModified(true);
                console.log("Market sync completed.");
            } else {
                console.log("Market sync completed. No new data.");
            }
        } catch (e) {
            console.error("Market sync failed", e);
        } finally {
            setIsMarketSyncing(false);
            setMarketSyncProgress(null);
        }
    }, []);

    const newProject = useCallback(() => {
        const created = createEmptyProject();
        setProject(created);
        setFileHandle(null);
        setFileName('Unbenannt.json');
        setIsModified(true);
        performSync(created);
    }, [performSync]);

    const openProject = useCallback(async () => {
        try {
            // @ts-expect-error File System Access API types might need polyfill
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'OpenParqet Portfolio',
                    accept: { 'application/json': ['.json', '.parqet'] }
                }],
                multiple: false
            });

            const file = await handle.getFile();
            const text = await file.text();
            const parsedData = JSON.parse(text) as ProjectData;
            const data = normalizeProjectWealthGoal(parsedData);

            // Basic validation
            if (!data.version || !data.transactions) {
                throw new Error("Ungültiges Dateiformat");
            }

            setProject(data);
            setFileHandle(handle);
            setFileName(file.name);
            setIsModified(false);

            // Trigger Auto-Sync
            // We pass 'data' directly because 'project' state is not updated yet in this closure
            performSync(data);

        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
                return;
            }
            const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
            console.error('Failed to open project:', err);
            alert('Fehler beim Öffnen der Datei: ' + message);
        }
    }, [performSync]);

    const saveProjectAs = useCallback(async () => {
        if (!project) return;
        try {
            // @ts-expect-error File System Access API types might need polyfill
            const handle = await window.showSaveFilePicker({
                types: [{
                    description: 'OpenParqet Portfolio',
                    accept: { 'application/json': ['.json'] }
                }],
                suggestedName: fileName || 'Portfolio.json'
            });

            const writable = await handle.createWritable();
            const projectToSave = {
                ...project,
                modified: new Date().toISOString()
            };

            await writable.write(JSON.stringify(projectToSave, null, 2));
            await writable.close();

            setFileHandle(handle);
            setFileName(handle.name);
            setProject(projectToSave);
            setIsModified(false);
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
                return;
            }
            const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
            console.error('Failed to save project:', err);
            alert('Fehler beim Speichern: ' + message);
        }
    }, [project, fileName]);

    const saveProject = useCallback(async () => {
        if (!project) return;

        if (!fileHandle) {
            return saveProjectAs();
        }

        try {
            const writable = await fileHandle.createWritable();
            const projectToSave = {
                ...project,
                modified: new Date().toISOString()
            };
            await writable.write(JSON.stringify(projectToSave, null, 2));
            await writable.close();

            setProject(projectToSave);
            setIsModified(false);
        } catch (err) {
            console.error('Failed to save directly:', err);
            // Fallback to Save As if permission lost
            saveProjectAs();
        }
    }, [project, fileHandle, saveProjectAs]);

    const closeProject = useCallback(() => {
        if (isModified) {
            if (!confirm('Ungespeicherte Änderungen gehen verloren. Wirklich schließen?')) {
                return;
            }
        }
        setProject(null);
        setFileHandle(null);
        setFileName(null);
        setIsModified(false);
    }, [isModified]);

    const updateProject = useCallback((updater: (prev: ProjectData) => ProjectData) => {
        setProject(prev => {
            if (!prev) return null;
            const newData = updater(prev);
            return newData;
        });
        setIsModified(true);
    }, []);

    // Public Sync Function (useCallback to keep stable reference)
    const syncFx = useCallback(async () => {
        if (project) {
            await performSync(project);
        } else {
            console.warn("Could not sync FX: No project loaded.");
        }
    }, [project, performSync]);

    const syncMarket = useCallback(async (force: boolean = false, options?: { full?: boolean; projectOverride?: ProjectData }) => {
        const target = options?.projectOverride || project;
        if (target) {
            await performMarketSync(target, force, Boolean(options?.full));
        } else {
            console.warn("Could not sync market data: No project loaded.");
        }
    }, [project, performMarketSync]);

    const syncAll = useCallback(async (forceMarket: boolean = false) => {
        if (!project) {
            console.warn("Could not sync: No project loaded.");
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
