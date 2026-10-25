import React, { useMemo, useState } from 'react';
import { Activity, CalendarCheck, Coins, PiggyBank, Timer } from 'lucide-react';
import { selectCalculationTransactions, calculateProjectHoldings } from '@/lib/portfolioSelectors';
import { buildSplitIgnoreDates } from '@/lib/portfolioUtils';
import { convertCurrency } from '@/lib/fxUtils';
import { getRangeStartDate, toDateKeyLocal } from '@/lib/dateUtils';
import { useProjectData } from '@/contexts/ProjectContext';
import { SimpleAreaChart } from '@/components/SimpleAreaChart';
import { useFormatters } from '@/components/ui/useFormatters';
import { Avatar, CardHeader, EmptyState, GlassCard, Kpi, ListRow, Segmented } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { type DividendHistoryEntry, type EventEntry, type TransactionLike, type UpcomingDividendEntry } from '@/types/portfolioView';
import { type Security, type Transaction } from '@/types/domain';

const DividendListModal = ({
  isOpen,
  onClose,
  title,
  items
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: { id: string; name: string; date: string; amount: number; type: string }[];
}) => {
  const formatters = useFormatters();
  return (
    <Modal open={isOpen} onClose={onClose} size="lg" title={title} subtitle={`${items.length} Einträge`} icon={<Coins size={20} />}>
      <div className="ui-rows ui-scroll" style={{ maxHeight: '60vh' }}>
        {items.map((item) => (
          <ListRow
            key={item.id}
            leading={<Avatar seed={item.name} label={item.name} size={38} />}
            title={item.name}
            meta={<span>{item.date} · {item.type}</span>}
            trailing={<span className="ui-row-value is-up">{formatters.money(item.amount, { sign: true })}</span>}
          />
        ))}
      </div>
    </Modal>
  );
};

