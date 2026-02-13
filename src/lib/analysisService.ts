
import { AnalysisMetrics, calculateTWRSeries } from './portfolioUtils';
import { parseDateOnlyUTC } from './dateUtils';

/**
 * Calculate portfolio analysis metrics
 * Refactored into separate file for better maintainability and to ensure fix application
 */
export function calculateAnalysisMetrics(
    historyData: { date: string; value: number; invested: number; dividend?: number }[],
    riskFreeRate: number = 0.02, // 2% annual risk-free rate
    options?: { includeDividends?: boolean }
): AnalysisMetrics {
    if (historyData.length === 0) {
        return {
            volatility: 0,
            sharpeRatio: 0,
            maxDrawdown: 0,
            maxDrawdownDate: '',
            twrSeries: [],
            monthlyReturns: []
        };
    }

    // 1. Calculate monthly returns
    // 1. Calculate monthly returns using TWR Series (Source of Truth)
    // This ensures consistency with the detailed charts.
    const includeDividends = options?.includeDividends ?? false;
    const twrSeries = calculateTWRSeries(historyData, includeDividends);

    // Helper to find TWR value at a specific date
    const twrByDate = new Map<string, number>();
    const indexSeries = twrSeries.map(point => {
        const value = Number.isFinite(point.value) ? point.value : 0;
        const index = 1 + (value / 100);
        twrByDate.set(point.date, value);
        return { date: point.date, index };
    });
    const getTwrValue = (d: string) => twrByDate.get(d);
    const getIndexValue = (d: string): number | null => {
        const v = getTwrValue(d);
        if (!Number.isFinite(v)) return null;
        const idx = 1 + (v / 100);
        return Number.isFinite(idx) ? idx : null;
    };

    const findFirstPositiveIndexInRange = (start: string, end: string): number | null => {
        for (const point of indexSeries) {
            if (point.date < start) continue;
            if (point.date > end) break;
            if (Number.isFinite(point.index) && point.index > 0) return point.index;
        }
        return null;
    };

    const monthlyReturnsMap: Record<string, number> = {};
    const months: string[] = [];
    const monthRanges = new Map<string, { start: string; end: string }>();

    // Identify months present in data and store range for each month
    historyData.forEach(point => {
        const monthKey = point.date.slice(0, 7); // YYYY-MM (timezone-safe)
        const existing = monthRanges.get(monthKey);
        if (!existing) {
            monthRanges.set(monthKey, { start: point.date, end: point.date });
            months.push(monthKey);
        } else {
            existing.end = point.date;
        }
    });

    for (let i = 0; i < months.length; i++) {
        const monthKey = months[i];
        const range = monthRanges.get(monthKey);
        if (!range) continue;

        const endIndex = getIndexValue(range.end);
        if (!endIndex || endIndex <= 0) continue;

        const prevRange = i > 0 ? monthRanges.get(months[i - 1]) : undefined;
        let startIndex = prevRange ? getIndexValue(prevRange.end) : null;
        if (!startIndex || startIndex <= 0) {
            startIndex = getIndexValue(range.start);
        }
        if (!startIndex || startIndex <= 0) {
            startIndex = findFirstPositiveIndexInRange(range.start, range.end);
        }
        if (!startIndex || startIndex <= 0) continue;

        const monthReturn = ((endIndex / startIndex) - 1) * 100;
        if (Number.isFinite(monthReturn)) {
            monthlyReturnsMap[monthKey] = monthReturn;
        }
    }

    // 2. Calculate Volatility (annualized, trailing 1Y using TWR)
    const annualizationDays = 365; // data points are daily (incl. weekends)
    const msPerDay = 1000 * 60 * 60 * 24;
    const twrIndexSeries = twrSeries.map(p => ({
        date: p.date,
        index: 1 + (p.value / 100)
    }));

    const lastTwrDate = parseDateOnlyUTC(twrIndexSeries[twrIndexSeries.length - 1].date);
    const oneYearAgo = new Date(lastTwrDate);
    oneYearAgo.setUTCFullYear(lastTwrDate.getUTCFullYear() - 1);

    const firstInWindow = twrIndexSeries.findIndex(p => parseDateOnlyUTC(p.date) >= oneYearAgo);
    const windowStart = Math.max(firstInWindow, 1);

    let windowDailyReturns: number[] = [];
    for (let i = windowStart; i < twrIndexSeries.length; i++) {
        const prev = twrIndexSeries[i - 1].index;
        const curr = twrIndexSeries[i].index;
        if (prev > 0) {
            windowDailyReturns.push((curr / prev) - 1);
        }
    }

    // Fallback for short histories: use full series
    let effectiveStartIndex = Math.max(windowStart - 1, 0);
    if (windowDailyReturns.length < 2) {
        windowDailyReturns = [];
        effectiveStartIndex = 0;
        for (let i = 1; i < twrIndexSeries.length; i++) {
            const prev = twrIndexSeries[i - 1].index;
            const curr = twrIndexSeries[i].index;
            if (prev > 0) {
                windowDailyReturns.push((curr / prev) - 1);
            }
        }
    }

    let volatility = 0;
    if (windowDailyReturns.length > 1) {
        const mean = windowDailyReturns.reduce((a, b) => a + b, 0) / windowDailyReturns.length;
        const variance = windowDailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / windowDailyReturns.length;
        const dailyVol = Math.sqrt(variance);
        volatility = dailyVol * Math.sqrt(annualizationDays) * 100;
    }

    // 3. Calculate Sharpe Ratio (trailing 1Y using TWR)
    let sharpeRatio = 0;
    if (twrIndexSeries.length > 1) {
        const startIndex = effectiveStartIndex;
        const startValue = twrIndexSeries[startIndex].index;
        const endValue = twrIndexSeries[twrIndexSeries.length - 1].index;
        const startDate = parseDateOnlyUTC(twrIndexSeries[startIndex].date);
        const endDate = parseDateOnlyUTC(twrIndexSeries[twrIndexSeries.length - 1].date);
        const daysDiff = (endDate.getTime() - startDate.getTime()) / msPerDay;
        const yearsElapsed = daysDiff / annualizationDays;

        if (yearsElapsed > 0 && startValue > 0) {
            const annualizedReturn = Math.pow(endValue / startValue, 1 / yearsElapsed) - 1;
            const excessReturn = annualizedReturn - riskFreeRate;
            sharpeRatio = volatility > 0 ? excessReturn / (volatility / 100) : 0;
        }
    }

    // 4. Calculate Max Drawdown using TWR (Time-Weighted Return)
    // We construct a TWR index to measure pure strategy performance, ignoring deposit dilution effects.
    let maxDrawdown = 0;
    let maxDrawdownDate = '';
    const drawdownHistory: { date: string; value: number }[] = [];

    // TWR Index Tracking
    let peakIndex = 1.0;
    let currentIndex = 1.0;

    // Check if we have data
    if (historyData.length > 0) {
        // Handle Day 1 Alpha for TWR:
        // Day 1 Return = (Value - Invested) / Invested
        if (historyData[0].invested > 0) {
            const day1Return = (historyData[0].value - historyData[0].invested) / historyData[0].invested;
            currentIndex = 1.0 * (1 + day1Return);
            peakIndex = Math.max(peakIndex, currentIndex);
        }

        for (let i = 1; i < historyData.length; i++) {
            const prev = historyData[i - 1];
            const curr = historyData[i];

            // Calculate Cashflow
            const prevInvested = prev.invested || 0;
            const currInvested = curr.invested || 0;
            const cashFlow = currInvested - prevInvested;

            // Daily Return (Total Return)
            // Use standard Start-of-Day Cashflow assumption
            // Daily Return (Total Return)
            // Use standard Start-of-Day Cashflow assumption

            const costBasis = prev.value + cashFlow;
            let dailyReturn = 0;

            if (costBasis > 0) {
                dailyReturn = (curr.value - costBasis) / costBasis;
            }

            currentIndex *= (1 + dailyReturn);

            // Update Peak and Drawdown
            if (currentIndex > peakIndex) {
                peakIndex = currentIndex;
                drawdownHistory.push({ date: curr.date, value: 0 });
            } else {
                const drawdown = (peakIndex - currentIndex) / peakIndex; // Positive value representing drop
                const drawdownPercent = drawdown * 100;

                // Store negative value for chart (0 to -X%)
                drawdownHistory.push({ date: curr.date, value: -drawdownPercent });

                if (drawdownPercent > maxDrawdown) {
                    maxDrawdown = drawdownPercent;
                    maxDrawdownDate = curr.date;
                }
            }
        }
    }

    // 5. Format monthly returns for display
    // We now return the full map and letting UI handle display for selected year
    // But we still return 'monthlyReturns' as default view (current year) for backward compat

    const monthlyReturns: { month: string; return: number }[] = [];
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    // Determine available years from data
    const availableYearsSet = new Set<number>();
    historyData.forEach(d => availableYearsSet.add(Number(d.date.slice(0, 4))));
    const availableYears = Array.from(availableYearsSet).sort((a, b) => b - a); // Descending

    const splitYear = Number(historyData[historyData.length - 1].date.slice(0, 4));

    for (let month = 0; month < 12; month++) {
        const monthKey = `${splitYear}-${String(month + 1).padStart(2, '0')}`;
        const returnValue = monthlyReturnsMap[monthKey] || 0;

        monthlyReturns.push({
            month: monthNames[month],
            return: Math.round(returnValue * 10) / 10
        });
    }

    return {
        volatility: Math.round(volatility * 10) / 10,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        maxDrawdown: -Math.round(maxDrawdown * 10) / 10,
        maxDrawdownDate,
        drawdownHistory,
        twrSeries,
        monthlyReturns,
        monthlyReturnsMap,
        availableYears
    };
}
