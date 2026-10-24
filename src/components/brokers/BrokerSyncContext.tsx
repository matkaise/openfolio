"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { scanDegiroFolder } from '@/lib/brokers/degiroFolder';
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
import { reconcilePositions } from '@/lib/brokers/reconcile';
import { parseIbkrFlexXml } from '@/lib/importers/ibkrFlex';
import { parseTrading212Data, type Trading212Data } from '@/lib/importers/trading212';
import { applyImportBatch, type ImportBatch, type ImportSummary } from '@/lib/importers/importBatch';
import type { BrokerConnection, ProjectData } from '@/types/domain';

export type ConnectionStatus =
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'ok'; message: string; warnings?: string[] }
    | { state: 'needs-permission' }
    | { state: 'needs-token' }
    | { state: 'missing-folder' }
    | { state: 'error'; message: string };

export type PendingImport = {
    connection: BrokerConnection;
    batch: ImportBatch;
    summary: ImportSummary;
    source: { files: string[]; newestModified: number };
    /** E.g. positions that differ from the broker's snapshot. */
    warnings: string[];
};

type PortfolioTarget = { portfolioId: string; portfolioName: string; isNew: boolean };

/** Credentials of API connections: IBKR uses `token`, Trading 212 `apiKey` + `apiSecret`. */
export type ConnectionSecrets = { token?: string; apiKey?: string; apiSecret?: string };

const hasSecrets = (connection: BrokerConnection, secrets: ConnectionSecrets) => (
    connection.kind === 'trading212' ? Boolean(secrets.apiKey && secrets.apiSecret) : Boolean(secrets.token)
);

interface BrokerSyncContextType {
    /** Folder access (DEGIRO watcher) is available in this browser. */
    supported: boolean;
    statuses: Record<string, ConnectionStatus>;
    connectDegiroFolder: (target: PortfolioTarget) => Promise<void>;
    connectIbkrFlex: (target: PortfolioTarget, credentials: { token: string; queryId: string; remember: boolean }) => void;
    connectTrading212: (
        target: PortfolioTarget,
        credentials: { apiKey: string; apiSecret: string; environment: 'live' | 'demo'; remember: boolean }
    ) => void;
    /** Credentials for this session (or stored, in encrypted projects) when they were not saved. */
    provideSecrets: (connection: BrokerConnection, secrets: ConnectionSecrets, remember: boolean) => void;
    canStoreTokens: boolean;
    checkConnection: (connection: BrokerConnection) => Promise<void>;
    removeConnection: (connection: BrokerConnection) => Promise<void>;
    /** New bookings found by a check, waiting for the user's confirmation. */
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

const addPortfolioIfNew = (project: ProjectData, target: PortfolioTarget): ProjectData => (
    target.isNew && !project.portfolios.some((p) => p.id === target.portfolioId)
        ? { ...project, portfolios: [...project.portfolios, { id: target.portfolioId, name: target.portfolioName }] }
        : project
);

const fetchTrading212 = async (secrets: ConnectionSecrets, environment: 'live' | 'demo', since?: string): Promise<Trading212Data> => {
    const res = await fetch('/api/brokers/trading212', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: secrets.apiKey, apiSecret: secrets.apiSecret, environment, since })
    });
    const data = await res.json().catch(() => ({})) as { data?: Trading212Data; error?: string };
    if (!res.ok || !data.data) throw new Error(data.error || `Abruf fehlgeschlagen (HTTP ${res.status}).`);
    return data.data;
};

/** Re-read a week before the last check, so late bookings are not missed (duplicates are skipped). */
const sinceDate = (lastCheckedAt?: string) => {
    if (!lastCheckedAt) return undefined;
    const date = new Date(Date.parse(lastCheckedAt) - 7 * 24 * 3600_000);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
};

const fetchIbkrStatement = async (token: string, queryId: string): Promise<string> => {
    const res = await fetch('/api/brokers/ibkr-flex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, queryId })
    });
    const data = await res.json().catch(() => ({})) as { xml?: string; error?: string };
    if (!res.ok || !data.xml) throw new Error(data.error || `Abruf fehlgeschlagen (HTTP ${res.status}).`);
    return data.xml;
};

