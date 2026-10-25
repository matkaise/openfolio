import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import type { MarketSyncProgress } from '@/lib/marketDataService';
import type { ProjectEncryptionStatus } from '@/lib/projectPersistence';
import type { ProjectData } from '@/types/domain';
import { createRevisionTracker, type RevisionTracker } from './revisionTracker';

// Central project state (brief §3: zustand with subscribeWithSelector). Components read
// slices through selectors, so a sync progress tick only re-renders what shows progress.
// File and sync workflows live in ProjectProvider and write here.

export interface ProjectStatus {
    fileName: string | null;
    isModified: boolean;
    /** When the project was last written to (or read from) its file in this session. */
    lastSavedAt: string | null;
    encryptionStatus: ProjectEncryptionStatus;
    isHydratingProject: boolean;
    isSyncing: boolean;
    isMarketSyncing: boolean;
    marketSyncProgress: MarketSyncProgress | null;
}

export interface ProjectState extends ProjectStatus {
    project: ProjectData | null;
    /** Counts changes so a save that overlaps an edit does not mark the project as saved. */
    revisions: RevisionTracker;

    /** A user or sync change: applies the updater and marks the project as modified. */
    updateProject: (updater: (prev: ProjectData) => ProjectData) => void;
    /** Changes that are not edits (save timestamp, data loaded lazily from the file). */
    touchProject: (updater: (prev: ProjectData) => ProjectData) => void;
    loadProject: (project: ProjectData, status?: Partial<ProjectStatus>) => void;
    setStatus: (status: Partial<ProjectStatus>) => void;
    closeProject: () => void;
}

const initialStatus: ProjectStatus = {
    fileName: null,
    isModified: false,
    lastSavedAt: null,
    encryptionStatus: 'none',
    isHydratingProject: false,
    isSyncing: false,
    isMarketSyncing: false,
    marketSyncProgress: null
};

export const createProjectStore = () => createStore<ProjectState>()(subscribeWithSelector((set, get) => ({
    ...initialStatus,
    project: null,
    revisions: createRevisionTracker(),

    updateProject: (updater) => {
        const prev = get().project;
        if (!prev) return;
        const next = updater(prev);
        if (next === prev) return;
        get().revisions.bump();
        set({ project: next, isModified: true });
    },

    touchProject: (updater) => {
        const prev = get().project;
        if (!prev) return;
        const next = updater(prev);
        if (next !== prev) set({ project: next });
    },

    loadProject: (project, status) => set({ ...initialStatus, ...status, project }),

    setStatus: (status) => set(status),

    closeProject: () => set({ ...initialStatus, project: null })
})));

export type ProjectStore = ReturnType<typeof createProjectStore>;