export const DividendenContent = ({ selectedPortfolioIds }: { selectedPortfolioIds: string[] }) => {
  const project = useProjectData();
  const [chartView, setChartView] = useState<'monthly' | 'yearly'>('yearly'); // Default to yearly as requested "Last 5 Years"
  const [historyRange, setHistoryRange] = useState<'5Y' | 'MAX'>('5Y');
  const [dividendListModal, setDividendListModal] = useState<{
    title: string;
    items: { id: string; name: string; date: string; amount: number; type: string }[];
  } | null>(null);
  const [cumulativeRange, setCumulativeRange] = useState<'1M' | '6M' | 'YTD' | '1J' | '3J' | '5J' | 'MAX'>('1J');
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const formatters = useFormatters();

  // 1. Filter Transactions (same logic as other tabs)
  const filteredTransactions = useMemo(() => (
    selectCalculationTransactions(project, selectedPortfolioIds)
  ), [project, selectedPortfolioIds]);

  // 2. Calculate Holdings (for Yield Calculation)
  const { totalValue, totalInvested, holdings } = useMemo(() => {
    if (!project) return { totalValue: 0, totalInvested: 0, holdings: [] };
    const { holdings } = calculateProjectHoldings(project, filteredTransactions);

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
    let sumCurrentActual = 0;
    let sumLastActual = 0;

    // Config for 5 Year Monthly Comparison
    const comparisonYears = Array.from({ length: 5 }, (_, i) => currentYear - i).reverse(); // [2021, 2022, 2023, 2024, 2025]
    const monthlyHistoryMap: Record<string, number> = {}; // "Year-Month" -> Amount
    const monthlyHistoryAllMap: Record<string, number> = {}; // Full history map

    const convertToBaseAtDate = (amount: number, currency: string, date: string) => (
      convertCurrency(project.fxData, amount, currency, baseCurrency, date)
    );
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
        sumCurrentActual += amount;
      } else if (year === lastYear) {
        sumLastActual += amount;
      }

      // Populate Full Map
      monthlyHistoryAllMap[`${year}-${month}`] = (monthlyHistoryAllMap[`${year}-${month}`] || 0) + amount;

      // Populate 5-Year Map
      if (year >= currentYear - 4) {
        monthlyHistoryMap[`${year}-${month}`] = (monthlyHistoryMap[`${year}-${month}`] || 0) + amount;
      }
    });

    // Helper: Get latest FX rate
    const convertToBase = (amount: number, currency: string, date?: string) => {
      const effectiveDate = date || project.fxData.lastUpdated || new Date().toISOString().split('T')[0];
      return convertToBaseAtDate(amount, currency, effectiveDate);
    };

    const convertToBaseLatest = (amount: number, currency: string) => (
      convertCurrency(project.fxData, amount, currency, baseCurrency)
    );

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
      // Usually Openfolio stores rate as "1 EUR = X USD". 
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

    const splitsByIsin: Record<string, Record<string, number>> = {};
    const securityByIsin: Record<string, Security> = {};
    Object.values(project.securities || {}).forEach(sec => {
      securityByIsin[sec.isin] = sec;
      if (sec.splits) splitsByIsin[sec.isin] = sec.splits;
    });
    const splitIgnoreDates = buildSplitIgnoreDates(txByIsin as unknown as Record<string, Transaction[]>, splitsByIsin, securityByIsin);

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
        const ignoredDates = splitIgnoreDates[isin];
        Object.entries(sec.splits).forEach(([d, r]) => {
          if (ignoredDates && ignoredDates.has(d)) return;
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
        type: 'Ausschüttung'
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
    const sumCurrentTheoretical = annualTheoreticalAllMap[currentYear] || 0;
    const sumLastTheoretical = annualTheoreticalAllMap[lastYear] || 0;
    const receivedCurrentYear = sumCurrentActual > 0 ? sumCurrentActual : sumCurrentTheoretical;
    const receivedLastYear = sumLastActual > 0 ? sumLastActual : sumLastTheoretical;

    const totalProjected = (receivedCurrentYear + estimatedRest); // Mix of YTD actuals + Future Forecast
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
      receivedCurrentYear,
      receivedLastYear,
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
        startDate = getRangeStartDate('1M', endDate) ?? endDate;
        return [
          { date: toDateKeyLocal(startDate), value: valueAt(startDate) },
          { date: toDateKeyLocal(endDate), value: valueAt(endDate) }
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

  const currentYear = new Date().getFullYear();
  const changeVsLastYear = receivedLastYear > 0 ? ((receivedCurrentYear - receivedLastYear) / receivedLastYear) * 100 : 0;
  const RANGE_OPTIONS = (['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'] as const).map((value) => ({ value, label: value }));
  const showAll = (title: string, items: { id: string; name: string; date: string; amount: number; type: string }[]) => setDividendListModal({ title, items });

  const yearlyMax = Math.max(...yearlyDisplayData.map((d) => d.amount), 0) * 1.1 || 1;
  const monthlyMax = Math.max(...monthlyData.flatMap((d) => d.years.map((y) => y.amount)), 0) * 1.1 || 1;

  const paymentRows = (items: { key: string; name: string; date: string; type: string; amount: number }[]) => (
    <div className="ui-rows">
      {items.map((item) => (
        <ListRow
          key={item.key}
          leading={<Avatar seed={item.name} label={item.name} size={38} />}
          title={item.name}
          meta={<span>{item.date} · {item.type}</span>}
          trailing={<span className="ui-row-value is-up">{formatters.money(item.amount, { sign: true })}</span>}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="ui-kpis is-3">
        <Kpi
          label={`Erhalten ${currentYear}`}
          value={formatters.money(receivedCurrentYear)}
          sub={receivedLastYear > 0 ? `${formatters.percent(changeVsLastYear, { sign: true, decimals: 1 })} gegenüber Vorjahr` : 'Kein Vorjahreswert'}
          icon={<PiggyBank size={16} />}
          tone="gain"
        />
        <Kpi label="Erwartet (Restjahr)" value={formatters.money(projectedRestYear)} sub="Prognose aus den aktuellen Positionen" icon={<Timer size={16} />} tone="teal" />
        <Kpi
          label="Dividendenrendite"
          value={formatters.percent(personalYield)}
          sub={`Auf den Einstand: ${formatters.percent(yieldOnCost)}`}
          icon={<Activity size={16} />}
          tone="accent"
        />
      </div>

      <GlassCard>
        <CardHeader title="Dividendenentwicklung">
          <div className="ui-head-actions">
            <Segmented
              options={[{ value: 'yearly', label: 'Jährlich' }, { value: 'monthly', label: 'Monatlich' }]}
              value={chartView}
              onChange={setChartView}
              ariaLabel="Ansicht"
              size="sm"
            />
            {chartView === 'yearly' && (
              <Segmented options={[{ value: '5Y', label: '5 Jahre' }, { value: 'MAX', label: 'Alle' }]} value={historyRange} onChange={setHistoryRange} ariaLabel="Zeitraum" size="sm" />
            )}
          </div>
        </CardHeader>

        <div className="ui-bars" role="img" aria-label="Dividenden je Zeitraum">
          {chartView === 'monthly' ? (
            monthlyData.map((m) => (
              <div key={m.month} className="ui-bar-col">
                <div className="ui-bar-group">
                  {m.years.map((yData) => (
                    <div
                      key={yData.year}
                      className={`ui-bar${yData.year === currentYear ? ' is-current' : ''}`}
                      style={{ height: `${(yData.amount / monthlyMax) * 100}%` }}
                    />
                  ))}
                </div>
                <span className="ui-bar-label">{m.month}</span>
                <div className="ui-bar-tip glass">
                  <div className="ui-bar-tip-title">{m.month}</div>
                  {m.years.slice().reverse().map((yData) => (
                    <div key={yData.year} className={`ui-bar-tip-row${yData.year === currentYear ? ' is-current' : ''}`}>
                      <span>{yData.year}</span>
                      <span>{formatters.money(yData.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            yearlyDisplayData.map((d) => (
              <div key={d.year} className="ui-bar-col">
                <div className="ui-bar-group">
                  <div className={`ui-bar is-wide${d.isCurrent ? ' is-current' : ''}`} style={{ height: `${(d.amount / yearlyMax) * 100}%` }} />
                </div>
                <span className="ui-bar-label">{d.year}</span>
                <div className="ui-bar-tip glass">
                  <div className="ui-bar-tip-title">{d.year}</div>
                  <div className="ui-bar-tip-row is-current"><span>Summe</span><span>{formatters.money(d.amount)}</span></div>
                </div>
              </div>
            ))
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <CardHeader title="Kumulierte Dividenden">
          <Segmented options={RANGE_OPTIONS} value={cumulativeRange} onChange={setCumulativeRange} ariaLabel="Zeitraum" size="sm" />
        </CardHeader>
        <SimpleAreaChart
          data={cumulativeDividendData}
          color="var(--accent)"
          height={240}
          showAxes={true}
          timeRange={cumulativeRange}
          currency={baseCurrency}
          tooltipLabel="Kumuliert"
        />
      </GlassCard>

      <div className="ui-grid-2" style={{ alignItems: 'start' }}>
        <GlassCard>
          <CardHeader title="Nächste Auszahlungen">
            {upcomingDividends.length > 5 && (
              <button type="button" className="ui-link" onClick={() => showAll('Nächste Auszahlungen', upcomingDividends.map((div, i) => ({ id: `${div.ticker}-${div.date}-${i}`, name: div.name, date: div.date, amount: div.amount, type: div.type })))}>
                Alle {upcomingDividends.length} →
              </button>
            )}
          </CardHeader>
          {upcomingDividends.length === 0 ? (
            <EmptyState icon={<CalendarCheck size={22} />} title="Keine bestätigten Termine" text="Die Prognose basiert auf deinen aktuellen Positionen und den Zahlungen des Vorjahres." />
          ) : (
            paymentRows(upcomingDividends.slice(0, 5).map((div, i) => ({ key: `${div.ticker}-${div.date}-${i}`, name: div.name, date: div.date, type: div.type, amount: div.amount })))
          )}
        </GlassCard>

        <GlassCard>
          <CardHeader title="Zahlungshistorie">
            {recentDividends.length > 5 && (
              <button type="button" className="ui-link" onClick={() => showAll('Zahlungshistorie', recentDividends.map((div) => ({ id: div.id, name: div.name || '', date: div.date, amount: div.amount, type: div.type })))}>
                Alle {recentDividends.length} →
              </button>
            )}
          </CardHeader>
          {recentDividends.length === 0 ? (
            <EmptyState icon={<Coins size={22} />} title="Noch keine Auszahlungen" text="Dividenden aus Importen oder manuellen Buchungen erscheinen hier." />
          ) : (
            paymentRows(recentDividends.slice(0, 5).map((div) => ({ key: div.id, name: div.name || '', date: div.date, type: div.type, amount: div.amount })))
          )}
        </GlassCard>
      </div>

      <DividendListModal
        isOpen={!!dividendListModal}
        onClose={() => setDividendListModal(null)}
        title={dividendListModal?.title || ''}
        items={dividendListModal?.items || []}
      />
    </>
  );
};
