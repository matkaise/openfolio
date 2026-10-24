"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { getBrokerConnections } from '@/lib/brokers/connections';
import type { BrokerConnection } from '@/types/domain';
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
        case 'missing-folder':
            return <span className="flex items-center gap-1.5 md3-negative"><AlertTriangle size={14} /> Ordner in diesem Browser nicht gespeichert – bitte neu verbinden</span>;
        case 'error':
            return <span className="flex items-center gap-1.5 md3-negative"><AlertTriangle size={14} /> {status.message}</span>;
        case 'ok':
            return <span className="flex items-center gap-1.5 md3-positive"><CheckCircle2 size={14} /> {status.message}</span>;
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

export const BrokersContent = () => {
    const { project } = useProject();
    const { supported, statuses, connectDegiroFolder, checkConnection, removeConnection } = useBrokerSync();
    const [targetId, setTargetId] = useState<string>('new');
    const [newName, setNewName] = useState('DEGIRO');
    const [error, setError] = useState<string | null>(null);

    if (!project) return null;
    const connections = getBrokerConnections(project);
    const portfolioName = (id: string) => project.portfolios.find((p) => p.id === id)?.name || 'Gelöschtes Depot';

    const handleConnect = async () => {
        setError(null);
        const existing = project.portfolios.find((p) => p.id === targetId);
        try {
            await connectDegiroFolder(existing
                ? { portfolioId: existing.id, portfolioName: existing.name, isNew: false }
                : { portfolioId: crypto.randomUUID(), portfolioName: newName.trim() || 'DEGIRO', isNew: true });
        } catch (err) {
            if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') return;
            setError(err instanceof Error ? err.message : 'Ordner konnte nicht verbunden werden.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="md3-card p-6">
                <h2 className="text-lg font-semibold md3-text-main">Konten &amp; Broker</h2>
                <p className="mt-1 text-sm md3-text-muted">
                    Verbinde den Ordner, in den du die DEGIRO-Exporte (Account.csv, Transactions.csv) herunterlädst, z.&nbsp;B. „Downloads“.
                    Beim Öffnen des Projekts sucht Openfolio dort nach neuen Exporten und zeigt sie vor dem Import an.
                    Bereits importierte Buchungen werden übersprungen. Der Ordner wird nur gelesen; nichts verlässt deinen Rechner.
                </p>
                {!supported && (
                    <p className="mt-3 rounded-2xl px-4 py-3 text-sm md3-warning-soft">
                        Dieser Browser kann keine Ordner verbinden. Das geht in Chrome, Edge oder Brave. Exporte lassen sich weiterhin über „Import“ hochladen.
                    </p>
                )}
            </div>

            {connections.map((connection) => (
                <div key={connection.id} className="md3-card p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <span
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                                style={{ background: 'var(--md3-primary-container)', color: 'var(--md3-on-primary-container)' }}
                            >
                                <FolderOpen size={18} />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold md3-text-main">DEGIRO</span>
                                    <span className="md3-chip-tonal rounded-md px-2 py-0.5 text-xs font-semibold">Datei-Ordner</span>
                                </div>
                                <div className="mt-0.5 text-sm md3-text-muted">
                                    Ordner „{connection.label}“ → Depot „{portfolioName(connection.portfolioId)}“
                                </div>
                                <div className="mt-2 text-sm"><StatusLine status={statuses[connection.id]} connection={connection} /></div>
                                <div className="mt-1 text-xs md3-text-muted">
                                    Zuletzt geprüft: {formatDateTime(connection.lastCheckedAt)} · Letzter Import: {formatDateTime(connection.lastImportAt)}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => void checkConnection(connection)}
                                disabled={!supported || statuses[connection.id]?.state === 'checking'}
                                className="md3-filled-btn flex items-center gap-1.5 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                            >
                                <RefreshCw size={14} />
                                {statuses[connection.id]?.state === 'needs-permission' ? 'Zugriff erlauben' : 'Jetzt prüfen'}
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
            ))}

            <div className="md3-card p-6">
                <h3 className="font-semibold md3-text-main">DEGIRO-Ordner verbinden</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="text-xs font-semibold md3-text-muted">
                        Ziel-Depot
                        <select
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                            className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none"
                        >
                            <option value="new">Neues Depot</option>
                            {project.portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </label>
                    {targetId === 'new' ? (
                        <label className="text-xs font-semibold md3-text-muted">
                            Name des Depots
                            <input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none"
                            />
                        </label>
                    ) : <div />}
                    <button
                        type="button"
                        onClick={() => void handleConnect()}
                        disabled={!supported}
                        className="md3-filled-btn flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                        <Plus size={16} /> Ordner wählen
                    </button>
                </div>
                {error && <p className="mt-2 text-sm md3-negative">{error}</p>}
                <p className="mt-4 text-xs md3-text-muted">
                    Weitere Broker (Interactive Brokers Flex, Trading 212, comdirect) folgen. DEGIRO bietet keine offizielle API;
                    der Ordner-Import vermeidet inoffizielle Logins und das Risiko einer Kontosperre.
                </p>
            </div>
        </div>
    );
};
