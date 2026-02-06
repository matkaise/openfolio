"use client";

import React, { useState, useMemo } from 'react';
import { Database, FileText, Globe, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
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
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                        <Database size={24} className="text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Datenquellen</h2>
                        <p className="text-sm text-slate-400">Verwalte deine Broker-Importe und API-Verbindungen</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ECB Feed Card */}
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Globe size={18} className="text-blue-400" />
                                <h3 className="font-semibold text-white">EZB Währungskurse</h3>
                            </div>
                            <p className="text-sm text-slate-400">Offizielle Referenzkurse der Europäischen Zentralbank.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isSyncing ? (
                                <span className="flex items-center text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                                    <Loader2 size={12} className="animate-spin mr-1" />
                                    Synchronisiere...
                                </span>
                            ) : (
                                <span className="flex items-center text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                                    <CheckCircle size={12} className="mr-1" />
                                    Aktuell
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-900/50 rounded-xl p-4 mb-6">
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Letztes Update</p>
                            <p className="text-white font-mono mt-1">
                                {project?.fxData.lastUpdated || 'Nie'}
                            </p>
                        </div>

                        <button
                            onClick={() => syncFx()}
                            disabled={isSyncing}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${isSyncing
                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                }`}
                        >
                            <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                            {isSyncing ? 'Lädt...' : 'Jetzt aktualisieren'}
                        </button>
                    </div>

                    {/* Chart Area */}
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-medium text-slate-300">Kursverlauf (vs. EUR)</h4>
                            <select
                                value={selectedCurrency}
                                onChange={(e) => setSelectedCurrency(e.target.value)}
                                className="bg-slate-700 border-none text-xs rounded px-2 py-1 text-white focus:ring-1 focus:ring-blue-500"
                            >
                                {availableCurrencies.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* Time Range Selectors */}
                        <div className="flex bg-slate-900/50 p-1 rounded-lg w-max mb-4">
                            {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={`px-3 py-1 text-[10px] rounded-md font-medium transition-all ${timeRange === range
                                        ? 'bg-slate-700 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="h-48 w-full bg-slate-900/30 rounded-lg p-2 border border-slate-700/30">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatXAxis}
                                        tick={{ fontSize: 10, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        tick={{ fontSize: 10, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={30}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '12px' }}
                                        labelStyle={{ color: '#94a3b8' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="rate"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorRate)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                                Keine Daten verfügbar. Bitte synchronisieren.
                            </div>
                        )}
                    </div>
                </div>

                {/* CSV Import (Existing Placeholder) */}
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <FileText size={18} className="text-emerald-400" />
                                <h3 className="font-semibold text-white">Import</h3>
                            </div>
                            <p className="text-sm text-slate-400">Importiere Abrechnungen von Trade Republic, Scalable, und weiteren Brokern.</p>
                        </div>
                    </div>
                    {/* ... (Kept simple for now as per previous mockup) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 text-center hover:border-emerald-500/50 transition cursor-pointer group">
                            <div className="w-10 h-10 mx-auto bg-slate-800 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition">
                                <span className="font-bold text-white text-xs">TR</span>
                            </div>
                            <p className="text-xs text-slate-300">Trade Republic</p>
                        </div>
                        <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 text-center hover:border-emerald-500/50 transition cursor-pointer group">
                            <div className="w-10 h-10 mx-auto bg-slate-800 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition">
                                <span className="font-bold text-white text-xs">SC</span>
                            </div>
                            <p className="text-xs text-slate-300">Scalable</p>
                        </div>
                    </div>
                </div>
                {/* Yahoo Finance Card */}
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <BarChart3 size={18} className="text-purple-400" />
                                <h3 className="font-semibold text-white">Marktdaten (Yahoo)</h3>
                            </div>
                            <p className="text-sm text-slate-400">Automatische Schlusskurse für Aktien & ETFs.</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500 uppercase">Letztes Update</p>
                            <p className="font-mono text-slate-300">{marketStats.lastSync}</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[300px] mb-4 space-y-2 pr-2 custom-scrollbar">
                        {marketStats.securities.length === 0 ? (
                            <div className="text-center text-slate-500 py-8 text-sm">
                                Keine Wertpapiere gefunden.
                            </div>
                        ) : (
                            marketStats.securities.map(sec => (
                                <div
                                    key={sec.isin}
                                    onClick={() => setSelectedSecurity(sec)}
                                    className="flex items-center justify-between p-3 bg-slate-900/30 hover:bg-slate-700/50 rounded-lg cursor-pointer transition group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-400 group-hover:text-white group-hover:bg-purple-500/20 transition-colors">
                                            {sec.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-slate-200">{sec.symbol || sec.isin}</div>
                                            <div className="text-xs text-slate-500 truncate max-w-[150px]">{sec.name}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-xs px-2 py-0.5 rounded ${sec.lastSync ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                                            {sec.lastSync ? new Date(sec.lastSync).toLocaleDateString() : 'Pending'}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <button
                        onClick={handleQuoteSync}
                        disabled={isQuoteSyncing}
                        className="w-full py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg flex items-center justify-center font-medium transition mt-auto"
                    >
                        {isQuoteSyncing ? (
                            <>
                                <Loader2 size={16} className="animate-spin mr-2" />
                                Lade Kurse...
                            </>
                        ) : (
                            <>
                                <RefreshCw size={16} className="mr-2" />
                                Jetzt aktualisieren
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Chart Modal Overlay */}
            {selectedSecurity && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSecurity(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-white">{selectedSecurity.name}</h3>
                                <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                                    <span className="bg-slate-800 px-1.5 rounded text-xs font-mono">{selectedSecurity.isin}</span>
                                    <span>•</span>
                                    <span>{selectedSecurity.symbol}</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedSecurity(null)} className="text-slate-400 hover:text-white p-2">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Time Range Selector */}
                        <div className="flex space-x-2 mb-4">
                            {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map(range => (
                                <button
                                    key={range}
                                    onClick={() => setModalTimeRange(range)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${modalTimeRange === range
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>

                        <div className="h-[350px] w-full bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                            {selectedSecurity.priceHistory && Object.keys(selectedSecurity.priceHistory).length > 0 ? (
                                <SimpleAreaChart
                                    data={getFilteredHistory(selectedSecurity.priceHistory)}
                                    color="#a855f7"
                                    height={320}
                                    showAxes={true}
                                    timeRange={modalTimeRange}
                                    currency={selectedSecurity.currency}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center flex-col text-slate-500">
                                    <BarChart3 size={48} className="mb-2 opacity-50" />
                                    <p>Keine historischen Daten verfügbar</p>
                                    <p className="text-xs mt-2">Klicken Sie auf &quot;Jetzt aktualisieren&quot;</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button onClick={() => setSelectedSecurity(null)} className="px-4 py-2 text-slate-300 hover:text-white">
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
