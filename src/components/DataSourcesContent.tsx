"use client";

import React, { useState, useMemo } from 'react';
import { Globe, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { syncProjectQuotes } from '@/lib/marketDataService';
import { BarChart3, X } from 'lucide-react';
import { SimpleAreaChart } from './SimpleAreaChart';
import { Security } from '@/types/domain';

export const DataSourcesContent = () => {
    const { project, syncFx, isSyncing, updateProject } = useProject();
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
        const cutoff = new Date();

        // Helper to set cutoff
        switch (timeRange) {
            case '1M': cutoff.setMonth(now.getMonth() - 1); break;
            case '6M': cutoff.setMonth(now.getMonth() - 6); break;
            case 'YTD': cutoff.setFullYear(now.getFullYear(), 0, 1); break; // Jan 1st current year
            case '1J': cutoff.setFullYear(now.getFullYear() - 1); break;
            case '3J': cutoff.setFullYear(now.getFullYear() - 3); break;
            case '5J': cutoff.setFullYear(now.getFullYear() - 5); break;
            case 'MAX': cutoff.setFullYear(1900); break; // Way back
            default: cutoff.setFullYear(now.getFullYear() - 1);
        }

        const cutoffStr = cutoff.toISOString().split('T')[0];
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
    const [isQuoteSyncing, setIsQuoteSyncing] = useState(false);
    const [selectedSecurity, setSelectedSecurity] = useState<Security | null>(null);
    const [modalTimeRange, setModalTimeRange] = useState('1M');

    // Filter Security Data based on Time Range
    const getFilteredHistory = (history: Record<string, number> | undefined) => {
        if (!history) return [];
        const entries = Object.entries(history).sort((a, b) => a[0].localeCompare(b[0]));

        const now = new Date();
        const cutoff = new Date();

        switch (modalTimeRange) {
            case '1M': cutoff.setMonth(now.getMonth() - 1); break;
            case '6M': cutoff.setMonth(now.getMonth() - 6); break;
            case 'YTD': cutoff.setFullYear(now.getFullYear(), 0, 1); break;
            case '1J': cutoff.setFullYear(now.getFullYear() - 1); break;
            case '3J': cutoff.setFullYear(now.getFullYear() - 3); break;
            case '5J': cutoff.setFullYear(now.getFullYear() - 5); break;
            case 'MAX': cutoff.setFullYear(1900); break;
            default: cutoff.setMonth(now.getMonth() - 1);
        }

        const cutoffStr = cutoff.toISOString().split('T')[0];
        return entries
            .filter(([date]) => date >= cutoffStr)
            .map(([date, value]) => ({ date, value }));
    };

    // Derived Stats
    const marketStats = useMemo(() => {
        if (!project?.securities) return { count: 0, lastSync: null, securities: [] };
        const secs = Object.values(project.securities);
        const count = secs.length;
        const lastSyncTimes = secs.map(s => s.lastSync ? new Date(s.lastSync).getTime() : 0);
        const maxTime = Math.max(...lastSyncTimes);
        return {
            count,
            lastSync: maxTime > 0 ? new Date(maxTime).toISOString().split('T')[0] : 'Nie',
            securities: secs.sort((a, b) => a.name.localeCompare(b.name))
        };
    }, [project?.securities]);

    const handleQuoteSync = async () => {
        if (!project) return;
        setIsQuoteSyncing(true);
        try {
            const updated = await syncProjectQuotes(project, true); // Force update on manual click
            if (updated !== project) {
                updateProject(() => updated);
            } else {
                alert("Daten sind bereits aktuell.");
            }
        } catch (e) {
            console.error(e);
            alert("Fehler beim Sync.");
        } finally {
            setIsQuoteSyncing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
                {/* ECB Feed Card */}
                <div className="md3-card p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Globe size={18} className="md3-accent" />
                                <h3 className="font-semibold md3-text-main">EZB Waehrungskurse</h3>
                            </div>
                            <p className="text-sm md3-text-muted">Offizielle Referenzkurse der Europaeischen Zentralbank.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isSyncing ? (
                                <span className="md3-chip-accent inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold">
                                    <Loader2 size={12} className="animate-spin" />
                                    Synchronisiere...
                                </span>
                            ) : (
                                <span className="md3-positive-soft inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold">
                                    <CheckCircle size={12} />
                                    Aktuell
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="md3-list-item mt-6 flex items-center justify-between gap-4 p-4">
                        <div>
                            <p className="md3-text-muted text-xs uppercase font-bold tracking-wider">Letztes Update</p>
                            <p className="md3-text-main font-mono mt-1">
                                {project?.fxData.lastUpdated || 'Nie'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => syncFx()}
                            disabled={isSyncing}
                            className="md3-icon-btn h-10 w-10 disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="EZB-Kurse aktualisieren"
                            title="Jetzt aktualisieren"
                        >
                            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Chart Area */}
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <h4 className="text-sm font-medium md3-text-main">Kursverlauf (vs. EUR)</h4>
                            <select
                                value={selectedCurrency}
                                onChange={(e) => setSelectedCurrency(e.target.value)}
                                className="md3-field px-3 py-2 text-xs font-semibold outline-none"
                            >
                                {availableCurrencies.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* Time Range Selectors */}
                        <div className="md3-segment flex w-max items-center gap-1 p-1">
                            {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((range) => (
                                <button
                                    key={range}
                                    type="button"
                                    onClick={() => setTimeRange(range)}
                                    className={`px-3 py-1 text-[11px] font-semibold transition-all ${timeRange === range
                                        ? 'md3-chip-tonal'
                                        : 'md3-text-muted hover:opacity-90'
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="md3-list-item mt-4 h-48 w-full p-2">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--md3-primary)" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="var(--md3-primary)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--md3-outline)" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 10, fill: 'var(--md3-on-surface-variant)' }}
                                        axisLine={false}
                                        tickLine={false}
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        tick={{ fontSize: 10, fill: 'var(--md3-on-surface-variant)' }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={30}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--md3-surface-container-high)', border: 'none', fontSize: '12px', borderRadius: '12px' }}
                                        labelStyle={{ color: 'var(--md3-on-surface-variant)' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="rate"
                                        stroke="var(--md3-primary)"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorRate)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center md3-text-muted text-sm">
                                Keine Daten verfuegbar. Bitte synchronisieren.
                            </div>
                        )}
                    </div>
                </div>

                {/* Yahoo Finance Card */}
                <div className="md3-card flex h-full flex-col p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <BarChart3 size={18} className="md3-accent" />
                                <h3 className="font-semibold md3-text-main">Marktdaten (Yahoo)</h3>
                            </div>
                            <p className="text-sm md3-text-muted">Automatische Schlusskurse fuer Aktien & ETFs.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isQuoteSyncing ? (
                                <span className="md3-chip-accent inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold">
                                    <Loader2 size={12} className="animate-spin" />
                                    Synchronisiere...
                                </span>
                            ) : marketStats.lastSync && marketStats.lastSync !== 'Nie' ? (
                                <span className="md3-positive-soft inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold">
                                    <CheckCircle size={12} />
                                    Aktuell
                                </span>
                            ) : (
                                <span className="md3-segment inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold md3-text-muted">
                                    Ausstehend
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="md3-list-item mt-6 flex items-center justify-between gap-4 p-4">
                        <div>
                            <p className="md3-text-muted text-xs uppercase font-bold tracking-wider">Letztes Update</p>
                            <p className="md3-text-main font-mono mt-1">
                                {marketStats.lastSync}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={handleQuoteSync}
                            disabled={isQuoteSyncing}
                            className="md3-icon-btn h-10 w-10 disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Marktdaten aktualisieren"
                            title="Jetzt aktualisieren"
                        >
                            {isQuoteSyncing ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <RefreshCw size={16} />
                            )}
                        </button>
                    </div>

                    <div className="custom-scrollbar mt-6 flex-1 max-h-[300px] space-y-2 overflow-y-auto pr-2">
                        {marketStats.securities.length === 0 ? (
                            <div className="md3-list-item p-6 text-center text-sm md3-text-muted">
                                Keine Wertpapiere gefunden.
                            </div>
                        ) : (
                            marketStats.securities.map(sec => (
                                <div
                                    key={sec.isin}
                                    onClick={() => setSelectedSecurity(sec)}
                                    className="md3-list-item flex items-center justify-between gap-3 p-3 cursor-pointer transition"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="md3-chip-tonal flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold">
                                            {sec.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="md3-text-main text-sm font-medium">{sec.symbol || sec.isin}</div>
                                            <div className="md3-text-muted text-xs truncate max-w-[150px]">{sec.name}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`px-2 py-0.5 text-xs font-semibold rounded-full ${sec.lastSync ? 'md3-positive-soft' : 'md3-segment md3-text-muted'}`}>
                                            {sec.lastSync ? new Date(sec.lastSync).toLocaleDateString() : 'Ausstehend'}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                </div>
            </div>

            {/* Chart Modal Overlay */}
            {selectedSecurity && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSecurity(null)}>
                    <div className="md3-card w-full max-w-3xl p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div>
                                <h3 className="text-xl font-bold md3-text-main">{selectedSecurity.name}</h3>
                                <div className="flex items-center gap-2 text-sm md3-text-muted mt-1">
                                    <span className="md3-segment rounded-full px-2 py-0.5 text-xs font-mono">{selectedSecurity.isin}</span>
                                    <span>&bull;</span>
                                    <span>{selectedSecurity.symbol}</span>
                                </div>
                            </div>
                            <button type="button" onClick={() => setSelectedSecurity(null)} className="md3-icon-btn" aria-label="Schliessen">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Time Range Selector */}
                        <div className="md3-segment flex w-max items-center gap-1 p-1 mb-4">
                            {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map(range => (
                                <button
                                    key={range}
                                    type="button"
                                    onClick={() => setModalTimeRange(range)}
                                    className={`px-3 py-1 text-xs font-semibold transition-colors ${modalTimeRange === range
                                        ? 'md3-chip-tonal'
                                        : 'md3-text-muted hover:opacity-90'
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>

                        <div className="md3-list-item h-[350px] w-full p-4">
                            {selectedSecurity.priceHistory && Object.keys(selectedSecurity.priceHistory).length > 0 ? (
                                <SimpleAreaChart
                                    data={getFilteredHistory(selectedSecurity.priceHistory)}
                                    color="var(--md3-primary)"
                                    height={320}
                                    showAxes={true}
                                    timeRange={modalTimeRange}
                                    currency={selectedSecurity.currency}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center flex-col md3-text-muted">
                                    <BarChart3 size={48} className="mb-2 opacity-50" />
                                    <p>Keine historischen Daten verfuegbar</p>
                                    <p className="text-xs mt-2">Klicke auf &quot;Jetzt aktualisieren&quot;</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button type="button" onClick={() => setSelectedSecurity(null)} className="md3-text-muted px-4 py-2 font-semibold hover:opacity-80">
                                Schliessen
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

