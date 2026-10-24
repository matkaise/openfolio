"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, KeyRound, Landmark, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { getBrokerConnections } from '@/lib/brokers/connections';
import type { BrokerConnection, ProjectData } from '@/types/domain';
import { useBrokerSync, type ConnectionStatus } from './BrokerSyncContext';

const formatDateTime = (value?: string) => (
    value ? new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie'
);

const StatusLine = ({ status, connection }: { status?: ConnectionStatus; connection: BrokerConnection }) => {
    switch (status?.state) {
        case 'checking':
            return <span className="flex items-center gap-1.5 md3-text-muted"><Loader2 size={14} className="animate-spin" /> Wird geprüft…</span>;
        case 'needs-permission':
            return <span className="flex items-center gap-1.5 md3-warning"><AlertTriangle size={14} /> Ordnerzugriff muss bestätigt werden</span>;
        case 'needs-token':
            return <span className="flex items-center gap-1.5 md3-warning"><KeyRound size={14} /> Token für diese Sitzung eingeben</span>;
        case 'missing-folder':
            return <span className="flex items-center gap-1.5 md3-negative"><AlertTriangle size={14} /> Ordner in diesem Browser nicht gespeichert – bitte neu verbinden</span>;
        case 'error':
            return <span className="flex items-center gap-1.5 md3-negative"><AlertTriangle size={14} /> {status.message}</span>;
        case 'ok':
            return (
                <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 md3-positive"><CheckCircle2 size={14} /> {status.message}</span>
                    {status.warnings && status.warnings.length > 0 && (
                        <span className="md3-warning">Bestand weicht ab: {status.warnings.join(' · ')}</span>
                    )}
                </span>
            );
        default:
            return (
                <span className="md3-text-muted">
                    {connection.lastResult
                        ? `Letzter Import: ${connection.lastResult.added} neu, ${connection.lastResult.duplicates} bereits vorhanden`
                        : 'Noch nicht geprüft'}
                </span>
            );
    }
};

const TargetPicker = ({
    project, targetId, setTargetId, newName, setNewName
}: {
    project: ProjectData;
    targetId: string;
    setTargetId: (id: string) => void;
    newName: string;
    setNewName: (name: string) => void;
}) => (
    <>
        <label className="text-xs font-semibold md3-text-muted">
            Ziel-Depot
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none">
                <option value="new">Neues Depot</option>
                {project.portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
        </label>
        {targetId === 'new' ? (
            <label className="text-xs font-semibold md3-text-muted">
                Name des Depots
                <input value={newName} onChange={(e) => setNewName(e.target.value)} className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none" />
            </label>
        ) : <div />}
    </>
);

const resolveTarget = (project: ProjectData, targetId: string, newName: string, fallback: string) => {
    const existing = project.portfolios.find((p) => p.id === targetId);
    return existing
        ? { portfolioId: existing.id, portfolioName: existing.name, isNew: false }
        : { portfolioId: crypto.randomUUID(), portfolioName: newName.trim() || fallback, isNew: true };
};

const TokenPrompt = ({ connection }: { connection: BrokerConnection }) => {
    const { provideToken, canStoreTokens } = useBrokerSync();
    const [token, setToken] = useState('');
    const [remember, setRemember] = useState(false);
    return (
        <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                provideToken(connection, token, remember);
                setToken('');
            }}
        >
            <label className="text-xs font-semibold md3-text-muted">
                Flex-Token
                <input
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="md3-field mt-1 w-64 px-3 py-2 text-sm outline-none"
                />
            </label>
            {canStoreTokens && (
                <label className="flex items-center gap-1.5 text-xs md3-text-muted">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    in der verschlüsselten Projektdatei speichern
                </label>
            )}
            <button type="submit" className="md3-filled-btn px-3 py-2 text-sm font-semibold">Abrufen</button>
        </form>
    );
};

