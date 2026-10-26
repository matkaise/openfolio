import { applyToCash, createCashState, sortForCash } from './cashModel';
import { Transaction, Security, CurrencyHistory, CashAccount } from '../types/domain';
import { getFxTable } from './domain/fx/rates';
import { getRangeStartDate } from './dateUtils';

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
    fxMissing?: boolean; // A needed exchange rate is missing; value/return exclude the unconvertible part
}

const isBuyType = (type: Transaction['type']) => {
    return type === 'Buy' || type === 'Sparplan_Buy';
};

/**
 * Fees of a trade as a positive cost (fees are stored negative = cost). Kept in the
 * fee currency, which defaults to the trade currency.
 */
export const getTradeFeeCost = (tx: Transaction): { cost: number; currency: string } => ({
    cost: -((tx.fee || 0) + (tx.fxFee || 0)),
    currency: tx.feeCurrency || tx.currency
});

export const buildSplitIgnoreDates = (
    txByIsin: Record<string, Transaction[]>,
    splitsByIsin: Record<string, Record<string, number>>,
    securitiesByIsin?: Record<string, Security>
) => {
    const ignoreMap: Record<string, Set<string>> = {};

    const normalizeKey = (value?: string) => {
        if (!value) return '';
        return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    };

    const symbolToIsins: Record<string, string[]> = {};
    const nameToIsins: Record<string, string[]> = {};

    if (securitiesByIsin) {
        Object.entries(securitiesByIsin).forEach(([isin, sec]) => {
            const symbolKey = normalizeKey(sec.symbol);
            const nameKey = normalizeKey(sec.name);
            if (symbolKey) {
                if (!symbolToIsins[symbolKey]) symbolToIsins[symbolKey] = [];
                symbolToIsins[symbolKey].push(isin);
            }
            if (nameKey) {
                if (!nameToIsins[nameKey]) nameToIsins[nameKey] = [];
                nameToIsins[nameKey].push(isin);
            }
        });
    }

    const txSummaryByIsin: Record<string, Record<string, { buyShares: number; sellShares: number; buyAmount: number; sellAmount: number }>> = {};
    Object.entries(txByIsin).forEach(([isin, txs]) => {
        txs.forEach(tx => {
            if (!tx.date) return;
            if (!isBuyType(tx.type) && tx.type !== 'Sell') return;
            const shares = Math.abs(tx.shares || 0);
            const amount = Math.abs(tx.amount || 0);
            if (!txSummaryByIsin[isin]) txSummaryByIsin[isin] = {};
            if (!txSummaryByIsin[isin][tx.date]) {
                txSummaryByIsin[isin][tx.date] = { buyShares: 0, sellShares: 0, buyAmount: 0, sellAmount: 0 };
            }
            const summary = txSummaryByIsin[isin][tx.date];
            if (isBuyType(tx.type)) {
                summary.buyShares += shares;
                summary.buyAmount += amount;
            } else if (tx.type === 'Sell') {
                summary.sellShares += shares;
                summary.sellAmount += amount;
            }
        });
    });

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
            if (buys.length > 0 && sells.length > 0) {
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
                    return;
                }
            }

            if (!securitiesByIsin) return;

            const baseSummary = txSummaryByIsin[isin]?.[date];
            if (!baseSummary || baseSummary.sellShares <= 0) return;

            const sec = securitiesByIsin[isin];
            if (!sec) return;
            const symbolKey = normalizeKey(sec.symbol);
            const nameKey = normalizeKey(sec.name);

            const candidateIsins = new Set<string>();
            if (symbolKey && symbolToIsins[symbolKey]) {
                symbolToIsins[symbolKey].forEach(id => candidateIsins.add(id));
            }
            if (nameKey && nameToIsins[nameKey]) {
                nameToIsins[nameKey].forEach(id => candidateIsins.add(id));
            }
            candidateIsins.delete(isin);

            for (const candidate of candidateIsins) {
                const otherSummary = txSummaryByIsin[candidate]?.[date];
                if (!otherSummary || otherSummary.buyShares <= 0) continue;

                const shareRatio = otherSummary.buyShares > baseSummary.sellShares
                    ? (otherSummary.buyShares / baseSummary.sellShares)
                    : (baseSummary.sellShares / otherSummary.buyShares);
                const ratioTolerance = Math.max(0.05, ratio * 0.05);
                if (Math.abs(shareRatio - ratio) > ratioTolerance) continue;

                const baseAmount = baseSummary.sellAmount;
                const otherAmount = otherSummary.buyAmount;
                if (baseAmount > 0 && otherAmount > 0) {
                    const amountDiff = Math.abs(baseAmount - otherAmount);
                    const amountTolerance = Math.max(1, Math.max(baseAmount, otherAmount) * 0.02);
                    if (amountDiff > amountTolerance) continue;
                }

                if (!ignoreMap[isin]) ignoreMap[isin] = new Set<string>();
                ignoreMap[isin].add(date);
                break;
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

    const normalizeCurrency = (value: string | undefined): string | undefined => {
        if (!value) return undefined;
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
    };

    // One position per ISIN, whatever the trading currency (buying in USD on Nasdaq and
    // selling in EUR on Xetra is the same position). Cost basis is kept in the base currency;
    // the display currency is the security's own currency.
    const holdingsMap: Record<string, {
        quantity: number;
        invested: number; // cost basis in base currency
        investedInDisplayCurrency: number; // cost basis in the display currency (for avg. price)
        realizedPnL: number;
        isin: string;
        currency: string; // display currency
    }> = {};

    // A missing rate converts to 0 instead of silently using 1; the holding is flagged.
    const fx = getFxTable(fxRates);
    let missingFxForCurrentHolding = false;
    const convert = (amount: number, from: string, to: string, date?: string): number => {
        const converted = fx.convert(amount, from, to, date);
        if (converted === null) {
            missingFxForCurrentHolding = true;
            return 0;
        }
        return converted;
    };

    let globalRealizedPnL = 0;
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const txByIsin: Record<string, Transaction[]> = {};
    sortedTx.forEach(tx => {
        if (!tx.isin) return;
        if (!txByIsin[tx.isin]) txByIsin[tx.isin] = [];
        txByIsin[tx.isin].push(tx);
    });

    const securityByIsin: Record<string, Security> = {};
    const splitsByIsin: Record<string, Record<string, number>> = {};
    securities.forEach(sec => {
        securityByIsin[sec.isin] = sec;
        if (sec.splits) {
            splitsByIsin[sec.isin] = sec.splits;
        }
    });
    const splitIgnoreDates = buildSplitIgnoreDates(txByIsin, splitsByIsin, securityByIsin);

    const tradePrice = (tx: Transaction): number => {
        const shares = Math.abs(tx.shares || 0);
        if (!shares) return 0;
        const maybePrice = tx.originalData && typeof tx.originalData === 'object'
            ? (tx.originalData as { pricePerShare?: number }).pricePerShare
            : undefined;
        if (typeof maybePrice === 'number' && Number.isFinite(maybePrice) && maybePrice > 0) return maybePrice;
        const price = Math.abs(tx.amount || 0) / shares;
        return Number.isFinite(price) && price > 0 ? price : 0;
    };

    const fxMissingByIsin: Record<string, boolean> = {};
    const fallbackPriceByIsin: Record<string, number> = {};

    Object.entries(txByIsin).forEach(([isin, txs]) => {
        missingFxForCurrentHolding = false;
        const sec = securityByIsin[isin];
        const firstTradeCurrency = txs.find(tx => isBuyType(tx.type) || tx.type === 'Sell')?.currency;
        const displayCurrency = normalizeCurrency(sec?.currency) || normalizeCurrency(firstTradeCurrency) || baseCurrency;
        const h = {
            quantity: 0,
            invested: 0,
            investedInDisplayCurrency: 0,
            realizedPnL: 0,
            isin,
            currency: displayCurrency
        };
        holdingsMap[isin] = h;

        // Build Timeline: Transactions + Splits
        const events: { date: string, type: 'Tx' | 'Split', data?: Transaction, ratio?: number }[] = [];
        txs.forEach(tx => events.push({ date: tx.date, type: 'Tx', data: tx }));

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

        for (const event of events) {
            if (event.type === 'Split') {
                const ratio = event.ratio || 1;
                if (ratio > 0 && h.quantity > 0) { // Only split if we have shares!
                    h.quantity = h.quantity * ratio;
                }
            } else if (event.type === 'Tx' && event.data) {
                const tx = event.data;
                if (!isBuyType(tx.type) && tx.type !== 'Sell') continue;

                const shares = Math.abs(tx.shares || 0);
                const amountOriginal = Math.abs(tx.amount);
                const txCurrency = normalizeCurrency(tx.currency) || displayCurrency;
                const amountBase = convert(amountOriginal, txCurrency, baseCurrency, tx.date);
                const fees = getTradeFeeCost(tx);
                const feesBase = fees.cost ? convert(fees.cost, fees.currency, baseCurrency, tx.date) : 0;

                const price = tradePrice(tx);
                if (price) fallbackPriceByIsin[isin] = convert(price, txCurrency, displayCurrency, tx.date);

                if (isBuyType(tx.type)) {
                    h.quantity += shares;
                    h.invested += amountBase + feesBase;
                    h.investedInDisplayCurrency += convert(amountOriginal, txCurrency, displayCurrency, tx.date)
                        + (fees.cost ? convert(fees.cost, fees.currency, displayCurrency, tx.date) : 0);
                } else {
                    const share = h.quantity > 0 ? Math.min(1, shares / h.quantity) : 0;
                    const costBasis = h.invested * share;
                    const pnl = amountBase - feesBase - costBasis;
                    h.realizedPnL += pnl;
                    globalRealizedPnL += pnl;
                    h.invested -= costBasis;
                    h.investedInDisplayCurrency -= h.investedInDisplayCurrency * share;
                    h.quantity -= shares;
                    if (h.quantity < 0.000001) { h.quantity = 0; h.invested = 0; h.investedInDisplayCurrency = 0; }
                }
            }
        }
        fxMissingByIsin[isin] = missingFxForCurrentHolding;
    });

    const result: Holding[] = [];

    for (const isin in holdingsMap) {
        const h = holdingsMap[isin];
        if (h.quantity <= 0.000001) continue;
        missingFxForCurrentHolding = fxMissingByIsin[isin] || false;

        const sec = securityByIsin[isin] || { isin, name: isin, currency: h.currency };

        // Current price in the security currency (= display currency), e.g. USD from Yahoo
        let currentPrice = quotes ? quotes[isin] : 0;
        if (!currentPrice) {
            // No quote: last trade price, else the average buy price
            currentPrice = fallbackPriceByIsin[isin] || (h.quantity > 0 ? h.investedInDisplayCurrency / h.quantity : 0);
        }

        const valueBase = convert(h.quantity * currentPrice, h.currency, baseCurrency);
        const invested = h.invested;
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
            averageBuyPriceInOriginalCurrency: h.investedInDisplayCurrency / h.quantity, // Security currency
            currentPriceInOriginalCurrency: currentPrice, // Security currency
            value: valueBase,
            totalReturn,
            totalReturnPercent,
            currency: h.currency, // Security currency for display
            ...(missingFxForCurrentHolding ? { fxMissing: true } : {})
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

    const rangeStart = getRangeStartDate(timeRange, now);
    if (rangeStart) {
        startDate = rangeStart;
    } else if (timeRange === 'MAX' && firstTxDate) {
        startDate = new Date(firstTxDate);
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
    const txPriceTimelineCache: Record<string, { dates: string[]; times: number[]; prices: number[]; idx: number }> = {};
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
        if (targetTime < timeline.times[0]) return 0;
        while (timeline.idx + 1 < timeline.times.length && timeline.times[timeline.idx + 1] <= targetTime) {
            timeline.idx++;
        }

        return sec.priceHistory[timeline.dates[timeline.idx]] || 0;
    };

    const getTxPriceAtTime = (
        isin: string,
        targetTime: number
    ): { price: number; currency: string; date: string; time: number } | null => {
        let timeline = txPriceTimelineCache[isin];
        if (!timeline) {
            const txs = txByIsin[isin] || [];
            const dates: string[] = [];
            const times: number[] = [];
            const prices: number[] = [];
            const securityCurrency = securityByIsin[isin]?.currency || baseCurrency;

            txs.forEach(tx => {
                const shares = Math.abs(tx.shares || 0);
                if (!shares) return;
                const priceFromOriginal = (tx.originalData as { pricePerShare?: number } | undefined)?.pricePerShare;
                let price = priceFromOriginal && priceFromOriginal > 0 ? priceFromOriginal : 0;
                if (!price) {
                    const amountAbs = Math.abs(tx.amount || 0);
                    if (amountAbs > 0) {
                        price = amountAbs / shares;
                    }
                }
                if (!price) return;
                const txTime = dateKeyToUtcMs(tx.date);
                const priceInSecurityCurrency = convert(
                    price,
                    tx.currency || baseCurrency,
                    securityCurrency,
                    txTime
                );
                if (!Number.isFinite(priceInSecurityCurrency) || priceInSecurityCurrency <= 0) return;
                dates.push(tx.date);
                times.push(txTime);
                prices.push(priceInSecurityCurrency);
            });

            timeline = { dates, times, prices, idx: 0 };
            txPriceTimelineCache[isin] = timeline;
        }

        if (timeline.dates.length === 0) return null;
        if (targetTime < timeline.times[0]) return null;
        while (timeline.idx + 1 < timeline.times.length && timeline.times[timeline.idx + 1] <= targetTime) {
            timeline.idx++;
        }

        let price = timeline.prices[timeline.idx];
        let date = timeline.dates[timeline.idx];
        let time = timeline.times[timeline.idx];

        if (timeline.idx + 1 < timeline.times.length) {
            const nextTime = timeline.times[timeline.idx + 1];
            const nextPrice = timeline.prices[timeline.idx + 1];
            if (nextTime > time) {
                const ratio = (targetTime - time) / (nextTime - time);
                price = price + (nextPrice - price) * ratio;
                if (!Number.isFinite(price) || price <= 0) {
                    price = timeline.prices[timeline.idx];
                }
                date = timeline.dates[timeline.idx];
                time = timeline.times[timeline.idx];
            }
        }

        return {
            price,
            currency: securityByIsin[isin]?.currency || baseCurrency,
            date,
            time
        };
    };

    // Helper to get Split-Adjusted Price for chart consistency
    // Yahoo prices are already split-adjusted (backwards).
    // Our holdings are point-in-time (not adjusted yet).
    // So if we are in 2021 (pre-split), we have few shares, but price is tiny.
    // We must "Un-adjust" the price by multiplying by all FUTURE split ratios.
    const getAdjustedPriceAtTime = (isin: string, targetTime: number): number => {
        const rawPrice = getPriceAtTime(isin, targetTime);
        const splits = splitsMap[isin];

        if (rawPrice === 0) {
            const fallback = getTxPriceAtTime(isin, targetTime);
            if (!fallback || !fallback.price) return 0;

            const securityCurrency = securityByIsin[isin]?.currency || fallback.currency;
            let fallbackPrice = convert(fallback.price, fallback.currency, securityCurrency, fallback.time);

            if (splits && splits.length > 0) {
                const fallbackDate = fallback.date;
                let adjustment = 1;
                for (const split of splits) {
                    if (split.date > fallbackDate && split.time <= targetTime) {
                        adjustment *= split.ratio;
                    }
                }
                if (adjustment > 0) {
                    fallbackPrice = fallbackPrice / adjustment;
                }
            }

            return fallbackPrice;
        }

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

    // Stateless lookups: trade prices are converted at their own (older) dates while the
    // chart walks forward, so a forward-only cursor would return later rates (B9).
    const fx = getFxTable(fxRates);
    const convert = (amount: number, from: string, to: string, targetTime?: number): number => (
        fx.convert(amount, from, to, targetTime) ?? 0
    );

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

    const splitIgnoreDates = buildSplitIgnoreDates(txByIsin, splitsByIsin, securityByIsin);
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
    const sortedTransactions = sortForCash(transactions);
    // Imported account statements give the cash; otherwise it is derived from the bookings
    // (sale proceeds stay cash until the next buy, see cashModel.ts).
    const hasExplicitCashBalances = cashAccounts.some(a => !!a.balanceHistory && Object.keys(a.balanceHistory).length > 0);
    const derivedCash = createCashState(baseCurrency);
    const toBase = (amount: number, currency: string, date: string) => convert(amount, currency, baseCurrency, dateKeyToUtcMs(date));

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

    let transactionIndex = 0;
    let totalExternalInvested = 0;
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
                        const fees = getTradeFeeCost(tx);
                        const amountBase = convert(Math.abs(tx.amount), tx.currency, baseCurrency, event.time)
                            + (fees.cost ? convert(fees.cost, fees.currency, baseCurrency, event.time) : 0);
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

            if (!hasExplicitCashBalances) applyToCash(derivedCash, tx, toBase);

            // Signed amounts: a withdrawal is negative, a dividend reversal reduces the total.
            if (tx.type === 'Deposit' || tx.type === 'Withdrawal') {
                totalExternalInvested += convert(tx.amount || 0, txCurrency, baseCurrency, txTime);
            } else if (tx.type === 'Dividend') {
                totalDividend += convert(tx.amount || 0, txCurrency, baseCurrency, txTime);
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
            totalCashValue = Object.entries(derivedCash.byCurrency).reduce((sum, [currency, amount]) => {
                if (Math.abs(amount) < 0.0000001) return sum;
                return sum + convert(amount, currency, baseCurrency, dateTime);
            }, 0);
        }

        const investedValue = hasExplicitCashBalances ? totalExternalInvested : derivedCash.invested;

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

