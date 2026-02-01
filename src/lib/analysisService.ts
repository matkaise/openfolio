
import { AnalysisMetrics } from './portfolioUtils';

/**
 * Calculate portfolio analysis metrics
 * Refactored into separate file for better maintainability and to ensure fix application
 */
export function calculateAnalysisMetrics(
    historyData: { date: string; value: number; invested: number }[],
    riskFreeRate: number = 0.02 // 2% annual risk-free rate
): AnalysisMetrics {
    if (historyData.length === 0) {
        return {
            volatility: 0,
            sharpeRatio: 0,
            maxDrawdown: 0,
            maxDrawdownDate: '',
            monthlyReturns: []
        };
    }

    // 1. Calculate monthly returns
    const monthlyReturnsMap: Record<string, number> = {};
    const dailyReturns: number[] = [];

    // Calculate daily returns for volatility
    for (let i = 1; i < historyData.length; i++) {
        const prev = historyData[i - 1];
        const curr = historyData[i];

        if (prev.value > 0) {
            const dailyReturn = (curr.value - prev.value) / prev.value;
            dailyReturns.push(dailyReturn);
        }
    }

    // Identify month start values for robust return calculation
    // Now storing both Value and Invested capital
    const monthStartPoints: Record<string, { value: number, invested: number }> = {};
    const months: string[] = []; // Keep order

    for (const point of historyData) {
        const date = new Date(point.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        // Pick the first data point encountered for each month
        // Since historyData is sorted by date asc, this is the earliest point (e.g. 1st of month)
        if (!monthStartPoints[monthKey]) {
            monthStartPoints[monthKey] = {
                value: point.value,
                invested: point.invested || 0
            };
            months.push(monthKey);
        }
    }

    // Calculate return for each month using Period MWR logic
    for (let i = 0; i < months.length; i++) {
        const monthKey = months[i];
        const startPoint = monthStartPoints[monthKey];
        let startValue = startPoint.value;
        const startInvested = startPoint.invested;

        // CRITICAL FIX: If this is the very first month of the history, 
        // check if we should base strictly on Invested Capital to capture Day 1 Alpha
        // (Similar to MAX View logic: First Buy @ 100 vs Close @ 131 should be +31%)
        if (i === 0 && startInvested > 0) {
            // Check if this month start point is actually the history start point
            // (It usually is, as Month 0 Start = History[0])
            if (monthStartPoints[monthKey].value === historyData[0].value) {
                startValue = startInvested;
            }
        }

        let endValue = 0;
        let endInvested = 0;

        if (i < months.length - 1) {
            const nextMonthKey = months[i + 1];
            endValue = monthStartPoints[nextMonthKey].value;
            endInvested = monthStartPoints[nextMonthKey].invested;
        } else {
            // For the last month, use the very last data point available
            const lastPoint = historyData[historyData.length - 1];
            endValue = lastPoint.value;
            endInvested = lastPoint.invested || 0;
        }

        // MWR Formula: ((Val_End - Val_Start) - (Inv_End - Inv_Start)) / (Val_Start + (Inv_End - Inv_Start))
        const deltaInvested = endInvested - startInvested;
        const capitalAtWork = startValue + deltaInvested;

        let monthReturn = 0;
        if (capitalAtWork > 0) {
            const profitWithNewCash = (endValue - startValue) - deltaInvested;
            monthReturn = (profitWithNewCash / capitalAtWork) * 100;
        }

        monthlyReturnsMap[monthKey] = monthReturn;
    }

    // 2. Calculate Volatility (annualized)
    let volatility = 0;
    if (dailyReturns.length > 1) {
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
        const dailyVol = Math.sqrt(variance);
        volatility = dailyVol * Math.sqrt(252) * 100;
    }

    // 3. Calculate Sharpe Ratio
    let sharpeRatio = 0;
    if (historyData.length > 1 && historyData[0].value > 0) {
        const totalReturn = (historyData[historyData.length - 1].value - historyData[0].value) / historyData[0].value;
        const daysDiff = (new Date(historyData[historyData.length - 1].date).getTime() - new Date(historyData[0].date).getTime()) / (1000 * 60 * 60 * 24);
        const yearsElapsed = daysDiff / 365;

        if (yearsElapsed > 0) {
            const annualizedReturn = totalReturn / yearsElapsed;
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
            // Include Dividends in the numerator (Total Return)
            const prevDividend = prev.dividend || 0;
            const currDividend = curr.dividend || 0;
            const dailyDividend = currDividend - prevDividend;

            const costBasis = prev.value + cashFlow;
            let dailyReturn = 0;

            if (costBasis > 0) {
                dailyReturn = (curr.value + dailyDividend - costBasis) / costBasis;
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
    historyData.forEach(d => availableYearsSet.add(new Date(d.date).getFullYear()));
    const availableYears = Array.from(availableYearsSet).sort((a, b) => b - a); // Descending

    const lastDate = new Date(historyData[historyData.length - 1].date);
    const splitYear = lastDate.getFullYear();

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
        monthlyReturns,
        monthlyReturnsMap,
        availableYears
    };
}
