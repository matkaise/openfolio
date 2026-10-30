"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useProjectActions, useProjectData, useProjectStore } from '@/contexts/ProjectContext';
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
import type { ImportRowNote } from '@/lib/importers/fileImport';
import { parseIbkrFlexXml } from '@/lib/importers/ibkrFlex';
import { parseTrading212Data, type Trading212Data } from '@/lib/importers/trading212';
import { parseComdirectData, type ComdirectData } from '@/lib/importers/comdirect';
import type { ComdirectChallenge } from '@/lib/brokers/comdirectClient';
import { applyImportBatch, type ImportBatch, type ImportSummary } from '@/lib/importers/importBatch';
import type { BrokerConnection, ProjectData } from '@/types/domain';
import { getT, LANGUAGE_HEADER, languageStore } from '@/lib/i18n';

export type ConnectionStatus =
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'ok'; message: string; warnings?: string[] }
    | { state: 'needs-permission' }
    | { state: 'needs-token' }
    | { state: 'needs-login' }
    | { state: 'awaiting-tan' }
    | { state: 'missing-folder' }
    | { state: 'error'; message: string };

export type PendingImport = {
    connection: BrokerConnection;
    batch: ImportBatch;
    summary: ImportSummary;
    source: { files: string[]; newestModified: number };
    /** Positions that differ from the broker's snapshot. */
    warnings: string[];
    /** Importer notes, e.g. depot transfers that need manual entry. */
    notes: string[];
};

type PortfolioTarget = { portfolioId: string; portfolioName: string; isNew: boolean };

/**
 * Credentials of API connections: IBKR `token`, Trading 212 `apiKey` + `apiSecret`,
 * comdirect `clientId` + `clientSecret` + `username` (the PIN is asked at every login).
 */
export type ConnectionSecrets = {
    token?: string;
    apiKey?: string;
    apiSecret?: string;
    clientId?: string;
    clientSecret?: string;
    username?: string;
};

const SECRET_KEYS: (keyof ConnectionSecrets)[] = ['token', 'apiKey', 'apiSecret', 'clientId', 'clientSecret', 'username'];

const hasSecrets = (connection: BrokerConnection, secrets: ConnectionSecrets) => {
    switch (connection.kind) {
        case 'trading212': return Boolean(secrets.apiKey && secrets.apiSecret);
        case 'comdirect': return Boolean(secrets.clientId && secrets.clientSecret && secrets.username);
        case 'ibkr-flex': return Boolean(secrets.token);
        default: return true;
    }
};

export type TanRequest = { connection: BrokerConnection; flowId: string; challenge: ComdirectChallenge };

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
    connectComdirect: (
        target: PortfolioTarget,
        credentials: { clientId: string; clientSecret: string; username: string; remember: boolean }
    ) => void;
    /** Credentials for this session (or stored, in encrypted projects) when they were not saved. */
    provideSecrets: (connection: BrokerConnection, secrets: ConnectionSecrets, remember: boolean) => void;
    /** comdirect: log in with the PIN and request a TAN challenge. */
    startComdirectLogin: (connection: BrokerConnection, pin: string) => Promise<void>;
    tanRequest: TanRequest | null;
    submitTan: (tan?: string) => Promise<void>;
    cancelTan: () => void;
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
    return getT().brokers.sync.summary(added, duplicates);
};

const FLEX_NOTE_LIMIT = 8;

/** Rows of a Flex statement that were not booked, as notes for the import dialog. */
const flexReportNotes = (rows: ImportRowNote[]): string[] => {
    const { preview } = getT().fileImport;
    return [
        ...rows.slice(0, FLEX_NOTE_LIMIT).map((row) => `${preview.unsupported}: ${preview.note(row.line, row.label)}`),
        ...(rows.length > FLEX_NOTE_LIMIT ? [preview.more(rows.length - FLEX_NOTE_LIMIT)] : [])
    ];
};

const addPortfolioIfNew = (project: ProjectData, target: PortfolioTarget): ProjectData => (
    target.isNew && !project.portfolios.some((p) => p.id === target.portfolioId)
        ? { ...project, portfolios: [...project.portfolios, { id: target.portfolioId, name: target.portfolioName }] }
        : project
);

