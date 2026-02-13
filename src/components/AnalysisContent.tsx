import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, Banknote, BarChart3, Check, ChevronLeft, ChevronRight, Globe, Loader2, X } from 'lucide-react';
import { AreaChart, Area, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { calculatePortfolioHistory, type Holding, type AnalysisMetrics } from '@/lib/portfolioUtils';
import { calculateAnalysisMetrics } from '@/lib/analysisService';
import { buildMwrSeries, normalizeInvestedForExplicitCash } from '@/lib/performanceUtils';
import { filterTransactionsByPortfolio, calculateProjectHoldings, filterCashAccountsByPortfolio } from '@/lib/portfolioSelectors';
import { convertCurrency as convertFxCurrency } from '@/lib/fxUtils';
import { parseDateOnlyUTC, toDateKeyUTC } from '@/lib/dateUtils';
import { useProject } from '@/contexts/ProjectContext';
import { ReturnChartModal } from '@/components/ReturnChartModal';
import { SimpleAreaChart } from '@/components/SimpleAreaChart';
import { Card } from '@/components/ui/Card';
import { type AnalysisCache, type HistoryPoint, type PerformanceRow } from '@/types/portfolioView';

const DrawdownModal = ({ isOpen, onClose, data }: { isOpen: boolean; onClose: () => void; data: { date: string; value: number }[] }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="md3-card rounded-[32px] w-full max-w-4xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold md3-text-main flex items-center gap-2">
            <Activity className="md3-negative" />
            Drawdown Historie
          </h3>
          <button onClick={onClose} className="w-10 h-10 rounded-full md3-list-item flex items-center justify-center transition-all">
            <X className="md3-text-muted" />
          </button>
        </div>
        <div className="h-80 w-full">
          <SimpleAreaChart
            data={data}
            color="#f43f5e"
            height={320}
            showAxes={true}
            timeRange="MAX"
            isPercentage={true}
            tooltipLabel="Abstand zum Hoch"
          />
        </div>
        <p className="md3-text-muted text-sm mt-4 text-center">
          Der Chart zeigt den prozentualen Rückgang vom jeweils letzten Höchststand (High-Water Mark) des Portfolios.
        </p>
      </div>
    </div>
  );
};

