"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useProjectActions, useProjectData, useProjectStore, useProjectStoreShallow } from '@/contexts/ProjectContext';
import { findMissingFxCurrencies } from '@/lib/domain/fx/rates';
import { repairProjectSecurities, securityNeedsSync } from '@/lib/marketDataService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/primitives';
import { useFormatters } from '@/components/ui/useFormatters';
import { useT } from '@/lib/i18n';

// Parts of the app shell that show fast-changing status (file state, sync progress).
// Each subscribes to its own slice of the project store, so a progress tick or a save
// re-renders only these small components and not the pages.

/** "Ungespeicherte Änderungen" or "Verschlüsselt · 14:02 gespeichert". */
const useFileStatus = () => {
    const { fileName, isModified, encryptionStatus, lastSavedAt } = useProjectStoreShallow((state) => ({
        fileName: state.fileName,
        isModified: state.isModified,
        encryptionStatus: state.encryptionStatus,
        lastSavedAt: state.lastSavedAt
    }));
    const t = useT();
    const formatters = useFormatters();
    const savedTime = lastSavedAt ? formatters.time(lastSavedAt) : null;
    const detail = isModified
        ? t.shell.file.unsaved
        : `${encryptionStatus === 'encrypted' ? t.shell.file.encrypted : t.shell.file.unencrypted} · ${savedTime ? t.shell.file.savedAt(savedTime) : t.shell.file.notSaved}`;
    return { name: fileName || t.shell.file.untitled, detail, isModified, t };
};

export const FileStatusCard = ({ onClose }: { onClose: () => void }) => {
    const { saveProject } = useProjectActions();
    const file = useFileStatus();
    const { t } = file;
    return (
        <div className="app-file">
            <button type="button" className="app-file-main" onClick={() => void saveProject()} title={file.isModified ? t.shell.file.saveNow : t.shell.file.saved}>
                <span className={file.isModified ? 'app-live is-warn' : 'app-live'} aria-hidden="true" />
                <span className="app-file-text">
                    <span className="app-file-name">{file.name}</span>
                    <span className="app-file-meta">{file.detail}</span>
                </span>
            </button>
            <button type="button" className="app-file-close" onClick={onClose} aria-label={t.shell.closeProject} title={t.shell.closeProject}>
                <LogOut size={15} />
            </button>
        </div>
    );
};

export const MobileSaveButton = ({ onDone }: { onDone: () => void }) => {
    const { saveProject } = useProjectActions();
    const isModified = useProjectStore((state) => state.isModified);
    const t = useT();
    return (
        <button type="button" className="app-nav-item" onClick={() => { onDone(); void saveProject(); }}>
            <span className="app-nav-dot" aria-hidden="true" />
            {isModified ? t.shell.file.saveUnsaved : t.shell.file.saved}
        </button>
    );
};

export const SyncButton = () => {
    const { syncAll } = useProjectActions();
    const busy = useProjectStore((state) => state.isSyncing || state.isMarketSyncing);
    const t = useT();
    return (
        <button
            type="button"
            onClick={() => syncAll(true)}
            className="ui-icon-btn"
            aria-label={t.shell.refreshMarket}
            disabled={busy}
            title={t.shell.refreshMarket}
        >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
    );
};

export const MissingFxNotice = () => {
    const project = useProjectData();
    const isHydratingProject = useProjectStore((state) => state.isHydratingProject);
    const t = useT();
    // Only meaningful once FX data is loaded (lazy hydration or the first sync may still be running).
    const missing = useMemo(() => {
        if (!project || isHydratingProject || Object.keys(project.fxData?.rates || {}).length === 0) return [];
        return findMissingFxCurrencies(project);
    }, [project, isHydratingProject]);

    if (missing.length === 0) return null;
    return (
        <div className="app-notices">
            <div className="md3-warning-soft flex items-start gap-3 rounded-2xl px-4 py-3 text-sm" role="status">
                <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                <span>{t.shell.missingFx(missing.join(', '), missing.length)}</span>
            </div>
        </div>
    );
};

const MARKET_AUTO_SYNC_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Syncs market data when a project is opened (and repairs missing securities), with a
 * progress dialog. At most once per 10 minutes per opened project.
 */
export const StartupMarketSync = () => {
    const { syncMarket, updateProject } = useProjectActions();
    const project = useProjectData();
    const { isMarketSyncing, isHydratingProject, marketSyncProgress } = useProjectStoreShallow((state) => ({
        isMarketSyncing: state.isMarketSyncing,
        isHydratingProject: state.isHydratingProject,
        marketSyncProgress: state.marketSyncProgress
    }));
    const [showDialog, setShowDialog] = useState(false);
    const t = useT();
    const lastSyncRef = useRef(0);

    useEffect(() => {
        // Reset the cooldown after closing a project so the next opened project syncs immediately.
        if (!project) lastSyncRef.current = 0;
    }, [project]);

    useEffect(() => {
        if (!project || isMarketSyncing || isHydratingProject) return;

        if (repairProjectSecurities(project) !== project) {
            // Apply to the latest state, not to this render's snapshot
            updateProject((prev) => repairProjectSecurities(prev));
            return;
        }

        const now = new Date();
        if (!Object.values(project.securities || {}).some((sec) => securityNeedsSync(sec, now))) return;
        if (Date.now() - lastSyncRef.current < MARKET_AUTO_SYNC_COOLDOWN_MS) return;

        lastSyncRef.current = Date.now();
        void Promise.resolve()
            .then(() => {
                setShowDialog(true);
                return syncMarket(false, { full: true });
            })
            .finally(() => setShowDialog(false));
    }, [project, isMarketSyncing, isHydratingProject, syncMarket, updateProject]);

    if (!showDialog || !isMarketSyncing) return null;
    const percent = marketSyncProgress && marketSyncProgress.total > 0
        ? Math.min(100, Math.round((marketSyncProgress.current / marketSyncProgress.total) * 100))
        : 0;

    return (
        <Modal
            open
            size="sm"
            onClose={() => setShowDialog(false)}
            title={t.shell.startupSync.title}
            subtitle={t.shell.startupSync.subtitle}
            icon={<Loader2 size={20} className="animate-spin" />}
            footer={<Button variant="ghost" onClick={() => setShowDialog(false)}>{t.shell.startupSync.background}</Button>}
        >
            <div className="ui-progress-block" style={{ marginBottom: 0 }}>
                <div className="ui-progress-meta">
                    <span>{marketSyncProgress && marketSyncProgress.total > 0 ? t.shell.startupSync.progress(marketSyncProgress.current, marketSyncProgress.total) : t.shell.startupSync.preparing}</span>
                    <span>{marketSyncProgress?.symbol || ''}</span>
                </div>
                <div className="ui-progress"><span style={{ width: `${percent}%` }} /></div>
            </div>
        </Modal>
    );
};
