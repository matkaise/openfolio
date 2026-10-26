import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, Check, ChevronLeft, ChevronRight, Gauge, Loader2, PieChart, Plus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { AreaChart, Area, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { calculateTWRSeries, type Holding, type AnalysisMetrics } from '@/lib/portfolioUtils';
import { buildMwrSeries, smoothPerformanceSeries } from '@/lib/performanceUtils';
import { createHistoryInput, type AnalysisInput } from '@/lib/calculations/portfolioCalculations';
import { useWorkerComputation } from '@/lib/calculations/useWorkerComputation';
import { selectCalculationTransactions, calculateProjectHoldings, filterCashAccountsByPortfolio } from '@/lib/portfolioSelectors';
import { convertCurrency as convertFxCurrency } from '@/lib/fxUtils';
import { parseDateOnlyUTC, toDateKeyUTC } from '@/lib/dateUtils';
import { useProjectData } from '@/contexts/ProjectContext';
import { ReturnChartModal } from '@/components/ReturnChartModal';
import { SimpleAreaChart } from '@/components/SimpleAreaChart';
import { useFormatters } from '@/components/ui/useFormatters';
import { Avatar, Button, CardHeader, Chip, EmptyState, GlassCard, IconButton, IconTile, Kpi, ListRow, Pill, Segmented, TextInput, toneOf } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { quoteTypeLabel } from '@/lib/labels';
import { useT } from '@/lib/i18n';
import { summarizeTwrSeries } from '@/lib/analysisService';
import { type AnalysisCache, type HistoryPoint, type PerformanceRow } from '@/types/portfolioView';
import { isCacheFor } from '@/lib/state/inputCache';

const EMPTY_HISTORY: HistoryPoint[] = [];
const EMPTY_METRICS: AnalysisMetrics = { volatility: 0, sharpeRatio: 0, maxDrawdown: 0, maxDrawdownDate: '', availableYears: [], monthlyReturns: [], twrSeries: [] };

const DrawdownModal = ({ isOpen, onClose, data }: { isOpen: boolean; onClose: () => void; data: { date: string; value: number }[] }) => (
  <Modal open={isOpen} onClose={onClose} size="xl" title="Drawdown-Verlauf" subtitle="Rückgang vom jeweils letzten Höchststand des Depots" icon={<TrendingDown size={20} />}>
    <SimpleAreaChart data={data} color="var(--loss)" height={320} showAxes={true} timeRange="MAX" isPercentage={true} tooltipLabel="Abstand zum Hoch" />
  </Modal>
);

const HoldingsGroupModal = ({
  isOpen,
  onClose,
  title,
  holdings,
  groupValue,
  portfolioValue
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  holdings: Holding[];
  groupValue: number;
  portfolioValue: number;
}) => {
  const t = useT();
  const formatters = useFormatters();
  const sortedHoldings = [...holdings].sort((a, b) => b.value - a.value);
  const safeGroupValue = groupValue || sortedHoldings.reduce((sum, h) => sum + h.value, 0);
  const groupShare = portfolioValue > 0 ? (safeGroupValue / portfolioValue) * 100 : 0;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={title}
      subtitle={`${sortedHoldings.length} Positionen · ${formatters.percent(groupShare, { decimals: 1 })} vom Depot`}
      icon={<PieChart size={20} />}
    >
      <div className="ui-rows ui-scroll" style={{ maxHeight: '60vh' }}>
        {sortedHoldings.map((h) => {
          const percentOfGroup = safeGroupValue > 0 ? (h.value / safeGroupValue) * 100 : 0;
          return (
            <ListRow
              key={`${h.security.isin}-${h.currency}`}
              leading={<Avatar seed={h.security.isin} label={h.security.name} size={38} />}
              title={h.security.name}
              meta={<span>{quoteTypeLabel(t, h.security.quoteType)} · {h.security.isin}</span>}
              trailing={(
                <>
                  <span className="ui-row-value">{formatters.money(h.value)}</span>
                  <span className="ui-row-sub">{formatters.percent(percentOfGroup, { decimals: 1 })} der Gruppe</span>
                </>
              )}
            />
          );
        })}
      </div>
    </Modal>
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
}) => (
  <Modal open={isOpen} onClose={onClose} size="xl" title={title} subtitle="Rollierend über 12 Monate" icon={<Activity size={20} />}>
    {series.length > 0 ? (
      <SimpleAreaChart data={series} color={color} height={320} showAxes={true} timeRange="MAX" currency={isPercentage ? 'EUR' : ''} isPercentage={isPercentage} tooltipLabel={tooltipLabel} />
    ) : (
      <EmptyState title="Keine Daten" text="Für diesen Zeitraum liegen noch keine Werte vor." />
    )}
  </Modal>
);

