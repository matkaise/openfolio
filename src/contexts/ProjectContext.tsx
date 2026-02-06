"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { ProjectData, createEmptyProject } from '@/types/domain';
import { CurrencyService } from '@/lib/currencyService';

interface ProjectContextType {
    project: ProjectData | null;
    isLoaded: boolean;
    isModified: boolean;
    fileName: string | null;

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
    isSyncing: boolean;
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

    const newProject = useCallback(() => {
        setProject(createEmptyProject());
        setFileHandle(null);
        setFileName('Unbenannt.json');
        setIsModified(true);
    }, []);

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
            const data = JSON.parse(text) as ProjectData;

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

    return (
        <ProjectContext.Provider value={{
            project,
            isLoaded: !!project,
            isModified,
            fileName,
            newProject,
            openProject,
            saveProject,
            saveProjectAs,
            closeProject,
            updateProject,
            syncFx,
            isSyncing
        }}>
            {children}
        </ProjectContext.Provider>
    );
};
