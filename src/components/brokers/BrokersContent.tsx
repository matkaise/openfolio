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
            return <span className="flex items-center gap-1.5 md3-warning"><KeyRound size={14} /> Zugangsdaten für diese Sitzung eingeben</span>;
        case 'needs-login':
            return <span className="flex items-center gap-1.5 md3-text-muted"><KeyRound size={14} /> Zum Abrufen mit PIN und TAN anmelden</span>;
        case 'awaiting-tan':
            return <span className="flex items-center gap-1.5 md3-warning"><Loader2 size={14} className="animate-spin" /> Warte auf TAN</span>;
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

const CredentialsPrompt = ({ connection }: { connection: BrokerConnection }) => {
    const { provideSecrets, canStoreTokens } = useBrokerSync();
    const [token, setToken] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [remember, setRemember] = useState(false);
    const isT212 = connection.kind === 'trading212';
    const isComdirect = connection.kind === 'comdirect';
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [username, setUsername] = useState('');
    const field = (label: string, value: string, onChange: (v: string) => void) => (
        <label className="text-xs font-semibold md3-text-muted">
            {label}
            <input
                type="password"
                autoComplete="off"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="md3-field mt-1 w-56 px-3 py-2 text-sm outline-none"
            />
        </label>
    );
    return (
        <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                provideSecrets(
                    connection,
                    isComdirect ? { clientId, clientSecret, username } : isT212 ? { apiKey, apiSecret } : { token },
                    remember
                );
                setToken('');
                setApiKey('');
                setApiSecret('');
                setClientSecret('');
            }}
        >
            {isComdirect ? (
                <>
                    {field('client_id', clientId, setClientId)}
                    {field('client_secret', clientSecret, setClientSecret)}
                    {field('Zugangsnummer', username, setUsername)}
                </>
            ) : isT212 ? (
                <>
                    {field('API-Schlüssel', apiKey, setApiKey)}
                    {field('API-Secret', apiSecret, setApiSecret)}
                </>
            ) : field('Flex-Token', token, setToken)}
            {canStoreTokens && (
                <label className="flex items-center gap-1.5 text-xs md3-text-muted">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    in der verschlüsselten Projektdatei speichern
                </label>
            )}
            <button type="submit" className="md3-filled-btn px-3 py-2 text-sm font-semibold">{isComdirect ? 'Weiter' : 'Abrufen'}</button>
        </form>
    );
};

/** comdirect: the PIN is asked for every login and only sent to the local server once. */
const ComdirectLoginPrompt = ({ connection }: { connection: BrokerConnection }) => {
    const { startComdirectLogin } = useBrokerSync();
    const [pin, setPin] = useState('');
    return (
        <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
                e.preventDefault();
                const value = pin;
                setPin('');
                void startComdirectLogin(connection, value);
            }}
        >
            <label className="text-xs font-semibold md3-text-muted">
                PIN
                <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="md3-field mt-1 w-40 px-3 py-2 text-sm outline-none"
                />
            </label>
            <button type="submit" disabled={pin.length < 4} className="md3-filled-btn px-3 py-2 text-sm font-semibold disabled:opacity-50">
                TAN anfordern
            </button>
            <span className="w-full text-xs md3-text-muted">
                Die PIN wird nicht gespeichert. Achtung: Nach fünf angeforderten TANs ohne gültige Eingabe sperrt comdirect den Zugang.
            </span>
        </form>
    );
};

const CONNECTION_INFO: Record<BrokerConnection['kind'], { name: string; method: string }> = {
    'degiro-folder': { name: 'DEGIRO', method: 'Datei-Ordner' },
    'ibkr-flex': { name: 'Interactive Brokers', method: 'Flex Web Service' },
    trading212: { name: 'Trading 212', method: 'Public API' },
    comdirect: { name: 'comdirect', method: 'REST API mit TAN' }
};

const hasStoredSecrets = (connection: BrokerConnection) => {
    switch (connection.kind) {
        case 'trading212': return Boolean(connection.apiKey && connection.apiSecret);
        case 'comdirect': return Boolean(connection.clientId && connection.clientSecret && connection.username);
        default: return Boolean(connection.token);
    }
};

