"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, KeyRound, Landmark, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useProjectData } from '@/contexts/ProjectContext';
import { getBrokerConnections } from '@/lib/brokers/connections';
import type { BrokerConnection, ProjectData } from '@/types/domain';
import { useBrokerSync, type ConnectionStatus } from './BrokerSyncContext';
import { Button, CardHeader, EmptyState, Field, GlassCard, IconButton, Pill, SelectInput, TextInput } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { useFormatters } from '@/components/ui/useFormatters';
import { useT, type Messages } from '@/lib/i18n';
import type { Formatters } from '@/lib/format';

const formatDateTime = (t: Messages, formatters: Formatters, value?: string) => (
    value ? formatters.date(value, { dateStyle: 'medium', timeStyle: 'short' }) : t.brokers.never
);

const StatusLine = ({ status, connection }: { status?: ConnectionStatus; connection: BrokerConnection }) => {
    const t = useT();
    switch (status?.state) {
        case 'checking':
            return <span className="ui-status is-muted"><Loader2 size={14} className="animate-spin" /> {t.brokers.status.checking}</span>;
        case 'needs-permission':
            return <span className="ui-status is-warn"><AlertTriangle size={14} /> {t.brokers.status.needsPermission}</span>;
        case 'needs-token':
            return <span className="ui-status is-warn"><KeyRound size={14} /> {t.brokers.status.needsToken}</span>;
        case 'needs-login':
            return <span className="ui-status is-muted"><KeyRound size={14} /> {t.brokers.status.needsLogin}</span>;
        case 'awaiting-tan':
            return <span className="ui-status is-warn"><Loader2 size={14} className="animate-spin" /> {t.brokers.status.awaitingTan}</span>;
        case 'missing-folder':
            return <span className="ui-status is-down"><AlertTriangle size={14} /> {t.brokers.status.missingFolder}</span>;
        case 'error':
            return <span className="ui-status is-down"><AlertTriangle size={14} /> {status.message}</span>;
        case 'ok':
            return (
                <span className="ui-status-stack">
                    <span className="ui-status is-up"><CheckCircle2 size={14} /> {status.message}</span>
                    {status.warnings && status.warnings.length > 0 && (
                        <span className="ui-status is-warn">{t.brokers.status.holdingsDiffer(status.warnings.join(' · '))}</span>
                    )}
                </span>
            );
        default:
            return (
                <span className="ui-status is-muted">
                    {connection.lastResult
                        ? t.brokers.status.lastImport(connection.lastResult.added, connection.lastResult.duplicates)
                        : t.brokers.status.notChecked}
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
}) => {
    const t = useT();
    return (
    <>
        <Field label={t.brokers.targetPortfolio}>
            <SelectInput value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="new">{t.brokers.newPortfolio}</option>
                {project.portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectInput>
        </Field>
        {targetId === 'new' ? (
            <Field label={t.brokers.portfolioName}>
                <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
        ) : <div />}
    </>
    );
};

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
    const t = useT();
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
                    {field(t.brokers.accessNumber, username, setUsername)}
                </>
            ) : isT212 ? (
                <>
                    {field(t.brokers.apiKey, apiKey, setApiKey)}
                    {field(t.brokers.apiSecret, apiSecret, setApiSecret)}
                </>
            ) : field(t.brokers.flexToken, token, setToken)}
            <div className="ui-inline-panel-foot">
                {canStoreTokens ? (
                    <label className="ui-check">
                        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                        <span>{t.brokers.storeInFile}</span>
                    </label>
                ) : <span />}
                <Button type="submit" variant="primary" size="sm">{isComdirect ? t.brokers.continue : t.brokers.fetch}</Button>
            </div>
        </form>
    );
};

/** comdirect: the PIN is asked for every login and only sent to the local server once. */
const ComdirectLoginPrompt = ({ connection }: { connection: BrokerConnection }) => {
    const { startComdirectLogin } = useBrokerSync();
    const t = useT();
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
            <Field label="PIN" hint={t.brokers.pinHint}>
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
                <Button type="submit" variant="primary" size="sm" disabled={pin.length < 4}>{t.brokers.requestTan}</Button>
            </div>
        </form>
    );
};

