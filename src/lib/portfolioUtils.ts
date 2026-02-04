import { Transaction, Security, CurrencyHistory } from '../types/domain';

export interface Holding {
    security: {
        isin: string;
        name: string;
        quoteType?: string;
        sector?: string;
        industry?: string;
        region?: string;
        country?: string;
    };
    quantity: number;
    averageBuyPrice: number; // in Base Currency
    averageBuyPriceInOriginalCurrency: number;
    currentPriceInOriginalCurrency: number; // New field
    value: number; // in Base Currency
    totalReturn: number; // value - invested
    totalReturnPercent: number;
    currency: string; // Original currency
}

// ... inside calculateHoldings function ...

/**
 * Calculates current holdings based on transactions.
 * Uses a simplified Weighted Average Price method.
 */
export function calculateHoldings(
    transactions: Transaction[],
    securities: Security[], // List or Map of known securities
    quotes: Record<string, number> | undefined, // Current prices (map by ISIN)
    fxRates: Record<string, CurrencyHistory>,
    baseCurrency: string = 'EUR'
): { holdings: Holding[], realizedPnL: number } {

    const holdingsMap: Record<string, {
        quantity: number;
        invested: number; // Total amount spent (in base currency)
        investedOriginal: number;
        realizedPnL: number;
        isin: string;
        currency: string;
    }> = {};

    // Helper to get rate relative to EUR
    // FxRates are EUR based. e.g. EURUSD = 1.10
    const getEurRate = (currency: string, date?: string): number => {
        if (currency === 'EUR') return 1;
        const history = fxRates[currency];
        if (!history) return 1; // Fallback

        if (date) {
            // Look up historical rate for the specific date
            // If exact date not found, find the closest earlier date
            const targetDate = new Date(date).getTime();
            const availableDates = Object.keys(history).sort();

            // Find the closest date that is <= targetDate
            let closestDate = availableDates[0];
            for (const d of availableDates) {
                const dTime = new Date(d).getTime();
                if (dTime <= targetDate) {
                    closestDate = d;
                } else {
                    break;
                }
            }

            return history[closestDate] || 1;
        }

        // No date provided, use latest rate
        const dates = Object.keys(history).sort();
        const latest = dates[dates.length - 1];
        return history[latest] || 1;
    };

    const convert = (amount: number, from: string, to: string, date?: string): number => {
        if (from === to) return amount;

        // 1. Convert From -> EUR
        // Rate EUR->From = X. So 1 EUR = X From. 1 From = 1/X EUR.
        // Amount(From) / Rate(EURFrom) = Amount(EUR)
        const rateFrom = getEurRate(from, date);
        const amountEur = amount / rateFrom;

        // 2. Convert EUR -> To
        // Rate EUR->To = Y. 1 EUR = Y To.
        // Amount(EUR) * Rate(EURTo) = Amount(To)
        if (to === 'EUR') return amountEur;
        const rateTo = getEurRate(to, date);
        return amountEur * rateTo;
    };

    let globalRealizedPnL = 0;
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Group transactions by ISIN for easier processing
    const txByIsin: Record<string, Transaction[]> = {};
    sortedTx.forEach(tx => {
        if (!tx.isin) return;
        if (!txByIsin[tx.isin]) txByIsin[tx.isin] = [];
        txByIsin[tx.isin].push(tx);
    });

    // Process each security
    const allIsins = new Set([...Object.keys(txByIsin), ...Object.keys(holdingsMap)]);

    allIsins.forEach(isin => {
        // Initialize if needed
        if (!holdingsMap[isin]) {
            // Find currency from first tx or security
            const firstTx = txByIsin[isin]?.[0];
            const sec = securities.find(s => s.isin === isin);
            holdingsMap[isin] = {
                quantity: 0,
                invested: 0,
                investedOriginal: 0,
                realizedPnL: 0,
                isin,
                currency: firstTx?.currency || sec?.currency || 'EUR'
            };
        }
        const h = holdingsMap[isin];
        const sec = securities.find(s => s.isin === isin);

        // Build Timeline: Transactions + Splits
        const events: { date: string, type: 'Tx' | 'Split', data?: Transaction, ratio?: number }[] = [];

        // Add Transactions
        if (txByIsin[isin]) {
            txByIsin[isin].forEach(tx => events.push({ date: tx.date, type: 'Tx', data: tx }));
        }

        // Add Splits from Security
        if (sec && sec.splits) {
            Object.entries(sec.splits).forEach(([date, ratio]) => {
                events.push({ date, type: 'Split', ratio });
            });
        }

        // Sort Events
        events.sort((a, b) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            if (timeA !== timeB) return timeA - timeB;
            // Split before Tx on same day
            if (a.type === 'Split' && b.type !== 'Split') return -1;
            if (a.type !== 'Split' && b.type === 'Split') return 1;
            return 0;
        });

        // Process Timeline
        for (const event of events) {
            if (event.type === 'Split') {
                const ratio = event.ratio || 1;
                if (ratio > 0 && h.quantity > 0) { // Only split if we have shares!
                    h.quantity = h.quantity * ratio;
                }
            } else if (event.type === 'Tx' && event.data) {
                const tx = event.data;
                const shares = Math.abs(tx.shares || 0);
                const amountOriginal = Math.abs(tx.amount);
                const amountBase = convert(amountOriginal, tx.currency, baseCurrency, tx.date);

                if (tx.type === 'Buy') {
                    h.quantity += shares;
                    h.invested += amountBase;
                    h.investedOriginal += amountOriginal;
                } else if (tx.type === 'Sell') {
                    const avgCost = h.quantity > 0 ? h.invested / h.quantity : 0;
                    const costBasis = shares * avgCost;
                    const pnl = amountBase - costBasis;
                    h.realizedPnL += pnl;
                    globalRealizedPnL += pnl;
                    h.invested -= costBasis;
                    h.quantity -= shares;
                    if (h.quantity < 0.000001) { h.quantity = 0; h.invested = 0; h.investedOriginal = 0; }
                }
            }
        }
    });

    const result: Holding[] = [];

    for (const isin in holdingsMap) {
        const h = holdingsMap[isin];
        if (h.quantity <= 0.000001) continue;

        // Resolve Security
        const sec = securities.find(s => s.isin === isin) || { isin, name: isin, currency: h.currency };

        // Current Price in Security Currency (e.g., USD from Yahoo)
        let currentPriceInSecurityCurrency = quotes ? quotes[isin] : 0;

        // Fallback Price if no quote available
        if (!currentPriceInSecurityCurrency) {
            // Estimate from average buy price in transaction currency
            const avgPriceInTransactionCurrency = (h.quantity > 0) ? h.investedOriginal / h.quantity : 0;
            // Convert to security currency if they differ
            const securityCurrency = sec.currency || h.currency;
            currentPriceInSecurityCurrency = convert(avgPriceInTransactionCurrency, h.currency, securityCurrency);
        }

        // Convert current price to transaction currency for display
        // Security might be in USD, but transaction was in EUR
        const securityCurrency = sec.currency || h.currency;
        const currentPriceInTransactionCurrency = convert(
            currentPriceInSecurityCurrency,
            securityCurrency,
            h.currency
        );

        // Convert Current Value to Base Currency
        const valueOriginal = h.quantity * currentPriceInSecurityCurrency;
        const valueBase = convert(valueOriginal, securityCurrency, baseCurrency);

        const invested = h.invested; // Already in Base
        const totalReturn = valueBase - invested;
        const totalReturnPercent = invested > 0 ? (totalReturn / invested) * 100 : 0;

        result.push({
            security: {
                isin: sec.isin,
                name: sec.name,
                quoteType: sec.quoteType,
                sector: sec.sector,
                industry: sec.industry,
                region: sec.region,
                country: sec.country
            },
            quantity: h.quantity,
            averageBuyPrice: invested / h.quantity, // Base
            averageBuyPriceInOriginalCurrency: h.investedOriginal / h.quantity, // Transaction currency
            currentPriceInOriginalCurrency: currentPriceInTransactionCurrency, // Transaction currency
            value: valueBase,
            totalReturn,
            totalReturnPercent,
            currency: h.currency // Transaction currency for display
        });
    }

    return { holdings: result, realizedPnL: globalRealizedPnL };
}

