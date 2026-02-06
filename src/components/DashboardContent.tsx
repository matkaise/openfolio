import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, PieChart, Wallet } from 'lucide-react';
import { calculateHoldings, calculatePortfolioHistory } from '@/lib/portfolioUtils';
import { CurrencyService } from '@/lib/currencyService';
import { useProject } from '@/contexts/ProjectContext';
import { SimpleAreaChart } from '@/components/SimpleAreaChart';
import { AllocationChart } from '@/components/AllocationChart';
import { Card } from '@/components/ui/Card';
import { type DividendHistoryEntry, type EventEntry, type TransactionLike, type UpcomingDividendEntry } from '@/types/portfolioView';

export const DashboardContent = ({ timeRange, setTimeRange, selectedPortfolioIds, onSelectSecurity, onShowPortfolio, includeDividends, onToggleDividends }: { timeRange: string, setTimeRange: (range: string) => void, selectedPortfolioIds: string[], onSelectSecurity: (isin: string) => void, onShowPortfolio: () => void, includeDividends: boolean, onToggleDividends: () => void }) => {
  const { project } = useProject();
  const [chartMode, setChartMode] = useState<'value' | 'performance'>('value');
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const [dividendRange, setDividendRange] = useState<'YTD' | '1J'>('YTD');

  // Filter transactions based on selected Portfolio
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioIds.length === 0) return project.transactions; // All
    return project.transactions.filter(t => t.portfolioId && selectedPortfolioIds.includes(t.portfolioId));
  }, [project, selectedPortfolioIds]);

  const { holdings, realizedPnL } = useMemo(() => {
    if (!project) return { holdings: [], realizedPnL: 0 };

    // Extract latest quotes from securities history
    const quotes: Record<string, number> = {};
    if (project.securities) {
      Object.values(project.securities).forEach(sec => {
        if (sec.priceHistory) {
          const dates = Object.keys(sec.priceHistory).sort();
          if (dates.length > 0) {
            const lastDate = dates[dates.length - 1];
            quotes[sec.isin] = sec.priceHistory[lastDate];
          }
        }
      });
    }

    return calculateHoldings(
      filteredTransactions,
      Object.values(project.securities || {}),
      quotes, // Pass real quotes
      project.fxData.rates, // fxRates
      project.settings.baseCurrency // Pass selected base currency
    );
  }, [project, filteredTransactions]);

  // Calculate portfolio history for chart
  const historyData = useMemo(() => {
    if (!project) return [];

    return calculatePortfolioHistory(
      filteredTransactions,
      Object.values(project.securities || {}),
      project.fxData.rates,
      project.settings.baseCurrency,
      timeRange
    );
  }, [project, filteredTransactions, timeRange]);

  const displayData = useMemo(() => {
    if (chartMode === 'value') return historyData;

    // Performance mode: Calculate TWR (Time Weighted Return)
    // This matches Value % change if no cashflows, and handles cashflows correctly without jumps.

    if (historyData.length === 0) return [];
    const getValue = (point: { value: number; dividend?: number }) =>
      point.value + (includeDividends ? (point.dividend || 0) : 0);

    // Period Money-Weighted Return (MWR) Logic
    // Formula: ((Val_Curr - Val_Start) - (Inv_Curr - Inv_Start)) / (Val_Start + (Inv_Curr - Inv_Start))

    // Get baseline values at start of period
    const startPoint = historyData[0];
    let startValue = getValue(startPoint);
    const startInvested = startPoint.invested || 0;

    // Detect if this is the start of the entire history (First Transaction)
    // If so, we want to baseline against Initial Investment to capture Day 1 Alpha.
    // This applies to MAX view OR any view (5J, 3J) that covers the inception date.
    let isStartOfHistory = timeRange === 'MAX';

    if (!isStartOfHistory && filteredTransactions.length > 0) {
      const firstTxDateStr = filteredTransactions.reduce((min, t) => t.date < min ? t.date : min, '9999-12-31');
      const firstTxTime = new Date(firstTxDateStr).setHours(0, 0, 0, 0);
      const startTime = new Date(startPoint.date).setHours(0, 0, 0, 0);
      // Allow 24h buffer for timezone diffs or exact match
      if (Math.abs(startTime - firstTxTime) < 86400000) {
        isStartOfHistory = true;
      }
    }

    if (isStartOfHistory && startInvested > 0) {
      startValue = startInvested;
    }

    return historyData.map((point, index) => {
      // For the very first point: MWR starts at 0% usually.
      // Special Case: If this is the Start of History (MAX/5J/etc covering inception),
      // we want Standard MWR definition (Value - Invested) / Invested to show Day 1 Alpha immediately.
      if (index === 0) {
        if (isStartOfHistory) {
          const inv = point.invested || 0;
          const valueWithDividends = getValue(point);
          if (inv > 0) return { ...point, value: ((valueWithDividends - inv) / inv) * 100 };
          return { ...point, value: 0 };
        }
        return { ...point, value: 0 };
      }

      const currValue = getValue(point);
      const currInvested = point.invested || 0;

      const deltaInvested = currInvested - startInvested;
      const capitalAtWork = startValue + deltaInvested;

      let percent = 0;
      if (capitalAtWork > 0) {
        // Profit made strictly within this period = (Val_Curr - Val_Start) - Net_New_Cash
        const profitPeriod = (currValue - startValue) - deltaInvested;
        percent = (profitPeriod / capitalAtWork) * 100;
      }

      return {
        ...point,
        value: percent
      };
    });
    /* 
    const twrData = [];

    // Initialize performance
    let runningPerformance = 1.0;
    let startPercent = 0;

    // For MAX view: Capture the "Day 1" intraday/IPO performance relative to cost basis
    // If I buy at 100 and close at 131, Day 1 is +31%.
    if (timeRange === 'MAX' && historyData[0].invested > 0) {
      runningPerformance = historyData[0].value / historyData[0].invested;
      startPercent = (runningPerformance - 1) * 100;
    }

    twrData.push({ ...historyData[0], value: startPercent });

    for (let i = 1; i < historyData.length; i++) {
      const prev = historyData[i - 1];
      const curr = historyData[i];

      const prevValue = prev.value;
      const currValue = curr.value;

      const prevInvested = prev.invested || 0;
      const currInvested = curr.invested || 0;

      const cashFlow = currInvested - prevInvested;

      // Robust TWR Formula for Daily Data:
      // Assumes CashFlow happens at Start-Of-Day (or effectively before Close)
      // This correctly handles the "First Buy" (Prev=0, CF=10k) and subsequent flows.
      // R = EndValue / (StartValue + CashFlow) - 1

      let periodReturn = 0;
      const costBasis = prevValue + cashFlow;

      if (costBasis > 0) {
        periodReturn = (currValue / costBasis) - 1;
      }

      runningPerformance *= (1 + periodReturn);

      twrData.push({
        ...curr,
        value: (runningPerformance - 1) * 100
      });
    }

    */
  }, [historyData, chartMode, timeRange, includeDividends, filteredTransactions]);

  const investedCapital = holdings.reduce((sum, h) => sum + (h.quantity * (h.averageBuyPrice || 0)), 0);
  const currentMaketValue = holdings.reduce((sum, h) => sum + h.value, 0);
  // totalReturn = (MarketValue + RealizedPnL) - Invested. (Simplified)
  // Or just MarketValue - Invested for Unrealized.
  // Let's stick to Unrealized for Dashboard Card for now + Realized.
  const totalReturn = (currentMaketValue + realizedPnL) - investedCapital;

  // Day change is missing real data source (need quotes). Mocking 0 for now or calculating if we had Yest Close.
  const dayChangePercent = 0;

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

    const convertToBaseAtDate = (amount: number, currency: string, date: string) => {
      if (currency === baseCurrency) return amount;
      const rateFrom = CurrencyService.getRate(project.fxData, currency, date) || 1;
      const amountEur = amount / rateFrom;
      if (baseCurrency === 'EUR') return amountEur;
      const rateTo = CurrencyService.getRate(project.fxData, baseCurrency, date) || 1;
      return amountEur * rateTo;
    };

    const getLatestRate = (currency: string): number => {
      const fxBase = project.fxData.baseCurrency || 'EUR';
      if (currency === fxBase) return 1;
      const rates = project.fxData.rates[currency];
      if (!rates) return 1;
      const dates = Object.keys(rates).sort().reverse();
      return rates[dates[0]] || 1;
    };

    const convertToBaseLatest = (amount: number, currency: string) => {
      if (currency === baseCurrency) return amount;
      const rateOrg = getLatestRate(currency);
      const inEur = amount / rateOrg;
      const rateBase = getLatestRate(baseCurrency);
      return baseCurrency === 'EUR' ? inEur : inEur * rateBase;
    };

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

    // Define colors
    const colorMap: Record<string, string> = {
      'Einzelaktien': '#3b82f6', // blue-500
      'Aktie': '#3b82f6',
      'ETFs': '#10b981', // emerald-500
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
  }, [holdings]);

  return (
    <>
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1 md:col-span-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={120} className="text-emerald-500" />
          </div>
          <div className="relative z-10">
            <h3 className="text-slate-400 font-medium mb-1">Gesamtwert Portfolio</h3>
            <div className="flex items-baseline space-x-3">
              <span className="text-4xl font-bold text-white tracking-tight">
                {currentMaketValue.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
              </span>
              <span className={`flex items-center px-2 py-0.5 rounded text-sm font-medium ${dayChangePercent >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                {dayChangePercent >= 0 ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
                {dayChangePercent}%
              </span>
            </div>
            <div className="mt-6 flex gap-8">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Ertrag Gesamt</p>
                <p className={`text-lg font-semibold ${totalReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalReturn > 0 ? '+' : ''}{totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Investiert</p>
                <p className="text-lg font-semibold text-slate-300">
                  {investedCapital.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-400 font-medium">Dividenden ({dividendRange})</h3>
            <div className="flex bg-slate-900/50 p-1 rounded-lg">
              <button
                onClick={() => setDividendRange('YTD')}
                className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-all ${dividendRange === 'YTD' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                YTD
              </button>
              <button
                onClick={() => setDividendRange('1J')}
                className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-all ${dividendRange === '1J' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                1J
              </button>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-bold text-white">
              {(
                dividendRange === '1J'
                  ? dividendSummary.monthlyBars1J.reduce((sum, v) => sum + v, 0)
                  : dividendSummary.ytdValue
              ).toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
            </span>
            <p className="text-sm text-slate-500 mt-1">
              {dividendSummary.nextPayout ? (
                <>
                  {'N\u00e4chste Auszahlung:'} <span className="font-semibold text-slate-200">{dividendSummary.nextPayout.amount.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}</span> ({dividendSummary.nextPayout.name}) - <span className="font-semibold text-slate-200">{dividendSummary.nextPayout.date}</span>
                  {dividendSummary.isTheoretical ? <span className="text-xs text-slate-600 ml-2">Prognose</span> : null}
                </>
              ) : (
                'Keine geplanten Auszahlungen'
              )}
            </p>
          </div>
          <div className="h-16 flex items-end space-x-1 mt-4">
            {(() => {
              const bars = dividendRange === '1J' ? dividendSummary.monthlyBars1J : dividendSummary.monthlyBarsYTD;
              const max = Math.max(...bars, 1);
              return bars.map((val, i) => (
                <div key={i} className="flex-1 bg-blue-500/20 hover:bg-blue-500/40 rounded-t transition-colors relative group" style={{ height: `${(val / max) * 100}%` }}>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-700 text-xs px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {val.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      < div className="grid grid-cols-1 lg:grid-cols-3 gap-6" >
        {/* Performance Chart */}
        < Card className="lg:col-span-2 min-h-[350px]" >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 relative">
            {/* Left: Toggles */}
            <div className="flex items-center gap-4 z-10">
              <div className="flex bg-slate-900/50 p-1 rounded-lg">
                <button
                  onClick={() => setChartMode('value')}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${chartMode === 'value' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Wert
                </button>
                <button
                  onClick={() => setChartMode('performance')}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${chartMode === 'performance' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  %
                </button>
              </div>
              {chartMode === 'performance' && (
                <button
                  onClick={onToggleDividends}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1 ${includeDividends
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-900/50 text-slate-500 hover:text-slate-300'
                    }`}
                >
                  {includeDividends && <Check size={12} />}
                  Dividenden
                </button>
              )}
            </div>

            {/* Center: Time Range */}
            <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex bg-slate-900/50 p-1 rounded-lg overflow-x-auto max-w-full">
              {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((range) => (
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
            {/* Mobile fallback for TimeRange (not absolute centered) */}
            <div className="md:hidden flex bg-slate-900/50 p-1 rounded-lg overflow-x-auto max-w-full self-start">
              {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((range) => (
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

            {/* Right: Badge */}
            <div className="flex items-center z-10">
              {displayData.length > 1 && (
                <div className="bg-slate-800/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-700/50">
                  <span className={`text-sm font-medium ${chartMetrics.badgeValue >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {chartMetrics.badgeValue >= 0 ? '+' : ''}
                    {chartMode === 'value'
                      ? chartMetrics.badgeValue.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })
                      : `${chartMetrics.badgeValue.toFixed(2)}%`
                    } {timeRange}
                  </span>
                </div>
              )}
            </div>
          </div>

          <SimpleAreaChart
            data={displayData}
            currency={project?.settings.baseCurrency || 'EUR'}
            timeRange={timeRange}
            showAxes={true}
            isPercentage={chartMode === 'performance'}
            color={chartMetrics.color}
          />
        </Card >

        {/* Allocation Chart */}
        <Card className="p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <PieChart size={18} className="text-emerald-500" />
            Allokation
          </h3>

          <div className="flex flex-col items-center gap-6">
            <div className="w-full h-52 relative">
              {allocationData.length > 0 ? (
                <AllocationChart
                  data={allocationData}
                  currency={project?.settings.baseCurrency || 'EUR'}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-500 text-sm">
                  Portfolio leer
                </div>
              )}
            </div>

            <div className="w-full border-t border-slate-800/50 pt-4">
              <div className="space-y-2 overflow-y-auto max-h-52 custom-scrollbar pr-2">
                {allocationData.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm group hover:bg-slate-800/50 p-2 rounded-lg transition-colors cursor-default">
                    <div className="flex items-center space-x-3">
                      <span className="w-2.5 h-2.5 rounded-full shadow-sm shadow-black/50 ring-2 ring-slate-900" style={{ backgroundColor: item.color }}></span>
                      <span className="text-slate-200 font-medium truncate max-w-[150px]">{item.name}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider w-12 text-right">{item.percentage.toFixed(1)}%</span>
                      <span className="font-bold text-white text-xs w-24 text-right">{item.value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} {project?.settings.baseCurrency}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div >

      {/* Holdings List (Compact) */}
      < div className="mt-2" >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Top Holding Performance</h3>
          <button
            onClick={onShowPortfolio}
            className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center"
          >
            Alles sehen <ChevronRight size={16} />
          </button>
        </div>
        <div className="space-y-3">
          {holdings.length === 0 ? (
            <div className="text-slate-400 text-sm p-4 text-center bg-slate-800/20 rounded-xl">Keine Positionen vorhanden.</div>
          ) : (
            holdings.slice(0, 5).map((stock) => (
              <div key={stock.security.isin} onClick={() => onSelectSecurity(stock.security.isin)} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between hover:bg-slate-800/80 transition cursor-pointer">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs bg-slate-700`}>
                    {stock.security.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{stock.security.name}</h4>
                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                      <span className="bg-slate-700 px-1.5 rounded">{stock.security.quoteType || 'Aktie'}</span>
                      <span>{stock.quantity} Stk.</span>
                      <span className="text-slate-500">•</span>
                      <span>Ø {stock.averageBuyPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                      <span className="text-slate-500">•</span>
                      <span>Aktuell: {stock.currentPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-medium text-white">{stock.value.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
                  <div className="flex flex-col items-end">
                    <p className={`text-xs ${(stock.totalReturn) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {stock.totalReturn > 0 ? '+' : ''}{stock.totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                    </p>
                    <p className={`text-xs ${(stock.totalReturnPercent) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {stock.totalReturnPercent > 0 ? '+' : ''}{stock.totalReturnPercent.toLocaleString('de-DE', { maximumFractionDigits: 2 })}%
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div >
    </>
  )
};
