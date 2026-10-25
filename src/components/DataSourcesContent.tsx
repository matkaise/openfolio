"use client";

import React, { useState, useMemo } from 'react';
import { Loader2, RefreshCw, CheckCircle, Search, Check, PencilLine, Trash2, Wallet } from 'lucide-react';
import { useProjectActions, useProjectData, useProjectStoreShallow } from '@/contexts/ProjectContext';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { buildManualPriceHistory, securityNeedsSync } from '@/lib/marketDataService';
import { getRangeStartDate, toDateKeyLocal } from '@/lib/dateUtils';
import { BarChart3 } from 'lucide-react';
import { Avatar, Button, CardHeader, EmptyState, Field, GlassCard, IconButton, IconTile, ListRow, Pill, Segmented, SelectInput, TextInput } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { SimpleAreaChart } from './SimpleAreaChart';
import { Security, type ProjectData } from '@/types/domain';
import { resolveTicker, searchCompanyMatches, type CompanyMatch } from '@/lib/tickerSearch';
import { getTransactions, removePortfolioBookings } from '@/lib/domain/ledger/store';

const isSecurityPending = (sec: Security, nowMs: number) => securityNeedsSync(sec, new Date(nowMs));

export const DataSourcesContent = () => {
    const project = useProjectData();
    const { syncFx, syncMarket, updateProject } = useProjectActions();
    const { isSyncing, isMarketSyncing, marketSyncProgress } = useProjectStoreShallow((state) => ({
        isSyncing: state.isSyncing,
        isMarketSyncing: state.isMarketSyncing,
        marketSyncProgress: state.marketSyncProgress
    }));
    const [selectedCurrency, setSelectedCurrency] = useState('USD');
    const [timeRange, setTimeRange] = useState('1J');

    // Prepare chart data from project.fxData
    const chartData = useMemo(() => {
        if (!project?.fxData.rates[selectedCurrency]) return [];

        const rates = project.fxData.rates[selectedCurrency];
        let entries = Object.entries(rates)
            .sort((a, b) => a[0].localeCompare(b[0]));

        // Filter based on Time Range
        const now = new Date();
        const cutoff = timeRange === 'MAX' ? null : (getRangeStartDate(timeRange, now) ?? getRangeStartDate('1J', now));
        const cutoffStr = cutoff ? toDateKeyLocal(cutoff) : '';
        entries = entries.filter(([date]) => date >= cutoffStr);

        return entries.map(([date, rate]) => ({
            date,
            rate
        }));
    }, [project?.fxData, selectedCurrency, timeRange]);

    const formatXAxis = (tickItem: string) => {
        const d = new Date(tickItem);
        // If range is large (3J, 5J, MAX), show Year only
        if (['3J', '5J', 'MAX'].includes(timeRange)) {
            return `${d.getFullYear()}`;
        }
        return `${d.getDate()}.${d.getMonth() + 1}.`;
    };

    const availableCurrencies = useMemo(() => {
        if (!project?.fxData.rates) return ['USD'];
        return Object.keys(project.fxData.rates).sort();
    }, [project]);

    // Market Data Info
    const [selectedSecurity, setSelectedSecurity] = useState<Security | null>(null);
    const [modalTimeRange, setModalTimeRange] = useState('1M');
    const [activeSearchSecurity, setActiveSearchSecurity] = useState<Security | null>(null);
    const [companyQuery, setCompanyQuery] = useState('');
    const [companyMatches, setCompanyMatches] = useState<CompanyMatch[]>([]);
    const [companySearchMessage, setCompanySearchMessage] = useState<string | null>(null);
    const [isCompanySearching, setIsCompanySearching] = useState(false);
    const [portfolioToDelete, setPortfolioToDelete] = useState<{ id: string; name: string; txCount: number; cashCount: number } | null>(null);

    // Filter Security Data based on Time Range
    const getFilteredHistory = (history: Record<string, number> | undefined) => {
        if (!history) return [];
        const entries = Object.entries(history).sort((a, b) => a[0].localeCompare(b[0]));

        const now = new Date();
        const cutoff = modalTimeRange === 'MAX' ? null : (getRangeStartDate(modalTimeRange, now) ?? getRangeStartDate('1M', now));
        const cutoffStr = cutoff ? toDateKeyLocal(cutoff) : '';
        return entries
            .filter(([date]) => date >= cutoffStr)
            .map(([date, value]) => ({ date, value }));
    };

    // Derived Stats
    const projectSecurities = project?.securities;
    const marketStats = useMemo(() => {
        if (!projectSecurities) return { count: 0, lastSync: null, securities: [] };
        const secs = Object.values(projectSecurities);
        const count = secs.length;
        const lastSyncTimes = secs.map(s => s.lastSync ? new Date(s.lastSync).getTime() : 0);
        const maxTime = Math.max(...lastSyncTimes);
        return {
            count,
            lastSync: maxTime > 0 ? new Date(maxTime).toISOString().split('T')[0] : 'Nie',
            securities: secs.sort((a, b) => a.name.localeCompare(b.name))
        };
    }, [projectSecurities]);

    const unresolvedSecurities = useMemo(() => {
        return marketStats.securities.filter(sec => sec.symbolStatus === 'unresolved');
    }, [marketStats.securities]);

    const portfolioStats = useMemo(() => {
        const portfolios = project?.portfolios || [];
        const txCounts: Record<string, number> = {};
        const cashCounts: Record<string, number> = {};

        getTransactions(project).forEach(tx => {
            if (!tx.portfolioId) return;
            txCounts[tx.portfolioId] = (txCounts[tx.portfolioId] || 0) + 1;
        });

        (project?.cashAccounts || []).forEach(acc => {
            if (!acc.portfolioId) return;
            cashCounts[acc.portfolioId] = (cashCounts[acc.portfolioId] || 0) + 1;
        });

        return portfolios.map(p => ({
            id: p.id,
            name: p.name,
            txCount: txCounts[p.id] || 0,
            cashCount: cashCounts[p.id] || 0
        }));
    }, [project]);

    const applyResolvedTicker = (
        sec: Security,
        symbol: string,
        options?: { name?: string; currency?: string; source?: Security['symbolSource'] }
    ) => {
        const next = symbol.trim().toUpperCase();
        if (!next) return;
        if (!project) return;
        const now = new Date().toISOString();

        // Pure: used for the state update and, on the current project, for the sync below.
        const applyTicker = (prev: ProjectData): ProjectData => {
            const current = prev.securities[sec.isin];
            if (!current) return prev;

            const updatedSecurity: Security = {
                ...current,
                symbol: next,
                name: options?.name || current.name,
                currency: options?.currency || current.currency,
                symbolStatus: 'resolved',
                symbolSource: options?.source || 'manual',
                symbolLastTried: now,
                ignoreMarketData: false,
                quoteType: undefined,
                priceHistory: {},
                splits: {},
                dividendHistory: [],
                upcomingDividends: [],
                dividendHistorySynced: false,
                lastSync: undefined,
                marketCap: undefined,
                trailingPE: undefined,
                dividendYield: undefined,
                fiftyTwoWeekHigh: undefined,
                fiftyTwoWeekLow: undefined,
                totalRevenue: undefined,
                forwardPE: undefined,
                epsTrailingTwelveMonths: undefined,
                epsForward: undefined,
                earningsHistory: undefined,
                annualDividendRate: undefined,
                country: undefined,
                sector: undefined,
                industry: undefined
            };

            return {
                ...prev,
                securities: {
                    ...prev.securities,
                    [sec.isin]: updatedSecurity
                },
                modified: now
            };
        };

        updateProject(applyTicker);
        void syncMarket(true, { projectOverride: applyTicker(project) });
    };

    const handleIgnoreSecurity = (sec: Security) => {
        updateProject(prev => {
            const current = prev.securities[sec.isin];
            if (!current) return prev;
            const manualHistory = buildManualPriceHistory(getTransactions(prev), sec.isin);
            return {
                ...prev,
                securities: {
                    ...prev.securities,
                    [sec.isin]: {
                        ...current,
                        ignoreMarketData: true,
                        symbolStatus: 'ignored',
                        priceHistory: { ...(current.priceHistory || {}), ...manualHistory },
                        dividendHistory: current.dividendHistory || [],
                        upcomingDividends: current.upcomingDividends || [],
                        dividendHistorySynced: true
                    }
                },
                modified: new Date().toISOString()
            };
        });
    };

    const openCompanySearch = (sec: Security) => {
        setActiveSearchSecurity(sec);
        setCompanyQuery(sec.symbol || sec.name || sec.isin);
        setCompanyMatches([]);
        setCompanySearchMessage(null);
    };

    const closeCompanySearch = () => {
        setActiveSearchSecurity(null);
        setCompanyMatches([]);
        setCompanySearchMessage(null);
        setIsCompanySearching(false);
        setCompanyQuery('');
    };

    const handleCompanySearch = async () => {
        if (!activeSearchSecurity) return;
        const query = companyQuery.trim();
        if (!query) return;

        setIsCompanySearching(true);
        setCompanySearchMessage(null);
        setCompanyMatches([]);

        const resolveResult = await resolveTicker(query, {
            currency: activeSearchSecurity.currency,
            isin: activeSearchSecurity.isin
        });

        const directMatches: CompanyMatch[] = [];
        if (resolveResult?.status === 'resolved' && resolveResult.symbol) {
            directMatches.push({
                symbol: resolveResult.symbol,
                name: resolveResult.name,
                currency: resolveResult.currency
            });
        }

        const matches = await searchCompanyMatches(query);
        setIsCompanySearching(false);

        const combinedMatches = directMatches.length
            ? [
                ...directMatches,
                ...matches.filter(match => match.symbol !== directMatches[0].symbol)
            ]
            : matches;

        if (!combinedMatches.length) {
            setCompanySearchMessage('Kein Treffer gefunden.');
            return;
        }

        setCompanyMatches(combinedMatches);
    };

    const handleSelectCompanyMatch = (match: CompanyMatch) => {
        if (!activeSearchSecurity) return;
        applyResolvedTicker(activeSearchSecurity, match.symbol, {
            name: match.name,
            currency: match.currency,
            source: 'yahoo'
        });
        closeCompanySearch();
    };

    // Reference time for "stale" checks; taken once per mount to keep rendering pure.
    const [nowMs] = useState(() => Date.now());
    const pendingSecurities = useMemo(() => {
        return marketStats.securities.filter(sec => isSecurityPending(sec, nowMs));
    }, [marketStats.securities, nowMs]);

    const handleQuoteSync = async () => {
        if (!project) return;
        await syncMarket(true, { full: true });
    };

    const handleDeletePortfolio = (portfolioId: string) => {
        updateProject(prev => {
            const portfolios = (prev.portfolios || []).filter(p => p.id !== portfolioId);
            const cashAccounts = (prev.cashAccounts || []).filter(a => a.portfolioId !== portfolioId);
            return {
                ...removePortfolioBookings(prev, portfolioId),
                portfolios,
                cashAccounts,
                modified: new Date().toISOString()
            };
        });
        setPortfolioToDelete(null);
    };

    const RANGE_OPTIONS = ['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((value) => ({ value, label: value }));
    const marketStatus = isMarketSyncing
        ? <Pill tone="accent"><Loader2 size={12} className="animate-spin" />Aktualisiere …</Pill>
        : pendingSecurities.length > 0
            ? <Pill>Teilweise</Pill>
            : marketStats.lastSync && marketStats.lastSync !== 'Nie'
                ? <Pill tone="up"><CheckCircle size={12} />Aktuell</Pill>
                : <Pill>Ausstehend</Pill>;
    const securityBadge = (sec: Security) => {
        if (isSecurityPending(sec, nowMs)) return <Pill>Ausstehend</Pill>;
        if (sec.lastSync) return <Pill tone="up">{new Date(sec.lastSync).toLocaleDateString('de-DE')}</Pill>;
        return sec.symbolStatus === 'unresolved' ? <Pill tone="down">Nicht gefunden</Pill> : <Pill>Ausstehend</Pill>;
    };

    return (
        <>
            <div className="ui-grid-2" style={{ alignItems: 'start' }}>
                <GlassCard>
                    <CardHeader title="EZB-Wechselkurse">
                        {isSyncing ? <Pill tone="accent"><Loader2 size={12} className="animate-spin" />Aktualisiere …</Pill> : <Pill tone="up"><CheckCircle size={12} />Aktuell</Pill>}
                    </CardHeader>
                    <p className="ui-text">Offizielle Referenzkurse der Europäischen Zentralbank.</p>
                    <div className="ui-status-row">
                        <div>
                            <span className="ui-label">Letztes Update</span>
                            <span className="ui-status-value">{project?.fxData.lastUpdated || 'Nie'}</span>
                        </div>
                        <IconButton label="EZB-Kurse aktualisieren" onClick={() => syncFx()} disabled={isSyncing}>
                            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        </IconButton>
                    </div>

                    <div className="ui-toolbar">
                        <Segmented options={RANGE_OPTIONS} value={timeRange} onChange={setTimeRange} ariaLabel="Zeitraum" size="sm" />
                        <SelectInput aria-label="Währung" value={selectedCurrency} onChange={(e) => setSelectedCurrency(e.target.value)} className="ui-input-compact">
                            {availableCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                        </SelectInput>
                    </div>
                    <div className="ui-chart" style={{ height: 200 }}>
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="fxRateFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" tickFormatter={formatXAxis} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} minTickGap={40} />
                                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={44} />
                                    <Tooltip
                                        contentStyle={{ background: 'color-mix(in oklch, var(--surface) 92%, transparent)', border: '1px solid var(--stroke)', borderRadius: 12, fontSize: 12 }}
                                        labelStyle={{ color: 'var(--text3)' }}
                                        itemStyle={{ color: 'var(--text)' }}
                                    />
                                    <Area type="monotone" dataKey="rate" name={`${selectedCurrency} je EUR`} stroke="var(--accent)" strokeWidth={2} fill="url(#fxRateFill)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <EmptyState title="Keine Kurse" text="Noch keine Wechselkurse geladen. Bitte aktualisieren." />
                        )}
                    </div>
                </GlassCard>

                <GlassCard>
                    <CardHeader title="Kursdaten (Yahoo)">{marketStatus}</CardHeader>
                    <p className="ui-text">Automatische Schlusskurse für Aktien und ETFs.</p>
                    <div className="ui-status-row">
                        <div>
                            <span className="ui-label">Letztes Update</span>
                            <span className="ui-status-value">{marketStats.lastSync}</span>
                        </div>
                        <IconButton label="Kursdaten aktualisieren" onClick={handleQuoteSync} disabled={isMarketSyncing}>
                            {isMarketSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        </IconButton>
                    </div>
                    {isMarketSyncing && marketSyncProgress && marketSyncProgress.total > 0 && (
                        <div className="ui-progress-block">
                            <div className="ui-progress-meta">
                                <span>{marketSyncProgress.symbol ? `Aktuell: ${marketSyncProgress.symbol}` : 'Fortschritt'}</span>
                                <span>{marketSyncProgress.current}/{marketSyncProgress.total}</span>
                            </div>
                            <div className="ui-progress"><span style={{ width: `${Math.min(100, Math.round((marketSyncProgress.current / marketSyncProgress.total) * 100))}%` }} /></div>
                        </div>
                    )}
                    {marketStats.securities.length === 0 ? (
                        <EmptyState title="Keine Wertpapiere" text="Sobald Positionen importiert sind, werden ihre Kurse hier geladen." />
                    ) : (
                        <div className="ui-rows ui-scroll" style={{ maxHeight: 340 }}>
                            {marketStats.securities.map((sec) => (
                                <ListRow
                                    key={sec.isin}
                                    onClick={() => setSelectedSecurity(sec)}
                                    leading={<Avatar seed={sec.isin} label={sec.name} size={38} />}
                                    title={sec.symbol || sec.isin}
                                    meta={<span>{sec.name}</span>}
                                    trailing={securityBadge(sec)}
                                />
                            ))}
                        </div>
                    )}
                </GlassCard>
            </div>

            {unresolvedSecurities.length > 0 && (
                <GlassCard>
                    <CardHeader title={`Fehlende Ticker (${unresolvedSecurities.length})`} />
                    <p className="ui-text">Für diese Titel wurde kein Yahoo-Ticker gefunden. Weise ihn manuell zu oder verzichte auf Marktdaten.</p>
                    <div className="ui-rows" style={{ marginTop: 8 }}>
                        {unresolvedSecurities.map((sec) => (
                            <ListRow
                                key={sec.isin}
                                onClick={() => openCompanySearch(sec)}
                                leading={<Avatar seed={sec.isin} label={sec.name} size={38} />}
                                title={sec.name}
                                meta={<span>{sec.isin}</span>}
                                trailing={<span className="ui-row-sub"><Pill tone="down">Kein Treffer</Pill><span className="ui-link">Zuweisen</span></span>}
                            />
                        ))}
                    </div>
                </GlassCard>
            )}

            <GlassCard>
                <CardHeader title="Depots verwalten" />
                <p className="ui-text">Löscht ein Depot mit allen zugehörigen Buchungen und Konten.</p>
                {portfolioStats.length === 0 ? (
                    <EmptyState title="Keine Depots" />
                ) : (
                    <div className="ui-rows" style={{ marginTop: 8 }}>
                        {portfolioStats.map((portfolio) => (
                            <ListRow
                                key={portfolio.id}
                                leading={<IconTile tone="accent"><Wallet size={18} /></IconTile>}
                                title={portfolio.name}
                                meta={<span>{portfolio.txCount} Buchungen · {portfolio.cashCount} Konten</span>}
                                trailing={(
                                    <IconButton label={`Depot ${portfolio.name} löschen`} className="is-danger" onClick={() => setPortfolioToDelete(portfolio)}>
                                        <Trash2 size={16} />
                                    </IconButton>
                                )}
                            />
                        ))}
                    </div>
                )}
            </GlassCard>

            <Modal
                open={Boolean(selectedSecurity)}
                onClose={() => setSelectedSecurity(null)}
                size="lg"
                title={selectedSecurity?.name}
                subtitle={selectedSecurity ? `${selectedSecurity.symbol || '–'} · ${selectedSecurity.isin}` : undefined}
                icon={selectedSecurity ? <Avatar seed={selectedSecurity.isin} label={selectedSecurity.name} size={44} /> : undefined}
                footer={(
                    <>
                        <Button
                            variant="ghost"
                            icon={<PencilLine size={14} />}
                            onClick={() => {
                                const sec = selectedSecurity;
                                if (!sec) return;
                                setSelectedSecurity(null);
                                openCompanySearch(sec);
                            }}
                        >
                            Ticker ändern
                        </Button>
                        <Button onClick={() => setSelectedSecurity(null)}>Schließen</Button>
                    </>
                )}
            >
                {selectedSecurity && (
                    <>
                        <Segmented options={RANGE_OPTIONS} value={modalTimeRange} onChange={setModalTimeRange} ariaLabel="Zeitraum" size="sm" />
                        <div className="ui-chart" style={{ height: 320 }}>
                            {selectedSecurity.priceHistory && Object.keys(selectedSecurity.priceHistory).length > 0 ? (
                                <SimpleAreaChart
                                    data={getFilteredHistory(selectedSecurity.priceHistory)}
                                    color="var(--accent)"
                                    height={320}
                                    showAxes={true}
                                    timeRange={modalTimeRange}
                                    currency={selectedSecurity.currency}
                                />
                            ) : (
                                <EmptyState icon={<BarChart3 size={22} />} title="Keine Kursdaten" text="Aktualisiere die Kursdaten, um den Verlauf zu laden." />
                            )}
                        </div>
                    </>
                )}
            </Modal>

            <Modal
                open={Boolean(activeSearchSecurity)}
                onClose={closeCompanySearch}
                title="Ticker zuweisen"
                subtitle={activeSearchSecurity ? `Für ${activeSearchSecurity.name || activeSearchSecurity.isin}` : undefined}
                icon={<Search size={20} />}
                footer={(
                    <>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                if (!activeSearchSecurity) return;
                                handleIgnoreSecurity(activeSearchSecurity);
                                closeCompanySearch();
                            }}
                        >
                            Ohne Marktdaten fortfahren
                        </Button>
                        <Button onClick={closeCompanySearch}>Schließen</Button>
                    </>
                )}
            >
                <form
                    className="ui-inline-form"
                    onSubmit={(e) => { e.preventDefault(); void handleCompanySearch(); }}
                >
                    <Field label="Ticker, ISIN oder Firmenname">
                        <TextInput
                            value={companyQuery}
                            onChange={(e) => {
                                setCompanyQuery(e.target.value);
                                setCompanySearchMessage(null);
                                setCompanyMatches([]);
                            }}
                            placeholder="z. B. AAPL oder Apple"
                            autoFocus
                        />
                    </Field>
                    <Button type="submit" variant="primary" icon={isCompanySearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} disabled={isCompanySearching || !companyQuery.trim()}>
                        Suchen
                    </Button>
                </form>
                {companySearchMessage && <p className="ui-field-hint">{companySearchMessage}</p>}
                {companyMatches.length > 0 && (
                    <div className="ui-rows ui-scroll" style={{ maxHeight: 300 }}>
                        {companyMatches.map((match) => (
                            <ListRow
                                key={match.symbol}
                                title={match.name || match.symbol}
                                meta={(
                                    <>
                                        <Pill>{match.symbol}</Pill>
                                        {match.exchange && <Pill>{match.exchange}</Pill>}
                                        {match.currency && <Pill>{match.currency}</Pill>}
                                    </>
                                )}
                                trailing={<Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => handleSelectCompanyMatch(match)}>Übernehmen</Button>}
                            />
                        ))}
                    </div>
                )}
            </Modal>

            <Modal
                open={Boolean(portfolioToDelete)}
                onClose={() => setPortfolioToDelete(null)}
                size="sm"
                title="Depot löschen?"
                icon={<Trash2 size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={() => setPortfolioToDelete(null)}>Abbrechen</Button>
                        <Button variant="danger" onClick={() => portfolioToDelete && handleDeletePortfolio(portfolioToDelete.id)}>Endgültig löschen</Button>
                    </>
                )}
            >
                {portfolioToDelete && (
                    <p className="ui-modal-text">
                        <strong>{portfolioToDelete.name}</strong> wird mit {portfolioToDelete.txCount} Buchungen und {portfolioToDelete.cashCount} Konten gelöscht. Das lässt sich nicht rückgängig machen, solange du das Projekt nicht ohne Speichern schließt.
                    </p>
                )}
            </Modal>
        </>
    );
};
