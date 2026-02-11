import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, PenLine, PieChart, Wallet, X } from 'lucide-react';
import { calculatePortfolioHistory } from '@/lib/portfolioUtils';
import { buildMwrSeries, normalizeInvestedForExplicitCash } from '@/lib/performanceUtils';
import { filterTransactionsByPortfolio, calculateProjectHoldings, filterCashAccountsByPortfolio } from '@/lib/portfolioSelectors';
import { convertCurrency } from '@/lib/fxUtils';
import { resolveWealthGoalSource } from '@/lib/wealthGoalUtils';
import { useProject } from '@/contexts/ProjectContext';
import { SimpleAreaChart } from '@/components/SimpleAreaChart';
import { AllocationChart } from '@/components/AllocationChart';
import { Card } from '@/components/ui/Card';
import { type DividendHistoryEntry, type EventEntry, type TransactionLike, type UpcomingDividendEntry } from '@/types/portfolioView';

export const DashboardContent = ({ timeRange, setTimeRange, selectedPortfolioIds, onSelectSecurity, onShowPortfolio, includeDividends, onToggleDividends }: { timeRange: string, setTimeRange: (range: string) => void, selectedPortfolioIds: string[], onSelectSecurity: (isin: string) => void, onShowPortfolio: () => void, includeDividends: boolean, onToggleDividends: () => void }) => {
  const { project, updateProject } = useProject();
  const [chartMode, setChartMode] = useState<'value' | 'performance'>('value');
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const [dividendRange, setDividendRange] = useState<'YTD' | '1J'>('YTD');
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  // Filter transactions based on selected Portfolio
  const filteredTransactions = useMemo(() => (
    filterTransactionsByPortfolio(project, selectedPortfolioIds)
  ), [project, selectedPortfolioIds]);
  const filteredCashAccounts = useMemo(() => (
    filterCashAccountsByPortfolio(project, selectedPortfolioIds)
  ), [project, selectedPortfolioIds]);

  const { holdings } = useMemo(() => {
    return calculateProjectHoldings(project, filteredTransactions);
  }, [project, filteredTransactions]);

  // Calculate portfolio history for chart
  const historyData = useMemo(() => {
    if (!project) return [];

    return calculatePortfolioHistory(
      filteredTransactions,
      Object.values(project.securities || {}),
      project.fxData.rates,
      filteredCashAccounts,
      project.settings.baseCurrency,
      timeRange
    );
  }, [project, filteredTransactions, filteredCashAccounts, timeRange]);

  const kpiHistoryData = useMemo(() => {
    if (!project) return [];

    return calculatePortfolioHistory(
      filteredTransactions,
      Object.values(project.securities || {}),
      project.fxData.rates,
      filteredCashAccounts,
      project.settings.baseCurrency,
      'MAX'
    );
  }, [project, filteredTransactions, filteredCashAccounts]);

  const dailyHistoryData = useMemo(() => {
    if (!project) return [];

    return calculatePortfolioHistory(
      filteredTransactions,
      Object.values(project.securities || {}),
      project.fxData.rates,
      filteredCashAccounts,
      project.settings.baseCurrency,
      '1M',
      'daily'
    );
  }, [project, filteredTransactions, filteredCashAccounts]);

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

  const performanceSeries = useMemo(() => {
    if (historyForPerformance.length === 0) return [];
    const start = historyForPerformance[0].date;
    const end = historyForPerformance[historyForPerformance.length - 1].date;
    return buildMwrSeries(historyForPerformance, start, end, {
      includeDividends,
      isFullRange: timeRange === 'MAX',
      transactions: filteredTransactions
    });
  }, [historyForPerformance, includeDividends, timeRange, filteredTransactions]);

  const displayData = useMemo(() => {
    if (chartMode === 'value') return historyData;
    return performanceSeries;
  }, [historyData, chartMode, performanceSeries]);

  const latestKpiHistoryPoint = kpiHistoryData.length > 0 ? kpiHistoryData[kpiHistoryData.length - 1] : null;
  const latestKpiPerformancePoint = kpiHistoryForPerformance.length > 0
    ? kpiHistoryForPerformance[kpiHistoryForPerformance.length - 1]
    : null;
  const holdingsMarketValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const investedCapital = latestKpiPerformancePoint
    ? latestKpiPerformancePoint.invested
    : holdings.reduce((sum, h) => sum + (h.quantity * (h.averageBuyPrice || 0)), 0);
  const currentMaketValue = latestKpiHistoryPoint
    ? latestKpiHistoryPoint.value
    : holdings.reduce((sum, h) => sum + h.value, 0);
  const cashBalance = latestKpiHistoryPoint ? (currentMaketValue - holdingsMarketValue) : 0;
  const totalReturn = currentMaketValue - investedCapital;
  const wealthGoalStep = 25000;
  const goalSource = resolveWealthGoalSource(project?.settings);
  const storedGoal = goalSource.amount;
  const storedGoalCurrency = goalSource.currency || baseCurrency;
  const convertedStoredGoal = (project && typeof storedGoal === 'number' && Number.isFinite(storedGoal) && storedGoal > 0)
    ? convertCurrency(project.fxData, storedGoal, storedGoalCurrency, baseCurrency)
    : undefined;
  const normalizedConvertedGoal = Number.isFinite(convertedStoredGoal) && convertedStoredGoal > 0
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

    updateProject((prev) => {
      const withoutLegacyGoals = { ...prev.settings };
      delete withoutLegacyGoals.wealthGoals;

      return {
        ...prev,
        settings: {
          ...withoutLegacyGoals,
          wealthGoal: numericGoal,
          wealthGoalCurrency: prev.settings.baseCurrency
        }
      };
    });

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
  const dayChangePercentLabel = `${dayChangePercent > 0 ? '+' : ''}${dayChangePercent.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;

  const chartMetrics = useMemo(() => {
    let badgeValue = 0;
    let color = '#10b981';

    if (displayData.length > 1) {
      const firstPoint = displayData[0];
      const lastPoint = displayData[displayData.length - 1];

      if (chartMode === 'value') {
        badgeValue = lastPoint.value - firstPoint.value;
      } else {
        badgeValue = lastPoint.value;
      }

      if (badgeValue < 0) {
        color = '#f43f5e';
      }
    }
    return { badgeValue, color };
  }, [displayData, chartMode]);

  const dividendSummary = useMemo(() => {
    if (!project) {
      return {
        ytdValue: 0,
        nextPayout: null as null | { name: string; amount: number; date: string },
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
        const amount = convertToBaseAtDate(Math.abs(t.amount), t.currency, t.date);
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
      nextPayout: next ? { name: next.name, amount: next.amount, date: next.date.toLocaleDateString('de-DE') } : null,
      monthlyBars1J,
      monthlyBarsYTD,
      isTheoretical: dividendsTx.length === 0
    };
  }, [project, filteredTransactions, holdings, baseCurrency]);

  // Calculate Allocation Data
  const allocationData = useMemo(() => {
    const groups: Record<string, { value: number; count: number }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      // Normalize type
      const type = h.security.quoteType || 'Sonstige';
      // Yahoo types normalization
      const yahooTypeMap: Record<string, string> = {
        'EQUITY': 'Einzelaktien',
        'ETF': 'ETFs',
        'CRYPTOCURRENCY': 'Krypto',
        'MUTUALFUND': 'Fonds',
        'FUTURE': 'Derivate',
        'INDEX': 'Indizes',
        'CURRENCY': 'Währungen'
      };

      const normalizedType = yahooTypeMap[type.toUpperCase()] || (type === 'Stock' ? 'Einzelaktien' : type);

      if (!groups[normalizedType]) groups[normalizedType] = { value: 0, count: 0 };
      groups[normalizedType].value += h.value;
      groups[normalizedType].count += 1;
      totalValue += h.value;
    });

    // Show positive cash as separate allocation bucket.
    if (cashBalance > 0.000001) {
      groups['Cash'] = {
        value: cashBalance,
        count: 1
      };
      totalValue += cashBalance;
    }

    // Define colors
    const colorMap: Record<string, string> = {
      'Einzelaktien': '#3b82f6', // blue-500
      'Aktie': '#3b82f6',
      'ETFs': '#10b981', // emerald-500
      'Cash': '#f59e0b', // amber-500
      'Krypto': '#a855f7', // purple-500
      'Fonds': '#f97316', // orange-500
      'Derivate': '#ef4444', // red-500
      'Sonstige': '#64748b' // slate-500
    };

    return Object.entries(groups)
      .map(([name, data]) => ({
        id: name,
        name,
        value: data.value,
        count: data.count,
        percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
        color: colorMap[name] || '#64748b'
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, cashBalance]);

  return (
    <>
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:items-stretch">
        <Card className="col-span-1 md:col-span-2 relative overflow-hidden group !p-8 md3-card-primary h-full flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={120} className="md3-accent" />
          </div>
          <div className="relative z-10">
            <h3 className="md3-text-muted mb-1 font-medium">Gesamtwert Portfolio</h3>
            <div className="flex items-baseline space-x-3">
              <span className="md3-text-main text-4xl font-bold tracking-tight">
                {currentMaketValue.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
              </span>
              <span className={`flex items-center rounded px-2 py-0.5 text-sm font-medium ${dayChangePercent >= 0 ? 'md3-positive-soft' : 'md3-negative-soft'}`}>
                {dayChangePercent >= 0 ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
                {dayChangePercentLabel}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-8">
              <div>
                <p className="md3-text-muted text-xs uppercase tracking-wider">Ertrag Gesamt</p>
                <p className={`text-lg font-semibold ${totalReturn >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                  {totalReturn > 0 ? '+' : ''}{totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                </p>
              </div>
              <div>
                <p className="md3-text-muted text-xs uppercase tracking-wider">Tagesgewinn</p>
                <p className={`text-lg font-semibold ${dayChangeValue >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                  {dayChangeValue > 0 ? '+' : ''}{dayChangeValue.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                </p>
              </div>
              <div>
                <p className="md3-text-muted text-xs uppercase tracking-wider">Investiert</p>
                <p className="md3-text-main text-lg font-semibold">
                  {investedCapital.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                </p>
              </div>
              <div>
                <p className="md3-text-muted text-xs uppercase tracking-wider">Cash</p>
                <p className={`text-lg font-semibold ${cashBalance >= 0 ? 'md3-text-main' : 'md3-negative'}`}>
                  {cashBalance > 0 ? '+' : ''}{cashBalance.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                </p>
              </div>
            </div>

            <div
              className="mt-6 rounded-2xl p-3"
              style={{ backgroundColor: 'color-mix(in srgb, var(--md3-primary) 10%, var(--md3-surface-container-high) 90%)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="md3-text-muted text-[11px] uppercase tracking-wider">Zielvermögen</span>
                {isEditingGoal ? (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="flex items-center rounded-full px-2 py-1"
                      style={{ backgroundColor: 'var(--md3-surface-container-highest)' }}
                    >
                      <input
                        value={goalInput}
                        onChange={(e) => setGoalInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveGoalEdit();
                          if (e.key === 'Escape') cancelGoalEdit();
                        }}
                        inputMode="numeric"
                        className="w-20 bg-transparent text-xs font-semibold outline-none"
                        style={{ color: 'var(--md3-on-surface)' }}
                        aria-label="Zielvermögen"
                      />
                      <span className="ml-1 text-[10px] font-semibold md3-text-muted">{baseCurrency}</span>
                    </div>
                    <button
                      type="button"
                      onClick={saveGoalEdit}
                      className="h-7 w-7 rounded-full md3-chip-accent inline-flex items-center justify-center"
                      aria-label="Ziel speichern"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={cancelGoalEdit}
                      className="h-7 w-7 rounded-full md3-segment md3-text-muted inline-flex items-center justify-center"
                      aria-label="Bearbeiten abbrechen"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="md3-text-main text-xs font-semibold">
                      {wealthGoal.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR', maximumFractionDigits: 0 })}
                    </span>
                    <button
                      type="button"
                      onClick={startGoalEdit}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full md3-chip-tonal"
                      aria-label="Ziel bearbeiten"
                      title="Ziel bearbeiten"
                    >
                      <PenLine size={12} />
                    </button>
                  </div>
                )}
              </div>

              <div
                className="mt-2 h-2.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'color-mix(in srgb, var(--md3-primary) 18%, var(--md3-surface-container-highest) 82%)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${wealthGoalProgress}%`,
                    background: 'linear-gradient(90deg, color-mix(in srgb, var(--md3-primary) 86%, white 14%) 0%, color-mix(in srgb, var(--md3-primary) 70%, white 30%) 100%)'
                  }}
                />
              </div>

              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="md3-text-muted text-[11px] uppercase tracking-wider">Fortschritt</p>
                  <p className="md3-text-main text-sm font-semibold">{wealthGoalProgress.toFixed(1)}%</p>
                </div>
                <div className="text-right">
                  <p className="md3-text-muted text-[11px] uppercase tracking-wider">Bis Ziel</p>
                  <p className="md3-accent text-sm font-semibold">
                    {wealthGoalRemaining.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR', maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between !p-7 md3-card-secondary h-full">
          <div className="flex items-center justify-between">
            <h3 className="md3-text-muted font-medium">Dividenden ({dividendRange})</h3>
            <div className="md3-segment flex p-1">
              <button
                onClick={() => setDividendRange('YTD')}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-all ${dividendRange === 'YTD' ? 'md3-chip-accent' : 'md3-text-muted'}`}
              >
                YTD
              </button>
              <button
                onClick={() => setDividendRange('1J')}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-all ${dividendRange === '1J' ? 'md3-chip-accent' : 'md3-text-muted'}`}
              >
                1J
              </button>
            </div>
          </div>
          <div className="mt-2">
            <span className="md3-text-main text-3xl font-bold">
              {(
                dividendRange === '1J'
                  ? dividendSummary.monthlyBars1J.reduce((sum, v) => sum + v, 0)
                  : dividendSummary.ytdValue
              ).toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
            </span>
            <p className="md3-text-muted mt-1 text-sm">
              {dividendSummary.nextPayout ? (
                <>
                  {'N\u00e4chste Auszahlung:'} <span className="md3-text-main font-semibold">{dividendSummary.nextPayout.amount.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}</span> ({dividendSummary.nextPayout.name}) - <span className="md3-text-main font-semibold">{dividendSummary.nextPayout.date}</span>
                  {dividendSummary.isTheoretical ? <span className="text-xs text-slate-600 ml-2">Prognose</span> : null}
                </>
              ) : (
                'Keine geplanten Auszahlungen'
              )}
            </p>
          </div>
          {(() => {
            const bars = dividendRange === '1J' ? dividendSummary.monthlyBars1J : dividendSummary.monthlyBarsYTD;
            const max = Math.max(...bars, 0);
            const hasDividendData = max > 0;
            const now = new Date();
            const monthLabels = dividendRange === '1J'
              ? Array.from({ length: 12 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
                return d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
              })
              : Array.from({ length: bars.length }, (_, i) => {
                const d = new Date(now.getFullYear(), i, 1);
                return d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
              });

            return (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-[11px] md3-text-muted">
                  <span>Monatliche Dividenden</span>
                  <span>{dividendRange === '1J' ? 'letzte 12 Monate' : 'seit Januar'}</span>
                </div>
                <div className="h-14 flex items-end gap-1">
                  {bars.map((val, i) => (
                    <div
                      key={i}
                      className="relative flex-1 h-full rounded-md group"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--md3-primary) 14%, var(--md3-surface-container-highest) 86%)' }}
                      aria-label={`${monthLabels[i]}: ${val.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}`}
                    >
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-t-[6px] transition-all duration-200 group-hover:brightness-105"
                        style={{
                          height: `${hasDividendData ? Math.max((val / max) * 100, val > 0 ? 14 : 4) : 8}%`,
                          backgroundColor: 'color-mix(in srgb, var(--md3-primary) 78%, white 22%)',
                          opacity: hasDividendData ? (val > 0 ? 1 : 0.35) : 0.5
                        }}
                      />
                      <div
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-xs md3-text-main z-10"
                        style={{ backgroundColor: 'var(--md3-surface-container-highest)' }}
                      >
                        {monthLabels[i]}: {val.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid text-[10px] md3-text-muted" style={{ gridTemplateColumns: `repeat(${monthLabels.length}, minmax(0, 1fr))` }}>
                  {monthLabels.map((label, i) => (
                    <span key={`${label}-${i}`} className="text-center truncate">
                      {monthLabels.length > 8 && i % 2 === 1 ? '' : label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 !p-7 flex flex-col">
          <div className="relative mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="z-10 flex items-center gap-4">
              <div className="md3-segment flex p-1">
                <button
                  onClick={() => setChartMode('value')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${chartMode === 'value' ? 'md3-chip-accent' : 'md3-text-muted'}`}
                >
                  Wert
                </button>
                <button
                  onClick={() => setChartMode('performance')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${chartMode === 'performance' ? 'md3-chip-accent' : 'md3-text-muted'}`}
                >
                  %
                </button>
              </div>
              {chartMode === 'performance' && (
                <button
                  onClick={onToggleDividends}
                  className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${includeDividends ? 'md3-chip-accent' : 'md3-text-muted md3-segment'}`}
                >
                  {includeDividends && <Check size={12} />}
                  Dividenden
                </button>
              )}
            </div>

            <div className="absolute left-1/2 hidden max-w-full -translate-x-1/2 overflow-x-auto md3-segment p-1 md:flex">
              {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${timeRange === range ? 'md3-chip-tonal' : 'md3-text-muted'}`}
                >
                  {range}
                </button>
              ))}
            </div>

            <div className="md3-segment flex max-w-full self-start overflow-x-auto p-1 md:hidden">
              {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${timeRange === range ? 'md3-chip-tonal' : 'md3-text-muted'}`}
                >
                  {range}
                </button>
              ))}
            </div>

            <div className="z-10 flex items-center">
              {displayData.length > 1 && (
                <div className="md3-segment px-3 py-1.5">
                  <span className={`text-sm font-medium ${chartMetrics.badgeValue >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                    {chartMetrics.badgeValue >= 0 ? '+' : ''}
                    {chartMode === 'value'
                      ? chartMetrics.badgeValue.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })
                      : `${chartMetrics.badgeValue.toFixed(2)}%`} {timeRange}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-[280px]">
            <SimpleAreaChart
              data={displayData}
              currency={project?.settings.baseCurrency || 'EUR'}
              timeRange={timeRange}
              height="100%"
              showAxes={true}
              isPercentage={chartMode === 'performance'}
              color={chartMetrics.color}
            />
          </div>
        </Card>

        <Card className="!p-6">
          <h3 className="md3-text-main mb-4 flex items-center gap-2 font-semibold">
            <PieChart size={18} className="md3-accent" />
            Allokation
          </h3>

          <div className="flex flex-col items-center gap-6">
            <div className="relative h-52 w-full">
              {allocationData.length > 0 ? (
                <AllocationChart data={allocationData} currency={project?.settings.baseCurrency || 'EUR'} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Portfolio leer
                </div>
              )}
            </div>

            <div className="w-full pt-4">
              <div className="custom-scrollbar max-h-52 space-y-2 overflow-y-auto pr-2">
                {allocationData.map((item) => (
                  <div key={item.id} className="md3-list-item group flex cursor-default items-center justify-between p-3 text-sm">
                    <div className="flex items-center space-x-3">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="md3-text-main max-w-[150px] truncate font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="w-12 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.percentage.toFixed(1)}%</span>
                      <span className="md3-text-main w-24 text-right text-xs font-bold">
                        {item.value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} {project?.settings.baseCurrency}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Holdings List (Compact) */}
      <Card className="mt-2 !p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="md3-text-main text-xl font-semibold">Top Holding Performance</h3>
          <button
            onClick={onShowPortfolio}
            className="md3-accent flex items-center text-sm opacity-90 hover:opacity-100"
          >
            Alles sehen <ChevronRight size={16} />
          </button>
        </div>
        <div className="space-y-3">
          {holdings.length === 0 ? (
            <div className="md3-list-item p-5 text-center text-sm text-slate-400">Keine Positionen vorhanden.</div>
          ) : (
            holdings.slice(0, 5).map((stock) => (
              <div key={stock.security.isin} onClick={() => onSelectSecurity(stock.security.isin)} className="md3-list-item flex cursor-pointer items-center justify-between p-4">
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
                    {stock.security.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="md3-text-main font-medium">{stock.security.name}</h4>
                    <div className="mt-0.5 flex items-center space-x-2 text-xs text-slate-400">
                      <span className="rounded bg-slate-700 px-1.5">{stock.security.quoteType || 'Aktie'}</span>
                      <span>{stock.quantity} Stk.</span>
                      <span className="text-slate-500">|</span>
                      <span>Avg {stock.averageBuyPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                      <span className="text-slate-500">|</span>
                      <span>Aktuell: {stock.currentPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="md3-text-main font-medium">{stock.value.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
                  <div className="flex flex-col items-end">
                    <p className={`text-xs ${stock.totalReturn >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                      {stock.totalReturn > 0 ? '+' : ''}{stock.totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                    </p>
                    <p className={`text-xs ${stock.totalReturnPercent >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                      {stock.totalReturnPercent > 0 ? '+' : ''}{stock.totalReturnPercent.toLocaleString('de-DE', { maximumFractionDigits: 2 })}%
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
};

