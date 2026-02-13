import { Transaction, Security, CurrencyHistory, CashAccount } from '../types/domain';

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

const isBuyType = (type: Transaction['type']) => {
    return type === 'Buy' || type === 'Sparplan_Buy';
};

const getAbsoluteAmount = (amount: number | undefined) => {
    return Math.abs(amount || 0);
};

const getCashDeltaForTransaction = (tx: Transaction): number => {
    const amount = getAbsoluteAmount(tx.amount);

    // Only explicit cash-related transactions should affect cash balance.
    if (tx.type === 'Fee' || tx.type === 'Tax' || tx.type === 'Withdrawal') {
        return -amount;
    }

    if (tx.type === 'Dividend' || tx.type === 'Deposit') {
        return amount;
    }

    return 0;
};

const buildSplitIgnoreDates = (
    txByIsin: Record<string, Transaction[]>,
    splitsByIsin: Record<string, Record<string, number>>
) => {
    const ignoreMap: Record<string, Set<string>> = {};

    Object.entries(splitsByIsin).forEach(([isin, splits]) => {
        const txs = txByIsin[isin] || [];
        if (txs.length === 0) return;

        const byDate = new Map<string, Transaction[]>();
        txs.forEach(tx => {
            if (!tx.date) return;
            const list = byDate.get(tx.date) || [];
            list.push(tx);
            byDate.set(tx.date, list);
        });

        Object.entries(splits).forEach(([date, ratio]) => {
            const list = byDate.get(date) || [];
            if (list.length === 0) return;

            const buys = list.filter(tx => isBuyType(tx.type));
            const sells = list.filter(tx => tx.type === 'Sell');
            if (buys.length === 0 || sells.length === 0) return;

            let hasSplitLike = false;

            for (const buy of buys) {
                const buyShares = Math.abs(buy.shares || 0);
                const buyAmount = Math.abs(buy.amount || 0);
                if (!buyShares) continue;
                for (const sell of sells) {
                    const sellShares = Math.abs(sell.shares || 0);
                    const sellAmount = Math.abs(sell.amount || 0);
                    if (!sellShares) continue;

                    const shareRatio = buyShares > sellShares ? (buyShares / sellShares) : (sellShares / buyShares);
                    const ratioTolerance = Math.max(0.05, ratio * 0.05);
                    if (Math.abs(shareRatio - ratio) > ratioTolerance) continue;

                    const amountDiff = Math.abs(buyAmount - sellAmount);
                    const amountTolerance = Math.max(1, Math.max(buyAmount, sellAmount) * 0.02);
                    if (amountDiff <= amountTolerance) {
                        hasSplitLike = true;
                        break;
                    }
                }
                if (hasSplitLike) break;
            }

            if (hasSplitLike) {
                if (!ignoreMap[isin]) ignoreMap[isin] = new Set<string>();
                ignoreMap[isin].add(date);
            }
        });
    });

    return ignoreMap;
};

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

    const splitsByIsin: Record<string, Record<string, number>> = {};
    securities.forEach(sec => {
        if (sec.splits) {
            splitsByIsin[sec.isin] = sec.splits;
        }
    });
    const splitIgnoreDates = buildSplitIgnoreDates(txByIsin, splitsByIsin);

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

        // Add Splits from Security (skip split days already represented in transactions)
        if (sec && sec.splits) {
            const ignoredDates = splitIgnoreDates[isin];
            Object.entries(sec.splits).forEach(([date, ratio]) => {
                if (ignoredDates && ignoredDates.has(date)) return;
                events.push({ date, type: 'Split', ratio });
            });
        }

        // Sort Events (same-day order: Split -> Buy -> Sell)
        const txOrder = (event: { type: 'Tx' | 'Split'; data?: Transaction }) => {
            if (event.type === 'Split') return 0;
            const tx = event.data;
            if (tx && isBuyType(tx.type)) return 1;
            if (tx && tx.type === 'Sell') return 2;
            return 3;
        };

        events.sort((a, b) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return txOrder(a) - txOrder(b);
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

                if (isBuyType(tx.type)) {
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
    cashAccounts: CashAccount[] = [],
    baseCurrency: string = 'EUR',
    timeRange: string = '1J',
    granularity: 'daily' | 'weekly' = 'weekly'
): { date: string; value: number; invested: number; dividend: number }[] {

    const dateKeyToUtcMs = (dateStr: string): number => {
        const parts = dateStr.split('-').map(Number);
        if (parts.length === 3 && parts.every(p => Number.isFinite(p))) {
            return Date.UTC(parts[0], parts[1] - 1, parts[2]);
        }
        return new Date(dateStr).getTime();
    };

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
    const splitsMap: Record<string, { time: number; ratio: number; date: string }[]> = {};
    const splitsByIsin: Record<string, Record<string, number>> = {};
    // Use splits from Securities now (filtered later once we know split-like days)
    securities.forEach(sec => {
        if (sec.splits) {
            splitsByIsin[sec.isin] = sec.splits;
            splitsMap[sec.isin] = Object.entries(sec.splits).map(([d, r]) => ({
                time: dateKeyToUtcMs(d),
                ratio: r,
                date: d
            }));
        }
    });
    const securityByIsin: Record<string, Security> = {};
    securities.forEach(sec => {
        securityByIsin[sec.isin] = sec;
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

    const priceTimelineCache: Record<string, { dates: string[]; times: number[]; idx: number }> = {};
    const fxTimelineCache: Record<string, { dates: string[]; times: number[]; idx: number }> = {};
    const cashTimelineCache: Record<string, { dates: string[]; times: number[]; idx: number }> = {};

    // Helper function to get price at a specific date
    const getPriceAtTime = (isin: string, targetTime: number): number => {
        const sec = securityByIsin[isin];
        if (!sec || !sec.priceHistory) return 0;

        let timeline = priceTimelineCache[isin];
        if (!timeline) {
            const dates = Object.keys(sec.priceHistory).sort();
            const times = dates.map(d => dateKeyToUtcMs(d));
            timeline = { dates, times, idx: 0 };
            priceTimelineCache[isin] = timeline;
        }

        // Find closest earlier or equal date
        if (timeline.dates.length === 0) return 0;
        while (timeline.idx + 1 < timeline.times.length && timeline.times[timeline.idx + 1] <= targetTime) {
            timeline.idx++;
        }

        return sec.priceHistory[timeline.dates[timeline.idx]] || 0;
    };

    // Helper to get Split-Adjusted Price for chart consistency
    // Yahoo prices are already split-adjusted (backwards).
    // Our holdings are point-in-time (not adjusted yet).
    // So if we are in 2021 (pre-split), we have few shares, but price is tiny.
    // We must "Un-adjust" the price by multiplying by all FUTURE split ratios.
    const getAdjustedPriceAtTime = (isin: string, targetTime: number): number => {
        const rawPrice = getPriceAtTime(isin, targetTime);
        if (rawPrice === 0) return 0;

        const splits = splitsMap[isin];
        if (!splits) return rawPrice;

        // Multiply by all splits that happen AFTER targetDate
        let adjustmentFactor = 1;
        for (const split of splits) {
            if (split.time > targetTime) {
                adjustmentFactor *= split.ratio;
            }
        }

        return rawPrice * adjustmentFactor;
    };

    // Helper to get FX rate at date (reuse logic from calculateHoldings)
    const getEurRateAtTime = (currency: string, targetTime?: number): number => {
        if (currency === 'EUR') return 1;
        const history = fxRates[currency];
        if (!history) return 1;

        let timeline = fxTimelineCache[currency];
        if (!timeline) {
            const dates = Object.keys(history).sort();
            const times = dates.map(d => dateKeyToUtcMs(d));
            timeline = { dates, times, idx: 0 };
            fxTimelineCache[currency] = timeline;
        }

        if (timeline.dates.length === 0) return 1;

        if (targetTime !== undefined) {
            while (timeline.idx + 1 < timeline.times.length && timeline.times[timeline.idx + 1] <= targetTime) {
                timeline.idx++;
            }
            return history[timeline.dates[timeline.idx]] || 1;
        }

        return history[timeline.dates[timeline.dates.length - 1]] || 1;
    };

    const convert = (amount: number, from: string, to: string, targetTime?: number): number => {
        if (from === to) return amount;
        const rateFrom = getEurRateAtTime(from, targetTime);
        const amountEur = amount / rateFrom;
        if (to === 'EUR') return amountEur;
        const rateTo = getEurRateAtTime(to, targetTime);
        return amountEur * rateTo;
    };

    const getCashAccountBalanceAtTime = (account: CashAccount, targetTime: number): number => {
        if (!account.balanceHistory) return 0;
        const cacheKey = account.id;

        let timeline = cashTimelineCache[cacheKey];
        if (!timeline) {
            const dates = Object.keys(account.balanceHistory).sort();
            const times = dates.map(d => dateKeyToUtcMs(d));
            timeline = { dates, times, idx: 0 };
            cashTimelineCache[cacheKey] = timeline;
        }

        if (timeline.dates.length === 0) return 0;
        if (timeline.times[0] > targetTime) return 0;

        while (timeline.idx + 1 < timeline.times.length && timeline.times[timeline.idx + 1] <= targetTime) {
            timeline.idx++;
        }

        return account.balanceHistory[timeline.dates[timeline.idx]] || 0;
    };

    // Prepare events per ISIN (transactions + splits) once for incremental replay
    const txByIsin: Record<string, Transaction[]> = {};
    transactions.forEach(tx => {
        if (!tx.isin) return;
        if (!txByIsin[tx.isin]) txByIsin[tx.isin] = [];
        txByIsin[tx.isin].push(tx);
    });
    Object.values(txByIsin).forEach(list => {
        list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });

    const splitIgnoreDates = buildSplitIgnoreDates(txByIsin, splitsByIsin);
    Object.keys(splitsMap).forEach((isin) => {
        const ignoredDates = splitIgnoreDates[isin];
        if (!ignoredDates) return;
        splitsMap[isin] = splitsMap[isin].filter(split => !ignoredDates.has(split.date));
    });

    const eventsByIsin: Record<string, { time: number; date: string; type: 'Tx' | 'Split'; data?: Transaction; ratio?: number }[]> = {};
    const allIsins = new Set<string>([
        ...Object.keys(txByIsin),
        ...Object.keys(splitsMap)
    ]);

    allIsins.forEach(isin => {
        const events: { time: number; date: string; type: 'Tx' | 'Split'; data?: Transaction; ratio?: number }[] = [];

        const txs = txByIsin[isin] || [];
        txs.forEach(tx => {
            events.push({ time: dateKeyToUtcMs(tx.date), date: tx.date, type: 'Tx', data: tx });
        });

        const splits = splitsMap[isin];
        if (splits) {
            splits.forEach(split => {
                const splitDate = new Date(split.time);
                events.push({ time: split.time, date: splitDate.toISOString().split('T')[0], type: 'Split', ratio: split.ratio });
            });
        }

        const txOrder = (event: { type: 'Tx' | 'Split'; data?: Transaction }) => {
            if (event.type === 'Split') return 0;
            const tx = event.data;
            if (tx && isBuyType(tx.type)) return 1;
            if (tx && tx.type === 'Sell') return 2;
            return 3;
        };

        events.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return txOrder(a) - txOrder(b);
        });

        eventsByIsin[isin] = events;
    });

    const stateByIsin: Record<string, { quantity: number; invested: number; currency: string }> = {};
    const eventIndexByIsin: Record<string, number> = {};
    const sortedTransactions = [...transactions].sort((a, b) => dateKeyToUtcMs(a.date) - dateKeyToUtcMs(b.date));
    const hasExplicitCashBalances = cashAccounts.some(a => !!a.balanceHistory && Object.keys(a.balanceHistory).length > 0);
    const hasCashFundingTransactions = transactions.some((tx) => tx.type === 'Deposit' || tx.type === 'Withdrawal');
    const useImplicitFunding = !hasExplicitCashBalances;
    const useTradeFlowsForInvested = !hasExplicitCashBalances && !hasCashFundingTransactions;

    allIsins.forEach(isin => {
        const firstTx = txByIsin[isin]?.[0];
        const sec = securityByIsin[isin];
        stateByIsin[isin] = {
            quantity: 0,
            invested: 0,
            currency: firstTx?.currency || sec?.currency || 'EUR'
        };
        eventIndexByIsin[isin] = 0;
    });

    const cashByCurrency: Record<string, number> = {};
    let transactionIndex = 0;
    let totalExternalInvested = 0;
    let totalTradeInvested = 0;
    let totalDividend = 0;

    // Calculate portfolio value at each date point (incremental replay)
    const result: { date: string; value: number; invested: number; dividend: number }[] = [];

    for (const datePoint of datePoints) {
        // Use local date string to avoid timezone shifts (e.g. Jan 1 00:00 becoming Dec 31 23:00)
        const year = datePoint.getFullYear();
        const month = String(datePoint.getMonth() + 1).padStart(2, '0');
        const day = String(datePoint.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const dateTime = dateKeyToUtcMs(dateStr);

        // Apply events up to this date
        allIsins.forEach(isin => {
            const events = eventsByIsin[isin];
            if (!events || events.length === 0) return;
            const h = stateByIsin[isin];
            let idx = eventIndexByIsin[isin] || 0;

            while (idx < events.length && events[idx].time <= dateTime) {
                const event = events[idx];
                if (event.type === 'Split') {
                    const ratio = event.ratio || 1;
                    if (ratio > 0 && h.quantity > 0) h.quantity *= ratio;
                } else if (event.type === 'Tx' && event.data) {
                    const tx = event.data;
                    if (isBuyType(tx.type)) {
                        const shares = Math.abs(tx.shares || 0);
                        const amountBase = convert(Math.abs(tx.amount), tx.currency, baseCurrency, event.time);
                        h.quantity += shares;
                        h.invested += amountBase;
                    } else if (tx.type === 'Sell') {
                        const shares = Math.abs(tx.shares || 0);
                        const avgCost = h.quantity > 0 ? h.invested / h.quantity : 0;
                        h.invested -= (shares * avgCost);
                        h.quantity -= shares;
                        if (h.quantity < 0.000001) { h.quantity = 0; h.invested = 0; }
                    }
                }
                idx++;
            }

            eventIndexByIsin[isin] = idx;
        });

        while (transactionIndex < sortedTransactions.length && dateKeyToUtcMs(sortedTransactions[transactionIndex].date) <= dateTime) {
            const tx = sortedTransactions[transactionIndex];
            const txCurrency = tx.currency || baseCurrency;
            const txTime = dateKeyToUtcMs(tx.date);
            const amountAbs = getAbsoluteAmount(tx.amount);

            if (!hasExplicitCashBalances) {
                const cashDelta = getCashDeltaForTransaction(tx);
                const currentCash = cashByCurrency[txCurrency] || 0;

                // Backward-compatibility: infer required funding when transaction replay would drive
                // cash negative and no explicit cash balance history is available.
                if (useImplicitFunding && cashDelta < 0 && currentCash + cashDelta < 0) {
                    const requiredFunding = -(currentCash + cashDelta);
                    cashByCurrency[txCurrency] = currentCash + requiredFunding;
                    totalExternalInvested += convert(requiredFunding, txCurrency, baseCurrency, txTime);
                }

                cashByCurrency[txCurrency] = (cashByCurrency[txCurrency] || 0) + cashDelta;
            }

            if (useTradeFlowsForInvested) {
                if (isBuyType(tx.type)) {
                    totalTradeInvested += convert(amountAbs, txCurrency, baseCurrency, txTime);
                } else if (tx.type === 'Sell') {
                    totalTradeInvested -= convert(amountAbs, txCurrency, baseCurrency, txTime);
                }
            }

            if (tx.type === 'Deposit') {
                totalExternalInvested += convert(amountAbs, txCurrency, baseCurrency, txTime);
            } else if (tx.type === 'Withdrawal') {
                totalExternalInvested -= convert(amountAbs, txCurrency, baseCurrency, txTime);
            } else if (tx.type === 'Dividend') {
                totalDividend += convert(amountAbs, txCurrency, baseCurrency, txTime);
            }

            transactionIndex++;
        }

        // Calculate totals at this date
        let totalValue = 0;

        allIsins.forEach(isin => {
            const h = stateByIsin[isin];
            if (h.quantity <= 0.000001) return;

            const sec = securityByIsin[isin];
            const securityCurrency = sec?.currency || h.currency;

            // Use ADJUSTED price (un-adjusted for future splits) to match point-in-time holdings
            const price = getAdjustedPriceAtTime(isin, dateTime);
            const valueInSecurityCurrency = h.quantity * price;
            const valueInBaseCurrency = convert(valueInSecurityCurrency, securityCurrency, baseCurrency, dateTime);

            totalValue += valueInBaseCurrency;
        });

        let totalCashValue = 0;

        if (hasExplicitCashBalances) {
            totalCashValue = cashAccounts.reduce((sum, account) => {
                const balance = getCashAccountBalanceAtTime(account, dateTime);
                if (Math.abs(balance) < 0.0000001) return sum;
                return sum + convert(balance, account.currency, baseCurrency, dateTime);
            }, 0);
        } else {
            totalCashValue = Object.entries(cashByCurrency).reduce((sum, [currency, amount]) => {
                if (Math.abs(amount) < 0.0000001) return sum;
                return sum + convert(amount, currency, baseCurrency, dateTime);
            }, 0);
        }

        const investedValue = useTradeFlowsForInvested ? totalTradeInvested : totalExternalInvested;

        result.push({
            date: dateStr,
            value: totalValue + totalCashValue,
            invested: investedValue,
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
    twrSeries?: { date: string; value: number }[]; // Full TWR series (source of truth)
    monthlyReturns: { month: string; return: number }[];
    monthlyReturnsMap?: Record<string, number>; // Full history map for navigation
    availableYears?: number[];
}

/**
 * Calculate Time-Weighted Return (TWR) Series
 * Used for charts to show pure performance over time, filtering out cashflows.
 */
export function calculateTWRSeries(
    historyData: { date: string; value: number; invested: number; dividend?: number }[],
    includeDividends: boolean = false
): { date: string; value: number }[] {
    if (!historyData || historyData.length === 0) return [];

    const result: { date: string; value: number }[] = [];
    const getValue = (point: { value: number; dividend?: number }) =>
        point.value + (includeDividends ? (point.dividend || 0) : 0);

    // Start baseline
    result.push({ date: historyData[0].date, value: 0 });

    let index = 1.0;

    for (let i = 1; i < historyData.length; i++) {
        const prev = historyData[i - 1];
        const curr = historyData[i];

        // Cashflow Detection
        const prevInvested = prev.invested || 0;
        const currInvested = curr.invested || 0;
        const cashFlow = currInvested - prevInvested;

        // TWR Formula: (End - (Start + CF)) / (Start + CF)
        // Check for edge case: Start + CF = 0
        const prevValue = getValue(prev);
        const currValue = getValue(curr);
        const denominator = prevValue + cashFlow;

        let periodicReturn = 0;
        if (denominator !== 0) {
            periodicReturn = (currValue - denominator) / denominator; // Raw scalar (e.g. 0.01 for 1%)
        }

        // Chain the return
        index *= (1 + periodicReturn);

        // Store percentage ((1.05 -> 5%))
        result.push({
            date: curr.date,
            value: (index - 1) * 100
        });
    }

    return result;
}

