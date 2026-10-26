import React, { useMemo, useState } from 'react';
import { Check, PenLine, X } from 'lucide-react';
import { calculateTWRSeries } from '@/lib/portfolioUtils';
import { createHistoryInput } from '@/lib/calculations/portfolioCalculations';
import { useWorkerComputation } from '@/lib/calculations/useWorkerComputation';
import { buildMwrSeries, normalizeInvestedForExplicitCash, smoothPerformanceSeries } from '@/lib/performanceUtils';
import { selectCalculationTransactions, calculateProjectHoldings, filterCashAccountsByPortfolio } from '@/lib/portfolioSelectors';
import { convertCurrency } from '@/lib/fxUtils';
import { resolveWealthGoalSource } from '@/lib/wealthGoalUtils';
import { replayCash } from '@/lib/cashModel';
import { useProjectActions, useProjectData } from '@/contexts/ProjectContext';
import { Avatar, CardHeader, Chip, Donut, GlassCard, Kpi, Pill, Segmented, toneOf } from '@/components/ui/primitives';
import { useFormatters } from '@/components/ui/useFormatters';
import { useT, type Messages } from '@/lib/i18n';
import { quoteTypeLabel } from '@/lib/labels';
import { HeroChart } from '@/components/dashboard/HeroChart';
import { annualizedReturnFromHistory } from '@/lib/domain/performance/xirr';
import { getBrokerConnections } from '@/lib/brokers/connections';
import type { BrokerConnection } from '@/types/domain';
import { parseDateOnlyUTC } from '@/lib/dateUtils';
import { type DividendHistoryEntry, type EventEntry, type TransactionLike, type UpcomingDividendEntry } from '@/types/portfolioView';

const EMPTY_HISTORY: { date: string; value: number; invested: number; dividend: number }[] = [];