/**
 * Calculate portfolio value history over time
 */
export function calculatePortfolioHistory(
    transactions: Transaction[],
    securities: Security[],
    fxRates: Record<string, CurrencyHistory>,
    baseCurrency: string = 'EUR',
    timeRange: string = '1J',
    granularity: 'daily' | 'weekly' = 'weekly'
): { date: string; value: number; invested: number; dividend: number }[] {

    // Determine date range
    const now = new Date();
    let startDate = new Date();

    // Find earliest transaction for range clamping
    let firstTxDate: Date | null = null;
    if (transactions.length > 0) {
        const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        firstTxDate = new Date(sortedTx[0].date);
    }

    // Pre-calculate splits per ISIN for price adjustment
    const splitsMap: Record<string, { date: Date, ratio: number }[]> = {};
    // Use splits from Securities now
    securities.forEach(sec => {
        if (sec.splits) {
            splitsMap[sec.isin] = Object.entries(sec.splits).map(([d, r]) => ({
                date: new Date(d),
                ratio: r
            }));
        }
    });

    switch (timeRange) {
        case '1M':
            startDate.setMonth(now.getMonth() - 1);
            break;
        case '6M':
            startDate.setMonth(now.getMonth() - 6);
            break;
        case 'YTD':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        case '1J':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        case '3J':
            startDate.setFullYear(now.getFullYear() - 3);
            break;
        case '5J':
            startDate.setFullYear(now.getFullYear() - 5);
            break;
        case 'MAX':
            if (firstTxDate) {
                startDate = new Date(firstTxDate);
            }
            break;
    }

    // Clamp start date to first transaction if we have history
    // matches logic: "Don't show flat line before first investment"
    if (firstTxDate && startDate < firstTxDate) {
        startDate = new Date(firstTxDate);
    }

    // Generate date points
    const datePoints: Date[] = [];
    const current = new Date(startDate);

    // Always include start date
    datePoints.push(new Date(current));

    while (current < now) {
        if (granularity === 'daily') {
            // Add next day
            current.setDate(current.getDate() + 1);
        } else {
            // Add next weekly point
            const nextWeek = new Date(current);
            nextWeek.setDate(current.getDate() + 7);

            // Check month boundary (for nicer charts if weekly)
            if (current.getMonth() !== nextWeek.getMonth() || current.getFullYear() !== nextWeek.getFullYear()) {
                const distinctMonth = new Date(nextWeek.getFullYear(), nextWeek.getMonth(), 1);
                if (distinctMonth <= now && distinctMonth > current) {
                    datePoints.push(distinctMonth);
                }
            }
            current.setDate(current.getDate() + 7);
        }

        if (current <= now) {
            datePoints.push(new Date(current));
        }
    }

    // Ensure last point is exactly 'now' if not already added
    const lastPoint = datePoints[datePoints.length - 1];
    if (lastPoint.getDate() !== now.getDate() || lastPoint.getMonth() !== now.getMonth() || lastPoint.getFullYear() !== now.getFullYear()) {
        datePoints.push(new Date(now));
    }

    // Sort and deduplicate (just in case)
    datePoints.sort((a, b) => a.getTime() - b.getTime());

    // Helper function to get price at a specific date
    const getPriceAtDate = (isin: string, targetDate: Date): number => {
        const sec = securities.find(s => s.isin === isin);
        if (!sec || !sec.priceHistory) return 0;

        const targetTime = targetDate.getTime();
        const dates = Object.keys(sec.priceHistory).sort();

        // Find closest earlier or equal date
        let closestDate = dates[0];
        for (const d of dates) {
            const dTime = new Date(d).getTime();
            if (dTime <= targetTime) {
                closestDate = d;
            } else {
                break;
            }
        }

        return sec.priceHistory[closestDate] || 0;
    };

    // Helper to get Split-Adjusted Price for chart consistency
    // Yahoo prices are already split-adjusted (backwards).
    // Our holdings are point-in-time (not adjusted yet).
    // So if we are in 2021 (pre-split), we have few shares, but price is tiny.
    // We must "Un-adjust" the price by multiplying by all FUTURE split ratios.
    const getAdjustedPriceAtDate = (isin: string, targetDate: Date): number => {
        const rawPrice = getPriceAtDate(isin, targetDate);
        if (rawPrice === 0) return 0;

        const splits = splitsMap[isin];
        if (!splits) return rawPrice;

        // Multiply by all splits that happen AFTER targetDate
        let adjustmentFactor = 1;
        for (const split of splits) {
            if (split.date > targetDate) {
                adjustmentFactor *= split.ratio;
            }
        }

        return rawPrice * adjustmentFactor;
    };

    // Helper to get FX rate at date (reuse logic from calculateHoldings)
    const getEurRate = (currency: string, date?: string): number => {
        if (currency === 'EUR') return 1;
        const history = fxRates[currency];
        if (!history) return 1;

        if (date) {
            const targetDate = new Date(date).getTime();
            const availableDates = Object.keys(history).sort();
            let closestDate = availableDates[0];
            for (const d of availableDates) {
                const dTime = new Date(d).getTime();
                if (dTime <= targetDate) {
                    closestDate = d;
                } else {
                    break;
                }
            }
            return history[closestDate] || 1;
        }

        const dates = Object.keys(history).sort();
        const latest = dates[dates.length - 1];
        return history[latest] || 1;
    };

    const convert = (amount: number, from: string, to: string, date?: string): number => {
        if (from === to) return amount;
        const rateFrom = getEurRate(from, date);
        const amountEur = amount / rateFrom;
        if (to === 'EUR') return amountEur;
        const rateTo = getEurRate(to, date);
        return amountEur * rateTo;
    };

    // Calculate portfolio value at each date point
    // Calculate portfolio value at each date point
    const result: { date: string; value: number; invested: number; dividend: number }[] = [];

    for (const datePoint of datePoints) {
        // Use local date string to avoid timezone shifts (e.g. Jan 1 00:00 becoming Dec 31 23:00)
        const year = datePoint.getFullYear();
        const month = String(datePoint.getMonth() + 1).padStart(2, '0');
        const day = String(datePoint.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Build holdings snapshot at this date
        const holdingsMap: Record<string, {
            quantity: number;
            invested: number;
            currency: string;
            dividend?: number;
        }> = {};

        // Process all transactions up to this date
        // Build timeline for this date snapshot
        // We need to replay history up to 'datePoint'.
        const activeIsins = new Set([...Object.keys(holdingsMap), ...transactions.filter(t => new Date(t.date) <= datePoint && t.isin).map(t => t.isin!)]);

        activeIsins.forEach(isin => {
            if (!holdingsMap[isin]) {
                const firstTx = transactions.find(t => t.isin === isin);
                const sec = securities.find(s => s.isin === isin);
                holdingsMap[isin] = { quantity: 0, invested: 0, currency: firstTx?.currency || sec?.currency || 'EUR' };
            }
            const h = holdingsMap[isin];
            const sec = securities.find(s => s.isin === isin);

            // Events up to datePoint for this ISIN
            // Optimize: This is N^3 effectively. Can be slow.
            // But correct.
            const events: { date: string, type: 'Tx' | 'Split', data?: Transaction, ratio?: number }[] = [];

            // Add Txs
            transactions.filter(t => t.isin === isin && new Date(t.date) <= datePoint).forEach(tx => events.push({ date: tx.date, type: 'Tx', data: tx }));

            // Add Splits
            if (sec && sec.splits) {
                Object.entries(sec.splits).forEach(([d, r]) => {
                    if (new Date(d) <= datePoint) events.push({ date: d, type: 'Split', ratio: r });
                });
            }

            events.sort((a, b) => {
                const timeA = new Date(a.date).getTime();
                const timeB = new Date(b.date).getTime();
                if (timeA !== timeB) return timeA - timeB;
                if (a.type === 'Split' && b.type !== 'Split') return -1;
                if (a.type !== 'Split' && b.type === 'Split') return 1;
                return 0;
            });

            // Replay
            // Note: This replay is inefficient inside the datePoint loop (re-calculating from 0 for every point).
            // But refactoring to incremental calculation is too risky for now.
            h.quantity = 0; h.invested = 0; h.dividend = 0; // Reset state for replay

            for (const event of events) {
                if (event.type === 'Split') {
                    const ratio = event.ratio || 1;
                    if (ratio > 0 && h.quantity > 0) h.quantity *= ratio;
                } else if (event.type === 'Tx' && event.data) {
                    const tx = event.data;
                    if (tx.type === 'Buy') {
                        const shares = Math.abs(tx.shares || 0);
                        const amountBase = convert(Math.abs(tx.amount), tx.currency, baseCurrency, tx.date);
                        h.quantity += shares;
                        h.invested += amountBase;
                    } else if (tx.type === 'Sell') {
                        const shares = Math.abs(tx.shares || 0);
                        const avgCost = h.quantity > 0 ? h.invested / h.quantity : 0;
                        h.invested -= (shares * avgCost);
                        h.quantity -= shares;
                        if (h.quantity < 0.000001) { h.quantity = 0; h.invested = 0; }
                    } else if (tx.type === 'Dividend') {
                        const amountBase = convert(Math.abs(tx.amount), tx.currency, baseCurrency, tx.date);
                        h.dividend = (h.dividend || 0) + amountBase;
                    }
                }
            }
        });

        // Calculate total value at this date
        let totalValue = 0;
        let totalInvested = 0;
        let totalDividend = 0;

        for (const isin in holdingsMap) {
            const h = holdingsMap[isin];

            // Capture dividends for this specific day (reset daily in a real accumulation, 
            // but here we are snapshotting. Wait, calculatePortfolioHistory is cumulative?
            // No, the logic re-runs transaction filter from scratch for EACH datePoint.
            // So `holdingsMap` is rebuilt from zero for each day.
            // This is O(N^2) but fine for now.
            // BUT: 'Dividend' is a one-off event. summing all past dividends into `h.dividend` 
            // implies accumulation. 
            // We need returns for THAT DAY.

            // Correction: For TWR, we need the dividend occurring ON THAT SPECIFIC DAY/PERIOD.
            // My current logic rebuilds state from 0 to DatePoint.
            // If I sum `h.dividend`, I get TOTAL CUMULATIVE dividends up to DatePoint.
            // This is NOT what I want for Daily TWR. I want "Dividend paid TODAY".

            // Actually, `calculatePortfolioHistory` returns a content series.
            // If I return `cumulativeDividend`, I can diff it in `analysisService`?
            // Yes. `dailyDividend = curr.cumulative - prev.cumulative`.
        }

        // Let's stick to the re-calc loop.
        // We will sum all dividends up to this date.
        // Then in analysisService, we take the delta.

        for (const isin in holdingsMap) {
            const h = holdingsMap[isin];
            if (h.dividend) totalDividend += h.dividend;

            if (h.quantity <= 0.000001) continue;

            const sec = securities.find(s => s.isin === isin);
            const securityCurrency = sec?.currency || h.currency;

            // Use ADJUSTED price (un-adjusted for future splits) to match point-in-time holdings
            const price = getAdjustedPriceAtDate(isin, datePoint);

            const valueInSecurityCurrency = h.quantity * price;
            const valueInBaseCurrency = convert(valueInSecurityCurrency, securityCurrency, baseCurrency, dateStr);

            totalValue += valueInBaseCurrency;
            totalInvested += h.invested;
        }

        result.push({
            date: dateStr,
            value: totalValue,
            invested: totalInvested,
            dividend: totalDividend
        });
    }

    return result;
}

/**
 * Portfolio Analysis Metrics
 */
export interface AnalysisMetrics {
    volatility: number; // Annualized volatility %
    sharpeRatio: number;
    maxDrawdown: number; // %
    maxDrawdownDate: string;
    drawdownHistory?: { date: string; value: number }[]; // Full history for underwater chart
    monthlyReturns: { month: string; return: number }[];
    monthlyReturnsMap?: Record<string, number>; // Full history map for navigation
    availableYears?: number[];
}

/**
 * Calculate portfolio analysis metrics
 */
export function calculateAnalysisMetrics(
    historyData: { date: string; value: number; invested: number }[],
    riskFreeRate: number = 0.02 // 2% annual risk-free rate (ECB reference)
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
    const monthStartValues: Record<string, number> = {};
    const months: string[] = []; // Keep order

    for (const point of historyData) {
        const date = new Date(point.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthStartValues[monthKey]) {
            monthStartValues[monthKey] = point.value;
            months.push(monthKey);
        }
    }

    // Calculate return for each month using (Start of Next Month - Start of Current Month) logic
    // This ensures consistency with YTD calculations
    for (let i = 0; i < months.length; i++) {
        const monthKey = months[i];
        const startValue = monthStartValues[monthKey];

        if (startValue <= 0) continue;

        let endValue = 0;

        if (i < months.length - 1) {
            const nextMonthKey = months[i + 1];
            endValue = monthStartValues[nextMonthKey];
        } else {
            endValue = historyData[historyData.length - 1].value;
        }

        const monthReturn = ((endValue - startValue) / startValue) * 100;
        monthlyReturnsMap[monthKey] = monthReturn;
    }

    // 2. Calculate Volatility (annualized)
    let volatility = 0;
    if (dailyReturns.length > 1) {
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
        const dailyVol = Math.sqrt(variance);
        // Annualize (assuming ~252 trading days)
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

    // 4. Calculate Max Drawdown
    let maxDrawdown = 0;
    let maxDrawdownDate = '';
    let peak = historyData[0].value;
    let peakDate = historyData[0].date;

    for (const point of historyData) {
        if (point.value > peak) {
            peak = point.value;
            peakDate = point.date;
        }

        if (peak > 0) {
            const drawdown = ((point.value - peak) / peak) * 100;
            if (drawdown < maxDrawdown) {
                maxDrawdown = drawdown;
                maxDrawdownDate = point.date;
            }
        }
    }

    // 5. Format monthly returns for display (last 12 months)
    const monthlyReturns: { month: string; return: number }[] = [];
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    // Get current year or last year with data
    const lastDate = new Date(historyData[historyData.length - 1].date);
    const year = lastDate.getFullYear();

    for (let month = 0; month < 12; month++) {
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        const returnValue = monthlyReturnsMap[monthKey] || 0;

        monthlyReturns.push({
            month: monthNames[month],
            return: Math.round(returnValue * 10) / 10 // Round to 1 decimal
        });
    }

    return {
        volatility: Math.round(volatility * 10) / 10,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 10) / 10,
        maxDrawdownDate,
        monthlyReturns
    };
}