const HoldingsGroupModal = ({
  isOpen,
  onClose,
  title,
  holdings,
  currency,
  groupValue,
  portfolioValue
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  holdings: Holding[];
  currency: string;
  groupValue: number;
  portfolioValue: number;
}) => {
  if (!isOpen) return null;

  const sortedHoldings = [...holdings].sort((a, b) => b.value - a.value);
  const safeGroupValue = groupValue || sortedHoldings.reduce((sum, h) => sum + h.value, 0);
  const groupShare = portfolioValue > 0 ? (safeGroupValue / portfolioValue) * 100 : 0;
  const formatCurrency = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="md3-card rounded-[32px] w-full max-w-3xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold md3-text-main">{title}</h3>
            <p className="text-xs md3-text-muted mt-1">
              {sortedHoldings.length} Positionen - {groupShare.toFixed(1)}% vom Portfolio
            </p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full md3-list-item flex items-center justify-center transition-all">
            <X className="md3-text-muted" />
          </button>
        </div>

        <div
          className="max-h-[60vh] overflow-y-auto divide-y divide-current/10 pr-2 -mr-2 [scrollbar-width:thin]"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {sortedHoldings.map(h => {
            const percentOfGroup = safeGroupValue > 0 ? (h.value / safeGroupValue) * 100 : 0;
            return (
              <div key={h.security.isin} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm md3-text-main font-medium truncate">{h.security.name}</p>
                  <p className="text-xs md3-text-muted truncate">
                    {h.security.isin}{h.security.quoteType ? ` - ${h.security.quoteType}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm md3-text-main">{formatCurrency(h.value)}</p>
                  <p className="text-xs md3-text-muted">{percentOfGroup.toFixed(1)}% der Gruppe</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RiskMetricModal = ({
  isOpen,
  onClose,
  title,
  series,
  color,
  isPercentage,
  tooltipLabel
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  series: { date: string; value: number }[];
  color: string;
  isPercentage: boolean;
  tooltipLabel: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="md3-card rounded-[32px] w-full max-w-4xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold md3-text-main flex items-center gap-2">
            <Activity className="md3-accent" />
            {title}
          </h3>
          <button onClick={onClose} className="w-10 h-10 rounded-full md3-list-item flex items-center justify-center transition-all">
            <X className="md3-text-muted" />
          </button>
        </div>

        <div className="h-80 w-full">
          {series.length > 0 ? (
            <SimpleAreaChart
              data={series}
              color={color}
              height={320}
              showAxes={true}
              timeRange="MAX"
              currency={isPercentage ? 'EUR' : ''}
              isPercentage={isPercentage}
              tooltipLabel={tooltipLabel}
            />
          ) : (
            <div className="h-full flex items-center justify-center md3-text-muted">
              Keine Daten für diesen Zeitraum verfügbar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export const AnalysisContent = ({
  selectedPortfolioIds,
  cachedData,
  onCacheUpdate,
  includeDividends,
  onToggleDividends
}: {
  selectedPortfolioIds: string[],
  cachedData?: AnalysisCache | null,
  onCacheUpdate?: (data: AnalysisCache) => void,
  includeDividends: boolean,
  onToggleDividends: () => void
}) => {
  const { project } = useProject();
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [isCalculating, setIsCalculating] = useState(true);

  // New View States
  const [returnViewMode, setReturnViewMode] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [selectedTileData, setSelectedTileData] = useState<{
    title: string;
    series: { date: string; value: number }[];
    timeRange: string;
  } | null>(null);
  const [groupOverlay, setGroupOverlay] = useState<{
    title: string;
    holdings: Holding[];
    groupValue: number;
  } | null>(null);
  const [riskModal, setRiskModal] = useState<{
    title: string;
    series: { date: string; value: number }[];
    color: string;
    isPercentage: boolean;
    tooltipLabel: string;
  } | null>(null);

  const riskFreeRate = 0.02;
  const [performanceRange, setPerformanceRange] = useState<'1M' | '6M' | 'YTD' | '1J' | '3J' | '5J' | 'MAX'>('1J');
  const [benchmarkInput, setBenchmarkInput] = useState('');
  const [benchmarkList, setBenchmarkList] = useState<{ symbol: string; name: string; history: Record<string, number>; currency?: string }[]>([]);
  const [isBenchmarkLoading, setIsBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [isBenchmarkCurrencyLoading, setIsBenchmarkCurrencyLoading] = useState(false);
  const benchmarkCurrencyAttempts = useRef<Set<string>>(new Set());

  // Filter transactions based on selected Portfolio (same as Dashboard)
  const filteredTransactions = useMemo(() => {
    return filterTransactionsByPortfolio(project, selectedPortfolioIds);
  }, [project, selectedPortfolioIds]);
  const filteredCashAccounts = useMemo(() => {
    return filterCashAccountsByPortfolio(project, selectedPortfolioIds);
  }, [project, selectedPortfolioIds]);

  // Calculate Holdings for Analysis (needed for Sector/Region)
  const { holdings } = useMemo(() => {
    if (!project) return { holdings: [] };
    return calculateProjectHoldings(project, filteredTransactions);
  }, [project, filteredTransactions]);

  // Calculate Sector Data
  const sectorData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const sector = h.security.sector || 'Unbekannt';
      if (!groups[sector]) groups[sector] = { value: 0, holdings: [] };
      groups[sector].value += h.value;
      groups[sector].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [holdings]);

  // Calculate Region Data
  const regionData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const region = h.security.region || h.security.country || 'Unbekannt';
      if (!groups[region]) groups[region] = { value: 0, holdings: [] };
      groups[region].value += h.value;
      groups[region].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [holdings]);

  // Calculate Industry Data (Branche)
  const industryData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const industry = h.security.industry || 'Unbekannt';
      if (!groups[industry]) groups[industry] = { value: 0, holdings: [] };
      groups[industry].value += h.value;
      groups[industry].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [holdings]);

  const portfolioTotalValue = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.value, 0);
  }, [holdings]);

  // Calculate portfolio history for MAX (for analysis metrics across years)
  // Moved to effect to unblock UI
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [analysisMetrics, setAnalysisMetrics] = useState<AnalysisMetrics>(
    { volatility: 0, sharpeRatio: 0, maxDrawdown: 0, maxDrawdownDate: '', availableYears: [], monthlyReturns: [], twrSeries: [] }
  );

  const riskSeries = useMemo(() => {
    const series = analysisMetrics?.twrSeries || [];
    if (series.length < 2) return { volatility: [], sharpe: [] };

    const msPerDay = 1000 * 60 * 60 * 24;
    const annualizationDays = 365;
    const indexSeries = series.map(p => ({
      date: p.date,
      index: 1 + (p.value / 100)
    }));

    const dailyReturns: number[] = new Array(indexSeries.length).fill(0);
    for (let i = 1; i < indexSeries.length; i++) {
      const prev = indexSeries[i - 1].index;
      const curr = indexSeries[i].index;
      dailyReturns[i] = prev > 0 ? (curr / prev) - 1 : 0;
    }

    let windowStart = 1;
    let sum = 0;
    let sumSq = 0;
    const volatility: { date: string; value: number }[] = [];
    const sharpe: { date: string; value: number }[] = [];

    for (let i = 1; i < indexSeries.length; i++) {
      const r = dailyReturns[i];
      sum += r;
      sumSq += r * r;

      while (windowStart < i) {
        const daysDiff = (parseDateOnlyUTC(indexSeries[i].date).getTime() - parseDateOnlyUTC(indexSeries[windowStart].date).getTime()) / msPerDay;
        if (daysDiff <= annualizationDays) break;
        const rDrop = dailyReturns[windowStart];
        sum -= rDrop;
        sumSq -= rDrop * rDrop;
        windowStart++;
      }

      const count = i - windowStart + 1;
      if (count < 2) continue;

      const windowSpanDays = (parseDateOnlyUTC(indexSeries[i].date).getTime() - parseDateOnlyUTC(indexSeries[windowStart].date).getTime()) / msPerDay;
      if (windowSpanDays < annualizationDays) continue;

      const mean = sum / count;
      const variance = Math.max(0, (sumSq / count) - (mean * mean));
      const dailyVol = Math.sqrt(variance);
      const annualizedVol = dailyVol * Math.sqrt(annualizationDays) * 100;

      const startIndexValue = indexSeries[Math.max(windowStart - 1, 0)].index;
      const startDate = parseDateOnlyUTC(indexSeries[Math.max(windowStart - 1, 0)].date);
      const endDate = parseDateOnlyUTC(indexSeries[i].date);
      const yearsElapsed = (endDate.getTime() - startDate.getTime()) / (msPerDay * annualizationDays);

      let annualizedReturn = 0;
      if (yearsElapsed > 0 && startIndexValue > 0) {
        annualizedReturn = Math.pow(indexSeries[i].index / startIndexValue, 1 / yearsElapsed) - 1;
      }

      const sharpeValue = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / (annualizedVol / 100) : 0;

      volatility.push({ date: indexSeries[i].date, value: Math.round(annualizedVol * 10) / 10 });
      sharpe.push({ date: indexSeries[i].date, value: Math.round(sharpeValue * 100) / 100 });
    }

    return { volatility, sharpe };
  }, [analysisMetrics?.twrSeries, riskFreeRate]);

  useEffect(() => {
    if (!project) return;

    // Check Cache
    // Added version suffix to force invalidation after TWR refactor
    const cacheKey = `${project.id}-${selectedPortfolioIds.slice().sort().join(',')}|div=${includeDividends ? 1 : 0}|base=${baseCurrency}|v9`;
    if (cachedData && cachedData.key === cacheKey) {
      setHistoryData(cachedData.historyData);
      setAnalysisMetrics(cachedData.analysisMetrics);
      setIsCalculating(false);
      return;
    }

    // Start loading immediately
    setIsCalculating(true);

    // Defer heavy calculation to next tick to allow UI to render loading state
    const timer = setTimeout(() => {
      const data = calculatePortfolioHistory(
        filteredTransactions,
        Object.values(project.securities || {}),
        project.fxData.rates,
        filteredCashAccounts,
        project.settings.baseCurrency,
        'MAX', // Full history
        'daily' // High precision for TWR/Drawdown
      );

      const normalizedHistory = normalizeInvestedForExplicitCash(
        data,
        filteredTransactions,
        filteredCashAccounts,
        project.fxData,
        baseCurrency
      );

      const metrics = calculateAnalysisMetrics(normalizedHistory, riskFreeRate, { includeDividends });

      setHistoryData(normalizedHistory);
      setAnalysisMetrics(metrics);

      // Update Cache
      if (onCacheUpdate) {
        onCacheUpdate({ key: cacheKey, historyData: normalizedHistory, analysisMetrics: metrics });
      }

      setIsCalculating(false);
    }, 100); // 100ms delay to ensure loading state is visible and UI feels responsive

    return () => clearTimeout(timer);
  }, [project, filteredTransactions, filteredCashAccounts, selectedPortfolioIds, cachedData, includeDividends, riskFreeRate, onCacheUpdate, baseCurrency]);

  // Removed old synchronous useMemos and redundant loading effects

  const mwrMonthlyReturnsMap = useMemo(() => {
    if (!historyData.length) return {};
    const start = historyData[0].date;
    const end = historyData[historyData.length - 1].date;
    const series = buildMwrSeries(historyData, start, end, {
      includeDividends,
      isFullRange: true,
      transactions: filteredTransactions
    });
    if (!series.length) return {};

    const map: Record<string, number> = {};
    let currentMonth = '';
    let startIndex: number | null = null;
    let endIndex: number | null = null;

    const flushMonth = () => {
      if (!currentMonth || !startIndex || !endIndex) return;
      if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) return;
      if (startIndex <= 0 || endIndex <= 0) return;
      map[currentMonth] = ((endIndex / startIndex) - 1) * 100;
    };

    for (const point of series) {
      const monthKey = point.date.slice(0, 7);
      const index = 1 + (point.value / 100);
      if (!Number.isFinite(index)) continue;

      if (monthKey !== currentMonth) {
        flushMonth();
        currentMonth = monthKey;
        startIndex = index;
        endIndex = index;
      } else {
        endIndex = index;
      }
    }

    flushMonth();
    return map;
  }, [historyData, includeDividends, filteredTransactions]);

  const monthlyReturnsMap = useMemo(() => {
    const primary = analysisMetrics?.monthlyReturnsMap || {};
    const fallback = mwrMonthlyReturnsMap;
    const merged: Record<string, number> = {};
    const keys = new Set([...Object.keys(fallback), ...Object.keys(primary)]);

    keys.forEach((key) => {
      const primaryValue = primary[key];
      if (Number.isFinite(primaryValue)) {
        merged[key] = primaryValue as number;
        return;
      }
      const fallbackValue = fallback[key];
      if (Number.isFinite(fallbackValue)) {
        merged[key] = fallbackValue as number;
      }
    });

    return merged;
  }, [analysisMetrics?.monthlyReturnsMap, mwrMonthlyReturnsMap]);

  const yearsWithReturns = useMemo(() => {
    const yearSet = new Set<number>();
    Object.entries(monthlyReturnsMap).forEach(([key, value]) => {
      if (!Number.isFinite(value)) return;
      const year = Number(key.slice(0, 4));
      if (Number.isFinite(year)) yearSet.add(year);
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [monthlyReturnsMap]);

  // Ensure selectedYear is valid when data changes
  useEffect(() => {
    const preferredYears = yearsWithReturns.length > 0
      ? yearsWithReturns
      : (analysisMetrics?.availableYears || []);
    if (preferredYears.length > 0 && !preferredYears.includes(selectedYear)) {
      // Default to most recent year with data
      setSelectedYear(preferredYears[0]);
    }
  }, [analysisMetrics?.availableYears, selectedYear, yearsWithReturns]);

  // Get monthly returns for selected year
  const displayedMonthlyReturns = useMemo(() => {
    if (!Object.keys(monthlyReturnsMap).length) return analysisMetrics.monthlyReturns || [];

    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const result: { month: string; return: number | null; hasData: boolean }[] = [];

    for (let month = 0; month < 12; month++) {
      const monthKey = `${selectedYear}-${String(month + 1).padStart(2, '0')}`;
      const rawReturn = monthlyReturnsMap[monthKey];
      const hasData = Number.isFinite(rawReturn);
      result.push({
        month: monthNames[month],
        return: hasData ? Math.round((rawReturn as number) * 10) / 10 : null,
        hasData
      });
    }
    return result;
  }, [analysisMetrics, monthlyReturnsMap, selectedYear]);

  // Calculate Aggregated Returns (Quarterly / Yearly)
  const aggregatedReturns = useMemo(() => {
    if (!Object.keys(monthlyReturnsMap).length) return { quarterly: [], yearly: [] };

    const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4'];
    const quarterly = [];

    // Quarterly for Selected Year
    for (let q = 0; q < 4; q++) {
      // Simple geometric linking of monthly returns for the quarter: (1+r1)(1+r2)(1+r3) - 1
      // This is an approximation for Q-MWR but standard for composed periods.
      let growingReturn = 1.0;
      let hasData = false;

      for (let m = 0; m < 3; m++) {
        const monthIndex = q * 3 + m + 1;
        const monthKey = `${selectedYear}-${String(monthIndex).padStart(2, '0')}`;
        const monthReturn = monthlyReturnsMap[monthKey];
        if (Number.isFinite(monthReturn)) {
          growingReturn *= (1 + (monthReturn / 100));
          hasData = true;
        }
      }

      quarterly.push({
        label: quarterNames[q],
        return: hasData ? Math.round((growingReturn - 1) * 100 * 10) / 10 : null,
        hasData,
        startDate: `${selectedYear}-${String(q * 3 + 1).padStart(2, '0')}-01`,
        endDate: toDateKeyUTC(new Date(Date.UTC(selectedYear, (q + 1) * 3, 0))) // Last day of quarter
      });
    }

    // Yearly (All Years)
    const yearlyYears = yearsWithReturns.length > 0
      ? yearsWithReturns
      : (analysisMetrics.availableYears || []);
    const yearly = yearlyYears.map((year: number) => {
      let growingReturn = 1.0;
      let hasData = false;

      // Aggregate all 12 months for that year
      for (let m = 1; m <= 12; m++) {
        const monthKey = `${year}-${String(m).padStart(2, '0')}`;
        const monthReturn = monthlyReturnsMap[monthKey];
        if (Number.isFinite(monthReturn)) {
          growingReturn *= (1 + (monthReturn / 100));
          hasData = true;
        }
      }

      return {
        year,
        return: hasData ? Math.round((growingReturn - 1) * 100 * 10) / 10 : null,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`
      };
    });

    return { quarterly, yearly };
  }, [analysisMetrics, monthlyReturnsMap, selectedYear, yearsWithReturns]);

  const openGroupOverlay = (title: string, group: { holdings: Holding[]; totalValue: number }) => {
    if (!group?.holdings?.length) return;
    setGroupOverlay({
      title,
      holdings: group.holdings,
      groupValue: group.totalValue
    });
  };

  // Build a period chart series from the single TWR source of truth
  const buildPeriodSeries = (periodStart: string, periodEnd: string) => {
    const series = analysisMetrics?.twrSeries || [];
    if (!series.length) return [];

    const startIndex = series.findIndex(p => p.date >= periodStart);
    if (startIndex === -1) return [];

    const baselineIndex = Math.max(startIndex - 1, 0);
    let endIndex = series.length - 1;

    for (let i = startIndex; i < series.length; i++) {
      if (series[i].date > periodEnd) {
        endIndex = i - 1;
        break;
      }
    }

    if (endIndex < baselineIndex) return [];

    const baselineValue = series[baselineIndex].value;
    const baselineIndexValue = 1 + (baselineValue / 100);
    const slice = series.slice(baselineIndex, endIndex + 1);

    if (baselineIndexValue === 0) {
      return slice.map(p => ({ date: p.date, value: 0 }));
    }

    return slice.map(p => {
      const currentIndexValue = 1 + (p.value / 100);
      return {
        date: p.date,
        value: ((currentIndexValue / baselineIndexValue) - 1) * 100
      };
    });
  };

  const performanceRangeDates = useMemo(() => {
    const series = analysisMetrics?.twrSeries || [];
    if (!series.length) return { start: '', end: '' };

    const end = series[series.length - 1].date;
    if (performanceRange === 'MAX') {
      return { start: series[0].date, end };
    }

    const endDate = parseDateOnlyUTC(end);
    const startDate = new Date(endDate);

    if (performanceRange === '1M') startDate.setUTCMonth(endDate.getUTCMonth() - 1);
    if (performanceRange === '6M') startDate.setUTCMonth(endDate.getUTCMonth() - 6);
    if (performanceRange === 'YTD') startDate.setUTCMonth(0, 1);
    if (performanceRange === '1J') startDate.setUTCFullYear(endDate.getUTCFullYear() - 1);
    if (performanceRange === '3J') startDate.setUTCFullYear(endDate.getUTCFullYear() - 3);
    if (performanceRange === '5J') startDate.setUTCFullYear(endDate.getUTCFullYear() - 5);

    const earliest = series[0].date;
    const start = startDate < parseDateOnlyUTC(earliest) ? earliest : toDateKeyUTC(startDate);
    return { start, end };
  }, [analysisMetrics?.twrSeries, performanceRange]);

  const portfolioPerformanceSeries = useMemo(() => {
    if (!performanceRangeDates.start || !performanceRangeDates.end) return [];
    return buildMwrSeries(historyData, performanceRangeDates.start, performanceRangeDates.end, {
      includeDividends,
      isFullRange: performanceRange === 'MAX',
      transactions: filteredTransactions
    });
  }, [historyData, performanceRangeDates.start, performanceRangeDates.end, includeDividends, performanceRange, filteredTransactions]);

  const alignSeriesToDates = useCallback((series: { date: string; value: number }[], dates: string[]) => {
    if (!series.length || !dates.length) return [];

    const sortedSeries = [...series].sort((a, b) => a.date.localeCompare(b.date));
    let idx = 0;
    let lastValue: number | null = null;
    const aligned: { date: string; value: number }[] = [];

    for (const date of dates) {
      while (idx < sortedSeries.length && sortedSeries[idx].date <= date) {
        lastValue = sortedSeries[idx].value;
        idx += 1;
      }
      if (lastValue !== null) {
        aligned.push({ date, value: lastValue });
      }
    }

    return aligned;
  }, []);

  useEffect(() => {
    const missingCurrency = benchmarkList.filter(b => !b.currency && !benchmarkCurrencyAttempts.current.has(b.symbol));
    if (missingCurrency.length === 0 || isBenchmarkCurrencyLoading) return;

    let isActive = true;
    const fetchCurrencies = async () => {
      setIsBenchmarkCurrencyLoading(true);
      try {
        for (const b of missingCurrency) {
          benchmarkCurrencyAttempts.current.add(b.symbol);
          try {
            const res = await fetch('/api/yahoo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol: b.symbol })
            });
            const data = await res.json();
            if (!res.ok || data.error) continue;

            const currency = data.currency;
            if (currency && isActive) {
              setBenchmarkList(prev => prev.map(item => item.symbol === b.symbol ? { ...item, currency } : item));
            }
          } catch {
            // Ignore individual benchmark errors
          }
        }
      } finally {
        if (isActive) setIsBenchmarkCurrencyLoading(false);
      }
    };

    fetchCurrencies();
    return () => {
      isActive = false;
    };
  }, [benchmarkList, isBenchmarkCurrencyLoading]);

  const buildBenchmarkMwrHistory = useCallback((
    history: Record<string, number>,
    currency: string,
    baseCurrency: string,
    rangeStart: string,
    rangeEnd: string
  ) => {
    if (!historyData.length) return [];

    const cashflowData = historyData.filter(d => d.date >= rangeStart && d.date <= rangeEnd);
    if (cashflowData.length === 0) return [];

    const priceDates = Object.keys(history || {}).sort();
    if (priceDates.length === 0) return [];

    let priceIndex = 0;
    let shares = 0;
    let invested = 0;
    let pendingCash = 0;
    const synthetic: { date: string; value: number; invested: number }[] = [];

    for (let i = 0; i < cashflowData.length; i++) {
      const date = cashflowData[i].date;

      while (priceIndex + 1 < priceDates.length && priceDates[priceIndex + 1] <= date) {
        priceIndex++;
      }

      const priceDate = priceDates[priceIndex];
      if (!priceDate || priceDate > date) {
        const cashFlow = i === 0 ? cashflowData[i].invested : (cashflowData[i].invested - cashflowData[i - 1].invested);
        if (cashFlow !== 0) {
          pendingCash += cashFlow;
        }
        continue;
      }

      const rawPrice = history[priceDate];
      if (!rawPrice) {
        const cashFlow = i === 0 ? cashflowData[i].invested : (cashflowData[i].invested - cashflowData[i - 1].invested);
        if (cashFlow !== 0) {
          pendingCash += cashFlow;
        }
        continue;
      }

      const price = convertFxCurrency(project?.fxData, rawPrice, currency, baseCurrency, priceDate);
      if (!price || price <= 0) {
        const cashFlow = i === 0 ? cashflowData[i].invested : (cashflowData[i].invested - cashflowData[i - 1].invested);
        if (cashFlow !== 0) {
          pendingCash += cashFlow;
        }
        continue;
      }

      const cashFlow = i === 0 ? cashflowData[i].invested : (cashflowData[i].invested - cashflowData[i - 1].invested);
      const effectiveCashFlow = cashFlow + pendingCash;
      if (effectiveCashFlow !== 0) {
        shares += effectiveCashFlow / price;
        invested += effectiveCashFlow;
        pendingCash = 0;
      }

      const value = shares * price;
      synthetic.push({ date, value, invested });
    }

    return synthetic;
  }, [historyData, project?.fxData]);

  const buildBenchmarkSeries = useCallback((
    history: Record<string, number>,
    start: string,
    end: string,
    currency: string,
    baseCurrency: string
  ) => {
    const syntheticHistory = buildBenchmarkMwrHistory(history, currency, baseCurrency, start, end);
    return buildMwrSeries(syntheticHistory, start, end, {
      includeDividends: false,
      isFullRange: performanceRange === 'MAX',
      transactions: filteredTransactions
    });
  }, [buildBenchmarkMwrHistory, performanceRange, filteredTransactions]);

  const benchmarkSeries = useMemo(() => {
    if (!performanceRangeDates.start || !performanceRangeDates.end) return [];
    const colors = ['#38bdf8', '#a855f7', '#f59e0b', '#22c55e', '#f43f5e', '#e2e8f0'];
    const baseCurrency = project?.settings.baseCurrency || 'EUR';
    return benchmarkList.map((b, i) => ({
      key: `bench_${b.symbol}`,
      name: b.name || b.symbol,
      color: colors[i % colors.length],
      series: buildBenchmarkSeries(b.history, performanceRangeDates.start, performanceRangeDates.end, b.currency || baseCurrency, baseCurrency)
    }));
  }, [
    benchmarkList,
    performanceRangeDates.start,
    performanceRangeDates.end,
    project?.settings.baseCurrency,
    buildBenchmarkSeries
  ]);

  const performanceComparisonData = useMemo(() => {
    const dataMap = new Map<string, PerformanceRow>();

    const addPoint = (date: string, key: string, value: number) => {
      const existing = dataMap.get(date);
      if (existing) {
        existing[key] = value;
        return;
      }
      dataMap.set(date, { date, [key]: value });
    };

    portfolioPerformanceSeries.forEach(p => addPoint(p.date, 'portfolio', p.value));
    const portfolioDates = portfolioPerformanceSeries.map(p => p.date);
    benchmarkSeries.forEach(b => {
      const aligned = alignSeriesToDates(b.series, portfolioDates);
      aligned.forEach(p => addPoint(p.date, b.key, p.value));
    });

    return Array.from(dataMap.keys())
      .sort()
      .map(date => dataMap.get(date))
      .filter((row): row is PerformanceRow => row !== undefined);
  }, [portfolioPerformanceSeries, benchmarkSeries, alignSeriesToDates]);

  const portfolioGradientOffset = useMemo(() => {
    const values = performanceComparisonData
      .map(d => Number(d.portfolio))
      .filter(v => !Number.isNaN(v));
    if (values.length === 0) return 0.5;
    const dataMax = Math.max(...values);
    const dataMin = Math.min(...values);
    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;
    return dataMax / (dataMax - dataMin);
  }, [performanceComparisonData]);

  const handleAddBenchmark = async () => {
    const raw = benchmarkInput.trim();
    if (!raw || isBenchmarkLoading) return;

    const symbol = raw.toUpperCase();
    if (benchmarkList.some(b => b.symbol.toUpperCase() === symbol)) {
      setBenchmarkInput('');
      return;
    }

    setIsBenchmarkLoading(true);
    setBenchmarkError(null);

    try {
      const res = await fetch('/api/yahoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });

      const data = await res.json();
      if (!res.ok || data.error || !data.history) {
        throw new Error(data.error || 'Benchmark konnte nicht geladen werden.');
      }

      const localSecurity = project?.securities?.[symbol]
        || Object.values(project?.securities || {}).find(
          (sec) => (sec.symbol || sec.isin || '').toUpperCase() === symbol
        );
      const localHistory = localSecurity?.priceHistory;
      const hasLocalHistory = !!localHistory && Object.keys(localHistory).length > 0;

      setBenchmarkList(prev => [
        ...prev,
        {
          symbol,
          name: data.longName || localSecurity?.name || symbol,
          history: hasLocalHistory ? localHistory : data.history,
          currency: localSecurity?.currency || data.currency
        }
      ]);
      setBenchmarkInput('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Benchmark konnte nicht geladen werden.';
      setBenchmarkError(message);
    } finally {
      setIsBenchmarkLoading(false);
    }
  };

  const removeBenchmark = (symbol: string) => {
    setBenchmarkList(prev => prev.filter(b => b.symbol !== symbol));
  };

  // Helper to open chart modal
  const handleTileClick = (periodStart: string, periodEnd: string, title: string) => {
    if (!periodStart || !periodEnd) return;

    const series = buildPeriodSeries(periodStart, periodEnd);
    if (series.length === 0) return;

    setSelectedTileData({
      title,
      series,
      timeRange: returnViewMode === 'monthly' ? '1M' : returnViewMode === 'quarterly' ? '3M' : '1Y'
    });
  };


  // Helper to get volatility label
  const getVolatilityLabel = (vol: number) => {
    if (vol < 10) return { text: 'Niedrig', color: 'md3-positive' };
    if (vol < 20) return { text: 'Mittel', color: 'md3-warning' };
    return { text: 'Hoch', color: 'md3-negative' };
  };

  // Helper to get Sharpe Ratio label
  const getSharpeLabel = (sharpe: number) => {
    if (sharpe > 1.5) return { text: 'Sehr gut', color: 'md3-positive' };
    if (sharpe > 1.0) return { text: 'Gut', color: 'md3-positive' };
    if (sharpe > 0.5) return { text: 'OK', color: 'md3-warning' };
    return { text: 'Schwach', color: 'md3-negative' };
  };

  const currentVolatility = riskSeries.volatility.length > 0
    ? riskSeries.volatility[riskSeries.volatility.length - 1].value
    : analysisMetrics.volatility;
  const currentSharpe = riskSeries.sharpe.length > 0
    ? riskSeries.sharpe[riskSeries.sharpe.length - 1].value
    : analysisMetrics.sharpeRatio;

  const volLabel = getVolatilityLabel(currentVolatility);
  const sharpeLabel = getSharpeLabel(currentSharpe);

  const availableYears = yearsWithReturns.length > 0
    ? yearsWithReturns
    : (analysisMetrics.availableYears || []);
  const hasPrevYear = availableYears.indexOf(selectedYear) < availableYears.length - 1;
  const hasNextYear = availableYears.indexOf(selectedYear) > 0;

  const navigateYear = (direction: 'prev' | 'next') => {
    const currentIndex = availableYears.indexOf(selectedYear);
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex < availableYears.length) {
      setSelectedYear(availableYears[newIndex]);
    }
  };

  return (
    <div className="analysis-md3 space-y-6">

      {/* Loading State */}
      {isCalculating && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 animate-pulse">
          <Loader2 className="w-12 h-12 md3-accent animate-spin" />
          <p className="md3-text-muted text-sm">Analysedaten werden berechnet...</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full mt-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="md3-list-item rounded-xl p-4 h-24 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {!isCalculating && (
        <>
          <DrawdownModal
            isOpen={showDrawdown}
            onClose={() => setShowDrawdown(false)}
            data={analysisMetrics.drawdownHistory || []}
          />
          <RiskMetricModal
            isOpen={!!riskModal}
            onClose={() => setRiskModal(null)}
            title={riskModal?.title || ''}
            series={riskModal?.series || []}
            color={riskModal?.color || '#10b981'}
            isPercentage={riskModal?.isPercentage ?? true}
            tooltipLabel={riskModal?.tooltipLabel || ''}
          />

          {/* Risk Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div
              onClick={() => setRiskModal({
                title: 'Volatilität (1J)',
                series: riskSeries.volatility,
                color: '#f97316',
                isPercentage: true,
                tooltipLabel: 'Volatilität (annualisiert)'
              })}
              className="cursor-pointer transition-colors group relative rounded-xl"
            >
              <Card className="md3-list-item flex flex-col items-center justify-center p-4 transition-colors">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <BarChart3 size={14} className="md3-text-muted" />
                </div>
                <p className="text-xs md3-text-muted uppercase tracking-wider mb-1">Volatilität (1J)</p>
                <span className="text-xl font-bold md3-text-main">{currentVolatility.toFixed(1)}%</span>
                <span className={`text-xs mt-1 ${volLabel.color}`}>{volLabel.text}</span>
              </Card>
            </div>
            <div
              onClick={() => setRiskModal({
                title: 'Sharpe Ratio (1J)',
                series: riskSeries.sharpe,
                color: '#10b981',
                isPercentage: false,
                tooltipLabel: 'Sharpe Ratio'
              })}
              className="cursor-pointer transition-colors group relative rounded-xl"
            >
              <Card className="md3-list-item flex flex-col items-center justify-center p-4 transition-colors">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <BarChart3 size={14} className="md3-text-muted" />
                </div>
                <p className="text-xs md3-text-muted uppercase tracking-wider mb-1">Sharpe Ratio (1J)</p>
                <span className="text-xl font-bold md3-text-main">{currentSharpe.toFixed(2)}</span>
                <span className={`text-xs mt-1 ${sharpeLabel.color}`}>{sharpeLabel.text}</span>
              </Card>
            </div>
            <div
              onClick={() => setShowDrawdown(true)}
              className="cursor-pointer transition-colors group relative rounded-xl"
            >
              <Card className="md3-list-item flex flex-col items-center justify-center p-4 transition-colors">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <BarChart3 size={14} className="md3-text-muted" />
                </div>
                <p className="text-xs md3-text-muted uppercase tracking-wider mb-1">Max Drawdown</p>
                <span className="text-xl font-bold md3-negative">{analysisMetrics.maxDrawdown.toFixed(1)}%</span>
                <span className="text-xs md3-text-muted mt-1">
                  {analysisMetrics.maxDrawdownDate ? parseDateOnlyUTC(analysisMetrics.maxDrawdownDate).toLocaleDateString('de-DE', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'N/A'}
                </span>
              </Card>
            </div>
            <Card className="md3-list-item flex flex-col items-center justify-center p-4">
              <p className="text-xs md3-text-muted uppercase tracking-wider mb-1">Dividendenrendite</p>
              <span className="text-xl font-bold md3-text-main">1.92%</span>
              <span className="text-xs md3-text-muted mt-1">Ø 245€ / Monat</span>
            </Card>
          </div>

          {/* Performance Comparison */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Activity size={18} className="md3-accent" />
                <h3 className="font-semibold md3-text-main">Performancevergleich</h3>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="md3-segment flex p-1 rounded-lg">
                  {(['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'] as const).map(range => (
                    <button
                      key={range}
                      onClick={() => setPerformanceRange(range)}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${performanceRange === range ? 'md3-chip-tonal' : 'md3-text-muted hover:opacity-90'}`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
                <button
                  onClick={onToggleDividends}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1 ${includeDividends
                    ? 'md3-chip-accent'
                    : 'md3-segment md3-text-muted hover:opacity-90'
                    }`}
                >
                  {includeDividends && <Check size={12} />}
                  Dividenden
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                value={benchmarkInput}
                onChange={(e) => setBenchmarkInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddBenchmark(); }}
                placeholder="Benchmark Symbol (z.B. SPY, ^GDAXI)"
                className="md3-field flex-1 rounded-lg px-3 py-2 text-sm md3-text-main focus:outline-none"
              />
              <button
                onClick={handleAddBenchmark}
                disabled={isBenchmarkLoading || !benchmarkInput.trim()}
                className={`px-3 py-2 text-sm rounded-lg font-medium transition-all ${isBenchmarkLoading || !benchmarkInput.trim() ? 'md3-segment md3-text-muted cursor-not-allowed' : 'md3-filled-btn'}`}
              >
                {isBenchmarkLoading ? 'Lädt...' : 'Hinzufügen'}
              </button>
            </div>

            {benchmarkError && (
              <p className="text-xs md3-negative mt-2">{benchmarkError}</p>
            )}
            {isBenchmarkCurrencyLoading && (
              <p className="text-xs md3-text-muted mt-2">Benchmark-Währungen werden aktualisiert...</p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full md3-chip-accent text-xs">
                Portfolio
              </span>
              {benchmarkList.map(b => (
                <span key={b.symbol} className="inline-flex items-center gap-2 px-2 py-1 rounded-full md3-chip-tonal text-xs">
                  {b.name || b.symbol}
                  <button
                    onClick={() => removeBenchmark(b.symbol)}
                    className="md3-text-muted hover:opacity-90"
                    aria-label={`Benchmark ${b.symbol} entfernen`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>

            <div className="h-80 mt-4">
              {performanceComparisonData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceComparisonData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="portfolioSplitStroke" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={portfolioGradientOffset} stopColor="#10b981" stopOpacity={1} />
                        <stop offset={portfolioGradientOffset} stopColor="#f43f5e" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="portfolioSplitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={portfolioGradientOffset} stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset={portfolioGradientOffset} stopColor="#f43f5e" stopOpacity={0.25} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(dateStr: string) => {
                        const d = parseDateOnlyUTC(dateStr);
                        if (['3J', '5J', 'MAX'].includes(performanceRange)) return d.getUTCFullYear().toString();
                        return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
                      }}
                      tick={{ fontSize: 11, fill: 'var(--md3-on-surface-variant)' }}
                      minTickGap={80}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(val: number) => `${val.toFixed(1)}%`}
                      tick={{ fontSize: 11, fill: 'var(--md3-on-surface-variant)' }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--md3-surface-container-high)', border: 'none', fontSize: '12px', borderRadius: '12px' }}
                      labelStyle={{ color: 'var(--md3-on-surface-variant)' }}
                      formatter={(value: number | string | undefined, name: string | undefined) => [`${Number(value ?? 0).toFixed(2)}%`, name ?? 'Wert']}
                      labelFormatter={(label: React.ReactNode) => {
                        if (typeof label !== 'string' && typeof label !== 'number') return '';
                        return parseDateOnlyUTC(String(label)).toLocaleDateString('de-DE', { timeZone: 'UTC' });
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      wrapperStyle={{ color: 'var(--md3-on-surface-variant)', paddingTop: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="portfolio"
                      name="Portfolio"
                      stroke="url(#portfolioSplitStroke)"
                      strokeWidth={2.2}
                      fill="url(#portfolioSplitFill)"
                      dot={false}
                    />
                    {benchmarkSeries.map(b => (
                      <Line
                        key={b.key}
                        type="monotone"
                        dataKey={b.key}
                        name={b.name}
                        stroke={b.color}
                        strokeWidth={1.8}
                        dot={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center md3-text-muted text-sm">
                  Keine Performance-Daten für den ausgewählten Zeitraum.
                </div>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Return Heatmap / Grid */}
            <Card className="lg:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4">
                  <h3 className="font-semibold md3-text-main flex items-center gap-2">
                    <Activity size={18} className="md3-accent" />
                    Rendite
                    {returnViewMode !== 'yearly' && <span className="md3-text-muted font-normal">({selectedYear})</span>}
                  </h3>

                  {/* View Toggle */}
                  <div className="md3-segment flex p-1 rounded-lg">
                    {(['monthly', 'quarterly', 'yearly'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setReturnViewMode(mode)}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${returnViewMode === mode ? 'md3-chip-tonal' : 'md3-text-muted hover:opacity-90'}`}
                      >
                        {mode === 'monthly' ? 'Monat' : mode === 'quarterly' ? 'Quartal' : 'Jahr'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Year Navigation (Only for Monthly/Quarterly) */}
                {returnViewMode !== 'yearly' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigateYear('prev')}
                      disabled={!hasPrevYear}
                      className={`p-1.5 rounded-full transition-colors ${!hasPrevYear ? 'md3-text-muted opacity-40 cursor-not-allowed' : 'md3-list-item md3-text-muted'}`}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => navigateYear('next')}
                      disabled={!hasNextYear}
                      className={`p-1.5 rounded-full transition-colors ${!hasNextYear ? 'md3-text-muted opacity-40 cursor-not-allowed' : 'md3-list-item md3-text-muted'}`}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </div>

              <div className={`grid gap-3 ${returnViewMode === 'monthly' ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6' : returnViewMode === 'quarterly' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
                {returnViewMode === 'monthly' && displayedMonthlyReturns.map((m: { month: string; return: number | null; hasData: boolean }, index: number) => {
                  // Calculate mock dates for click
                  const monthIndex = index + 1;
                  const startDate = `${selectedYear}-${String(monthIndex).padStart(2, '0')}-01`;
                  const endDate = toDateKeyUTC(new Date(Date.UTC(selectedYear, monthIndex, 0)));
                  const hasData = m.hasData && Number.isFinite(m.return);

                  return (
                    <div
                      key={m.month}
                      onClick={() => hasData && handleTileClick(startDate, endDate, `${m.month} ${selectedYear}`)}
                      className={`md3-list-item rounded-lg p-3 flex flex-col items-center justify-center transition group relative ${hasData ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
                    >
                      <span className="text-xs md3-text-muted mb-1">{m.month}</span>
                      <span className={`font-bold ${hasData ? ((m.return as number) >= 0 ? 'md3-positive' : 'md3-negative') : 'md3-text-muted'}`}>
                        {hasData ? `${(m.return as number) > 0 ? '+' : ''}${m.return}%` : '—'}
                      </span>
                    </div>
                  );
                })}

                {returnViewMode === 'quarterly' && aggregatedReturns.quarterly.map((q) => {
                  const hasData = Number.isFinite(q.return);
                  return (
                    <div
                      key={q.label}
                      onClick={() => hasData && handleTileClick(q.startDate, q.endDate, `${q.label} ${selectedYear}`)}
                      className={`md3-list-item rounded-lg p-4 flex flex-col items-center justify-center transition group relative ${hasData ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
                    >
                      <span className="text-xs md3-text-muted mb-1 uppercase tracking-wider">{q.label}</span>
                      <span className={`text-lg font-bold ${hasData ? ((q.return as number) >= 0 ? 'md3-positive' : 'md3-negative') : 'md3-text-muted'}`}>
                        {hasData ? `${(q.return as number) > 0 ? '+' : ''}${q.return}%` : '—'}
                      </span>
                    </div>
                  );
                })}

                {returnViewMode === 'yearly' && aggregatedReturns.yearly.map((y) => {
                  const hasData = Number.isFinite(y.return);
                  return (
                    <div
                      key={y.year}
                      onClick={() => hasData && handleTileClick(y.startDate, y.endDate, `Jahr ${y.year}`)}
                      className={`md3-list-item rounded-lg p-4 flex flex-col items-center justify-center transition group relative ${hasData ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
                    >
                      <span className="text-xs md3-text-muted mb-1">{y.year}</span>
                      <span className={`text-lg font-bold ${hasData ? ((y.return as number) >= 0 ? 'md3-positive' : 'md3-negative') : 'md3-text-muted'}`}>
                        {hasData ? `${(y.return as number) > 0 ? '+' : ''}${y.return}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <ReturnChartModal
              isOpen={!!selectedTileData}
              onClose={() => setSelectedTileData(null)}
              series={selectedTileData?.series || []}
              title={selectedTileData?.title || ''}
              currency={project?.settings.baseCurrency || 'EUR'}
              timeRange={selectedTileData?.timeRange}
            />

            <HoldingsGroupModal
              isOpen={!!groupOverlay}
              onClose={() => setGroupOverlay(null)}
              title={groupOverlay?.title || ''}
              holdings={groupOverlay?.holdings || []}
              currency={project?.settings.baseCurrency || 'EUR'}
              groupValue={groupOverlay?.groupValue || 0}
              portfolioValue={portfolioTotalValue}
            />

            {/* Region Allocation */}
            <Card>
              <h3 className="font-semibold md3-text-main flex items-center gap-2 mb-6">
                <Globe size={18} className="md3-accent" />
                Regionen
              </h3>
              <div className="space-y-4">
                {regionData.map((region) => (
                  <button
                    key={region.name}
                    type="button"
                    onClick={() => openGroupOverlay(`Region: ${region.name}`, region)}
                    className="w-full text-left group -mx-2 px-2 py-2 rounded-lg transition-all md3-list-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md3-primary)]/40 cursor-pointer"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="md3-text-main transition-colors flex items-center gap-2">
                        {region.name}
                        <span className="text-[10px] uppercase tracking-wider md3-text-muted transition-colors">Details</span>
                      </span>
                      <span className="md3-text-muted flex items-center gap-1">
                        {region.value}%
                        <ChevronRight className="w-3 h-3 md3-text-muted opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
                      </span>
                    </div>
                    <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--md3-surface-container-highest)' }}>
                      <div
                        className="h-2 rounded-full transition-all group-hover:brightness-110"
                        style={{ width: `${region.value}%`, backgroundColor: 'var(--md3-primary)' }}
                      ></div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Industry Allocation */}
            <Card>
              <h3 className="font-semibold md3-text-main flex items-center gap-2 mb-6">
                <Banknote size={18} className="md3-accent" />
                Branchen
              </h3>
              <div className="space-y-4">
                {industryData.map((industry) => (
                  <button
                    key={industry.name}
                    type="button"
                    onClick={() => openGroupOverlay(`Branche: ${industry.name}`, industry)}
                    className="w-full text-left group -mx-2 px-2 py-2 rounded-lg transition-all md3-list-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md3-primary)]/40 cursor-pointer"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="md3-text-main transition-colors flex items-center gap-2">
                        {industry.name}
                        <span className="text-[10px] uppercase tracking-wider md3-text-muted transition-colors">Details</span>
                      </span>
                      <span className="md3-text-muted flex items-center gap-1">
                        {industry.value}%
                        <ChevronRight className="w-3 h-3 md3-text-muted opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
                      </span>
                    </div>
                    <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--md3-surface-container-highest)' }}>
                      <div
                        className="h-2 rounded-full transition-all group-hover:brightness-110"
                        style={{ width: `${industry.value}%`, backgroundColor: 'var(--md3-primary)' }}
                      ></div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
            {/* Sector Allocation */}
            <Card>
              <h3 className="font-semibold md3-text-main flex items-center gap-2 mb-6">
                <BarChart3 size={18} className="md3-accent" />
                Sektoren
              </h3>
              <div className="space-y-4">
                {sectorData.map((sector) => (
                  <button
                    key={sector.name}
                    type="button"
                    onClick={() => openGroupOverlay(`Sektor: ${sector.name}`, sector)}
                    className="w-full text-left group -mx-2 px-2 py-2 rounded-lg transition-all md3-list-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md3-primary)]/40 cursor-pointer"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="md3-text-main transition-colors flex items-center gap-2">
                        {sector.name}
                        <span className="text-[10px] uppercase tracking-wider md3-text-muted transition-colors">Details</span>
                      </span>
                      <span className="md3-text-muted flex items-center gap-1">
                        {sector.value}%
                        <ChevronRight className="w-3 h-3 md3-text-muted opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
                      </span>
                    </div>
                    <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--md3-surface-container-highest)' }}>
                      <div
                        className="h-2 rounded-full transition-all group-hover:brightness-110"
                        style={{ width: `${sector.value}%`, backgroundColor: 'var(--md3-primary)' }}
                      ></div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Diversification Score / Alert */}
            {/* Diversification Score / Alert */}
            <Card className="flex flex-col justify-center">
              {(() => {
                const risks = [
                  { type: 'Sektor', data: sectorData[0] },
                  { type: 'Region', data: regionData[0] },
                  { type: 'Branche', data: industryData[0] }
                ]
                  .filter(item => item.data && item.data.value > 30)
                  .sort((a, b) => b.data.value - a.data.value);

                if (risks.length > 0) {
                  return (
                    <div className="flex items-start gap-4">
                      <div className="p-3 md3-warning-soft rounded-xl max-h-min">
                        <AlertCircle size={32} className="md3-warning" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-bold md3-text-main mb-2">Klumpenrisiken erkannt</h4>
                        <div className="space-y-3">
                          {risks.map((risk, index) => (
                            <div key={index} className="md3-list-item p-3 rounded-lg">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs md3-text-muted uppercase tracking-wider font-semibold">{risk.type}</span>
                                <span className="text-xs font-bold md3-negative">{risk.data.value}%</span>
                              </div>
                              <div className="md3-text-main font-medium">{risk.data.name}</div>
                            </div>
                          ))}
                        </div>
                        <p className="md3-text-muted text-sm mt-3 leading-relaxed">
                          Eine höhere Diversifikation in diesen Bereichen könnte die Volatilität senken.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex items-start gap-4">
                    <div className="p-3 md3-positive-soft rounded-xl">
                      <Check size={32} className="md3-positive" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold md3-text-main">Gut diversifiziert</h4>
                      <p className="md3-text-muted text-sm mt-1 leading-relaxed">
                        Kein Bereich (Sektor, Region, Branche) dominiert das Portfolio übermäßig (über 30%).
                      </p>
                    </div>
                  </div>
                );
              })()}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};