const fetchTrading212 = async (secrets: ConnectionSecrets, environment: 'live' | 'demo', since?: string): Promise<Trading212Data> => {
    const res = await fetch('/api/brokers/trading212', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [LANGUAGE_HEADER]: languageStore.getState().language },
        body: JSON.stringify({ apiKey: secrets.apiKey, apiSecret: secrets.apiSecret, environment, since })
    });
    const data = await res.json().catch(() => ({})) as { data?: Trading212Data; error?: string };
    if (!res.ok || !data.data) throw new Error(data.error || getT().brokers.sync.fetchFailed(res.status));
    return data.data;
};

const comdirectRequest = async <T,>(body: Record<string, unknown>): Promise<T> => {
    const res = await fetch('/api/brokers/comdirect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [LANGUAGE_HEADER]: languageStore.getState().language },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({})) as T & { error?: string };
    if (!res.ok) throw new Error(data.error || getT().brokers.sync.fetchFailed(res.status));
    return data;
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
        headers: { 'Content-Type': 'application/json', [LANGUAGE_HEADER]: languageStore.getState().language },
        body: JSON.stringify({ token, queryId })
    });
    const data = await res.json().catch(() => ({})) as { xml?: string; error?: string };
    if (!res.ok || !data.xml) throw new Error(data.error || getT().brokers.sync.fetchFailed(res.status));
    return data.xml;
};

