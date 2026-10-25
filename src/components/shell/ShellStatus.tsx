"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useProjectActions, useProjectData, useProjectStore, useProjectStoreShallow } from '@/contexts/ProjectContext';
import { findMissingFxCurrencies } from '@/lib/domain/fx/rates';
import { repairProjectSecurities, securityNeedsSync } from '@/lib/marketDataService';

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
    const savedTime = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
    const detail = isModified
        ? 'Ungespeicherte Änderungen'
        : `${encryptionStatus === 'encrypted' ? 'Verschlüsselt' : 'Unverschlüsselt'} · ${savedTime ? `${savedTime} gespeichert` : 'noch nicht gespeichert'}`;
    return { name: fileName || 'Unbenannt.openfolio', detail, isModified };
};

export const FileStatusCard = ({ onClose }: { onClose: () => void }) => {
    const { saveProject } = useProjectActions();
    const file = useFileStatus();
    return (
        <div className="app-file">
            <button type="button" className="app-file-main" onClick={() => void saveProject()} title={file.isModified ? 'Jetzt speichern' : 'Gespeichert'}>
                <span className={file.isModified ? 'app-live is-warn' : 'app-live'} aria-hidden="true" />
                <span className="app-file-text">
                    <span className="app-file-name">{file.name}</span>
                    <span className="app-file-meta">{file.detail}</span>
                </span>
            </button>
            <button type="button" className="app-file-close" onClick={onClose} aria-label="Projekt schließen" title="Projekt schließen">
                <LogOut size={15} />
            </button>
        </div>
    );
};

export const MobileSaveButton = ({ onDone }: { onDone: () => void }) => {
    const { saveProject } = useProjectActions();
    const isModified = useProjectStore((state) => state.isModified);
    return (
        <button type="button" className="app-nav-item" onClick={() => { onDone(); void saveProject(); }}>
            <span className="app-nav-dot" aria-hidden="true" />
            {isModified ? 'Speichern (ungespeicherte Änderungen)' : 'Gespeichert'}
        </button>
    );
};

export const SyncButton = () => {
    const { syncAll } = useProjectActions();
    const busy = useProjectStore((state) => state.isSyncing || state.isMarketSyncing);
    return (
        <button
            type="button"
            onClick={() => syncAll(true)}
            className="md3-icon-btn"
            aria-label="Kurse und Wechselkurse aktualisieren"
            disabled={busy}
            title="Kurse und Wechselkurse aktualisieren"
        >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
    );
};

export const MissingFxNotice = () => {
    const project = useProjectData();
    const isHydratingProject = useProjectStore((state) => state.isHydratingProject);
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
                <span>
                    Kurs fehlt: Für {missing.join(', ')} gibt es keinen Wechselkurs.
                    Beträge in {missing.length === 1 ? 'dieser Währung' : 'diesen Währungen'} sind in den Summen nicht enthalten.
                </span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-4">
            <div
                className="w-full max-w-md rounded-3xl p-6 shadow-2xl border"
                style={{
                    background: 'var(--md3-surface)',
                    borderColor: 'var(--md3-outline)'
                }}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl"
                        style={{
                            background: 'var(--md3-primary-container)',
                            color: 'var(--md3-on-primary-container)'
                        }}
                    >
                        <Loader2 size={20} className="animate-spin" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold" style={{ color: 'var(--md3-on-surface)' }}>
                            Marktdaten werden synchronisiert
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--md3-on-surface-variant)' }}>
                            Projektstart-Update
                        </div>
                    </div>
                </div>

                <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--md3-on-surface-variant)' }}>
                        <span>
                            {marketSyncProgress && marketSyncProgress.total > 0
                                ? `Markt ${marketSyncProgress.current}/${marketSyncProgress.total}`
                                : 'Vorbereitung...'}
                        </span>
                        <span>{marketSyncProgress?.symbol || ''}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--md3-surface-container-highest)' }}>
                        <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${percent}%`, background: 'var(--md3-primary)' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