export const BrokersContent = () => {
    const { project } = useProject();
    const { supported, statuses, connectDegiroFolder, connectIbkrFlex, connectTrading212, connectComdirect, canStoreTokens, checkConnection, removeConnection } = useBrokerSync();
    const [degiroTarget, setDegiroTarget] = useState<string>('new');
    const [degiroName, setDegiroName] = useState('DEGIRO');
    const [ibkrTarget, setIbkrTarget] = useState<string>('new');
    const [ibkrName, setIbkrName] = useState('Interactive Brokers');
    const [ibkrToken, setIbkrToken] = useState('');
    const [ibkrQueryId, setIbkrQueryId] = useState('');
    const [ibkrRemember, setIbkrRemember] = useState(false);
    const [t212Target, setT212Target] = useState<string>('new');
    const [t212Name, setT212Name] = useState('Trading 212');
    const [t212Key, setT212Key] = useState('');
    const [t212Secret, setT212Secret] = useState('');
    const [t212Environment, setT212Environment] = useState<'live' | 'demo'>('live');
    const [t212Remember, setT212Remember] = useState(false);
    const [cdTarget, setCdTarget] = useState<string>('new');
    const [cdName, setCdName] = useState('comdirect');
    const [cdClientId, setCdClientId] = useState('');
    const [cdClientSecret, setCdClientSecret] = useState('');
    const [cdUsername, setCdUsername] = useState('');
    const [cdRemember, setCdRemember] = useState(false);
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

    const handleConnectT212 = (e: React.FormEvent) => {
        e.preventDefault();
        if (!t212Key.trim() || !t212Secret.trim()) return;
        connectTrading212(resolveTarget(project, t212Target, t212Name, 'Trading 212'), {
            apiKey: t212Key,
            apiSecret: t212Secret,
            environment: t212Environment,
            remember: t212Remember
        });
        setT212Key('');
        setT212Secret('');
    };

    const handleConnectComdirect = (e: React.FormEvent) => {
        e.preventDefault();
        if (!cdClientId.trim() || !cdClientSecret.trim() || !/^\d{8}$/.test(cdUsername)) return;
        connectComdirect(resolveTarget(project, cdTarget, cdName, 'comdirect'), {
            clientId: cdClientId,
            clientSecret: cdClientSecret,
            username: cdUsername,
            remember: cdRemember
        });
        setCdClientSecret('');
    };

    return (
        <div className="space-y-6">
            <div className="md3-card p-6">
                <h2 className="text-lg font-semibold md3-text-main">Konten &amp; Broker</h2>
                <p className="mt-1 text-sm md3-text-muted">
                    Neue Buchungen kommen automatisch dazu: aus dem Ordner mit deinen DEGIRO-Exporten, über die Flex-Schnittstelle von Interactive Brokers, die API von Trading 212 oder comdirect (mit TAN).
                    Vor jedem Import siehst du, was neu ist; bereits importierte Buchungen werden übersprungen. Zugangsdaten bleiben auf deinem Rechner.
                </p>
            </div>

            {connections.map((connection) => {
                const isApi = connection.kind !== 'degiro-folder';
                const info = CONNECTION_INFO[connection.kind];
                const status = statuses[connection.id];
                return (
                    <div key={connection.id} className="md3-card p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                                <span
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                                    style={{ background: 'var(--md3-primary-container)', color: 'var(--md3-on-primary-container)' }}
                                >
                                    {isApi ? <Landmark size={18} /> : <FolderOpen size={18} />}
                                </span>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold md3-text-main">{info.name}</span>
                                        <span className="md3-chip-tonal rounded-md px-2 py-0.5 text-xs font-semibold">{info.method}</span>
                                    </div>
                                    <div className="mt-0.5 text-sm md3-text-muted">
                                        {isApi ? connection.label : `Ordner „${connection.label}“`} → Depot „{portfolioName(connection.portfolioId)}“
                                        {isApi && (hasStoredSecrets(connection) ? ' · Zugangsdaten gespeichert' : ' · Zugangsdaten nur für diese Sitzung')}
                                    </div>
                                    <div className="mt-2 text-sm"><StatusLine status={status} connection={connection} /></div>
                                    <div className="mt-1 text-xs md3-text-muted">
                                        Zuletzt geprüft: {formatDateTime(connection.lastCheckedAt)} · Letzter Import: {formatDateTime(connection.lastImportAt)}
                                    </div>
                                    {isApi && status?.state === 'needs-token' && <CredentialsPrompt connection={connection} />}
                                    {connection.kind === 'comdirect' && status?.state === 'needs-login' && <ComdirectLoginPrompt connection={connection} />}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => void checkConnection(connection)}
                                    disabled={(!isApi && !supported) || status?.state === 'checking' || status?.state === 'awaiting-tan'}
                                    className="md3-filled-btn flex items-center gap-1.5 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                                >
                                    <RefreshCw size={14} />
                                    {status?.state === 'needs-permission' ? 'Zugriff erlauben' : connection.kind === 'comdirect' ? 'Anmelden' : 'Jetzt prüfen'}
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
            </form>

            <form className="md3-card p-6" onSubmit={handleConnectT212}>
                <h3 className="font-semibold md3-text-main">Trading 212 verbinden</h3>
                <p className="mt-1 text-sm md3-text-muted">
                    In der Trading-212-App unter <em>Einstellungen → API (Beta)</em> einen Schlüssel mit Leserechten für
                    Konto, Historie und Portfolio erzeugen. Die API gibt es nur für Invest- und Aktien-ISA-Konten; Beträge kommen in der Kontowährung.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <TargetPicker project={project} targetId={t212Target} setTargetId={setT212Target} newName={t212Name} setNewName={setT212Name} />
                    <label className="text-xs font-semibold md3-text-muted">
                        API-Schlüssel
                        <input type="password" autoComplete="off" value={t212Key} onChange={(e) => setT212Key(e.target.value)} className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="text-xs font-semibold md3-text-muted">
                        API-Secret
                        <input type="password" autoComplete="off" value={t212Secret} onChange={(e) => setT212Secret(e.target.value)} className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="text-xs font-semibold md3-text-muted">
                        Konto
                        <select value={t212Environment} onChange={(e) => setT212Environment(e.target.value === 'demo' ? 'demo' : 'live')} className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none">
                            <option value="live">Echtgeld</option>
                            <option value="demo">Demo (Paper Trading)</option>
                        </select>
                    </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    {canStoreTokens ? (
                        <label className="flex items-center gap-1.5 text-xs md3-text-muted">
                            <input type="checkbox" checked={t212Remember} onChange={(e) => setT212Remember(e.target.checked)} />
                            Zugangsdaten in der verschlüsselten Projektdatei speichern (automatischer Abruf beim Öffnen)
                        </label>
                    ) : (
                        <span className="text-xs md3-text-muted">
                            Das Projekt ist nicht verschlüsselt: die Zugangsdaten gelten nur für diese Sitzung und werden nicht gespeichert.
                        </span>
                    )}
                    <button
                        type="submit"
                        disabled={!t212Key.trim() || !t212Secret.trim()}
                        className="md3-filled-btn flex items-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                        <Plus size={16} /> Verbinden &amp; abrufen
                    </button>
                </div>
            </form>

            <form className="md3-card p-6" onSubmit={handleConnectComdirect}>
                <h3 className="font-semibold md3-text-main">comdirect verbinden</h3>
                <p className="mt-1 text-sm md3-text-muted">
                    Im persönlichen Bereich unter <em>Verwaltung → REST API</em> freischalten und client_id sowie client_secret herunterladen.
                    Jeder Abruf braucht deine PIN und eine TAN (photoTAN, photoTAN-Push oder mobileTAN); danach liest Openfolio Depotbestand,
                    Depotumsätze und die Umsätze des Verrechnungskontos. Nach dem Abruf wird die Sitzung bei comdirect beendet.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <TargetPicker project={project} targetId={cdTarget} setTargetId={setCdTarget} newName={cdName} setNewName={setCdName} />
                    <label className="text-xs font-semibold md3-text-muted">
                        client_id
                        <input autoComplete="off" value={cdClientId} onChange={(e) => setCdClientId(e.target.value)} className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="text-xs font-semibold md3-text-muted">
                        client_secret
                        <input type="password" autoComplete="off" value={cdClientSecret} onChange={(e) => setCdClientSecret(e.target.value)} className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="text-xs font-semibold md3-text-muted">
                        Zugangsnummer (8 Ziffern)
                        <input inputMode="numeric" autoComplete="off" value={cdUsername} onChange={(e) => setCdUsername(e.target.value.replace(/\D/g, '').slice(0, 8))} className="md3-field mt-1 w-full px-3 py-2 text-sm outline-none" />
                    </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    {canStoreTokens ? (
                        <label className="flex items-center gap-1.5 text-xs md3-text-muted">
                            <input type="checkbox" checked={cdRemember} onChange={(e) => setCdRemember(e.target.checked)} />
                            client_id, client_secret und Zugangsnummer verschlüsselt speichern (die PIN nie)
                        </label>
                    ) : (
                        <span className="text-xs md3-text-muted">
                            Das Projekt ist nicht verschlüsselt: die Zugangsdaten gelten nur für diese Sitzung.
                        </span>
                    )}
                    <button
                        type="submit"
                        disabled={!cdClientId.trim() || !cdClientSecret.trim() || cdUsername.length !== 8}
                        className="md3-filled-btn flex items-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                        <Plus size={16} /> Verbinden
                    </button>
                </div>
            </form>
        </div>
    );
};
