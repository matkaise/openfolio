"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, KeyRound, Landmark, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useProjectData } from '@/contexts/ProjectContext';
import { getBrokerConnections } from '@/lib/brokers/connections';
import type { BrokerConnection, ProjectData } from '@/types/domain';
import { useBrokerSync, type ConnectionStatus } from './BrokerSyncContext';
import { Button, CardHeader, EmptyState, Field, GlassCard, IconButton, Pill, SelectInput, TextInput } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';

const formatDateTime = (value?: string) => (
    value ? new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie'
);

const StatusLine = ({ status, connection }: { status?: ConnectionStatus; connection: BrokerConnection }) => {
    switch (status?.state) {
        case 'checking':
            return <span className="ui-status is-muted"><Loader2 size={14} className="animate-spin" /> Wird geprüft …</span>;
        case 'needs-permission':
            return <span className="ui-status is-warn"><AlertTriangle size={14} /> Ordnerzugriff muss bestätigt werden</span>;
        case 'needs-token':
            return <span className="ui-status is-warn"><KeyRound size={14} /> Zugangsdaten für diese Sitzung eingeben</span>;
        case 'needs-login':
            return <span className="ui-status is-muted"><KeyRound size={14} /> Zum Abrufen mit PIN und TAN anmelden</span>;
        case 'awaiting-tan':
            return <span className="ui-status is-warn"><Loader2 size={14} className="animate-spin" /> Warte auf TAN</span>;
        case 'missing-folder':
            return <span className="ui-status is-down"><AlertTriangle size={14} /> Ordner in diesem Browser nicht gespeichert – bitte neu verbinden</span>;
        case 'error':
            return <span className="ui-status is-down"><AlertTriangle size={14} /> {status.message}</span>;
        case 'ok':
            return (
                <span className="ui-status-stack">
                    <span className="ui-status is-up"><CheckCircle2 size={14} /> {status.message}</span>
                    {status.warnings && status.warnings.length > 0 && (
                        <span className="ui-status is-warn">Bestand weicht ab: {status.warnings.join(' · ')}</span>
                    )}
                </span>
            );
        default:
            return (
                <span className="ui-status is-muted">
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
        <Field label="Ziel-Depot">
            <SelectInput value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="new">Neues Depot</option>
                {project.portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectInput>
        </Field>
        {targetId === 'new' ? (
            <Field label="Name des Depots">
                <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
        ) : <div />}
    </>
);

/** Checkbox to keep credentials in the encrypted project file, or the session-only hint. */
const RememberToggle = ({ canStore, checked, onChange, label, sessionHint }: { canStore: boolean; checked: boolean; onChange: (v: boolean) => void; label: string; sessionHint: string }) => (
    canStore ? (
        <label className="ui-check">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span>{label}</span>
        </label>
    ) : <p className="ui-field-hint">{sessionHint}</p>
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
        <Field label={label}>
            <TextInput type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
        </Field>
    );
    return (
        <form
            className="ui-inline-panel"
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
            <div className="ui-inline-panel-foot">
                {canStoreTokens ? (
                    <label className="ui-check">
                        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                        <span>In der verschlüsselten Projektdatei speichern</span>
                    </label>
                ) : <span />}
                <Button type="submit" variant="primary" size="sm">{isComdirect ? 'Weiter' : 'Abrufen'}</Button>
            </div>
        </form>
    );
};

/** comdirect: the PIN is asked for every login and only sent to the local server once. */
const ComdirectLoginPrompt = ({ connection }: { connection: BrokerConnection }) => {
    const { startComdirectLogin } = useBrokerSync();
    const [pin, setPin] = useState('');
    return (
        <form
            className="ui-inline-panel"
            onSubmit={(e) => {
                e.preventDefault();
                const value = pin;
                setPin('');
                void startComdirectLogin(connection, value);
            }}
        >
            <Field label="PIN" hint="Die PIN wird nicht gespeichert. Nach fünf angeforderten TANs ohne gültige Eingabe sperrt comdirect den Zugang.">
                <TextInput
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
            </Field>
            <div className="ui-inline-panel-foot">
                <span />
                <Button type="submit" variant="primary" size="sm" disabled={pin.length < 4}>TAN anfordern</Button>
            </div>
        </form>
    );
};

const CONNECTION_INFO: Record<BrokerConnection['kind'], { name: string; method: string; short: string; description: string }> = {
    'degiro-folder': { name: 'DEGIRO', method: 'Datei-Ordner', short: 'DG', description: 'Liest neue Exporte aus einem Ordner, ohne Login.' },
    'ibkr-flex': { name: 'Interactive Brokers', method: 'Flex Web Service', short: 'IB', description: 'Ruft eine Flex-Abfrage mit Token ab.' },
    trading212: { name: 'Trading 212', method: 'Public API', short: 'T2', description: 'API-Schlüssel mit Leserechten.' },
    comdirect: { name: 'comdirect', method: 'REST API mit TAN', short: 'CD', description: 'Abruf mit PIN und TAN.' }
};

const PROVIDERS: BrokerConnection['kind'][] = ['degiro-folder', 'ibkr-flex', 'trading212', 'comdirect'];

const hasStoredSecrets = (connection: BrokerConnection) => {
    switch (connection.kind) {
        case 'trading212': return Boolean(connection.apiKey && connection.apiSecret);
        case 'comdirect': return Boolean(connection.clientId && connection.clientSecret && connection.username);
        default: return Boolean(connection.token);
    }
};

export const BrokersContent = () => {
    const project = useProjectData();
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
    const [connectKind, setConnectKind] = useState<BrokerConnection['kind'] | null>(null);

    if (!project) return null;
    const connections = getBrokerConnections(project);
    const portfolioName = (id: string) => project.portfolios.find((p) => p.id === id)?.name || 'Gelöschtes Depot';

    const handleConnectDegiro = async () => {
        setError(null);
        try {
            await connectDegiroFolder(resolveTarget(project, degiroTarget, degiroName, 'DEGIRO'));
            setConnectKind(null);
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

    const closeConnect = () => {
        setConnectKind(null);
        setError(null);
    };

    return (
        <>
            <GlassCard>
                <CardHeader title="Verbundene Broker">{connections.length > 0 && <Pill>{connections.length}</Pill>}</CardHeader>
                <p className="ui-text">Neue Buchungen kommen automatisch dazu. Vor jedem Import siehst du, was neu ist; bereits importierte Buchungen werden übersprungen. Zugangsdaten bleiben auf deinem Rechner.</p>
                {connections.length === 0 ? (
                    <EmptyState icon={<Landmark size={22} />} title="Noch kein Broker verbunden" text="Wähle unten deinen Broker. DEGIRO funktioniert über den Download-Ordner, die anderen über ihre offiziellen Schnittstellen." />
                ) : (
                    <div className="ui-connections">
                        {connections.map((connection) => {
                            const isApi = connection.kind !== 'degiro-folder';
                            const info = CONNECTION_INFO[connection.kind];
                            const status = statuses[connection.id];
                            return (
                                <div key={connection.id} className="ui-connection">
                                    <div className="ui-connection-head">
                                        <span className="ui-broker-logo" aria-hidden="true">{info.short}</span>
                                        <div className="ui-connection-main">
                                            <div className="ui-connection-title">
                                                <span>{info.name}</span>
                                                <Pill>{info.method}</Pill>
                                            </div>
                                            <div className="ui-row-meta">
                                                <span>{isApi ? connection.label : `Ordner „${connection.label}“`} → {portfolioName(connection.portfolioId)}</span>
                                                {isApi && <span>{hasStoredSecrets(connection) ? 'Zugangsdaten gespeichert' : 'Zugangsdaten nur für diese Sitzung'}</span>}
                                            </div>
                                        </div>
                                        <div className="ui-row-actions">
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                icon={<RefreshCw size={14} />}
                                                onClick={() => void checkConnection(connection)}
                                                disabled={(!isApi && !supported) || status?.state === 'checking' || status?.state === 'awaiting-tan'}
                                            >
                                                {status?.state === 'needs-permission' ? 'Zugriff erlauben' : connection.kind === 'comdirect' ? 'Anmelden' : 'Jetzt prüfen'}
                                            </Button>
                                            <IconButton label={`Verbindung ${connection.label} entfernen`} className="is-danger" onClick={() => void removeConnection(connection)}>
                                                <Trash2 size={15} />
                                            </IconButton>
                                        </div>
                                    </div>
                                    <div className="ui-connection-status">
                                        <StatusLine status={status} connection={connection} />
                                        <span className="ui-sub">Geprüft: {formatDateTime(connection.lastCheckedAt)} · Importiert: {formatDateTime(connection.lastImportAt)}</span>
                                    </div>
                                    {isApi && status?.state === 'needs-token' && <CredentialsPrompt connection={connection} />}
                                    {connection.kind === 'comdirect' && status?.state === 'needs-login' && <ComdirectLoginPrompt connection={connection} />}
                                </div>
                            );
                        })}
                    </div>
                )}
            </GlassCard>

            <GlassCard>
                <CardHeader title="Broker verbinden" />
                <div className="ui-providers">
                    {PROVIDERS.map((kind) => {
                        const info = CONNECTION_INFO[kind];
                        return (
                            <button key={kind} type="button" className="ui-provider" onClick={() => setConnectKind(kind)}>
                                <span className="ui-broker-logo" aria-hidden="true">{info.short}</span>
                                <span className="ui-provider-name">{info.name}</span>
                                <Pill>{info.method}</Pill>
                                <span className="ui-provider-text">{info.description}</span>
                            </button>
                        );
                    })}
                </div>
            </GlassCard>

            <Modal
                open={connectKind === 'degiro-folder'}
                onClose={closeConnect}
                title="DEGIRO-Ordner verbinden"
                subtitle="Datei-Ordner · nur Lesezugriff"
                icon={<FolderOpen size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={closeConnect}>Abbrechen</Button>
                        <Button variant="primary" icon={<FolderOpen size={15} />} disabled={!supported} onClick={() => void handleConnectDegiro()}>Ordner wählen</Button>
                    </>
                )}
            >
                <p className="ui-modal-text">Wähle den Ordner, in den du Account.csv und Transactions.csv herunterlädst (z. B. „Downloads“). Openfolio liest ihn nur.</p>
                {!supported && <p className="ui-notice is-warn">Dieser Browser kann keine Ordner verbinden. Das geht in Chrome, Edge oder Brave. Exporte lassen sich weiterhin über „Import“ hochladen.</p>}
                <div className="ui-grid-2">
                    <TargetPicker project={project} targetId={degiroTarget} setTargetId={setDegiroTarget} newName={degiroName} setNewName={setDegiroName} />
                </div>
                {error && <p className="ui-notice is-down">{error}</p>}
                <p className="ui-field-hint">DEGIRO bietet keine offizielle API; der Ordner-Import vermeidet inoffizielle Logins und das Risiko einer Kontosperre.</p>
            </Modal>

            <Modal
                open={connectKind === 'ibkr-flex'}
                onClose={closeConnect}
                size="lg"
                title="Interactive Brokers verbinden"
                subtitle="Flex Web Service"
                icon={<Landmark size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={closeConnect}>Abbrechen</Button>
                        <Button type="submit" form="connect-ibkr" variant="primary" disabled={!ibkrToken.trim() || !ibkrQueryId.trim()}>Verbinden und abrufen</Button>
                    </>
                )}
            >
                <form id="connect-ibkr" className="ui-stack" onSubmit={(e) => { handleConnectIbkr(e); closeConnect(); }}>
                    <p className="ui-modal-text">
                        Im Client Portal unter <em>Performance &amp; Berichte → Flex-Abfragen</em> eine Aktivitäts-Flex-Abfrage (Format XML) mit
                        <em> Trades</em>, <em>Cash Transactions</em> und <em>Open Positions</em> anlegen, die Query-ID ablesen und unter
                        <em> Flex Web Service</em> ein Token erzeugen. Openfolio ruft den Bericht über den lokalen Server direkt bei IBKR ab.
                    </p>
                    <div className="ui-grid-2">
                        <TargetPicker project={project} targetId={ibkrTarget} setTargetId={setIbkrTarget} newName={ibkrName} setNewName={setIbkrName} />
                        <Field label="Flex-Token">
                            <TextInput type="password" autoComplete="off" value={ibkrToken} onChange={(e) => setIbkrToken(e.target.value)} />
                        </Field>
                        <Field label="Query-ID">
                            <TextInput inputMode="numeric" value={ibkrQueryId} onChange={(e) => setIbkrQueryId(e.target.value.replace(/\D/g, ''))} />
                        </Field>
                    </div>
                    <RememberToggle
                        canStore={canStoreTokens}
                        checked={ibkrRemember}
                        onChange={setIbkrRemember}
                        label="Token in der verschlüsselten Projektdatei speichern (Abruf beim Öffnen)"
                        sessionHint="Das Projekt ist nicht verschlüsselt: das Token gilt nur für diese Sitzung und wird nicht gespeichert."
                    />
                </form>
            </Modal>

            <Modal
                open={connectKind === 'trading212'}
                onClose={closeConnect}
                size="lg"
                title="Trading 212 verbinden"
                subtitle="Public API · Leserechte"
                icon={<Landmark size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={closeConnect}>Abbrechen</Button>
                        <Button type="submit" form="connect-t212" variant="primary" disabled={!t212Key.trim() || !t212Secret.trim()}>Verbinden und abrufen</Button>
                    </>
                )}
            >
                <form id="connect-t212" className="ui-stack" onSubmit={(e) => { handleConnectT212(e); closeConnect(); }}>
                    <p className="ui-modal-text">
                        In der Trading-212-App unter <em>Einstellungen → API (Beta)</em> einen Schlüssel mit Leserechten für Konto, Historie und Portfolio erzeugen.
                        Die API gibt es nur für Invest- und Aktien-ISA-Konten; Beträge kommen in der Kontowährung.
                    </p>
                    <div className="ui-grid-2">
                        <TargetPicker project={project} targetId={t212Target} setTargetId={setT212Target} newName={t212Name} setNewName={setT212Name} />
                        <Field label="API-Schlüssel">
                            <TextInput type="password" autoComplete="off" value={t212Key} onChange={(e) => setT212Key(e.target.value)} />
                        </Field>
                        <Field label="API-Secret">
                            <TextInput type="password" autoComplete="off" value={t212Secret} onChange={(e) => setT212Secret(e.target.value)} />
                        </Field>
                        <Field label="Konto">
                            <SelectInput value={t212Environment} onChange={(e) => setT212Environment(e.target.value === 'demo' ? 'demo' : 'live')}>
                                <option value="live">Echtgeld</option>
                                <option value="demo">Demo (Paper Trading)</option>
                            </SelectInput>
                        </Field>
                    </div>
                    <RememberToggle
                        canStore={canStoreTokens}
                        checked={t212Remember}
                        onChange={setT212Remember}
                        label="Zugangsdaten in der verschlüsselten Projektdatei speichern (Abruf beim Öffnen)"
                        sessionHint="Das Projekt ist nicht verschlüsselt: die Zugangsdaten gelten nur für diese Sitzung und werden nicht gespeichert."
                    />
                </form>
            </Modal>

            <Modal
                open={connectKind === 'comdirect'}
                onClose={closeConnect}
                size="lg"
                title="comdirect verbinden"
                subtitle="REST API mit TAN"
                icon={<Landmark size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={closeConnect}>Abbrechen</Button>
                        <Button type="submit" form="connect-comdirect" variant="primary" disabled={!cdClientId.trim() || !cdClientSecret.trim() || cdUsername.length !== 8}>Verbinden</Button>
                    </>
                )}
            >
                <form id="connect-comdirect" className="ui-stack" onSubmit={(e) => { handleConnectComdirect(e); closeConnect(); }}>
                    <p className="ui-modal-text">
                        Im persönlichen Bereich unter <em>Verwaltung → REST API</em> freischalten und client_id sowie client_secret herunterladen.
                        Jeder Abruf braucht deine PIN und eine TAN (photoTAN, photoTAN-Push oder mobileTAN); danach liest Openfolio Depotbestand,
                        Depotumsätze und die Umsätze des Verrechnungskontos und beendet die Sitzung bei comdirect.
                    </p>
                    <div className="ui-grid-2">
                        <TargetPicker project={project} targetId={cdTarget} setTargetId={setCdTarget} newName={cdName} setNewName={setCdName} />
                        <Field label="client_id">
                            <TextInput autoComplete="off" value={cdClientId} onChange={(e) => setCdClientId(e.target.value)} />
                        </Field>
                        <Field label="client_secret">
                            <TextInput type="password" autoComplete="off" value={cdClientSecret} onChange={(e) => setCdClientSecret(e.target.value)} />
                        </Field>
                        <Field label="Zugangsnummer (8 Ziffern)">
                            <TextInput inputMode="numeric" autoComplete="off" value={cdUsername} onChange={(e) => setCdUsername(e.target.value.replace(/\D/g, '').slice(0, 8))} />
                        </Field>
                    </div>
                    <RememberToggle
                        canStore={canStoreTokens}
                        checked={cdRemember}
                        onChange={setCdRemember}
                        label="client_id, client_secret und Zugangsnummer verschlüsselt speichern (die PIN nie)"
                        sessionHint="Das Projekt ist nicht verschlüsselt: die Zugangsdaten gelten nur für diese Sitzung."
                    />
                </form>
            </Modal>
        </>
    );
};
