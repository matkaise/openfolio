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
import { useFormatters } from '@/components/ui/useFormatters';
import { useT } from '@/lib/i18n';
import { SimpleAreaChart } from './SimpleAreaChart';
import { Security, type ProjectData } from '@/types/domain';
import { resolveTicker, searchCompanyMatches, type CompanyMatch } from '@/lib/tickerSearch';
import { getTransactions, removePortfolioBookings } from '@/lib/domain/ledger/store';

const isSecurityPending = (sec: Security, nowMs: number) => securityNeedsSync(sec, new Date(nowMs));

export const DataSourcesContent = () => {
    const project = useProjectData();
    const t = useT();
    const formatters = useFormatters();
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
        // If range is large (3J, 5J, MAX), show Year only
        if (['3J', '5J', 'MAX'].includes(timeRange)) return tickItem.slice(0, 4);
        return formatters.date(tickItem, { day: 'numeric', month: 'numeric' });
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
        if (!projectSecurities) return { count: 0, lastSync: null as Date | null, securities: [] };
        const secs = Object.values(projectSecurities);
        const count = secs.length;
        const lastSyncTimes = secs.map(s => s.lastSync ? new Date(s.lastSync).getTime() : 0);
        const maxTime = Math.max(...lastSyncTimes);
        return {
            count,
            lastSync: maxTime > 0 ? new Date(maxTime) : null,
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
            setCompanySearchMessage(t.dataSources.noMatchFound);
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

    const RANGE_OPTIONS = ['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((value) => ({ value, label: t.ranges.short[value] }));
    const marketStatus = isMarketSyncing
        ? <Pill tone="accent"><Loader2 size={12} className="animate-spin" />{t.dataSources.updating}</Pill>
        : pendingSecurities.length > 0
            ? <Pill>{t.dataSources.partial}</Pill>
            : marketStats.lastSync
                ? <Pill tone="up"><CheckCircle size={12} />{t.dataSources.upToDate}</Pill>
                : <Pill>{t.dataSources.pending}</Pill>;
    const securityBadge = (sec: Security) => {
        if (isSecurityPending(sec, nowMs)) return <Pill>{t.dataSources.pending}</Pill>;
        if (sec.lastSync) return <Pill tone="up">{formatters.date(sec.lastSync)}</Pill>;
        return sec.symbolStatus === 'unresolved' ? <Pill tone="down">{t.dataSources.notFound}</Pill> : <Pill>{t.dataSources.pending}</Pill>;
    };

    return (
        <>
            <div className="ui-grid-2" style={{ alignItems: 'start' }}>
                <GlassCard>
                    <CardHeader title={t.dataSources.ecbTitle}>
                        {isSyncing ? <Pill tone="accent"><Loader2 size={12} className="animate-spin" />{t.dataSources.updating}</Pill> : <Pill tone="up"><CheckCircle size={12} />{t.dataSources.upToDate}</Pill>}
                    </CardHeader>
                    <p className="ui-text">{t.dataSources.ecbText}</p>
                    <div className="ui-status-row">
                        <div>
                            <span className="ui-label">{t.dataSources.lastUpdate}</span>
                            <span className="ui-status-value">{project?.fxData.lastUpdated ? formatters.date(project.fxData.lastUpdated) : t.dataSources.never}</span>
                        </div>
                        <IconButton label={t.dataSources.refreshEcb} onClick={() => syncFx()} disabled={isSyncing}>
                            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        </IconButton>
                    </div>

                    <div className="ui-toolbar">
                        <Segmented options={RANGE_OPTIONS} value={timeRange} onChange={setTimeRange} ariaLabel={t.ranges.label} size="sm" />
                        <SelectInput aria-label={t.dataSources.currency} value={selectedCurrency} onChange={(e) => setSelectedCurrency(e.target.value)} className="ui-input-compact">
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
                                    <Area type="monotone" dataKey="rate" name={t.dataSources.perEur(selectedCurrency)} stroke="var(--accent)" strokeWidth={2} fill="url(#fxRateFill)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <EmptyState title={t.dataSources.noRatesTitle} text={t.dataSources.noRatesText} />
                        )}
                    </div>
                </GlassCard>

                <GlassCard>
                    <CardHeader title={t.dataSources.pricesTitle}>{marketStatus}</CardHeader>
                    <p className="ui-text">{t.dataSources.pricesText}</p>
                    <div className="ui-status-row">
                        <div>
                            <span className="ui-label">{t.dataSources.lastUpdate}</span>
                            <span className="ui-status-value">{marketStats.lastSync ? formatters.date(marketStats.lastSync) : t.dataSources.never}</span>
                        </div>
                        <IconButton label={t.dataSources.refreshPrices} onClick={handleQuoteSync} disabled={isMarketSyncing}>
                            {isMarketSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        </IconButton>
                    </div>
                    {isMarketSyncing && marketSyncProgress && marketSyncProgress.total > 0 && (
                        <div className="ui-progress-block">
                            <div className="ui-progress-meta">
                                <span>{marketSyncProgress.symbol ? t.dataSources.current(marketSyncProgress.symbol) : t.dataSources.progress}</span>
                                <span>{marketSyncProgress.current}/{marketSyncProgress.total}</span>
                            </div>
                            <div className="ui-progress"><span style={{ width: `${Math.min(100, Math.round((marketSyncProgress.current / marketSyncProgress.total) * 100))}%` }} /></div>
                        </div>
                    )}
                    {marketStats.securities.length === 0 ? (
                        <EmptyState title={t.dataSources.noSecuritiesTitle} text={t.dataSources.noSecuritiesText} />
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
                    <CardHeader title={t.dataSources.missingTickers(unresolvedSecurities.length)} />
                    <p className="ui-text">{t.dataSources.missingTickersText}</p>
                    <div className="ui-rows" style={{ marginTop: 8 }}>
                        {unresolvedSecurities.map((sec) => (
                            <ListRow
                                key={sec.isin}
                                onClick={() => openCompanySearch(sec)}
                                leading={<Avatar seed={sec.isin} label={sec.name} size={38} />}
                                title={sec.name}
                                meta={<span>{sec.isin}</span>}
                                trailing={<span className="ui-row-sub"><Pill tone="down">{t.dataSources.noMatch}</Pill><span className="ui-link">{t.dataSources.assign}</span></span>}
                            />
                        ))}
                    </div>
                </GlassCard>
            )}

            <GlassCard>
                <CardHeader title={t.dataSources.portfoliosTitle} />
                <p className="ui-text">{t.dataSources.portfoliosText}</p>
                {portfolioStats.length === 0 ? (
                    <EmptyState title={t.dataSources.noPortfolios} />
                ) : (
                    <div className="ui-rows" style={{ marginTop: 8 }}>
                        {portfolioStats.map((portfolio) => (
                            <ListRow
                                key={portfolio.id}
                                leading={<IconTile tone="accent"><Wallet size={18} /></IconTile>}
                                title={portfolio.name}
                                meta={<span>{t.dataSources.portfolioMeta(portfolio.txCount, portfolio.cashCount)}</span>}
                                trailing={(
                                    <IconButton label={t.dataSources.deletePortfolioLabel(portfolio.name)} className="is-danger" onClick={() => setPortfolioToDelete(portfolio)}>
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
                            {t.dataSources.changeTicker}
                        </Button>
                        <Button onClick={() => setSelectedSecurity(null)}>{t.common.close}</Button>
                    </>
                )}
            >
                {selectedSecurity && (
                    <>
                        <Segmented options={RANGE_OPTIONS} value={modalTimeRange} onChange={setModalTimeRange} ariaLabel={t.ranges.label} size="sm" />
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
                                <EmptyState icon={<BarChart3 size={22} />} title={t.dataSources.noPricesTitle} text={t.dataSources.noPricesText} />
                            )}
                        </div>
                    </>
                )}
            </Modal>

            <Modal
                open={Boolean(activeSearchSecurity)}
                onClose={closeCompanySearch}
                title={t.dataSources.assignTicker}
                subtitle={activeSearchSecurity ? t.dataSources.assignFor(activeSearchSecurity.name || activeSearchSecurity.isin) : undefined}
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
                            {t.dataSources.withoutMarketData}
                        </Button>
                        <Button onClick={closeCompanySearch}>{t.common.close}</Button>
                    </>
                )}
            >
                <form
                    className="ui-inline-form"
                    onSubmit={(e) => { e.preventDefault(); void handleCompanySearch(); }}
                >
                    <Field label={t.dataSources.searchLabel}>
                        <TextInput
                            value={companyQuery}
                            onChange={(e) => {
                                setCompanyQuery(e.target.value);
                                setCompanySearchMessage(null);
                                setCompanyMatches([]);
                            }}
                            placeholder={t.dataSources.searchPlaceholder}
                            autoFocus
                        />
                    </Field>
                    <Button type="submit" variant="primary" icon={isCompanySearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} disabled={isCompanySearching || !companyQuery.trim()}>
                        {t.dataSources.search}
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
                                trailing={<Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => handleSelectCompanyMatch(match)}>{t.dataSources.apply}</Button>}
                            />
                        ))}
                    </div>
                )}
            </Modal>

            <Modal
                open={Boolean(portfolioToDelete)}
                onClose={() => setPortfolioToDelete(null)}
                size="sm"
                title={t.dataSources.deleteTitle}
                icon={<Trash2 size={20} />}
                footer={(
                    <>
                        <Button variant="ghost" onClick={() => setPortfolioToDelete(null)}>{t.common.cancel}</Button>
                        <Button variant="danger" onClick={() => portfolioToDelete && handleDeletePortfolio(portfolioToDelete.id)}>{t.dataSources.deleteForever}</Button>
                    </>
                )}
            >
                {portfolioToDelete && (
                    <p className="ui-modal-text">
                        <strong>{portfolioToDelete.name}</strong>{t.dataSources.deleteText(portfolioToDelete.txCount, portfolioToDelete.cashCount)}
                    </p>
                )}
            </Modal>
        </>
    );
};