const sliceHistoryByRange = (
  history: { date: string; value: number; invested: number; dividend: number }[],
  range: string
) => {
  if (!history.length || range === 'MAX') return history;

  const endDate = parseDateOnlyUTC(history[history.length - 1].date);
  let startDate = new Date(endDate);

  switch (range) {
    case '1W':
      startDate.setUTCDate(startDate.getUTCDate() - 7);
      break;
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

type DashboardProps = {
  timeRange: string;
  setTimeRange: (range: string) => void;
  selectedPortfolioIds: string[];
  onSelectPortfolios: (ids: string[]) => void;
  onSelectSecurity: (isin: string, currency?: string) => void;
  onShowPortfolio: () => void;
  onShowBrokers: () => void;
  includeDividends: boolean;
  onToggleDividends: () => void;
};

const RANGES = ['1W', '1M', 'YTD', '1J', '5J', 'MAX'] as const;
const BROKER_LABELS: Record<BrokerConnection['kind'], { name: string; short: string }> = {
  'degiro-folder': { name: 'DEGIRO', short: 'DG' },
  'ibkr-flex': { name: 'Interactive Brokers', short: 'IB' },
  trading212: { name: 'Trading 212', short: 'T2' },
  comdirect: { name: 'comdirect', short: 'CD' }
};

const relativeTime = (t: Messages, iso: string | undefined, nowMs: number) => {
  if (!iso) return t.dashboard.synced.never;
  const minutes = Math.round((nowMs - Date.parse(iso)) / 60000);
  if (minutes < 1) return t.dashboard.synced.now;
  if (minutes < 60) return t.dashboard.synced.minutes(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t.dashboard.synced.hours(hours);
  return t.dashboard.synced.days(Math.round(hours / 24));
};

type AssetClass = keyof Messages['assetClasses'];
// Yahoo quote types and our own security types
const ASSET_CLASS_BY_TYPE: Record<string, AssetClass> = {
  EQUITY: 'stocks',
  STOCK: 'stocks',
  ETF: 'etfs',
  CRYPTOCURRENCY: 'crypto',
  CRYPTO: 'crypto',
  MUTUALFUND: 'funds',
  FUND: 'funds',
  FUTURE: 'derivatives',
  INDEX: 'indices',
  CURRENCY: 'currencies'
};
const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  stocks: 'var(--c2)',
  etfs: 'var(--c1)',
  cash: 'var(--c3)',
  crypto: 'var(--c5)',
  funds: 'var(--c4)',
  derivatives: 'var(--loss)',
  indices: 'var(--text3)',
  currencies: 'var(--text3)',
  other: 'var(--text3)'
};

export const DashboardContent = ({ timeRange, setTimeRange, selectedPortfolioIds, onSelectPortfolios, onSelectSecurity, onShowPortfolio, onShowBrokers, includeDividends, onToggleDividends }: DashboardProps) => {
  const project = useProjectData();
  const { updateProject } = useProjectActions();
  const formatters = useFormatters();
  const t = useT();
  const [nowMs] = useState(() => Date.now());
  const [chartMode, setChartMode] = useState<'value' | 'performance'>('value');
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const performanceMethod = project?.settings?.performanceMethod || 'MWR';
  const performanceSmoothing = project?.settings?.performanceSmoothing || '1d';
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  // Filter transactions based on selected Portfolio
  const filteredTransactions = useMemo(() => (
    selectCalculationTransactions(project, selectedPortfolioIds)
  ), [project, selectedPortfolioIds]);
  const filteredCashAccounts = useMemo(() => (
    filterCashAccountsByPortfolio(project, selectedPortfolioIds)
  ), [project, selectedPortfolioIds]);

  const { holdings, realizedPnL } = useMemo(() => {
    return calculateProjectHoldings(project, filteredTransactions);
  }, [project, filteredTransactions]);

  // Daily MAX history from the calculation worker; the previous history stays visible while it recalculates
  const historyInput = useMemo(() => {
    if (!project) return null;
    return createHistoryInput(filteredTransactions, Object.values(project.securities || {}), project.fxData, filteredCashAccounts, baseCurrency);
  }, [project, filteredTransactions, filteredCashAccounts, baseCurrency]);
  const maxHistoryData = useWorkerComputation('computeMaxHistory', historyInput).result ?? EMPTY_HISTORY;

  // Calculate portfolio history for chart by slicing MAX history.
  const historyData = useMemo(() => (
    sliceHistoryByRange(maxHistoryData, timeRange)
  ), [maxHistoryData, timeRange]);

  const kpiHistoryData = maxHistoryData;

  const dailyHistoryData = useMemo(() => {
    return sliceHistoryByRange(maxHistoryData, '1M');
  }, [maxHistoryData]);

  const kpiHistoryForPerformance = useMemo(() => {
    if (!project) return kpiHistoryData;

    return normalizeInvestedForExplicitCash(
      kpiHistoryData,
      filteredTransactions,
      filteredCashAccounts,
      project.fxData,
      baseCurrency
    );
  }, [project, kpiHistoryData, filteredCashAccounts, filteredTransactions, baseCurrency]);

  const historyForPerformance = useMemo(() => {
    if (!project) return historyData;

    return normalizeInvestedForExplicitCash(
      historyData,
      filteredTransactions,
      filteredCashAccounts,
      project.fxData,
      baseCurrency
    );
  }, [project, historyData, filteredCashAccounts, filteredTransactions, baseCurrency]);

  const rawPerformanceSeries = useMemo(() => {
    if (historyForPerformance.length === 0) return [];
    if (performanceMethod === 'TWR') {
      return calculateTWRSeries(historyForPerformance, includeDividends);
    }
    const start = historyForPerformance[0].date;
    const end = historyForPerformance[historyForPerformance.length - 1].date;
    return buildMwrSeries(historyForPerformance, start, end, {
      includeDividends,
      isFullRange: timeRange === 'MAX',
      transactions: filteredTransactions
    });
  }, [historyForPerformance, includeDividends, timeRange, filteredTransactions, performanceMethod]);

  const performanceSeries = useMemo(() => {
    return smoothPerformanceSeries(rawPerformanceSeries, performanceSmoothing);
  }, [rawPerformanceSeries, performanceSmoothing]);


  const latestKpiHistoryPoint = kpiHistoryData.length > 0 ? kpiHistoryData[kpiHistoryData.length - 1] : null;
  const latestKpiPerformancePoint = kpiHistoryForPerformance.length > 0
    ? kpiHistoryForPerformance[kpiHistoryForPerformance.length - 1]
    : null;
  const holdingsMarketValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const holdingsCostBasis = holdings.reduce((sum, h) => sum + (h.quantity * (h.averageBuyPrice || 0)), 0);
  const investedCapital = holdingsCostBasis > 0
    ? holdingsCostBasis
    : (latestKpiPerformancePoint
      ? latestKpiPerformancePoint.invested
      : holdingsCostBasis);
  const currentMaketValue = latestKpiHistoryPoint
    ? latestKpiHistoryPoint.value
    : holdings.reduce((sum, h) => sum + h.value, 0);

  const cashBalance = useMemo(() => {
    if (!project) return 0;

    const cashAccountsWithHistory = filteredCashAccounts.filter(
      (account) => account.balanceHistory && Object.keys(account.balanceHistory).length > 0
    );

    if (cashAccountsWithHistory.length > 0) {
      return cashAccountsWithHistory.reduce((sum, account) => {
        const dates = Object.keys(account.balanceHistory || {}).sort();
        if (dates.length === 0) return sum;
        const latestDate = dates[dates.length - 1];
        const balance = account.balanceHistory?.[latestDate] || 0;
        return sum + convertCurrency(project.fxData, balance, account.currency, baseCurrency, latestDate);
      }, 0);
    }

    // No account statements: cash from the bookings, incl. sale proceeds not reinvested yet
    const derived = replayCash(filteredTransactions, (amount, currency, date) => convertCurrency(project.fxData, amount, currency, baseCurrency, date), baseCurrency);
    return Object.entries(derived.byCurrency).reduce((sum, [currency, amount]) => sum + convertCurrency(project.fxData, amount, currency, baseCurrency), 0);
  }, [project, filteredCashAccounts, filteredTransactions, baseCurrency]);

  // Gain = open positions against their cost plus what sales realized; cash is not gain
  const totalReturn = (holdingsMarketValue - holdingsCostBasis) + (realizedPnL || 0);
  const wealthGoalStep = 25000;
  const goalSource = resolveWealthGoalSource(project?.settings);
  const storedGoal = goalSource.amount;
  const storedGoalCurrency = goalSource.currency || baseCurrency;
  const convertedStoredGoal = (project && typeof storedGoal === 'number' && Number.isFinite(storedGoal) && storedGoal > 0)
    ? convertCurrency(project.fxData, storedGoal, storedGoalCurrency, baseCurrency)
    : undefined;
  const normalizedConvertedGoal = typeof convertedStoredGoal === 'number' && Number.isFinite(convertedStoredGoal) && convertedStoredGoal > 0
    ? convertedStoredGoal
    : undefined;
  const suggestedGoal = Math.max(100000, Math.ceil(currentMaketValue / wealthGoalStep) * wealthGoalStep);
  const wealthGoal = normalizedConvertedGoal
    ?? (currentMaketValue >= suggestedGoal ? suggestedGoal + wealthGoalStep : suggestedGoal);
  const wealthGoalProgress = wealthGoal > 0 ? Math.min((currentMaketValue / wealthGoal) * 100, 100) : 0;
  const wealthGoalRemaining = Math.max(wealthGoal - currentMaketValue, 0);

  const startGoalEdit = () => {
    setGoalInput(String(Math.round(wealthGoal)));
    setIsEditingGoal(true);
  };

  const cancelGoalEdit = () => {
    setIsEditingGoal(false);
    setGoalInput('');
  };

  const saveGoalEdit = () => {
    if (!project) return;
    const numericGoal = Number(goalInput.replace(/[^\d]/g, ''));
    if (!Number.isFinite(numericGoal) || numericGoal < 1000) return;

    updateProject((prev) => ({
      ...prev,
      settings: { ...prev.settings, wealthGoal: numericGoal, wealthGoalCurrency: prev.settings.baseCurrency }
    }));

    setIsEditingGoal(false);
    setGoalInput('');
  };

  const latestDailyPoint = dailyHistoryData.length > 0 ? dailyHistoryData[dailyHistoryData.length - 1] : null;
  const previousDailyPoint = dailyHistoryData.length > 1 ? dailyHistoryData[dailyHistoryData.length - 2] : null;
  const dayChangeValue = (latestDailyPoint && previousDailyPoint)
    ? latestDailyPoint.value - previousDailyPoint.value
    : 0;
  const rawDayChangePercent = (previousDailyPoint && Math.abs(previousDailyPoint.value) > 0.000001)
    ? (dayChangeValue / previousDailyPoint.value) * 100
    : 0;
  const dayChangePercent = Math.abs(rawDayChangePercent) < 0.005 ? 0 : rawDayChangePercent;
  const dividendSummary = useMemo(() => {
    if (!project) {
      return {
        ytdValue: 0,
        nextPayout: null as null | { name: string; amount: number; date: Date },
        monthlyBars1J: new Array(12).fill(0),
        monthlyBarsYTD: [],
        isTheoretical: false
      };
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    const dividendsTx = filteredTransactions.filter(t => t.type === 'Dividend');

    const convertToBaseAtDate = (amount: number, currency: string, date: string) => (
      convertCurrency(project.fxData, amount, currency, baseCurrency, date)
    );

    const convertToBaseLatest = (amount: number, currency: string) => (
      convertCurrency(project.fxData, amount, currency, baseCurrency)
    );

    const monthKeys1J: string[] = [];
    const monthKeySet = new Set<string>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthKeys1J.push(key);
      monthKeySet.add(key);
    }

    const monthKeysYTD: string[] = [];
    for (let m = 0; m <= today.getMonth(); m++) {
      monthKeysYTD.push(`${today.getFullYear()}-${m}`);
    }

    const monthlyMap: Record<string, number> = {};
    let ytdValue = 0;

    if (dividendsTx.length > 0) {
      dividendsTx.forEach(t => {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        // Signed: a reversal (negative dividend) reduces the total
        const amount = convertToBaseAtDate(t.amount, t.currency, t.date);
        if (d.getFullYear() === currentYear) {
          ytdValue += amount;
        }
        if (monthKeySet.has(key)) {
          monthlyMap[key] = (monthlyMap[key] || 0) + amount;
        }
      });
    } else {
      const txByIsin: Record<string, TransactionLike[]> = {};
      filteredTransactions.forEach(t => {
        if (!t.isin) return;
        if (!txByIsin[t.isin]) txByIsin[t.isin] = [];
        txByIsin[t.isin].push(t);
      });

      Object.keys(txByIsin).forEach(isin => {
        const sec = project.securities?.[isin];
        if (!sec || !sec.dividendHistory) return;
        const secTx = (txByIsin[isin] || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const events: EventEntry[] = [];
        secTx.forEach(t => {
          events.push({ time: new Date(t.date).getTime(), type: 'Tx', data: t });
        });
        if (sec.splits) {
          Object.entries(sec.splits).forEach(([d, r]) => {
            events.push({ time: new Date(d).getTime(), type: 'Split', ratio: r as number });
          });
        }
        events.sort((a, b) => {
          if (a.time !== b.time) return a.time - b.time;
          if (a.type === 'Split' && b.type !== 'Split') return -1;
          if (a.type !== 'Split' && b.type === 'Split') return 1;
          return 0;
        });

        sec.dividendHistory.forEach((dh: DividendHistoryEntry) => {
          const dDate = new Date(dh.date);
          if (dDate > today) return;

          let sharesAtDate = 0;
          const targetTime = dDate.getTime();
          for (const event of events) {
            if (event.time > targetTime) break;
            if (event.type === 'Split') {
              const ratio = event.ratio || 1;
              if (ratio > 0 && sharesAtDate > 0) sharesAtDate *= ratio;
            } else if (event.type === 'Tx' && event.data) {
              const t = event.data;
              const qty = Math.abs(t.shares || t.quantity || 0);
              if (t.type === 'Buy' || t.type === 'Sparplan_Buy') sharesAtDate += qty;
              else if (t.type === 'Sell') sharesAtDate -= qty;
            }
          }
          if (sharesAtDate <= 0.0001) return;

          const amount = convertToBaseAtDate(dh.amount * sharesAtDate, sec.currency || 'EUR', dh.date);
          const key = `${dDate.getFullYear()}-${dDate.getMonth()}`;
          if (dDate.getFullYear() === currentYear) {
            ytdValue += amount;
          }
          if (monthKeySet.has(key)) {
            monthlyMap[key] = (monthlyMap[key] || 0) + amount;
          }
        });
      });
    }

    const monthlyBars1J = monthKeys1J.map(key => monthlyMap[key] || 0);
    const monthlyBarsYTD = monthKeysYTD.map(key => monthlyMap[key] || 0);

    const forecastEvents: { date: Date; amount: number; name: string }[] = [];
    holdings.forEach(h => {
      const sec = project.securities?.[h.security.isin];
      if (!sec) return;
      const shares = h.quantity || 0;
      if (shares <= 0) return;
      const secCurrency = sec.currency || 'EUR';

      if (sec.upcomingDividends && Array.isArray(sec.upcomingDividends)) {
        sec.upcomingDividends.forEach((ud: UpcomingDividendEntry) => {
          const exDate = new Date(ud.exDate);
          if (exDate.getFullYear() === currentYear && exDate > today) {
            let amount = ud.amount;
            if (!amount && sec.dividendHistory?.length) {
              const sortedHist = [...sec.dividendHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              amount = sortedHist[0].amount;
            }
            if (amount) {
              const total = amount * shares;
              forecastEvents.push({
                date: exDate,
                amount: convertToBaseLatest(total, secCurrency),
                name: sec.name || h.security.isin
              });
            }
          }
        });
      }

      if (sec.dividendHistory && Array.isArray(sec.dividendHistory)) {
        sec.dividendHistory.forEach((dh: DividendHistoryEntry) => {
          const dDate = new Date(dh.date);
          if (dDate.getFullYear() !== currentYear - 1) return;
          const thisYearDate = new Date(currentYear, dDate.getMonth(), dDate.getDate());
          if (thisYearDate <= today) return;
          const hasUpcoming = forecastEvents.some(e => e.name === (sec.name || h.security.isin) && e.date.getMonth() === dDate.getMonth());
          if (hasUpcoming) return;
          const total = dh.amount * shares;
          forecastEvents.push({
            date: thisYearDate,
            amount: convertToBaseLatest(total, secCurrency),
            name: sec.name || h.security.isin
          });
        });
      }
    });

    forecastEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
    const next = forecastEvents.length > 0 ? forecastEvents[0] : null;

    return {
      ytdValue,
      nextPayout: next ? { name: next.name, amount: next.amount, date: next.date } : null,
      monthlyBars1J,
      monthlyBarsYTD,
      isTheoretical: dividendsTx.length === 0
    };
  }, [project, filteredTransactions, holdings, baseCurrency]);

  // Calculate Allocation Data
  const allocationData = useMemo(() => {
    const groups: Partial<Record<AssetClass, { value: number; count: number }>> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const assetClass = ASSET_CLASS_BY_TYPE[(h.security.quoteType || '').toUpperCase()] || 'other';
      const group = groups[assetClass] ?? (groups[assetClass] = { value: 0, count: 0 });
      group.value += h.value;
      group.count += 1;
      totalValue += h.value;
    });

    // Show positive cash as separate allocation bucket.
    if (cashBalance > 0.000001) {
      groups.cash = { value: cashBalance, count: 1 };
      totalValue += cashBalance;
    }

    return (Object.entries(groups) as [AssetClass, { value: number; count: number }][])
      .map(([assetClass, data]) => ({
        id: assetClass,
        name: t.assetClasses[assetClass],
        value: data.value,
        count: data.count,
        percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
        color: ASSET_CLASS_COLORS[assetClass]
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, cashBalance, t]);

  const totalHoldingsValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const totalParts = formatters.moneyParts(currentMaketValue);
  const firstRangePoint = historyData[0];
  const lastRangePoint = historyData[historyData.length - 1];
  const rangeProfit = firstRangePoint && lastRangePoint
    ? (lastRangePoint.value - firstRangePoint.value) - (lastRangePoint.invested - firstRangePoint.invested)
    : 0;
  const rangePerformance = rawPerformanceSeries.length > 0 ? rawPerformanceSeries[rawPerformanceSeries.length - 1].value : 0;
  const annualizedReturn = annualizedReturnFromHistory(kpiHistoryForPerformance);
  const totalReturnPercent = investedCapital > 0 ? (totalReturn / investedCapital) * 100 : 0;
  const cashAccountsWithBalance = filteredCashAccounts.filter((account) => account.balanceHistory && Object.keys(account.balanceHistory).length > 0);
  const cashCurrencies = Array.from(new Set(cashAccountsWithBalance.map((account) => account.currency)));
  const topHoldings = [...holdings].sort((a, b) => b.value - a.value).slice(0, 6);
  const connections = getBrokerConnections(project);
  const portfolios = project?.portfolios || [];
  const chartData = chartMode === 'value' ? historyData : performanceSeries;

  const monthLabels = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(new Date(nowMs).getFullYear(), new Date(nowMs).getMonth() - 11 + i, 1);
    return formatters.date(d, { month: 'narrow' });
  });
  const dividendBars = dividendSummary.monthlyBars1J;
  const maxDividendBar = Math.max(...dividendBars, 0);

  return (
    <>
      <GlassCard className="hero anim-in anim-in-1" aria-label={t.dashboard.netWorth}>
        <div className="hero-top">
          <div>
            <div className="ui-label">{t.dashboard.netWorth}</div>
            <div className="hero-big">
              {totalParts.main}<span className="hero-big-rest">{totalParts.rest}</span>
            </div>
            <div className="hero-row">
              <Pill tone={toneOf(dayChangeValue)} title={t.dashboard.dayChangeTitle}>
                {dayChangeValue >= 0 ? '↑' : '↓'} {formatters.money(Math.abs(dayChangeValue))}
              </Pill>
              <Pill tone={toneOf(dayChangePercent)}>{t.dashboard.today(formatters.percent(dayChangePercent, { sign: true }))}</Pill>
              <Pill tone="neutral" title={performanceMethod === 'TWR' ? t.dashboard.twr : t.dashboard.mwr}>
                {formatters.percent(rangePerformance, { sign: true, decimals: 1 })} · {t.ranges.long[timeRange] || timeRange}
              </Pill>
            </div>
          </div>
          <div className="hero-controls">
            {portfolios.length > 1 && (
              <div className="hero-row" role="group" aria-label={t.dashboard.portfolio}>
                <Chip active={selectedPortfolioIds.length === 0} onClick={() => onSelectPortfolios([])}>{t.common.all}</Chip>
                {portfolios.map((portfolio) => (
                  <Chip
                    key={portfolio.id}
                    active={selectedPortfolioIds.length === 1 && selectedPortfolioIds[0] === portfolio.id}
                    onClick={() => onSelectPortfolios([portfolio.id])}
                  >
                    {portfolio.name}
                  </Chip>
                ))}
              </div>
            )}
            <Segmented
              ariaLabel={t.ranges.label}
              options={RANGES.map((range) => ({ value: range, label: t.ranges.short[range] }))}
              value={(RANGES as readonly string[]).includes(timeRange) ? timeRange as typeof RANGES[number] : 'MAX'}
              onChange={(range) => setTimeRange(range)}
            />
          </div>
        </div>

        <HeroChart data={chartData} mode={chartMode} formatters={formatters} />

        <div className="hero-row" style={{ justifyContent: 'space-between' }}>
          <div className="hero-legend">
            <span><i aria-hidden="true" />{chartMode === 'value' ? t.dashboard.legendValue : t.dashboard.legendReturn}</span>
            {chartMode === 'value' && <span><i className="is-invested" aria-hidden="true" />{t.dashboard.legendInvested}</span>}
          </div>
          <div className="hero-row">
            {chartMode === 'performance' && (
              <Chip active={includeDividends} onClick={onToggleDividends}>{t.dashboard.includeDividends}</Chip>
            )}
            <Segmented
              size="sm"
              ariaLabel={t.dashboard.chartMode}
              options={[{ value: 'value', label: t.dashboard.modeValue }, { value: 'performance', label: t.dashboard.modeReturn }]}
              value={chartMode}
              onChange={setChartMode}
            />
          </div>
        </div>
      </GlassCard>

      <div className="dash-kpis anim-in anim-in-2">
        <Kpi label={t.dashboard.invested} value={formatters.money(investedCapital, { decimals: 0 })} sub={t.dashboard.investedSub} icon="€" tone="accent" />
        <Kpi
          label={t.dashboard.gain}
          value={formatters.money(totalReturn, { decimals: 0, sign: true })}
          valueTone={toneOf(totalReturn)}
          sub={t.dashboard.gainSub(formatters.percent(totalReturnPercent, { sign: true, decimals: 1 }), formatters.money(rangeProfit, { decimals: 0, sign: true }))}
          icon="↗"
          tone="gain"
        />
        <Kpi
          label={t.dashboard.annualReturn}
          value={annualizedReturn === null ? '–' : formatters.percent(annualizedReturn * 100, { decimals: 1 })}
          valueTone={annualizedReturn === null ? undefined : toneOf(annualizedReturn)}
          sub={annualizedReturn === null ? t.dashboard.historyTooShort : t.dashboard.mwrShort}
          icon="%"
          tone="teal"
        />
        <Kpi
          label={t.dashboard.cash}
          value={formatters.money(cashBalance, { decimals: 0 })}
          valueTone={cashBalance < 0 ? 'down' : undefined}
          sub={cashAccountsWithBalance.length > 0
            ? t.dashboard.cashAccounts(cashAccountsWithBalance.length, cashCurrencies.join(', '))
            : t.dashboard.cashDerived}
          icon="◎"
          tone="amber"
        />
      </div>

      <div className="dash-goal glass anim-in anim-in-2">
        <span className="ui-label">{t.dashboard.goal}</span>
        {isEditingGoal ? (
          <span className="hero-row">
            <input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveGoalEdit();
                if (e.key === 'Escape') cancelGoalEdit();
              }}
              inputMode="numeric"
              autoFocus
              className="md3-field w-32 px-3 text-sm font-bold outline-none"
              aria-label={t.dashboard.goal}
            />
            <button type="button" onClick={saveGoalEdit} className="md3-icon-btn" aria-label={t.dashboard.saveGoal}><Check size={15} /></button>
            <button type="button" onClick={cancelGoalEdit} className="md3-icon-btn" aria-label={t.dashboard.cancelEdit}><X size={15} /></button>
          </span>
        ) : (
          <button type="button" onClick={startGoalEdit} className="ui-link" title={t.dashboard.editGoal}>
            {formatters.money(wealthGoal, { decimals: 0 })} <PenLine size={12} className="inline" />
          </button>
        )}
        <div className="dash-goal-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(wealthGoalProgress)}>
          <div className="dash-goal-fill" style={{ width: `${wealthGoalProgress}%` }} />
        </div>
        <span className="ui-sub">{t.dashboard.goalProgress(formatters.percent(wealthGoalProgress, { decimals: 1 }), formatters.money(wealthGoalRemaining, { decimals: 0 }))}</span>
      </div>

      <div className="dash-grid">
        <div className="dash-col">
          <GlassCard className="anim-in anim-in-3">
            <CardHeader title={t.dashboard.topPositions}>
              {holdings.length > 0 && <button type="button" className="ui-link" onClick={onShowPortfolio}>{t.dashboard.showAll(holdings.length)}</button>}
            </CardHeader>
            {topHoldings.length === 0 ? (
              <p className="ui-sub">{t.dashboard.noPositions}</p>
            ) : topHoldings.map((holding) => {
              const security = project?.securities?.[holding.security.isin];
              const weight = totalHoldingsValue > 0 ? (holding.value / totalHoldingsValue) * 100 : 0;
              return (
                <button
                  type="button"
                  key={holding.security.isin}
                  className="dash-pos"
                  onClick={() => onSelectSecurity(holding.security.isin, holding.currency)}
                >
                  <Avatar seed={holding.security.isin} label={security?.symbol && security.symbol !== holding.security.isin ? security.symbol : holding.security.name} />
                  <span style={{ minWidth: 0 }}>
                    <span className="dash-pos-name" style={{ display: 'block' }}>{holding.security.name}</span>
                    <span className="dash-pos-meta" style={{ display: 'block' }}>
                      {quoteTypeLabel(t, holding.security.quoteType)} · {t.units.shares(formatters.number(holding.quantity, holding.quantity % 1 === 0 ? 0 : 3))}
                    </span>
                  </span>
                  <span>
                    <span className="dash-pos-value" style={{ display: 'block' }}>{formatters.money(holding.value)}</span>
                    <span className="dash-pos-weight" style={{ display: 'block' }}>{t.dashboard.ofPortfolio(formatters.percent(weight, { decimals: 1 }))}</span>
                  </span>
                  <Pill tone={toneOf(holding.totalReturnPercent)} className="dash-pos-perf">
                    {formatters.percent(holding.totalReturnPercent, { sign: true, decimals: 1 })}
                  </Pill>
                </button>
              );
            })}
          </GlassCard>

          <GlassCard className="anim-in anim-in-4">
            <CardHeader title={t.dashboard.dividends}>
              <Pill tone={dividendSummary.ytdValue > 0 ? 'up' : 'neutral'}>{t.dashboard.ytd(formatters.money(dividendSummary.ytdValue, { decimals: 0 }))}</Pill>
            </CardHeader>
            <div className="dash-bars" role="img" aria-label={t.dashboard.dividendsChart}>
              {dividendBars.map((value, index) => (
                <div className="dash-bar-col" key={index} title={`${monthLabels[index]}: ${formatters.money(value)}`}>
                  <div
                    className={value > 0 ? 'dash-bar is-paid' : 'dash-bar'}
                    style={{ height: `${maxDividendBar > 0 ? Math.max(4, (value / maxDividendBar) * 100) : 4}%` }}
                  />
                  <span className="dash-bar-label">{monthLabels[index]}</span>
                </div>
              ))}
            </div>
            {dividendSummary.nextPayout ? (
              <div className="dash-next">
                <span>
                  <span className="dash-next-title" style={{ display: 'block' }}>{dividendSummary.nextPayout.name}</span>
                  <span className="ui-sub">{t.dashboard.nextPayment(formatters.date(dividendSummary.nextPayout.date), dividendSummary.isTheoretical)}</span>
                </span>
                <span className="dash-next-value">≈ {formatters.money(dividendSummary.nextPayout.amount)}</span>
              </div>
            ) : (
              <p className="ui-sub mt-4">{t.dashboard.noPayouts}</p>
            )}
          </GlassCard>
        </div>

        <div className="dash-col">
          <GlassCard className="anim-in anim-in-3">
            <CardHeader title={t.dashboard.allocation}><span className="ui-sub">{t.dashboard.assetClasses}</span></CardHeader>
            {allocationData.length === 0 ? (
              <p className="ui-sub">{t.dashboard.nothingToAllocate}</p>
            ) : (
              <div className="dash-donut">
                <Donut
                  segments={allocationData.map((item) => ({ label: item.name, value: item.value, color: item.color }))}
                  centerValue={holdings.length}
                  centerLabel={t.dashboard.positions(holdings.length)}
                />
                <div className="dash-legend">
                  {allocationData.map((item) => (
                    <div className="dash-legend-row" key={item.id}>
                      <span className="dash-legend-dot" style={{ background: item.color }} />
                      <span>{item.name}</span>
                      <span className="dash-legend-pct">{formatters.percent(item.percentage, { decimals: 1 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard className="anim-in anim-in-4">
            <CardHeader title={t.dashboard.connectedBrokers}><span className="ui-sub">{connections.length > 0 ? t.dashboard.syncOnOpen : ''}</span></CardHeader>
            {connections.length === 0 && <p className="ui-sub">{t.dashboard.noBroker}</p>}
            {connections.map((connection) => {
              const info = BROKER_LABELS[connection.kind];
              return (
                <div className="dash-broker" key={connection.id}>
                  <span className="dash-broker-logo">{info.short}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="dash-broker-name" style={{ display: 'block' }}>{info.name}</span>
                    <span className="dash-broker-meta">
                      <span className={connection.lastCheckedAt ? 'app-live' : 'app-live is-warn'} aria-hidden="true" />
                      {relativeTime(t, connection.lastCheckedAt, nowMs)}
                    </span>
                  </span>
                  <span className="dash-broker-tag">{t.brokerMethods[connection.kind]}</span>
                </div>
              );
            })}
            <button type="button" onClick={onShowBrokers} className="md3-tonal-btn mt-3 w-full text-sm">{t.dashboard.connectBroker}</button>
          </GlassCard>
        </div>
      </div>
    </>
  );
};