/** Method and description are in the messages (brokers.info). */
const CONNECTION_INFO: Record<BrokerConnection['kind'], { name: string; short: string }> = {
    'degiro-folder': { name: 'DEGIRO', short: 'DG' },
    'ibkr-flex': { name: 'Interactive Brokers', short: 'IB' },
    trading212: { name: 'Trading 212', short: 'T2' },
    comdirect: { name: 'comdirect', short: 'CD' }
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
    const t = useT();
    const formatters = useFormatters();
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
    const portfolioName = (id: string) => project.portfolios.find((p) => p.id === id)?.name || t.brokers.deletedPortfolio;

    const handleConnectDegiro = async () => {
        setError(null);
        try {
            await connectDegiroFolder(resolveTarget(project, degiroTarget, degiroName, 'DEGIRO'));
            setConnectKind(null);
        } catch (err) {
            if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') return;
            setError(err instanceof Error ? err.message : t.brokers.folderFailed);
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
                <CardHeader title={t.brokers.connected}>{connections.length > 0 && <Pill>{connections.length}</Pill>}</CardHeader>
                <p className="ui-text">{t.brokers.connectedText}</p>
                {connections.length === 0 ? (
                    <EmptyState icon={<Landmark size={22} />} title={t.brokers.noneTitle} text={t.brokers.noneText} />
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
                                                <Pill>{t.brokers.info[connection.kind].method}</Pill>
                                            </div>
                                            <div className="ui-row-meta">
                                                <span>{isApi ? connection.label : t.brokers.folder(connection.label)} → {portfolioName(connection.portfolioId)}</span>
                                                {isApi && <span>{hasStoredSecrets(connection) ? t.brokers.secretsStored : t.brokers.secretsSession}</span>}
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
                                                {status?.state === 'needs-permission' ? t.brokers.allowAccess : connection.kind === 'comdirect' ? t.brokers.signIn : t.brokers.checkNow}
                                            </Button>
                                            <IconButton label={t.brokers.removeConnection(connection.label)} className="is-danger" onClick={() => void removeConnection(connection)}>
                                                <Trash2 size={15} />
                                            </IconButton>
                                        </div>
                                    </div>
                                    <div className="ui-connection-status">
                                        <StatusLine status={status} connection={connection} />
                                        <span className="ui-sub">{t.brokers.checkedImported(formatDateTime(t, formatters, connection.lastCheckedAt), formatDateTime(t, formatters, connection.lastImportAt))}</span>
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
                <CardHeader title={t.brokers.connect} />
                <div className="ui-providers">
                    {PROVIDERS.map((kind) => {
                        const info = CONNECTION_INFO[kind];
                        return (
                            <button key={kind} type="button" className="ui-provider" onClick={() => setConnectKind(kind)}>
                                <span className="ui-broker-logo" aria-hidden="true">{info.short}</span>
                                <span className="ui-provider-name">{info.name}</span>
                                <Pill>{t.brokers.info[kind].method}</Pill>
                                <span className="ui-provider-text">{t.brokers.info[kind].description}</span>
                            </button>
                        );
                    })}
                </div>
            </GlassCard>

            <Modal
                open={connectKind === 'degiro-folder'}
                onClose={closeConnect}
                title={t.brokers.degiroTitle}
                subtitle={t.brokers.degiroSubtitle}
                icon={<FolderOpen size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={closeConnect}>{t.common.cancel}</Button>
                        <Button variant="primary" icon={<FolderOpen size={15} />} disabled={!supported} onClick={() => void handleConnectDegiro()}>{t.brokers.chooseFolder}</Button>
                    </>
                )}
            >
                <p className="ui-modal-text">{t.brokers.degiroText}</p>
                {!supported && <p className="ui-notice is-warn">{t.brokers.folderUnsupported}</p>}
                <div className="ui-grid-2">
                    <TargetPicker project={project} targetId={degiroTarget} setTargetId={setDegiroTarget} newName={degiroName} setNewName={setDegiroName} />
                </div>
                {error && <p className="ui-notice is-down">{error}</p>}
                <p className="ui-field-hint">{t.brokers.degiroHint}</p>
            </Modal>

            <Modal
                open={connectKind === 'ibkr-flex'}
                onClose={closeConnect}
                size="lg"
                title={t.brokers.ibkrTitle}
                subtitle={t.brokers.info['ibkr-flex'].method}
                icon={<Landmark size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={closeConnect}>{t.common.cancel}</Button>
                        <Button type="submit" form="connect-ibkr" variant="primary" disabled={!ibkrToken.trim() || !ibkrQueryId.trim()}>{t.brokers.connectAndFetch}</Button>
                    </>
                )}
            >
                <form id="connect-ibkr" className="ui-stack" onSubmit={(e) => { handleConnectIbkr(e); closeConnect(); }}>
                    <p className="ui-modal-text">{t.brokers.ibkrText}</p>
                    <div className="ui-grid-2">
                        <TargetPicker project={project} targetId={ibkrTarget} setTargetId={setIbkrTarget} newName={ibkrName} setNewName={setIbkrName} />
                        <Field label={t.brokers.flexToken}>
                            <TextInput type="password" autoComplete="off" value={ibkrToken} onChange={(e) => setIbkrToken(e.target.value)} />
                        </Field>
                        <Field label={t.brokers.queryId}>
                            <TextInput inputMode="numeric" value={ibkrQueryId} onChange={(e) => setIbkrQueryId(e.target.value.replace(/\D/g, ''))} />
                        </Field>
                    </div>
                    <RememberToggle
                        canStore={canStoreTokens}
                        checked={ibkrRemember}
                        onChange={setIbkrRemember}
                        label={t.brokers.ibkrRemember}
                        sessionHint={t.brokers.ibkrSession}
                    />
                </form>
            </Modal>

            <Modal
                open={connectKind === 'trading212'}
                onClose={closeConnect}
                size="lg"
                title={t.brokers.t212Title}
                subtitle={t.brokers.t212Subtitle}
                icon={<Landmark size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={closeConnect}>{t.common.cancel}</Button>
                        <Button type="submit" form="connect-t212" variant="primary" disabled={!t212Key.trim() || !t212Secret.trim()}>{t.brokers.connectAndFetch}</Button>
                    </>
                )}
            >
                <form id="connect-t212" className="ui-stack" onSubmit={(e) => { handleConnectT212(e); closeConnect(); }}>
                    <p className="ui-modal-text">{t.brokers.t212Text}</p>
                    <div className="ui-grid-2">
                        <TargetPicker project={project} targetId={t212Target} setTargetId={setT212Target} newName={t212Name} setNewName={setT212Name} />
                        <Field label={t.brokers.apiKey}>
                            <TextInput type="password" autoComplete="off" value={t212Key} onChange={(e) => setT212Key(e.target.value)} />
                        </Field>
                        <Field label={t.brokers.apiSecret}>
                            <TextInput type="password" autoComplete="off" value={t212Secret} onChange={(e) => setT212Secret(e.target.value)} />
                        </Field>
                        <Field label={t.brokers.account}>
                            <SelectInput value={t212Environment} onChange={(e) => setT212Environment(e.target.value === 'demo' ? 'demo' : 'live')}>
                                <option value="live">{t.brokers.live}</option>
                                <option value="demo">{t.brokers.demo}</option>
                            </SelectInput>
                        </Field>
                    </div>
                    <RememberToggle
                        canStore={canStoreTokens}
                        checked={t212Remember}
                        onChange={setT212Remember}
                        label={t.brokers.t212Remember}
                        sessionHint={t.brokers.t212Session}
                    />
                </form>
            </Modal>

            <Modal
                open={connectKind === 'comdirect'}
                onClose={closeConnect}
                size="lg"
                title={t.brokers.comdirectTitle}
                subtitle={t.brokers.info.comdirect.method}
                icon={<Landmark size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={closeConnect}>{t.common.cancel}</Button>
                        <Button type="submit" form="connect-comdirect" variant="primary" disabled={!cdClientId.trim() || !cdClientSecret.trim() || cdUsername.length !== 8}>{t.brokers.connectOnly}</Button>
                    </>
                )}
            >
                <form id="connect-comdirect" className="ui-stack" onSubmit={(e) => { handleConnectComdirect(e); closeConnect(); }}>
                    <p className="ui-modal-text">{t.brokers.comdirectText}</p>
                    <div className="ui-grid-2">
                        <TargetPicker project={project} targetId={cdTarget} setTargetId={setCdTarget} newName={cdName} setNewName={setCdName} />
                        <Field label="client_id">
                            <TextInput autoComplete="off" value={cdClientId} onChange={(e) => setCdClientId(e.target.value)} />
                        </Field>
                        <Field label="client_secret">
                            <TextInput type="password" autoComplete="off" value={cdClientSecret} onChange={(e) => setCdClientSecret(e.target.value)} />
                        </Field>
                        <Field label={t.brokers.accessNumber8}>
                            <TextInput inputMode="numeric" autoComplete="off" value={cdUsername} onChange={(e) => setCdUsername(e.target.value.replace(/\D/g, '').slice(0, 8))} />
                        </Field>
                    </div>
                    <RememberToggle
                        canStore={canStoreTokens}
                        checked={cdRemember}
                        onChange={setCdRemember}
                        label={t.brokers.comdirectRemember}
                        sessionHint={t.brokers.comdirectSession}
                    />
                </form>
            </Modal>
        </>
    );
};
