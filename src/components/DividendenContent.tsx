import React, { useMemo, useState } from 'react';
import { Activity, BarChart3, CalendarCheck, Coins, PiggyBank, Timer, TrendingUp, Wallet, X } from 'lucide-react';
import { CurrencyService } from '@/lib/currencyService';
import { calculateHoldings } from '@/lib/portfolioUtils';
import { useProject } from '@/contexts/ProjectContext';
import { SimpleAreaChart } from '@/components/SimpleAreaChart';
import { Card } from '@/components/ui/Card';
import { type DividendHistoryEntry, type EventEntry, type TransactionLike, type UpcomingDividendEntry } from '@/types/portfolioView';

const DividendListModal = ({
  isOpen,
  onClose,
  title,
  items,
  currency
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: { id: string; name: string; date: string; amount: number; type: string }[];
  currency: string;
}) => {
  if (!isOpen) return null;

  const formatCurrency = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <style>{`
        .dividend-modal-scroll::-webkit-scrollbar { width: 8px; }
        .dividend-modal-scroll::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.35);
          border-radius: 999px;
        }
        .dividend-modal-scroll::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.55);
          border-radius: 999px;
          border: 2px solid rgba(15, 23, 42, 0.35);
        }
        .dividend-modal-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(203, 213, 225, 0.75);
        }
      `}</style>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-1">{items.length} Eintraege</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="text-slate-400 hover:text-white" />
          </button>
        </div>

        <div
          className="dividend-modal-scroll max-h-[60vh] overflow-y-auto divide-y divide-slate-800 pr-2 -mr-2 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.5)_rgba(15,23,42,0.3)]"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {items.map(item => (
            <div key={item.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200 truncate">{item.name}</div>
                <div className="text-xs text-slate-500">{item.date} - {item.type}</div>
              </div>
              <div className="text-emerald-400 font-medium text-sm whitespace-nowrap">
                +{formatCurrency(item.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const DividendenContent = ({ selectedPortfolioIds }: { selectedPortfolioIds: string[] }) => {
  const { project } = useProject();
  const [chartView, setChartView] = useState<'monthly' | 'yearly'>('yearly'); // Default to yearly as requested "Last 5 Years"
  const [historyRange, setHistoryRange] = useState<'5Y' | 'MAX'>('5Y');
  const [dividendListModal, setDividendListModal] = useState<{
    title: string;
    items: { id: string; name: string; date: string; amount: number; type: string }[];
  } | null>(null);
  const [cumulativeRange, setCumulativeRange] = useState<'1M' | '6M' | 'YTD' | '1J' | '3J' | '5J' | 'MAX'>('1J');
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const formatCurrency = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency });

  // 1. Filter Transactions (same logic as other tabs)
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioIds.length === 0) return project.transactions;
    return project.transactions.filter(t => t.portfolioId && selectedPortfolioIds.includes(t.portfolioId));
  }, [project, selectedPortfolioIds]);

  // 2. Calculate Holdings (for Yield Calculation)
  const { totalValue, totalInvested, holdings } = useMemo(() => {
    if (!project) return { totalValue: 0, totalInvested: 0, holdings: [] };

    // Quick Holdings Calcs (simplified compared to Dashboard)
    const quotes: Record<string, number> = {};
    if (project.securities) {
      Object.values(project.securities).forEach(sec => {
        if (sec.priceHistory) {
          const dates = Object.keys(sec.priceHistory).sort();
          if (dates.length > 0) quotes[sec.isin] = sec.priceHistory[dates[dates.length - 1]];
        }
      });
    }

    const { holdings } = calculateHoldings(
      filteredTransactions,
      Object.values(project.securities || {}),
      quotes,
      project.fxData.rates,
      project.settings.baseCurrency
    );

    const val = holdings.reduce((sum, h) => sum + h.value, 0);
    const inv = holdings.reduce((sum, h) => sum + (h.value - h.totalReturn), 0);
    return { totalValue: val, totalInvested: inv, holdings };
  }, [project, filteredTransactions]);

  // 3. Process Dividends
  const {
    receivedCurrentYear,
    receivedLastYear,
    monthlyData,
    recentDividends,
    upcomingDividends,
    personalYield,
    yieldOnCost,
    projectedRestYear,
    annualData,
    combinedMonthlyMap
  } = useMemo(() => {
    if (!project) return { receivedCurrentYear: 0, receivedLastYear: 0, monthlyData: [], recentDividends: [], upcomingDividends: [], personalYield: 0, yieldOnCost: 0, projectedRestYear: 0, annualData: [] };

    const dividends = filteredTransactions.filter(t => t.type === 'Dividend');
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    let sumCurrent = 0;
    let sumLast = 0;

    // Config for 5 Year Monthly Comparison
    const comparisonYears = Array.from({ length: 5 }, (_, i) => currentYear - i).reverse(); // [2021, 2022, 2023, 2024, 2025]
    const monthlyHistoryMap: Record<string, number> = {}; // "Year-Month" -> Amount
    const monthlyHistoryAllMap: Record<string, number> = {}; // Full history map

    const convertToBaseAtDate = (amount: number, currency: string, date: string) => {
      if (currency === baseCurrency) return amount;
      const rateFrom = CurrencyService.getRate(project.fxData, currency, date) || 1;
      const amountEur = amount / rateFrom;
      if (baseCurrency === 'EUR') return amountEur;
      const rateTo = CurrencyService.getRate(project.fxData, baseCurrency, date) || 1;
      return amountEur * rateTo;
    };
    const convertDividendToBase = (amount: number, currency: string, date: string) => {
      return convertToBaseAtDate(amount, currency, date);
    };

    // Group actual dividends (converted to base currency)
    dividends.forEach(d => {
      const date = new Date(d.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const amount = convertDividendToBase(d.amount, d.currency, d.date);

      if (year === currentYear) {
        sumCurrent += amount;
      } else if (year === lastYear) {
        sumLast += amount;
      }

      // Populate Full Map
      monthlyHistoryAllMap[`${year}-${month}`] = (monthlyHistoryAllMap[`${year}-${month}`] || 0) + amount;

      // Populate 5-Year Map
      if (year >= currentYear - 4) {
        monthlyHistoryMap[`${year}-${month}`] = (monthlyHistoryMap[`${year}-${month}`] || 0) + amount;
      }
    });

    // Helper: Get latest FX rate
    const getLatestRate = (currency: string): number => {
      const fxBase = project.fxData.baseCurrency || 'EUR';
      if (currency === fxBase) return 1;
      const rates = project.fxData.rates[currency];
      if (!rates) return 1; // Fallback
      // Find latest date
      const dates = Object.keys(rates).sort().reverse();
      return rates[dates[0]] || 1;
    };

    // Helper: Convert to Base Currency
    const convertToBase = (amount: number, currency: string, date?: string) => {
      const effectiveDate = date || project.fxData.lastUpdated || new Date().toISOString().split('T')[0];
      return convertToBaseAtDate(amount, currency, effectiveDate);
    };

    const convertToBaseLatest = (amount: number, currency: string) => {
      if (currency === baseCurrency) return amount;
      const rateOrg = getLatestRate(currency);
      const rateBase = getLatestRate(baseCurrency);
      const inEur = amount / rateOrg;
      return baseCurrency === 'EUR' ? inEur : inEur * rateBase;
    };

    // --- FORECAST LOGIC (History & Upcoming Based) ---
    const forecastEvents: { date: Date, amount: number, name: string, ticker: string, debug?: string }[] = [];
    const monthlyForecastMap: Record<number, number> = {}; // Month -> Amount

    holdings.forEach(h => {
      const sec = project.securities?.[h.security.isin];
      if (!sec) return;

      const shares = h.quantity || 0;
      if (shares === 0) return;

      const secCurrency = sec.currency || 'EUR';
      // const fxRate = getLatestRate(secCurrency);
      // Rate is typically Base/Quote or Quote/Base? 
      // Usually OpenParqet stores rate as "1 EUR = X USD". 
      // If base is CHF and we have USD, we need USD->CHF.
      // Assuming project.fxData stores rates relative to BASE (EUR usually).
      // If Project Base is `CHF` and data is from ECB (EUR base), we need to be careful.
      // Let's assume `calculateHoldings` logic handles FX already correctly.
      // If `fxData.rates` contains `USD` it means `1 EUR = x USD`.
      // If Project Base is `CHF` and Sec is `USD`:
      // Convert USD -> EUR -> CHF.
      // For simplicity here, I will check how `calculateHoldings` converts. 
      // It likely uses `1 / rate` if `rate` is `EURUSD`.
      // Let's assume standard "Divide by rate if rate is FC/EUR" logic if base is EUR.
      // If `baseCurrency` is CHF, `fxData` might be rebased?
      // Let's stick to a simple converter: 
      // If we have EUR based rates: ValueInEUR = ValueInOrg / Rate(Org). ValueInTarget = ValueInEUR * Rate(Target).

      // 1. Check Upcoming Dividends (Confirmed)
      if (sec.upcomingDividends && Array.isArray(sec.upcomingDividends)) {
        sec.upcomingDividends.forEach((ud: UpcomingDividendEntry) => {
          const exDate = new Date(ud.exDate);
          if (exDate.getFullYear() === currentYear && exDate > new Date()) {
            let amount = ud.amount;
            // If amount is missing, infer from latest history
            if (!amount && sec.dividendHistory?.length) {
              const sortedHist = [...sec.dividendHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              amount = sortedHist[0].amount;
            }

            if (amount) {
              const totalPayout = amount * shares;
              const finalVal = convertToBaseLatest(totalPayout, secCurrency);

              forecastEvents.push({
                date: exDate,
                amount: finalVal,
                name: sec.name,
                ticker: sec.symbol || sec.isin,
                debug: `${shares}x ~${amount.toFixed(2)} ${secCurrency}`
              });
              monthlyForecastMap[exDate.getMonth()] = (monthlyForecastMap[exDate.getMonth()] || 0) + finalVal;
            }
          }
        });
      }

      // 2. Project from History (If no upcoming for the period)
      // Strategy: Look at Dividends from Previous Year (Last Year). 
      // If a dividend was paid in Month M last year, and we haven't passed Month M this year (or we passed it but assume next year... wait, REST of year).
      // Only look for months > currentMonth.
      if (sec.dividendHistory && Array.isArray(sec.dividendHistory)) {
        sec.dividendHistory.forEach((dh: DividendHistoryEntry) => {
          const dDate = new Date(dh.date);
          if (dDate.getFullYear() === lastYear) {
            // Check if this "slot" is in the future for current year
            // e.g. Last year paid on Sept 15. Today is Feb. 
            // We expect a payment in Sept this year.
            const thisYearDate = new Date(currentYear, dDate.getMonth(), dDate.getDate());

            // Only add if it's in the future AND we haven't already added a confirmed upcoming dividend for this month?
            // (Simple dedup: if monthlyForecastMap has entry, maybe skip? No, multiple stocks pay in same month).
            // Better: check if `forecastEvents` already has an entry for this stock in this month.

            if (thisYearDate > new Date()) {
              const hasUpcoming = forecastEvents.some(e => e.ticker === sec.symbol && e.date.getMonth() === dDate.getMonth());
              if (!hasUpcoming) {
                const totalPayout = dh.amount * shares;
                const finalVal = convertToBaseLatest(totalPayout, secCurrency);

                forecastEvents.push({
                  date: thisYearDate, // Projected date
                  amount: finalVal,
                  name: sec.name,
                  ticker: sec.symbol || sec.isin,
                  debug: `Hist(${dDate.toLocaleDateString()}): ${shares}x ${dh.amount} ${secCurrency}`
                });
                monthlyForecastMap[dDate.getMonth()] = (monthlyForecastMap[dDate.getMonth()] || 0) + finalVal;
              }
            }
          }
        });
      }
    });

    // Estimate Rest of Year
    // Only sum the "future" forecast events
    const estimatedRest = forecastEvents.filter(e => e.date > new Date()).reduce((sum, e) => sum + e.amount, 0);

    // --- RECONSTRUCTED HISTORY (Actual & Theoretical Combined) ---
    // Instead of naive "current shares * past div", we rebuild share count at each dividend date.
    const theoreticalLast: Record<number, number> = {};
    const theoreticalCurrent: Record<number, number> = {};
    const monthlyTheoreticalMap: Record<string, number> = {}; // "Year-Month" -> Amount
    const annualTheoreticalMap: Record<number, number> = {};  // Year -> Amount
    const monthlyTheoreticalAllMap: Record<string, number> = {}; // Full history map
    const annualTheoreticalAllMap: Record<number, number> = {};  // Full history map
    const theoreticalRecent: { id: string; name: string; date: string; amount: number; type: string; sortKey: number }[] = [];
    const today = new Date();

    // 1. Identify all securities involved in transactions
    const relevantIsins = new Set(filteredTransactions.map(t => t.isin).filter(Boolean) as string[]);

    // Group transactions by ISIN for fast lookup
    const txByIsin: Record<string, TransactionLike[]> = {};
    filteredTransactions.forEach(t => {
      const id = t.isin; // consistent ID
      if (!id) return;
      if (!txByIsin[id]) txByIsin[id] = [];
      txByIsin[id].push(t);
    });

    relevantIsins.forEach((isin: string) => {
      const sec = project.securities?.[isin];
      // If security or history missing, we can't do anything
      if (!sec || !sec.dividendHistory) return;

      // Sort Dividend History (Oldest first) needed? No, just iterate.
      // Sort Transactions (Oldest first) for running balance
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

      // We only care about dividends in our relevant buckets (Comparison Years + Last/Current Year)
      // Optimization: Pre-filter dividends? Or just check date.

      sec.dividendHistory.forEach((dh: DividendHistoryEntry) => {
        const dDate = new Date(dh.date);
        const month = dDate.getMonth();
        const year = dDate.getFullYear();

        // CALCULATE SHARES AT DATE (dDate)
        // Sum buys/sells where date < dDate (Ex-Date usually determines entitlement, assuming dh.date is Ex-Date or Pay-Date close enough)
        let sharesAtDate = 0;
        const targetTime = dDate.getTime();
        for (const event of events) {
          if (event.time > targetTime) break; // Event happened after dividend

          if (event.type === 'Split') {
            const ratio = event.ratio || 1;
            if (ratio > 0 && sharesAtDate > 0) sharesAtDate *= ratio;
          } else if (event.type === 'Tx' && event.data) {
            const t = event.data;
            const qty = Math.abs(t.shares || t.quantity || 0);
            if (t.type === 'Buy' || t.type === 'Sparplan_Buy') {
              sharesAtDate += qty;
            } else if (t.type === 'Sell') {
              sharesAtDate -= qty;
            }
          }
        }

        if (sharesAtDate <= 0.0001) return; // No shares held at this time

        const secCurrency = sec.currency || 'EUR';
        const amount = convertToBase(dh.amount * sharesAtDate, secCurrency, dh.date);

        // Populate Full Maps
        monthlyTheoreticalAllMap[`${year}-${month}`] = (monthlyTheoreticalAllMap[`${year}-${month}`] || 0) + amount;
        annualTheoreticalAllMap[year] = (annualTheoreticalAllMap[year] || 0) + amount;

        // Populate 5-Year Maps
        const minYear = Math.min(...comparisonYears, lastYear);
        if (year >= minYear - 1) {
          monthlyTheoreticalMap[`${year}-${month}`] = (monthlyTheoreticalMap[`${year}-${month}`] || 0) + amount;
          annualTheoreticalMap[year] = (annualTheoreticalMap[year] || 0) + amount;
        }

        if (dDate <= today) {
          theoreticalRecent.push({
            id: `${isin}-${dh.date}`,
            name: sec.name || isin,
            date: dDate.toLocaleDateString('de-DE'),
            amount,
            type: 'Theoretisch',
            sortKey: dDate.getTime()
          });
        }

        if (year === lastYear) {
          theoreticalLast[month] = (theoreticalLast[month] || 0) + amount;
        } else if (year === currentYear) {
          theoreticalCurrent[month] = (theoreticalCurrent[month] || 0) + amount;
        }
      });
    });

    // Prepare Chart Data
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    const chartData = monthNames.map((name, monthIndex) => {
      // Create 5-year values
      const yearsData = comparisonYears.map(year => {
        // Use Actual if available, otherwise Theoretical
        const actual = monthlyHistoryMap[`${year}-${monthIndex}`] || 0;
        const theoretical = monthlyTheoreticalMap[`${year}-${monthIndex}`] || 0;

        return {
          year,
          amount: actual > 0 ? actual : theoretical
        };
      });

      return {
        month: name,
        years: yearsData
      };
    });

    // Sort Forecast Events for List
    const upcomingList = forecastEvents
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(e => ({
        date: e.date.toLocaleDateString(),
        name: e.name,
        amount: e.amount,
        ticker: e.ticker,
        type: 'Prognose',
        debug: e.debug
      }));

    // List Data (Past)
    const recentActual = [...dividends]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(d => ({
        id: d.id,
        name: d.name || d.isin,
        date: new Date(d.date).toLocaleDateString('de-DE'),
        amount: convertDividendToBase(d.amount, d.currency, d.date),
        type: 'Ausschuettung'
      }));

    const recentTheoretical = theoreticalRecent
      .sort((a, b) => b.sortKey - a.sortKey);

    const recent = recentActual.length > 0 ? recentActual : recentTheoretical;

    // Updated Yields
    // Personal Yield = (Received YTD + Forecast Rest) / Total Value? 
    // Or just (Forecast 12m) / Value?
    // User wants "Personal Dividend Yield". Usually: (Projected Annual Income) / Invested Capital.
    // Let's use (Sum(Last 12 Month Actuals) if available OR Projected Annual)
    // Given we built `projectedAnnual` quite carefully:
    const totalProjected = (sumCurrent + estimatedRest); // Mix of YTD actuals + Future Forecast
    // Or we can construct strict "Forward Annual Dividend" sum.

    const pYield = totalValue > 0 ? (totalProjected / totalValue) * 100 : 0;
    const yoc = totalInvested > 0 ? (totalProjected / totalInvested) * 100 : 0;

    // --- ANNUAL DATA (Yearly History) ---
    const annualHistoryMap: Record<number, number> = {};
    const yearsSet = new Set<number>();

    // 1. From Transactions
    dividends.forEach(d => {
      const y = new Date(d.date).getFullYear();
      const amount = convertDividendToBase(d.amount, d.currency, d.date);
      annualHistoryMap[y] = (annualHistoryMap[y] || 0) + amount;
      yearsSet.add(y);
    });

    // 2. From Theoretical History (to fill gaps)
    // Actually, "last 5 years" usually means actuals. 
    // If the user wants "Everything", we show 0 if nothing happened.
    // Let's ensure we have at least last 5 years in the set if chartView is 5Y?
    // Or just show what we have.
    const currentYearNum = new Date().getFullYear();

    // Merge Theoretical into Annual Map if Actual is missing?
    // Or just use maximum?
    // Let's iterate over theoretical years
    Object.keys(annualTheoreticalAllMap).forEach(yStr => {
      const y = parseInt(yStr);
      if (!annualHistoryMap[y]) {
        annualHistoryMap[y] = annualTheoreticalAllMap[y];
        yearsSet.add(y);
      }
    });

    for (let y = currentYearNum - 4; y <= currentYearNum; y++) {
      yearsSet.add(y);
    }

    const sortedYears = Array.from(yearsSet).sort();
    const annualData = sortedYears.map(year => ({
      year,
      amount: annualHistoryMap[year] || 0,
      isCurrent: year === currentYearNum,
      isForecast: year > currentYearNum // Future if any
    }));

    const combinedMonthlyMap: Record<string, number> = {};
    const combinedKeys = new Set([
      ...Object.keys(monthlyTheoreticalAllMap),
      ...Object.keys(monthlyHistoryAllMap)
    ]);
    Array.from(combinedKeys).forEach(key => {
      const actual = monthlyHistoryAllMap[key] || 0;
      const theoretical = monthlyTheoreticalAllMap[key] || 0;
      combinedMonthlyMap[key] = actual > 0 ? actual : theoretical;
    });

    return {
      receivedCurrentYear: sumCurrent,
      receivedLastYear: sumLast,
      monthlyData: chartData,
      recentDividends: recent,
      upcomingDividends: upcomingList,
      personalYield: pYield,
      yieldOnCost: yoc,
      projectedRestYear: estimatedRest,
      annualData,
      combinedMonthlyMap
    };
  }, [project, filteredTransactions, totalValue, totalInvested, holdings, baseCurrency]);

  // Prepare Yearly Data for Display
  const yearlyDisplayData = useMemo(() => {
    if (!annualData) return [];
    let data = annualData;
    if (historyRange === '5Y') {
      const currentYear = new Date().getFullYear();
      data = annualData.filter(d => d.year >= currentYear - 4);
    }
    return data;
  }, [annualData, historyRange]);

  const cumulativeDividendData = useMemo(() => {
    if (!combinedMonthlyMap || Object.keys(combinedMonthlyMap).length === 0) return [];

    const endDate = new Date();
    let startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    let months = 0;

    const monthEntries = Object.entries(combinedMonthlyMap).map(([key, amount]) => {
      const [y, m] = key.split('-').map(Number);
      return { monthIndex: (y * 12) + m, amount };
    });
    const amountByMonth: Record<number, number> = {};
    monthEntries.forEach(entry => {
      amountByMonth[entry.monthIndex] = (amountByMonth[entry.monthIndex] || 0) + entry.amount;
    });

    const valueAt = (date: Date) => {
      const target = (date.getFullYear() * 12) + date.getMonth();
      return monthEntries.reduce((sum, entry) => sum + (entry.monthIndex <= target ? entry.amount : 0), 0);
    };

    switch (cumulativeRange) {
      case '1M':
        startDate = new Date(endDate);
        startDate.setMonth(endDate.getMonth() - 1);
        return [
          { date: toDateKey(startDate), value: valueAt(startDate) },
          { date: toDateKey(endDate), value: valueAt(endDate) }
        ];
      case '6M':
        months = 6;
        break;
      case '1J':
        months = 12;
        break;
      case '3J':
        months = 36;
        break;
      case '5J':
        months = 60;
        break;
      case 'YTD':
        startDate = new Date(endDate.getFullYear(), 0, 1);
        break;
      case 'MAX': {
        const allKeys = Object.keys(combinedMonthlyMap);
        let minYear = Number.MAX_SAFE_INTEGER;
        let minMonth = 11;
        allKeys.forEach(key => {
          const [y, m] = key.split('-').map(Number);
          if (y < minYear || (y === minYear && m < minMonth)) {
            minYear = y;
            minMonth = m;
          }
        });
        if (minYear !== Number.MAX_SAFE_INTEGER) {
          startDate = new Date(minYear, minMonth, 1);
        }
        break;
      }
    }

    if (months > 0) {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth() - (months - 1), 1);
    }

    const series: { date: string; value: number }[] = [];
    const startMonthIndex = (startDate.getFullYear() * 12) + startDate.getMonth();
    let running = valueAt(startDate) - (amountByMonth[startMonthIndex] || 0);
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endCursor = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cursor <= endCursor) {
      const key = (cursor.getFullYear() * 12) + cursor.getMonth();
      const amount = amountByMonth[key] || 0;
      running += amount;
      series.push({
        date: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`,
        value: running
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return series;
  }, [combinedMonthlyMap, cumulativeRange]);


  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-emerald-500/10 rounded-xl">
            <PiggyBank size={28} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Erhalten {new Date().getFullYear()}</p>
            <p className="text-2xl font-bold text-white">{receivedCurrentYear.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
            <p className={`text-xs flex items-center mt-0.5 ${receivedCurrentYear >= receivedLastYear ? 'text-emerald-400' : 'text-rose-400'}`}>
              <TrendingUp size={12} className="mr-1" /> {receivedLastYear > 0 ? ((receivedCurrentYear - receivedLastYear) / receivedLastYear * 100).toFixed(1) : 0}% vs. Vorjahr
            </p>
          </div>
        </Card>
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Timer size={28} className="text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Erwartet (Restjahr)</p>
            <p className="text-2xl font-bold text-white">{projectedRestYear.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
            <p className="text-xs text-slate-400 mt-0.5">Prognose auf Basis von Positionen</p>
          </div>
        </Card>
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-purple-500/10 rounded-xl">
            <Activity size={28} className="text-purple-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Pers. Dividendenrendite</p>
            <p className="text-2xl font-bold text-white">{personalYield.toFixed(2)} %</p>
            <p className="text-xs text-slate-400 mt-0.5">Yield on Cost: {yieldOnCost.toFixed(2)}%</p>
          </div>
        </Card>
      </div>

      {/* Dividend Chart (Year over Year) */}
      <Card className="h-96 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <BarChart3 size={18} className="text-emerald-400" />
            Dividendenentwicklung
          </h3>
          <div className="flex gap-4 items-center">
            {/* View Toggles */}
            <div className="flex bg-slate-900/50 p-1 rounded-lg">
              <button
                onClick={() => setChartView('monthly')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${chartView === 'monthly' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Monatlich
              </button>
              <button
                onClick={() => setChartView('yearly')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${chartView === 'yearly' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Jährlich
              </button>
            </div>

            {/* Range Toggles (Only for Yearly) */}
            {chartView === 'yearly' && (
              <div className="flex bg-slate-900/50 p-1 rounded-lg">
                <button
                  onClick={() => setHistoryRange('5Y')}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${historyRange === '5Y' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  5J
                </button>
                <button
                  onClick={() => setHistoryRange('MAX')}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${historyRange === 'MAX' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  max
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 w-full flex items-end justify-between gap-2 sm:gap-4 px-2">
          {chartView === 'monthly' ? (
            // --- MONTHLY VIEW (Last 5 Years) ---
            monthlyData.map((m, i) => {
              // Find global max for scale
              const allAmounts = monthlyData.flatMap(d => d.years.map(y => y.amount));
              const maxVal = Math.max(...allAmounts, 1);
              const max = maxVal * 1.1;

              return (
                <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group relative">
                  <div className="w-full flex justify-center items-end gap-px sm:gap-1 h-full px-0.5">
                    {m.years.map((yData) => (
                      <div
                        key={yData.year}
                        className={`flex-1 rounded-t-sm transition-all relative
                                ${yData.year === new Date().getFullYear() ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}
                            `}
                        style={{ height: `${(yData.amount / max) * 100}%` }}
                      >
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] sm:text-xs text-slate-500 mt-3 truncate w-full text-center">{m.month}</span>

                  {/* Hover Tooltip (Detailed) */}
                  <div className="absolute bottom-full mb-2 bg-slate-800 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 w-48 text-left">
                    <div className="text-xs text-slate-400 mb-2 font-bold border-b border-slate-700 pb-1">{m.month} Historie</div>
                    {m.years.slice().reverse().map(yData => (
                      <div key={yData.year} className="flex justify-between text-xs mb-0.5">
                        <span className={yData.year === new Date().getFullYear() ? "text-emerald-400 font-bold" : "text-slate-400"}>{yData.year}</span>
                        <span className="text-white font-medium">{formatCurrency(yData.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            // --- YEARLY VIEW ---
            (() => {
              const maxVal = Math.max(...yearlyDisplayData.map(d => d.amount));
              const max = maxVal > 0 ? maxVal * 1.1 : 100;

              return yearlyDisplayData.map((d) => (
                <div key={d.year} className="flex-1 flex flex-col justify-end items-center h-full group relative">
                  <div
                    className={`w-4 sm:w-8 rounded-t-lg transition-all ${d.isCurrent ? 'bg-emerald-500' : 'bg-slate-600 hover:bg-slate-500'}`}
                    style={{ height: `${(d.amount / max) * 100}%` }}
                  ></div>
                  <span className="text-xs text-slate-500 mt-3">{d.year}</span>

                  <div className="absolute bottom-full mb-2 bg-slate-800 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 min-w-[80px] text-center">
                    <div className="text-xs text-slate-400 mb-1">{d.year}</div>
                    <div className="text-sm font-bold text-white">{formatCurrency(d.amount)}</div>
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      </Card>

      {/* Cumulative Dividend Chart */}
      <Card className="h-80 flex flex-col">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Coins size={18} className="text-blue-400" />
            Kumulierte Dividenden
          </h3>
          <div className="flex flex-wrap gap-1 bg-slate-900/50 p-1 rounded-lg">
            {(['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'] as const).map(range => (
              <button
                key={range}
                onClick={() => setCumulativeRange(range)}
                className={`px-2 py-1 text-xs rounded-md font-medium transition-all ${cumulativeRange === range ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 w-full">
          <SimpleAreaChart
            data={cumulativeDividendData}
            color="#38bdf8"
            height={240}
            showAxes={true}
            timeRange={cumulativeRange}
            currency={baseCurrency}
            tooltipLabel="Kumuliert"
          />
        </div>
      </Card>

      {/* Bottom Section: Calendar & History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Payments */}
        <Card className="flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <CalendarCheck size={18} className="text-blue-400" />
              {'N\u00e4chste Auszahlungen'}
            </h3>
          </div>
          <div className="space-y-3 flex-1">
            {upcomingDividends.length === 0 ? (
              <div className="text-slate-400 text-sm p-4 text-center">
                {'Keine best\u00e4tigten Ex-Dates.'}
                <br />
                <span className="text-xs text-slate-500">Prognose basiert auf aktuellen Positionen.</span>
              </div>
            ) : (
              upcomingDividends.slice(0, 5).map((div, i) => (
                <div key={`${div.ticker}-${div.date}-${i}`} className={`flex items-center justify-between py-3 ${i !== Math.min(upcomingDividends.length, 5) - 1 ? 'border-b border-slate-700/50' : ''}`}>
                  <div>
                    <div className="text-sm font-medium text-slate-200">{div.name}</div>
                    <div className="text-xs text-slate-500">{div.date} - {div.type}</div>
                  </div>
                  <div className="text-emerald-400 font-medium text-sm">
                    +{formatCurrency(div.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
          {upcomingDividends.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => {
                  if (upcomingDividends.length <= 5) return;
                  setDividendListModal({
                    title: 'N\u00e4chste Auszahlungen',
                    items: upcomingDividends.map((div, i) => ({
                      id: `${div.ticker}-${div.date}-${i}`,
                      name: div.name,
                      date: div.date,
                      amount: div.amount,
                      type: div.type
                    }))
                  });
                }}
                disabled={upcomingDividends.length <= 5}
                className="text-xs text-slate-300 hover:text-white transition-colors disabled:opacity-50"
              >
                {upcomingDividends.length <= 5
                  ? `Alle angezeigt (${upcomingDividends.length})`
                  : `Alle anzeigen (${upcomingDividends.length})`}
              </button>
            </div>
          )}
        </Card>

        {/* Recent History */}
        <Card className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Wallet size={18} className="text-slate-400" />
              Zahlungshistorie
            </h3>
          </div>
          <div className="space-y-0 flex-1">
            {recentDividends.length === 0 ? (
              <div className="text-slate-400 text-sm p-4 text-center">
                Keine Auszahlungen gefunden.
              </div>
            ) : (
              recentDividends.slice(0, 5).map((div, i) => (
                <div key={div.id} className={`flex items-center justify-between py-3 ${i !== Math.min(recentDividends.length, 5) - 1 ? 'border-b border-slate-700/50' : ''}`}>
                  <div>
                    <div className="text-sm font-medium text-slate-200">{div.name}</div>
                    <div className="text-xs text-slate-500">{div.date} - {div.type}</div>
                  </div>
                  <div className="text-emerald-400 font-medium text-sm">
                    +{formatCurrency(div.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
          {recentDividends.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => {
                  if (recentDividends.length <= 5) return;
                  setDividendListModal({
                    title: 'Zahlungshistorie',
                    items: recentDividends.map(div => ({
                      id: div.id,
                      name: div.name,
                      date: div.date,
                      amount: div.amount,
                      type: div.type
                    }))
                  });
                }}
                disabled={recentDividends.length <= 5}
                className="text-xs text-slate-300 hover:text-white transition-colors disabled:opacity-50"
              >
                {recentDividends.length <= 5
                  ? `Alle angezeigt (${recentDividends.length})`
                  : `Alle anzeigen (${recentDividends.length})`}
              </button>
            </div>
          )}
        </Card>
      </div>

      <DividendListModal
        isOpen={!!dividendListModal}
        onClose={() => setDividendListModal(null)}
        title={dividendListModal?.title || ''}
        items={dividendListModal?.items || []}
        currency={baseCurrency}
      />
    </div>
  );
};