export const BrokerSyncProvider = ({ children }: { children: ReactNode }) => {
    const project = useProjectData();
    const { updateProject, syncMarket } = useProjectActions();
    const isHydratingProject = useProjectStore((state) => state.isHydratingProject);
    const encryptionStatus = useProjectStore((state) => state.encryptionStatus);
    const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
    const [pending, setPending] = useState<PendingImport | null>(null);
    const [tanRequest, setTanRequest] = useState<TanRequest | null>(null);
    // Only rendered after a project is open (client side), so no hydration mismatch
    const [supported] = useState(() => supportsFolderAccess());
    const autoCheckedProjectRef = useRef<string | null>(null);
    const projectRef = useRef(project);
    // API credentials that may not be written to the file (project not encrypted). Memory only.
    const sessionSecretsRef = useRef<Record<string, ConnectionSecrets>>({});
    const secretsOf = useCallback((connection: BrokerConnection): ConnectionSecrets => {
        const session = sessionSecretsRef.current[connection.id] || {};
        return Object.fromEntries(SECRET_KEYS.map((key) => [key, connection[key] || session[key]])) as ConnectionSecrets;
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
        positions?: { isin: string; symbol?: string; quantity: number }[],
        extraWarnings: string[] = []
    ) => {
        const now = new Date().toISOString();
        const applied = applyImportBatch(current, batch, connectionTarget(current, connection));
        const notes = extraWarnings;
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
                message: source.files.length > 0 ? getT().brokers.sync.nothingNew(describeSummary(applied.summary)) : getT().brokers.sync.noNewExports,
                ...(warnings.length + notes.length > 0 ? { warnings: [...notes, ...warnings] } : {})
            });
            return;
        }

        setStatus(connection.id, { state: 'ok', message: getT().brokers.sync.found(describeSummary(applied.summary)) });
        setPending({ connection, batch, summary: applied.summary, source, warnings, notes });
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
            if (connection.kind === 'comdirect') {
                // Every login needs the PIN and a TAN: wait for the user
                setStatus(connection.id, { state: hasSecrets(connection, secretsOf(connection)) ? 'needs-login' : 'needs-token' });
                return;
            }

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
                const label = parsed.period ? getT().brokers.sync.flexPeriod(parsed.period.from, parsed.period.to) : getT().brokers.sync.flexQueryShort;
                handleBatch(projectRef.current || current, connection, parsed.batch, { files: [label], newestModified: 0 }, parsed.positions, flexReportNotes(parsed.unsupported));
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
            const message = error instanceof Error ? error.message : getT().brokers.sync.unknownError;
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
            // API connections only run on open when their credentials are stored; comdirect needs a TAN
            if (connection.kind === 'comdirect') return;
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
            message: getT().brokers.sync.imported(describeSummary(pending.summary)),
            ...(pending.warnings.length + pending.notes.length > 0 ? { warnings: [...pending.notes, ...pending.warnings] } : {})
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
            label: getT().brokers.sync.flexQuery(credentials.queryId),
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

    const connectComdirect = useCallback((
        target: PortfolioTarget,
        credentials: { clientId: string; clientSecret: string; username: string; remember: boolean }
    ) => {
        const store = credentials.remember && canStoreTokens;
        const secrets = {
            clientId: credentials.clientId.trim(),
            clientSecret: credentials.clientSecret.trim(),
            username: credentials.username.trim()
        };
        const connection: BrokerConnection = {
            id: crypto.randomUUID(),
            kind: 'comdirect',
            label: getT().brokers.sync.access(`${secrets.username.slice(0, 2)}••••${secrets.username.slice(-2)}`),
            portfolioId: target.portfolioId,
            createdAt: new Date().toISOString(),
            ...(store ? secrets : {})
        };
        if (!store) sessionSecretsRef.current[connection.id] = secrets;
        updateProject((prev) => addBrokerConnection(addPortfolioIfNew(prev, target), connection));
        setStatus(connection.id, { state: 'needs-login' });
    }, [canStoreTokens, setStatus, updateProject]);

    const startComdirectLoginFlow = useCallback(async (connection: BrokerConnection, pin: string) => {
        const secrets = secretsOf(connection);
        if (!hasSecrets(connection, secrets)) {
            setStatus(connection.id, { state: 'needs-token' });
            return;
        }
        setStatus(connection.id, { state: 'checking' });
        try {
            const { flowId, challenge } = await comdirectRequest<{ flowId: string; challenge: ComdirectChallenge }>({
                action: 'start',
                clientId: secrets.clientId,
                clientSecret: secrets.clientSecret,
                username: secrets.username,
                pin
            });
            setTanRequest({ connection, flowId, challenge });
            setStatus(connection.id, { state: 'awaiting-tan' });
        } catch (error) {
            setStatus(connection.id, { state: 'error', message: error instanceof Error ? error.message : getT().brokers.sync.loginFailed });
        }
    }, [secretsOf, setStatus]);

    const submitTan = useCallback(async (tan?: string) => {
        const request = tanRequest;
        if (!request) return;
        setTanRequest(null); // one attempt per challenge: comdirect locks after wrong TANs
        setStatus(request.connection.id, { state: 'checking' });
        try {
            const { data } = await comdirectRequest<{ data: ComdirectData }>({ action: 'complete', flowId: request.flowId, tan });
            const parsed = parseComdirectData(data);
            const current = projectRef.current;
            if (!current) return;
            handleBatch(current, request.connection, parsed.batch, { files: [getT().brokers.sync.depot(data.depot.depotDisplayId || '')], newestModified: 0 }, parsed.positions, parsed.warnings);
        } catch (error) {
            setStatus(request.connection.id, { state: 'error', message: error instanceof Error ? error.message : getT().brokers.sync.fetchFailedShort });
        }
    }, [handleBatch, setStatus, tanRequest]);

    const cancelTan = useCallback(() => {
        const request = tanRequest;
        if (!request) return;
        setTanRequest(null);
        void comdirectRequest({ action: 'cancel', flowId: request.flowId }).catch(() => undefined);
        setStatus(request.connection.id, { state: 'needs-login' });
    }, [setStatus, tanRequest]);

    const provideSecrets = useCallback((connection: BrokerConnection, secrets: ConnectionSecrets, remember: boolean) => {
        const cleaned: ConnectionSecrets = Object.fromEntries(
            Object.entries(secrets).map(([key, value]) => [key, (value || '').trim()]).filter(([, value]) => value)
        );
        if (!hasSecrets(connection, cleaned)) return;
        if (remember && canStoreTokens) {
            updateProject((prev) => updateBrokerConnection(prev, connection.id, cleaned));
            void runCheck({ ...connection, ...cleaned }, true);
        } else {
            sessionSecretsRef.current[connection.id] = { ...sessionSecretsRef.current[connection.id], ...cleaned };
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
            connectComdirect,
            provideSecrets,
            startComdirectLogin: startComdirectLoginFlow,
            tanRequest,
            submitTan,
            cancelTan,
            checkConnection,
            removeConnection,
            confirmPending,
            dismissPending: () => setPending(null)
        }}>
            {children}
        </BrokerSyncContext.Provider>
    );
};