export const BrokerSyncProvider = ({ children }: { children: ReactNode }) => {
    const { project, updateProject, syncMarket, isHydratingProject, encryptionStatus } = useProject();
    const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
    const [pending, setPending] = useState<PendingImport | null>(null);
    // Only rendered after a project is open (client side), so no hydration mismatch
    const [supported] = useState(() => supportsFolderAccess());
    const autoCheckedProjectRef = useRef<string | null>(null);
    const projectRef = useRef(project);
    // API credentials that may not be written to the file (project not encrypted). Memory only.
    const sessionSecretsRef = useRef<Record<string, ConnectionSecrets>>({});
    const secretsOf = useCallback((connection: BrokerConnection): ConnectionSecrets => {
        const session = sessionSecretsRef.current[connection.id] || {};
        return {
            token: connection.token || session.token,
            apiKey: connection.apiKey || session.apiKey,
            apiSecret: connection.apiSecret || session.apiSecret
        };
    }, []);
    const canStoreTokens = encryptionStatus === 'encrypted';

    useEffect(() => {
        projectRef.current = project;
    }, [project]);

    const setStatus = useCallback((id: string, status: ConnectionStatus) => {
        setStatuses((prev) => ({ ...prev, [id]: status }));
    }, []);

    /** Turns fetched bookings into a preview, or records "nothing new". */
    const handleBatch = useCallback((
        current: ProjectData,
        connection: BrokerConnection,
        batch: ImportBatch,
        source: { files: string[]; newestModified: number },
        positions?: { isin: string; symbol?: string; quantity: number }[]
    ) => {
        const now = new Date().toISOString();
        const applied = applyImportBatch(current, batch, connectionTarget(current, connection));
        const warnings = positions
            ? reconcilePositions(applied.project, connection.portfolioId, positions).map((m) => (
                `${m.symbol || m.isin}: Broker ${m.expected}, Openfolio ${m.actual}`
            ))
            : [];
        const hasNew = applied.summary.addedTransactions + applied.summary.addedMovements > 0;

        if (!hasNew) {
            updateProject((prev) => updateBrokerConnection(prev, connection.id, {
                lastCheckedAt: now,
                ...(source.newestModified > (connection.lastFileModified || 0) ? { lastFileModified: source.newestModified } : {})
            }));
            setStatus(connection.id, {
                state: 'ok',
                message: source.files.length > 0 ? `Keine neuen Buchungen (${describeSummary(applied.summary)})` : 'Keine neuen Exporte',
                ...(warnings.length > 0 ? { warnings } : {})
            });
            return;
        }

        setStatus(connection.id, { state: 'ok', message: `Neue Buchungen gefunden: ${describeSummary(applied.summary)}` });
        setPending({ connection, batch, summary: applied.summary, source, warnings });
    }, [setStatus, updateProject]);

    /**
     * `interactive` = triggered by a click, so the browser may ask for folder access again;
     * on project open we only check silently.
     */
    const runCheck = useCallback(async (connection: BrokerConnection, interactive: boolean) => {
        const current = projectRef.current;
        if (!current) return;
        setStatus(connection.id, { state: 'checking' });
        try {
            if (connection.kind === 'trading212') {
                const secrets = secretsOf(connection);
                if (!hasSecrets(connection, secrets)) {
                    setStatus(connection.id, { state: 'needs-token' });
                    return;
                }
                const parsed = parseTrading212Data(await fetchTrading212(secrets, connection.environment || 'live', sinceDate(connection.lastCheckedAt)));
                handleBatch(projectRef.current || current, connection, parsed.batch, { files: ['Trading 212 API'], newestModified: 0 }, parsed.positions);
                return;
            }

            if (connection.kind === 'ibkr-flex') {
                const { token } = secretsOf(connection);
                if (!token || !connection.queryId) {
                    setStatus(connection.id, { state: 'needs-token' });
                    return;
                }
                const parsed = parseIbkrFlexXml(await fetchIbkrStatement(token, connection.queryId));
                const label = parsed.period ? `Flex ${parsed.period.from} – ${parsed.period.to}` : 'Flex-Abfrage';
                handleBatch(projectRef.current || current, connection, parsed.batch, { files: [label], newestModified: 0 }, parsed.positions);
                return;
            }

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
            handleBatch(projectRef.current || current, connection, scan.batch, { files: scan.files, newestModified: scan.newestModified });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
            setStatus(connection.id, { state: 'error', message });
        }
    }, [handleBatch, secretsOf, setStatus]);

    // Check every connection once per opened project (after lazy data is loaded)
    useEffect(() => {
        if (!project || isHydratingProject) return;
        if (autoCheckedProjectRef.current === project.id) return;
        autoCheckedProjectRef.current = project.id;
        getBrokerConnections(project).forEach((connection) => {
            if (connection.kind === 'degiro-folder' && !supported) return;
            // API connections only run on open when their credentials are stored
            if (connection.kind !== 'degiro-folder' && !hasSecrets(connection, connection)) return;
            void runCheck(connection, false);
        });
    }, [project, isHydratingProject, supported, runCheck]);

    useEffect(() => {
        if (!project) {
            autoCheckedProjectRef.current = null;
            sessionSecretsRef.current = {};
        }
    }, [project]);

    const confirmPending = useCallback(() => {
        const current = projectRef.current;
        if (!pending || !current) return;
        const now = new Date().toISOString();
        const apply = (prev: ProjectData) => importFromConnection(prev, pending.connection, pending.batch, pending.source, now).project;
        const next = apply(current);
        updateProject(apply);
        void syncMarket(true, { full: true, projectOverride: next });
        setStatus(pending.connection.id, {
            state: 'ok',
            message: `Importiert: ${describeSummary(pending.summary)}`,
            ...(pending.warnings.length > 0 ? { warnings: pending.warnings } : {})
        });
        setPending(null);
    }, [pending, setStatus, syncMarket, updateProject]);

    const connectDegiroFolder = useCallback(async (target: PortfolioTarget) => {
        const handle = await pickFolder();
        const connection: BrokerConnection = {
            id: crypto.randomUUID(),
            kind: 'degiro-folder',
            label: handle.name,
            portfolioId: target.portfolioId,
            createdAt: new Date().toISOString()
        };
        await saveFolderHandle(connection.id, handle);
        updateProject((prev) => addBrokerConnection(addPortfolioIfNew(prev, target), connection));
        // The project ref updates after the next render; check right after it.
        setTimeout(() => void runCheck(connection, true), 0);
    }, [runCheck, updateProject]);

    const connectIbkrFlex = useCallback((
        target: PortfolioTarget,
        credentials: { token: string; queryId: string; remember: boolean }
    ) => {
        const store = credentials.remember && canStoreTokens;
        const connection: BrokerConnection = {
            id: crypto.randomUUID(),
            kind: 'ibkr-flex',
            label: `Flex-Abfrage ${credentials.queryId}`,
            portfolioId: target.portfolioId,
            createdAt: new Date().toISOString(),
            queryId: credentials.queryId.trim(),
            ...(store ? { token: credentials.token.trim() } : {})
        };
        if (!store) sessionSecretsRef.current[connection.id] = { token: credentials.token.trim() };
        updateProject((prev) => addBrokerConnection(addPortfolioIfNew(prev, target), connection));
        setTimeout(() => void runCheck(connection, true), 0);
    }, [canStoreTokens, runCheck, updateProject]);

    const connectTrading212 = useCallback((
        target: PortfolioTarget,
        credentials: { apiKey: string; apiSecret: string; environment: 'live' | 'demo'; remember: boolean }
    ) => {
        const store = credentials.remember && canStoreTokens;
        const secrets = { apiKey: credentials.apiKey.trim(), apiSecret: credentials.apiSecret.trim() };
        const connection: BrokerConnection = {
            id: crypto.randomUUID(),
            kind: 'trading212',
            label: credentials.environment === 'demo' ? 'Trading 212 (Demo)' : 'Trading 212',
            portfolioId: target.portfolioId,
            createdAt: new Date().toISOString(),
            environment: credentials.environment,
            ...(store ? secrets : {})
        };
        if (!store) sessionSecretsRef.current[connection.id] = secrets;
        updateProject((prev) => addBrokerConnection(addPortfolioIfNew(prev, target), connection));
        setTimeout(() => void runCheck(connection, true), 0);
    }, [canStoreTokens, runCheck, updateProject]);

    const provideSecrets = useCallback((connection: BrokerConnection, secrets: ConnectionSecrets, remember: boolean) => {
        const cleaned: ConnectionSecrets = Object.fromEntries(
            Object.entries(secrets).map(([key, value]) => [key, (value || '').trim()]).filter(([, value]) => value)
        );
        if (!hasSecrets(connection, cleaned)) return;
        if (remember && canStoreTokens) {
            updateProject((prev) => updateBrokerConnection(prev, connection.id, cleaned));
            void runCheck({ ...connection, ...cleaned }, true);
        } else {
            sessionSecretsRef.current[connection.id] = cleaned;
            void runCheck(connection, true);
        }
    }, [canStoreTokens, runCheck, updateProject]);

    const removeConnection = useCallback(async (connection: BrokerConnection) => {
        if (connection.kind === 'degiro-folder') await deleteFolderHandle(connection.id);
        delete sessionSecretsRef.current[connection.id];
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
            canStoreTokens,
            connectDegiroFolder,
            connectIbkrFlex,
            connectTrading212,
            provideSecrets,
            checkConnection,
            removeConnection,
            confirmPending,
            dismissPending: () => setPending(null)
        }}>
            {children}
        </BrokerSyncContext.Provider>
    );
};
