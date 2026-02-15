import React, { useMemo, useState } from 'react';
import { Globe, BarChart3, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { SimpleAreaChart } from './SimpleAreaChart';
import { Security, Transaction } from '@/types/domain';

interface SecurityDetailModalProps {
    isOpen: boolean;
  onClose: () => void;
  security: Security;
  transactions: Transaction[];
  currencyFilter?: string;
}

export const SecurityDetailModal = ({ isOpen, onClose, security, transactions, currencyFilter }: SecurityDetailModalProps) => {
    const [timeRange, setTimeRange] = useState('1J');
    const normalizedCurrencyFilter = currencyFilter?.trim().toUpperCase();

    // Close on escape
    React.useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Prepare Chart Data
    const chartData = useMemo(() => {
        if (!security.priceHistory) return [];
        const sortedDates = Object.keys(security.priceHistory).sort();

        // Filter by time range (simplified logic)
        const now = new Date();
        const cutoffDate = new Date();
        if (timeRange === '1M') cutoffDate.setMonth(now.getMonth() - 1);
        if (timeRange === '6M') cutoffDate.setMonth(now.getMonth() - 6);
        if (timeRange === '1J') cutoffDate.setFullYear(now.getFullYear() - 1);
        if (timeRange === '3J') cutoffDate.setFullYear(now.getFullYear() - 3);
        if (timeRange === '5J') cutoffDate.setFullYear(now.getFullYear() - 5);
        if (timeRange === 'MAX') cutoffDate.setFullYear(1900);

        return sortedDates
            .filter(d => new Date(d) >= cutoffDate)
            .map(date => ({
                date,
                value: security.priceHistory![date]
            }));
    }, [security.priceHistory, timeRange]);

    // Prepare Markers
    const markers = useMemo(() => {
        return transactions
            .filter(t => t.isin === security.isin && (t.type === 'Buy' || t.type === 'Sell'))
            .filter(t => (normalizedCurrencyFilter ? (t.currency || '').trim().toUpperCase() === normalizedCurrencyFilter : true))
            .map(t => ({
                date: t.date.split('T')[0],
                label: t.type === 'Buy' ? 'Kauf' : 'Verkauf',
                color: t.type === 'Buy' ? '#10b981' : '#f43f5e',
                type: t.type as 'Buy' | 'Sell'
            }));
    }, [transactions, security.isin, normalizedCurrencyFilter]);

    const latestPrice = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
    const startPrice = chartData.length > 0 ? chartData[0].value : 0;
    const change = latestPrice - startPrice;
    const changePercent = startPrice > 0 ? (change / startPrice) * 100 : 0;
    const isPositive = change >= 0;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-lg font-bold text-white border border-slate-700">
                            {security.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{security.name}</h2>
                            <div className="flex items-center gap-2 text-sm text-slate-400 mt-0.5">
                                <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/50">{security.quoteType || 'Aktie'}</span>
                                <span>{security.symbol}</span>
                                {security.isin && <span className="text-slate-500 font-mono text-xs">{security.isin}</span>}
                                {normalizedCurrencyFilter && (
                                  <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/50 text-xs">
                                    Trades: {normalizedCurrencyFilter}
                                  </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white">
                            {latestPrice.toLocaleString('de-DE', { style: 'currency', currency: security.currency })}
                        </div>
                        <div className={`flex items-center justify-end text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? <ArrowUpRight size={16} className="mr-1" /> : <ArrowDownRight size={16} className="mr-1" />}
                            {change.toLocaleString('de-DE', { style: 'currency', currency: security.currency })} ({changePercent.toFixed(2)}%)
                        </div>
                    </div>
                </div>

                <div className="overflow-y-auto overflow-x-hidden custom-scrollbar flex-1">
                    {/* Chart Section */}
                    <div className="p-6 pb-2">
                        <div className="flex justify-end mb-4 gap-2">
                            {['1M', '6M', '1J', '3J', '5J', 'MAX'].map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${timeRange === range
                                        ? 'bg-slate-700 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                        <div className="h-72 w-full">
                            <SimpleAreaChart
                                data={chartData}
                                currency={security.currency}
                                timeRange={timeRange}
                                color={isPositive ? "#10b981" : "#f43f5e"}
                                showAxes={true}
                                markers={markers}
                            />
                        </div>
                        {/* Legend */}
                        <div className="flex justify-center gap-6 mt-2 text-xs text-slate-500">
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Kauf</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Verkauf</div>
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 pt-0">
                        {/* Profile Card */}
                        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                                <Globe size={16} className="text-blue-400" /> Unternehmensprofil
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Land</span>
                                    <span className="text-white">{security.country || '-'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Sektor</span>
                                    <span className="text-white">{security.sector || '-'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Industrie</span>
                                    <span className="text-white truncate max-w-[200px] text-right" title={security.industry}>{security.industry || '-'}</span>
                                </div>
                                <div className="h-px bg-slate-700/50 my-2"></div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Marktkapitalisierung</span>
                                    <span className="text-white">{security.marketCap ? (security.marketCap / 1e9).toFixed(2) + ' Mrd. ' + security.currency : '-'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Metrics Card */}
                        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                                <BarChart3 size={16} className="text-purple-400" /> Kennzahlen
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-slate-500 block mb-1">KGV (P/E)</span>
                                    <span className="text-lg font-bold text-white">{security.trailingPE?.toFixed(2) || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-500 block mb-1">KGV (Erwartet)</span>
                                    <span className="text-lg font-bold text-white">{security.forwardPE?.toFixed(2) || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-500 block mb-1">EPS (Gewinn/Aktie)</span>
                                    <span className="text-lg font-bold text-white">{security.epsTrailingTwelveMonths?.toFixed(2) || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-500 block mb-1">Umsatz</span>
                                    <span className="text-lg font-bold text-white">{security.totalRevenue ? (security.totalRevenue / 1e9).toFixed(2) + ' Mrd.' : '-'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Dividends Card */}
                        <div className="col-span-1 md:col-span-2 bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                                <Calendar size={16} className="text-emerald-400" /> Dividenden
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <span className="text-xs text-slate-500 block mb-1">Dividendenrendite</span>
                                    <span className="text-2xl font-bold text-emerald-400">{((security.dividendYield || 0) * 100).toFixed(2)}%</span>
                                </div>
                                <div className="border-l border-slate-700 pl-6">
                                    <span className="text-xs text-slate-500 block mb-1">Jährliche Dividende (Prognose)</span>
                                    <span className="text-xl font-bold text-white">
                                        {security.annualDividendRate ? security.annualDividendRate.toLocaleString('de-DE', { style: 'currency', currency: security.currency }) : '-'}
                                    </span>
                                </div>
                                <div className="border-l border-slate-700 pl-6">
                                    <span className="text-xs text-slate-500 block mb-1">Nächste Auszahlung</span>
                                    {security.upcomingDividends && security.upcomingDividends.length > 0 ? (
                                        <>
                                            <span className="block text-white font-medium">Ex-Date: {security.upcomingDividends[0].exDate}</span>
                                        </>
                                    ) : (
                                        <span className="text-slate-500 italic">Keine Daten</span>
                                    )}
                                </div>
                            </div>

                            {/* Dividend History (Mini) */}
                            {security.dividendHistory && security.dividendHistory.length > 0 && (
                                <div className="mt-6">
                                    <h4 className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Historie (Letzte 5)</h4>
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                        <style>{`
                                            .scrollbar-none::-webkit-scrollbar {
                                                display: none;
                                            }
                                        `}</style>
                                        {security.dividendHistory.slice(-5).reverse().map((div, i) => (
                                            <div key={i} className="bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-700 min-w-[100px]">
                                                <div className="text-xs text-slate-500">{div.date}</div>
                                                <div className="text-sm font-bold text-emerald-400">
                                                    {div.amount.toLocaleString('de-DE', { style: 'currency', currency: security.currency })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition font-medium">
                        Schließen
                    </button>
                </div>
            </div>
        </div>
    );
};