export const BrokersContent = () => {
    const { project } = useProject();
    const { supported, statuses, connectDegiroFolder, connectIbkrFlex, canStoreTokens, checkConnection, removeConnection } = useBrokerSync();
    const [degiroTarget, setDegiroTarget] = useState<string>('new');
    const [degiroName, setDegiroName] = useState('DEGIRO');
    const [ibkrTarget, setIbkrTarget] = useState<string>('new');
    const [ibkrName, setIbkrName] = useState('Interactive Brokers');
    const [ibkrToken, setIbkrToken] = useState('');
    const [ibkrQueryId, setIbkrQueryId] = useState('');
    const [ibkrRemember, setIbkrRemember] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!project) return null;
    const connections = getBrokerConnections(project);
    const portfolioName = (id: string) => project.portfolios.find((p) => p.id === id)?.name || 'Gelöschtes Depot';

    const handleConnectDegiro = async () => {
        setError(null);
        try {
            await connectDegiroFolder(resolveTarget(project, degiroTarget, degiroName, 'DEGIRO'));
        } catch (err) {
            if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') return;
            setError(err instanceof Error ? err.message : 'Ordner konnte nicht verbunden werden.');
        }
    };

    const handleConnectIbkr = (e: React.FormEvent) => {
        e.preventDefault();
        if (!ibkrToken.trim() || !ibkrQueryId.trim()) return;
        connectIbkrFlex(resolveTarget(project, ibkrTarget, ibkrName, 'Interactive Brokers'), {
            token: ibkrToken,
            queryId: ibkrQueryId,
            remember: ibkrRemember
        });
        setIbkrToken('');
        setIbkrQueryId('');
    };

    return (
        <div className="space-y-6">
            <div className="md3-card p-6">
                <h2 className="text-lg font-semibold md3-text-main">Konten &amp; Broker</h2>
                <p className="mt-1 text-sm md3-text-muted">
                    Neue Buchungen kommen automatisch dazu: aus dem Ordner mit deinen DEGIRO-Exporten oder über die Flex-Schnittstelle von Interactive Brokers.
                    Vor jedem Import siehst du, was neu ist; bereits importierte Buchungen werden übersprungen. Zugangsdaten bleiben auf deinem Rechner.
                </p>
            </div>

            {connections.map((connection) => {
                const isIbkr = connection.kind === 'ibkr-flex';
                const status = statuses[connection.id];
                return (
                    <div key={connection.id} className="md3-card p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                                <span
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                                    style={{ background: 'var(--md3-primary-container)', color: 'var(--md3-on-primary-container)' }}
                                >
                                    {isIbkr ? <Landmark size={18} /> : <FolderOpen size={18} />}
                                </span>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold md3-text-main">{isIbkr ? 'Interactive Brokers' : 'DEGIRO'}</span>
                                        <span className="md3-chip-tonal rounded-md px-2 py-0.5 text-xs font-semibold">{isIbkr ? 'Flex Web Service' : 'Datei-Ordner'}</span>
                                    </div>
                                    <div className="mt-0.5 text-sm md3-text-muted">
                                        {isIbkr ? connection.label : `Ordner „${connection.label}“`} → Depot „{portfolioName(connection.portfolioId)}“
                                        {isIbkr && (connection.token ? ' · Token gespeichert' : ' · Token nur für diese Sitzung')}
                                    </div>
                                    <div className="mt-2 text-sm"><StatusLine status={status} connection={connection} /></div>
                                    <div className="mt-1 text-xs md3-text-muted">
                                        Zuletzt geprüft: {formatDateTime(connection.lastCheckedAt)} · Letzter Import: {formatDateTime(connection.lastImportAt)}
                                    </div>
                                    {isIbkr && status?.state === 'needs-token' && <TokenPrompt connection={connection} />}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => void checkConnection(connection)}
                                    disabled={(!isIbkr && !supported) || status?.state === 'checking'}
                                    className="md3-filled-btn flex items-center gap-1.5 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                                >
                                    <RefreshCw size={14} />
                                    {status?.state === 'needs-permission' ? 'Zugriff erlauben' : 'Jetzt prüfen'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void removeConnection(connection)}
                                    className="md3-icon-btn"
                                    aria-label={`Verbindung ${connection.label} entfernen`}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}

            <div className="md3-card p-6">
                <h3 className="font-semibold md3-text-main">DEGIRO-Ordner verbinden</h3>
                <p className="mt-1 text-sm md3-text-muted">
                    Wähle den Ordner, in den du Account.csv und Transactions.csv herunterlädst (z.&nbsp;B. „Downloads“). Er wird nur gelesen.
                </p>
                {!supported && (
                    <p className="mt-3 rounded-2xl px-4 py-3 text-sm md3-warning-soft">
                        Dieser Browser kann keine Ordner verbinden. Das geht in Chrome, Edge oder Brave. Exporte lassen sich weiterhin über „Import“ hochladen.
                    </p>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <TargetPicker project={project} targetId={degiroTarget} setTargetId={setDegiroTarget} newName={degiroName} setNewName={setDegiroName} />
                    <button
                        type="button"
                        onClick={() => void handleConnectDegiro()}
                        disabled={!supported}
                        className="md3-filled-btn flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                        <Plus size={16} /> Ordner wählen
                    </button>
                </div>
                {error && <p className="mt-2 text-sm md3-negative">{error}</p>}
                <p className="mt-3 text-xs md3-text-muted">
                    DEGIRO bietet keine offizielle API; der Ordner-Import vermeidet inoffizielle Logins und das Risiko einer Kontosperre.
                </p>
            </div>

            <form className="md3-card p-6" onSubmit={handleConnectIbkr}>
                <h3 className="font-semibold md3-text-main">Interactive Brokers (Flex Web Service) verbinden</h3>
                <p className="mt-1 text-sm md3-text-muted">
                    Im Client Portal unter <em>Performance &amp; Berichte → Flex-Abfragen</em> eine Aktivitäts-Flex-Abfrage (Format XML) mit
                    <em> Trades</em>, <em>Cash Transactions</em> und <em>Open Positions</em> anlegen, dort die Query-ID ablesen und unter
                    <em> Flex Web Service</em> ein Token erzeugen. Openfolio ruft den Bericht über den lokalen Server direkt bei IBKR ab.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <TargetPicker project={project} targetId={ibkrTarget} setTargetId={setIbkrTarget} newName={ibkrName} setNewName={setIbkrName} />
                    <label className="text-xs font-semibold md3-text-muted">
                        Flex-Token
                        <input
                            type="password"
                            autoComplete="off"
                            value={ibkrToken}
                            onChange={(e) => setIbkrToken(e.target.value)}
                            className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none"
                        />
                    </label>
                    <label className="text-xs font-semibold md3-text-muted">
                        Query-ID
                        <input
                            inputMode="numeric"
                            value={ibkrQueryId}
                            onChange={(e) => setIbkrQueryId(e.target.value.replace(/\D/g, ''))}
                            className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none"
                        />
                    </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    {canStoreTokens ? (
                        <label className="flex items-center gap-1.5 text-xs md3-text-muted">
                            <input type="checkbox" checked={ibkrRemember} onChange={(e) => setIbkrRemember(e.target.checked)} />
                            Token in der verschlüsselten Projektdatei speichern (automatischer Abruf beim Öffnen)
                        </label>
                    ) : (
                        <span className="text-xs md3-text-muted">
                            Das Projekt ist nicht verschlüsselt: das Token gilt nur für diese Sitzung und wird nicht gespeichert.
                        </span>
                    )}
                    <button
                        type="submit"
                        disabled={!ibkrToken.trim() || !ibkrQueryId.trim()}
                        className="md3-filled-btn flex items-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                        <Plus size={16} /> Verbinden &amp; abrufen
                    </button>
                </div>
                <p className="mt-3 text-xs md3-text-muted">Trading 212 und comdirect folgen.</p>
            </form>
        </div>
    );
};
