"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { scanDegiroFolder, type DegiroFolderScan } from '@/lib/brokers/degiroFolder';
import {
    addBrokerConnection,
    connectionTarget,
    getBrokerConnections,
    importFromConnection,
    removeBrokerConnection,
    updateBrokerConnection
} from '@/lib/brokers/connections';
import {
    deleteFolderHandle,
    hasFolderPermission,
    loadFolderHandle,
    pickFolder,
    requestFolderPermission,
    saveFolderHandle,
    supportsFolderAccess
} from '@/lib/brokers/handleStore';
import { applyImportBatch, type ImportSummary } from '@/lib/importers/importBatch';
import type { BrokerConnection } from '@/types/domain';

export type ConnectionStatus =
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'ok'; message: string }
    | { state: 'needs-permission' }
    | { state: 'missing-folder' }
    | { state: 'error'; message: string };

export type PendingImport = {
    connection: BrokerConnection;
    scan: DegiroFolderScan;
    summary: ImportSummary;
};

interface BrokerSyncContextType {
    supported: boolean;
    statuses: Record<string, ConnectionStatus>;
    connectDegiroFolder: (target: { portfolioId: string; portfolioName: string; isNew: boolean }) => Promise<void>;
    checkConnection: (connection: BrokerConnection) => Promise<void>;
    removeConnection: (connection: BrokerConnection) => Promise<void>;
    /** New exports found by a check, waiting for the user's confirmation. */
    pending: PendingImport | null;
    confirmPending: () => void;
    dismissPending: () => void;
}

const BrokerSyncContext = createContext<BrokerSyncContextType | undefined>(undefined);

export const useBrokerSync = () => {
    const context = useContext(BrokerSyncContext);
    if (!context) throw new Error('useBrokerSync must be used within a BrokerSyncProvider');
    return context;
};

const describeSummary = (summary: ImportSummary) => {
    const added = summary.addedTransactions + summary.addedMovements;
    const duplicates = summary.duplicateTransactions + summary.duplicateMovements;
    return `${added} neu, ${duplicates} bereits vorhanden`;
};

export const BrokerSyncProvider = ({ children }: { children: ReactNode }) => {
    const { project, updateProject, syncMarket, isHydratingProject } = useProject();
    const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
    const [pending, setPending] = useState<PendingImport | null>(null);
    // Only rendered after a project is open (client side), so no hydration mismatch
    const [supported] = useState(() => supportsFolderAccess());
    const autoCheckedProjectRef = useRef<string | null>(null);
    const projectRef = useRef(project);

    useEffect(() => {
        projectRef.current = project;
    }, [project]);

    const setStatus = useCallback((id: string, status: ConnectionStatus) => {
        setStatuses((prev) => ({ ...prev, [id]: status }));
    }, []);

    /**
     * Scans the connection's folder. `interactive` = triggered by a click, so the browser
     * may ask for folder access again; on project open we only check silently.
     */
    const runCheck = useCallback(async (connection: BrokerConnection, interactive: boolean) => {
        const current = projectRef.current;
        if (!current) return;
        setStatus(connection.id, { state: 'checking' });
        try {
            const handle = await loadFolderHandle(connection.id);
            if (!handle) {
                setStatus(connection.id, { state: 'missing-folder' });
                return;
            }
            const permitted = await hasFolderPermission(handle) || (interactive && await requestFolderPermission(handle));
            if (!permitted) {
                setStatus(connection.id, { state: 'needs-permission' });
                return;
            }

            const scan = await scanDegiroFolder(handle, { modifiedAfter: connection.lastFileModified });
            const now = new Date().toISOString();
            const summary = scan.files.length > 0
                ? applyImportBatch(current, scan.batch, connectionTarget(current, connection)).summary
                : null;
            const hasNew = summary && summary.addedTransactions + summary.addedMovements > 0;

            if (!hasNew) {
                // Nothing new: remember the files so they are not read again
                updateProject((prev) => updateBrokerConnection(prev, connection.id, {
                    lastCheckedAt: now,
                    ...(scan.newestModified > (connection.lastFileModified || 0) ? { lastFileModified: scan.newestModified } : {})
                }));
                setStatus(connection.id, { state: 'ok', message: summary ? `Keine neuen Buchungen (${describeSummary(summary)})` : 'Keine neuen Exporte' });
                return;
            }

            setStatus(connection.id, { state: 'ok', message: `Neue Exporte gefunden: ${describeSummary(summary)}` });
            setPending({ connection, scan, summary });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
            setStatus(connection.id, { state: 'error', message });
        }
    }, [setStatus, updateProject]);

    // Check every connection once per opened project (after lazy data is loaded)
    useEffect(() => {
        if (!project || isHydratingProject || !supported) return;
        if (autoCheckedProjectRef.current === project.id) return;
        autoCheckedProjectRef.current = project.id;
        getBrokerConnections(project).forEach((connection) => {
            void runCheck(connection, false);
        });
    }, [project, isHydratingProject, supported, runCheck]);

    useEffect(() => {
        if (!project) autoCheckedProjectRef.current = null;
    }, [project]);

    const confirmPending = useCallback(() => {
        const current = projectRef.current;
        if (!pending || !current) return;
        const now = new Date().toISOString();
        const apply = (prev: typeof current) => importFromConnection(prev, pending.connection, pending.scan.batch, pending.scan, now).project;
        const next = apply(current);
        updateProject(apply);
        void syncMarket(true, { full: true, projectOverride: next });
        setStatus(pending.connection.id, { state: 'ok', message: `Importiert: ${describeSummary(pending.summary)}` });
        setPending(null);
    }, [pending, setStatus, syncMarket, updateProject]);

    const connectDegiroFolder = useCallback(async (target: { portfolioId: string; portfolioName: string; isNew: boolean }) => {
        const handle = await pickFolder();
        const connection: BrokerConnection = {
            id: crypto.randomUUID(),
            kind: 'degiro-folder',
            label: handle.name,
            portfolioId: target.portfolioId,
            createdAt: new Date().toISOString()
        };
        await saveFolderHandle(connection.id, handle);
        updateProject((prev) => {
            const withPortfolio = target.isNew && !prev.portfolios.some((p) => p.id === target.portfolioId)
                ? { ...prev, portfolios: [...prev.portfolios, { id: target.portfolioId, name: target.portfolioName }] }
                : prev;
            return addBrokerConnection(withPortfolio, connection);
        });
        // The project ref updates after the next render; check right after it.
        setTimeout(() => void runCheck(connection, true), 0);
    }, [runCheck, updateProject]);

    const removeConnection = useCallback(async (connection: BrokerConnection) => {
        await deleteFolderHandle(connection.id);
        updateProject((prev) => removeBrokerConnection(prev, connection.id));
        setStatuses((prev) => {
            const next = { ...prev };
            delete next[connection.id];
            return next;
        });
    }, [updateProject]);

    const checkConnection = useCallback((connection: BrokerConnection) => runCheck(connection, true), [runCheck]);

    return (
        <BrokerSyncContext.Provider value={{
            supported,
            statuses,
            pending,
            connectDegiroFolder,
            checkConnection,
            removeConnection,
            confirmPending,
            dismissPending: () => setPending(null)
        }}>
            {children}
        </BrokerSyncContext.Provider>
    );
};