/** Clickable allocation rows with a share bar (regions, sectors, industries). */
const AllocationList = ({ items, onSelect }: { items: { name: string; value: number }[]; onSelect: (item: { name: string; value: number }) => void }) => (
  <div className="ui-alloc">
    {items.map((item) => (
      <button key={item.name} type="button" className="ui-alloc-row" onClick={() => onSelect(item)}>
        <span className="ui-alloc-head">
          <span className="ui-alloc-name">{item.name}</span>
          <span className="ui-alloc-value">{item.value} %<ChevronRight size={14} /></span>
        </span>
        <span className="ui-alloc-track"><span style={{ width: `${Math.min(100, item.value)}%` }} /></span>
      </button>
    ))}
  </div>
);

const sliceHistoryByRange = (
  history: HistoryPoint[],
  range: '1M' | '6M' | 'YTD' | '1J' | '3J' | '5J' | 'MAX'
) => {
  if (!history.length || range === 'MAX') return history;

  const endDate = parseDateOnlyUTC(history[history.length - 1].date);
  let startDate = new Date(endDate);

  switch (range) {
    case '1M':
      startDate.setUTCMonth(startDate.getUTCMonth() - 1);
      break;
    case '6M':
      startDate.setUTCMonth(startDate.getUTCMonth() - 6);
      break;
    case 'YTD':
      startDate = new Date(Date.UTC(endDate.getUTCFullYear(), 0, 1));
      break;
    case '1J':
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
      break;
    case '3J':
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 3);
      break;
    case '5J':
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 5);
      break;
    default:
      return history;
  }

  const startMs = startDate.getTime();
  const startIndex = history.findIndex((point) => parseDateOnlyUTC(point.date).getTime() >= startMs);
  if (startIndex <= 0) return history;
  return history.slice(startIndex);
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
  const project = useProjectData();
  const formatters = useFormatters();
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const performanceMethod = project?.settings?.performanceMethod || 'MWR';
  const performanceSmoothing = project?.settings?.performanceSmoothing || '1d';
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showDrawdown, setShowDrawdown] = useState(false);

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
    return selectCalculationTransactions(project, selectedPortfolioIds);
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

  // Full daily history and metrics, calculated in the worker; cached across tab switches
  const analysisRequest = useMemo(() => {
    if (!project) return null;
    const key = `${project.id}-${selectedPortfolioIds.slice().sort().join(',')}|base=${baseCurrency}|v18`;
    // Same objects = same data; a market or FX sync replaces them and recalculates
    const inputs = [filteredTransactions, filteredCashAccounts, project.securities, project.fxData.rates] as const;
    const input: AnalysisInput = {
      ...createHistoryInput(filteredTransactions, Object.values(project.securities || {}), project.fxData, filteredCashAccounts, baseCurrency),
      riskFreeRate
    };
    return { key, inputs, input };
  }, [project, selectedPortfolioIds, baseCurrency, filteredTransactions, filteredCashAccounts, riskFreeRate]);

  const cacheHit = analysisRequest && isCacheFor(cachedData, analysisRequest.key, analysisRequest.inputs) ? cachedData : null;
  const computation = useWorkerComputation('computeAnalysis', cacheHit ? null : analysisRequest?.input ?? null);
  const analysis = cacheHit ?? computation.result;
  const historyData = analysis?.historyData ?? EMPTY_HISTORY;
  const analysisMetrics = (includeDividends ? analysis?.metrics.withDividends : analysis?.metrics.withoutDividends) ?? EMPTY_METRICS;
  const isCalculating = !cacheHit && !computation.isCurrent;

  useEffect(() => {
    if (!analysisRequest || !computation.isCurrent || !computation.result || !onCacheUpdate) return;
    onCacheUpdate({ key: analysisRequest.key, inputs: analysisRequest.inputs, ...computation.result });
  }, [analysisRequest, computation.isCurrent, computation.result, onCacheUpdate]);

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
    const twrMap = analysisMetrics?.monthlyReturnsMap || {};
    const mwrMap = mwrMonthlyReturnsMap;
    const primary = performanceMethod === 'TWR' ? twrMap : mwrMap;
    const fallback = performanceMethod === 'TWR' ? mwrMap : twrMap;
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
  }, [analysisMetrics?.monthlyReturnsMap, mwrMonthlyReturnsMap, performanceMethod]);

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
    if (!Object.keys(monthlyReturnsMap).length) {
      return (analysisMetrics.monthlyReturns || []).map((entry) => {
        const hasData = Number.isFinite(entry.return);
        return {
          month: entry.month,
          return: hasData ? entry.return : null,
          hasData
        };
      });
    }

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
    if (performanceMethod === 'MWR') {
      if (!historyData.length) return [];
      const isFullRange = historyData.length > 0 && periodStart === historyData[0].date;
      return buildMwrSeries(historyData, periodStart, periodEnd, {
        includeDividends,
        isFullRange,
        transactions: filteredTransactions
      });
    }

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

  const performanceHistoryData = useMemo(() => (
    sliceHistoryByRange(historyData, performanceRange)
  ), [historyData, performanceRange]);

  const performanceRangeDates = useMemo(() => {
    if (!performanceHistoryData.length) return { start: '', end: '' };
    return {
      start: performanceHistoryData[0].date,
      end: performanceHistoryData[performanceHistoryData.length - 1].date
    };
  }, [performanceHistoryData]);

  const rawPortfolioPerformanceSeries = useMemo(() => {
    if (!performanceRangeDates.start || !performanceRangeDates.end) return [];
    if (performanceMethod === 'TWR') {
      return calculateTWRSeries(performanceHistoryData, includeDividends);
    }
    return buildMwrSeries(performanceHistoryData, performanceRangeDates.start, performanceRangeDates.end, {
      includeDividends,
      isFullRange: performanceRange === 'MAX',
      transactions: filteredTransactions
    });
  }, [performanceHistoryData, performanceRangeDates.start, performanceRangeDates.end, includeDividends, performanceRange, filteredTransactions, performanceMethod]);

  const portfolioPerformanceSeries = useMemo(() => (
    smoothPerformanceSeries(rawPortfolioPerformanceSeries, performanceSmoothing)
  ), [rawPortfolioPerformanceSeries, performanceSmoothing]);

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
    if (performanceMethod === 'TWR') {
      return smoothPerformanceSeries(calculateTWRSeries(syntheticHistory, false), performanceSmoothing);
    }
    return smoothPerformanceSeries(buildMwrSeries(syntheticHistory, start, end, {
      includeDividends: false,
      isFullRange: performanceRange === 'MAX',
      transactions: filteredTransactions
    }), performanceSmoothing);
  }, [buildBenchmarkMwrHistory, performanceRange, filteredTransactions, performanceMethod, performanceSmoothing]);

  const benchmarkSeries = useMemo(() => {
    if (!performanceRangeDates.start || !performanceRangeDates.end) return [];
    const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--text3)'];
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

  const RANGE_OPTIONS = (['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'] as const).map((value) => ({ value, label: value }));
  const twrSummary = summarizeTwrSeries(analysisMetrics.twrSeries || []);
  const chartTooltipStyle = { background: 'color-mix(in oklch, var(--surface) 94%, transparent)', border: '1px solid var(--stroke)', borderRadius: 12, fontSize: 12 };
  const returnTile = (key: string, label: string, value: number | null | undefined, onClick?: () => void) => {
    const hasData = Number.isFinite(value);
    return (
      <button
        key={key}
        type="button"
        className={`ui-return-tile is-${hasData ? toneOf(value as number) : 'empty'}`}
        onClick={hasData ? onClick : undefined}
        disabled={!hasData}
      >
        <span className="ui-return-label">{label}</span>
        <span className="ui-return-value">{hasData ? formatters.percent(value as number, { sign: true, decimals: 1 }) : '–'}</span>
      </button>
    );
  };
  const risks = [
    { type: 'Sektor', data: sectorData[0] },
    { type: 'Region', data: regionData[0] },
    { type: 'Branche', data: industryData[0] }
  ]
    .filter((item) => item.data && item.data.value > 30)
    .sort((a, b) => b.data.value - a.data.value);

  if (isCalculating) {
    return (
      <>
        <div className="ui-kpis">
          {[1, 2, 3, 4].map((i) => <div key={i} className="ui-kpi glass ui-skeleton" />)}
        </div>
        <GlassCard>
          <EmptyState icon={<Loader2 size={22} className="animate-spin" />} title="Analyse wird berechnet" text="Die Kennzahlen werden aus der gesamten Historie berechnet." />
        </GlassCard>
      </>
    );
  }

  return (
    <>
      <DrawdownModal isOpen={showDrawdown} onClose={() => setShowDrawdown(false)} data={analysisMetrics.drawdownHistory || []} />
      <RiskMetricModal
        isOpen={!!riskModal}
        onClose={() => setRiskModal(null)}
        title={riskModal?.title || ''}
        series={riskModal?.series || []}
        color={riskModal?.color || 'var(--gain)'}
        isPercentage={riskModal?.isPercentage ?? true}
        tooltipLabel={riskModal?.tooltipLabel || ''}
      />

      <div className="ui-kpis">
        <button
          type="button"
          className="ui-kpi-button"
          onClick={() => setRiskModal({ title: 'Volatilität (1 Jahr)', series: riskSeries.volatility, color: 'var(--c4)', isPercentage: true, tooltipLabel: 'Volatilität (annualisiert)' })}
        >
          <Kpi label="Volatilität (1 J.)" value={formatters.percent(currentVolatility, { decimals: 1 })} sub={volLabel.text} icon={<Activity size={16} />} tone="amber" />
        </button>
        <button
          type="button"
          className="ui-kpi-button"
          onClick={() => setRiskModal({ title: 'Sharpe Ratio (1 Jahr)', series: riskSeries.sharpe, color: 'var(--gain)', isPercentage: false, tooltipLabel: 'Sharpe Ratio' })}
        >
          <Kpi label="Sharpe Ratio (1 J.)" value={formatters.number(currentSharpe, 2)} sub={sharpeLabel.text} icon={<Gauge size={16} />} tone="teal" />
        </button>
        <button type="button" className="ui-kpi-button" onClick={() => setShowDrawdown(true)}>
          <Kpi
            label="Max. Drawdown"
            value={formatters.percent(analysisMetrics.maxDrawdown, { decimals: 1 })}
            valueTone={analysisMetrics.maxDrawdown < 0 ? 'down' : undefined}
            sub={analysisMetrics.maxDrawdownDate ? parseDateOnlyUTC(analysisMetrics.maxDrawdownDate).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Kein Rückgang'}
            icon={<TrendingDown size={16} />}
            tone="accent"
          />
        </button>
        <Kpi
          label="Rendite gesamt (TWR)"
          value={twrSummary ? formatters.percent(twrSummary.total, { sign: true, decimals: 1 }) : '–'}
          valueTone={twrSummary ? toneOf(twrSummary.total) : undefined}
          sub={twrSummary
            ? `${twrSummary.annualized !== null ? `${formatters.percent(twrSummary.annualized, { sign: true, decimals: 1 })} p. a. · ` : ''}seit ${parseDateOnlyUTC(twrSummary.since).toLocaleDateString('de-DE', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`
            : 'Noch keine Historie'}
          icon={<TrendingUp size={16} />}
          tone="gain"
        />
      </div>

      <GlassCard>
        <CardHeader title="Performancevergleich">
          <div className="ui-head-actions">
            <Segmented options={RANGE_OPTIONS} value={performanceRange} onChange={setPerformanceRange} ariaLabel="Zeitraum" size="sm" />
            <Chip active={includeDividends} onClick={onToggleDividends}>{includeDividends && <Check size={12} />} Dividenden</Chip>
          </div>
        </CardHeader>

        <form className="ui-inline-form" onSubmit={(e) => { e.preventDefault(); handleAddBenchmark(); }}>
          <TextInput value={benchmarkInput} onChange={(e) => setBenchmarkInput(e.target.value)} placeholder="Benchmark hinzufügen, z. B. SPY oder ^GDAXI" aria-label="Benchmark-Symbol" />
          <Button type="submit" disabled={isBenchmarkLoading || !benchmarkInput.trim()} icon={isBenchmarkLoading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}>
            Hinzufügen
          </Button>
        </form>
        {benchmarkError && <p className="ui-field-hint ui-error" style={{ marginTop: 8 }}>{benchmarkError}</p>}
        {isBenchmarkCurrencyLoading && <p className="ui-field-hint" style={{ marginTop: 8 }}>Wechselkurse der Benchmarks werden geladen …</p>}

        <div className="ui-chips">
          <Pill tone="accent">Depot</Pill>
          {benchmarkList.map((b) => (
            <span key={b.symbol} className="ui-pill is-neutral">
              {b.name || b.symbol}
              <button type="button" className="ui-pill-remove" onClick={() => removeBenchmark(b.symbol)} aria-label={`Benchmark ${b.symbol} entfernen`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div className="ui-chart" style={{ height: 320, marginTop: 12 }}>
          {performanceComparisonData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceComparisonData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="portfolioSplitStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={portfolioGradientOffset} stopColor="var(--gain)" stopOpacity={1} />
                    <stop offset={portfolioGradientOffset} stopColor="var(--loss)" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="portfolioSplitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={portfolioGradientOffset} stopColor="var(--gain)" stopOpacity={0.22} />
                    <stop offset={portfolioGradientOffset} stopColor="var(--loss)" stopOpacity={0.22} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(dateStr: string) => {
                    const d = parseDateOnlyUTC(dateStr);
                    if (['3J', '5J', 'MAX'].includes(performanceRange)) return d.getUTCFullYear().toString();
                    return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
                  }}
                  tick={{ fontSize: 11, fill: 'var(--text3)' }}
                  minTickGap={80}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val: number) => formatters.percent(val, { decimals: 0 })}
                  tick={{ fontSize: 11, fill: 'var(--text3)' }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ color: 'var(--text3)' }}
                  itemStyle={{ color: 'var(--text)' }}
                  formatter={(value: number | string | undefined, name: string | undefined) => [formatters.percent(Number(value ?? 0), { sign: true }), name ?? 'Wert']}
                  labelFormatter={(label: React.ReactNode) => {
                    if (typeof label !== 'string' && typeof label !== 'number') return '';
                    return parseDateOnlyUTC(String(label)).toLocaleDateString('de-DE', { timeZone: 'UTC' });
                  }}
                />
                {benchmarkSeries.length > 0 && (
                  <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ color: 'var(--text2)', paddingTop: 8, fontSize: 12 }} />
                )}
                <Area type="monotone" dataKey="portfolio" name="Depot" stroke="url(#portfolioSplitStroke)" strokeWidth={2.2} fill="url(#portfolioSplitFill)" dot={false} />
                {benchmarkSeries.map((b) => (
                  <Line key={b.key} type="monotone" dataKey={b.key} name={b.name} stroke={b.color} strokeWidth={1.8} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Keine Daten" text="Für den gewählten Zeitraum gibt es keine Performance-Daten." />
          )}
        </div>
      </GlassCard>

      <div className="ui-analysis-grid">
        <GlassCard>
          <CardHeader title={returnViewMode === 'yearly' ? 'Rendite je Jahr' : `Rendite ${selectedYear}`}>
            <div className="ui-head-actions">
              <Segmented
                options={[{ value: 'monthly', label: 'Monat' }, { value: 'quarterly', label: 'Quartal' }, { value: 'yearly', label: 'Jahr' }]}
                value={returnViewMode}
                onChange={setReturnViewMode}
                ariaLabel="Zeitraster"
                size="sm"
              />
              {returnViewMode !== 'yearly' && (
                <span className="ui-row-actions">
                  <IconButton label="Vorheriges Jahr" onClick={() => navigateYear('prev')} disabled={!hasPrevYear}><ChevronLeft size={18} /></IconButton>
                  <IconButton label="Nächstes Jahr" onClick={() => navigateYear('next')} disabled={!hasNextYear}><ChevronRight size={18} /></IconButton>
                </span>
              )}
            </div>
          </CardHeader>

          <div className={`ui-return-grid is-${returnViewMode}`}>
            {returnViewMode === 'monthly' && displayedMonthlyReturns.map((m: { month: string; return: number | null; hasData: boolean }, index: number) => {
              const monthIndex = index + 1;
              const startDate = `${selectedYear}-${String(monthIndex).padStart(2, '0')}-01`;
              const endDate = toDateKeyUTC(new Date(Date.UTC(selectedYear, monthIndex, 0)));
              return returnTile(m.month, m.month, m.hasData ? m.return : null, () => handleTileClick(startDate, endDate, `${m.month} ${selectedYear}`));
            })}
            {returnViewMode === 'quarterly' && aggregatedReturns.quarterly.map((q) => (
              returnTile(q.label, q.label, q.return, () => handleTileClick(q.startDate, q.endDate, `${q.label} ${selectedYear}`))
            ))}
            {returnViewMode === 'yearly' && aggregatedReturns.yearly.map((y) => (
              returnTile(String(y.year), String(y.year), y.return, () => handleTileClick(y.startDate, y.endDate, `Jahr ${y.year}`))
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <CardHeader title="Regionen" />
          <AllocationList items={regionData} onSelect={(region) => openGroupOverlay(`Region: ${region.name}`, region as typeof regionData[number])} />
        </GlassCard>
      </div>

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
        groupValue={groupOverlay?.groupValue || 0}
        portfolioValue={portfolioTotalValue}
      />

      <div className="ui-analysis-grid is-thirds">
        <GlassCard>
          <CardHeader title="Branchen" />
          <AllocationList items={industryData} onSelect={(industry) => openGroupOverlay(`Branche: ${industry.name}`, industry as typeof industryData[number])} />
        </GlassCard>
        <GlassCard>
          <CardHeader title="Sektoren" />
          <AllocationList items={sectorData} onSelect={(sector) => openGroupOverlay(`Sektor: ${sector.name}`, sector as typeof sectorData[number])} />
        </GlassCard>
        <GlassCard>
          {risks.length > 0 ? (
            <>
              <CardHeader title="Klumpenrisiken"><IconTile tone="amber" size={36}><AlertCircle size={18} /></IconTile></CardHeader>
              <div className="ui-rows">
                {risks.map((risk) => (
                  <ListRow key={risk.type} title={risk.data.name} meta={<span>{risk.type}</span>} trailing={<Pill tone="down">{risk.data.value} %</Pill>} />
                ))}
              </div>
              <p className="ui-text" style={{ marginTop: 10, marginBottom: 0 }}>Mehr Streuung in diesen Bereichen könnte die Schwankungen senken.</p>
            </>
          ) : (
            <>
              <CardHeader title="Gut gestreut"><IconTile tone="gain" size={36}><Check size={18} /></IconTile></CardHeader>
              <p className="ui-text" style={{ marginBottom: 0 }}>Kein Sektor, keine Region und keine Branche macht mehr als 30 % des Depots aus.</p>
            </>
          )}
        </GlassCard>
      </div>
    </>
  );
};
