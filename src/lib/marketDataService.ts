import { ProjectData, type Security, type Transaction } from '@/types/domain';

type ResolveTickerResult = {
    status: 'resolved' | 'unresolved' | 'error';
    symbol?: string;
    isin?: string;
    name?: string;
    currency?: string;
    source?: 'kursliste' | 'openfigi' | 'yahoo';
    matchBy?: 'isin' | 'valor' | 'wkn' | 'symbol' | 'input';
};

export type MarketSyncProgress = {
    current: number;
    total: number;
    symbol?: string;
    stage?: 'start' | 'resolve' | 'fetch' | 'skip' | 'done' | 'limit';
};

const parsePositiveNumber = (raw: string | number | undefined, fallback: number) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return value;
};

const MAX_SYNC_PER_RUN = Math.floor(parsePositiveNumber(process.env.NEXT_PUBLIC_MARKET_SYNC_LIMIT, 5));
const SYNC_DELAY_MS = Math.floor(parsePositiveNumber(process.env.NEXT_PUBLIC_MARKET_SYNC_DELAY_MS, 350));
const MAX_SYNC_TIME_MS = Math.floor(parsePositiveNumber(process.env.NEXT_PUBLIC_MARKET_SYNC_MAX_MS, 15000));
const SYNC_CONCURRENCY = Math.floor(parsePositiveNumber(process.env.NEXT_PUBLIC_MARKET_SYNC_CONCURRENCY, 1));
const FULL_SYNC_DELAY_MS = Math.floor(parsePositiveNumber(process.env.NEXT_PUBLIC_MARKET_SYNC_FULL_DELAY_MS, 50));
const FULL_SYNC_CONCURRENCY = Math.floor(parsePositiveNumber(process.env.NEXT_PUBLIC_MARKET_SYNC_FULL_CONCURRENCY, 4));

const isBuyType = (type: Transaction['type']) => type === 'Buy' || type === 'Sparplan_Buy';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type DividendHistoryItem = { date: string; amount: number };

const mergeDividendHistory = (
    existing: DividendHistoryItem[] | undefined,
    incoming: DividendHistoryItem[] | undefined
): DividendHistoryItem[] => {
    const merged = new Map<string, DividendHistoryItem>();

    const add = (items: DividendHistoryItem[] | undefined) => {
        if (!items || !Array.isArray(items)) return;
        for (const item of items) {
            if (!item || !item.date) continue;
            const amount = Number(item.amount);
            if (!Number.isFinite(amount) || amount <= 0) continue;
            const key = `${item.date}|${amount}`;
            merged.set(key, { date: item.date, amount });
        }
    };

    add(existing);
    add(incoming);

    return Array.from(merged.values()).sort((a, b) => {
        if (a.date === b.date) return a.amount - b.amount;
        return a.date.localeCompare(b.date);
    });
};

const hasMissingDividendData = (sec: Security): boolean => {
    const missingFields = !sec.dividendHistorySynced || sec.dividendHistory === undefined || sec.upcomingDividends === undefined;
    if (missingFields) return true;

    const hasDividendSignal =
        Number(sec.dividendYield || 0) > 0 ||
        Number(sec.annualDividendRate || 0) > 0 ||
        ((sec.upcomingDividends?.length || 0) > 0);

    const emptyDividendHistory = Array.isArray(sec.dividendHistory) && sec.dividendHistory.length === 0;
    return hasDividendSignal && emptyDividendHistory;
};

export const buildManualPriceHistory = (transactions: Transaction[], isin: string): Record<string, number> => {
    const history: Record<string, number> = {};
    transactions
        .filter(tx => tx.isin === isin && isBuyType(tx.type))
        .forEach(tx => {
            const shares = Math.abs(tx.shares || 0);
            if (!shares) return;

            let price = 0;
            if (tx.originalData && typeof tx.originalData === 'object') {
                const maybePrice = (tx.originalData as { pricePerShare?: number }).pricePerShare;
                if (typeof maybePrice === 'number' && Number.isFinite(maybePrice) && maybePrice > 0) {
                    price = maybePrice;
                }
            }

            if (!price) {
                const amount = Math.abs(tx.amount || 0);
                price = amount / shares;
            }

            if (Number.isFinite(price) && price > 0) {
                history[tx.date] = price;
            }
        });

    return history;
};

const resolveSecuritySymbol = async (input: string, currency?: string, isin?: string, name?: string): Promise<ResolveTickerResult | null> => {
    if (!input) return null;
    try {
        const res = await fetch('/api/resolve-ticker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input, currency, isin, name })
        });
        if (!res.ok) return null;
        return res.json();
    } catch (e) {
        console.warn('[MarketData] Resolve ticker failed', e);
        return null;
    }
};

export const syncProjectQuotes = async (
    project: ProjectData,
    force: boolean = false,
    onProgress?: (progress: MarketSyncProgress) => void,
    options?: {
        maxPerRun?: number;
        maxTimeMs?: number;
        delayMs?: number;
        concurrency?: number;
    }
): Promise<ProjectData> => {
    const now = new Date();
    const securities = { ...project.securities };
    let hasChanges = false;
    const syncStartedAt = Date.now();
    const maxPerRunRaw = options?.maxPerRun;
    const maxPerRun = Number.isFinite(maxPerRunRaw) ? Math.floor(maxPerRunRaw as number) : MAX_SYNC_PER_RUN;
    const maxTimeMsRaw = options?.maxTimeMs;
    const maxTimeMs = Number.isFinite(maxTimeMsRaw) ? Math.floor(maxTimeMsRaw as number) : MAX_SYNC_TIME_MS;
    const fullSyncMode =
        Number.isFinite(maxPerRunRaw) &&
        Number.isFinite(maxTimeMsRaw) &&
        Math.floor(maxPerRunRaw as number) === 0 &&
        Math.floor(maxTimeMsRaw as number) === 0;
    const delayMsRaw = options?.delayMs;
    const delayMs = Number.isFinite(delayMsRaw)
        ? Math.floor(delayMsRaw as number)
        : (fullSyncMode ? FULL_SYNC_DELAY_MS : SYNC_DELAY_MS);
    const concurrencyRaw = options?.concurrency;
    const concurrency = Number.isFinite(concurrencyRaw)
        ? Math.floor(concurrencyRaw as number)
        : (fullSyncMode ? FULL_SYNC_CONCURRENCY : SYNC_CONCURRENCY);

    // Filter out old "System" split transactions as we now store them in Security
    // This is a one-time migration/cleanup
    const transactions = project.transactions.filter(t => t.type !== 'Split' || t.broker !== 'System');

    if (transactions.length !== project.transactions.length) {
        console.log(`[MarketData] Removed ${project.transactions.length - transactions.length} legacy split transactions.`);
        hasChanges = true;
    }

    let syncedCount = 0;
    let attemptedCount = 0;
    let processedCount = 0;

    const shouldSyncIsins = Object.keys(securities).filter((isin) => {
        const sec = securities[isin];
        if (!sec) return false;
        if (sec.ignoreMarketData || sec.symbolStatus === 'ignored') return false;
        const symbol = sec.symbol || sec.isin;
        if (!symbol) return false;
        if (!sec.lastSync) return true;
        const diffHours = (now.getTime() - new Date(sec.lastSync).getTime()) / (1000 * 60 * 60);
        const missingHistory = !sec.priceHistory || Object.keys(sec.priceHistory).length === 0;
        const missingDividends = hasMissingDividendData(sec);
        return force || diffHours > 24 || missingHistory || missingDividends;
    });

    const effectiveMaxPerRun = Number.isFinite(maxPerRun) && maxPerRun > 0 ? maxPerRun : Number.POSITIVE_INFINITY;
    const maxTargets = Number.isFinite(effectiveMaxPerRun)
        ? Math.min(effectiveMaxPerRun, shouldSyncIsins.length)
        : shouldSyncIsins.length;
    const targetIsins = shouldSyncIsins.slice(0, maxTargets);

    onProgress?.({ current: 0, total: targetIsins.length, stage: 'start' });
    const hasTimeBudget = Number.isFinite(maxTimeMs) && maxTimeMs > 0;
    let limitNotified = false;

    const notifyLimitReached = () => {
        if (limitNotified) return;
        limitNotified = true;
        console.log(`[MarketData] Sync time budget reached (${maxTimeMs}ms). Stopping early.`);
        onProgress?.({ current: processedCount, total: targetIsins.length, stage: 'limit' });
    };

    const processTarget = async (isin: string) => {
        let sec = securities[isin];
        if (!sec) return;

        const fallbackSymbol = sec.symbol || sec.isin || isin;
        onProgress?.({ current: processedCount, total: targetIsins.length, symbol: fallbackSymbol, stage: 'start' });

        if (sec.ignoreMarketData || sec.symbolStatus === 'ignored') {
            const manualHistory = buildManualPriceHistory(transactions, isin);
            if (Object.keys(manualHistory).length > 0) {
                securities[isin] = {
                    ...sec,
                    ignoreMarketData: true,
                    priceHistory: { ...(sec.priceHistory || {}), ...manualHistory },
                    dividendHistory: sec.dividendHistory || [],
                    upcomingDividends: sec.upcomingDividends || [],
                    dividendHistorySynced: true,
                    symbolStatus: 'ignored'
                };
                hasChanges = true;
            }
            processedCount += 1;
            onProgress?.({ current: processedCount, total: targetIsins.length, symbol: fallbackSymbol, stage: 'skip' });
            return;
        }

        const lastSync = sec.lastSync ? new Date(sec.lastSync) : new Date(0);
        const diffHours = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
        const missingHistory = !sec.priceHistory || Object.keys(sec.priceHistory).length === 0;
        const missingDividends = hasMissingDividendData(sec);

        const shouldSync = force || diffHours > 24 || missingHistory || missingDividends;
        if (!shouldSync) {
            processedCount += 1;
            onProgress?.({ current: processedCount, total: targetIsins.length, symbol: fallbackSymbol, stage: 'skip' });
            return;
        }

        let symbolToFetch = sec.symbol || sec.isin;
        const shouldResolve = !sec.symbol || sec.symbol === sec.isin || sec.symbolStatus === 'unresolved';
        const canRetryResolve = force || sec.symbolStatus !== 'unresolved';

        if (shouldResolve && canRetryResolve) {
            onProgress?.({ current: processedCount, total: targetIsins.length, symbol: symbolToFetch || fallbackSymbol, stage: 'resolve' });
            const resolveResult = await resolveSecuritySymbol(symbolToFetch || '', sec.currency, sec.isin, sec.name);
            if (resolveResult?.status === 'resolved' && resolveResult.symbol) {
                symbolToFetch = resolveResult.symbol;
                const secForResolve = securities[isin] || sec;
                securities[isin] = {
                    ...secForResolve,
                    symbol: resolveResult.symbol,
                    name: resolveResult.name || secForResolve.name,
                    currency: resolveResult.currency || secForResolve.currency,
                    symbolStatus: 'resolved',
                    symbolSource: resolveResult.source || 'unknown',
                    symbolLastTried: now.toISOString()
                };
                hasChanges = true;
                sec = securities[isin];
            } else if (resolveResult?.status === 'unresolved') {
                const secForResolve = securities[isin] || sec;
                securities[isin] = {
                    ...secForResolve,
                    symbolStatus: 'unresolved',
                    symbolSource: resolveResult.source || 'unknown',
                    symbolLastTried: now.toISOString()
                };
                hasChanges = true;
                sec = securities[isin];
                if (!sec.symbol || sec.symbol === sec.isin) {
                    processedCount += 1;
                    onProgress?.({ current: processedCount, total: targetIsins.length, symbol: symbolToFetch || fallbackSymbol, stage: 'skip' });
                    return;
                }
            }
        }

        if (!symbolToFetch) {
            processedCount += 1;
            onProgress?.({ current: processedCount, total: targetIsins.length, symbol: fallbackSymbol, stage: 'skip' });
            return;
        }

        const secForFetch = securities[isin] || sec;
        attemptedCount += 1;
        onProgress?.({ current: processedCount, total: targetIsins.length, symbol: symbolToFetch, stage: 'fetch' });

        try {
            const fetchMissingHistory = !secForFetch.priceHistory || Object.keys(secForFetch.priceHistory).length === 0;
            const fetchMissingDividends = hasMissingDividendData(secForFetch);
            const requiresFullHistory = !secForFetch.lastSync || fetchMissingHistory || fetchMissingDividends;
            const from = requiresFullHistory ? '1970-01-01' : secForFetch.lastSync.split('T')[0];

            const res = await fetch('/api/yahoo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: symbolToFetch, from })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.history) {
                    const incomingDividendHistory = Array.isArray(data.dividendHistory) ? data.dividendHistory : [];
                    const nextDividendHistory = requiresFullHistory
                        ? incomingDividendHistory
                        : mergeDividendHistory(secForFetch.dividendHistory, incomingDividendHistory);

                    securities[isin] = {
                        ...secForFetch,
                        priceHistory: { ...(secForFetch.priceHistory || {}), ...data.history },
                        splits: { ...(secForFetch.splits || {}), ...data.splits },
                        currency: data.currency || secForFetch.currency,
                        symbol: data.symbol || symbolToFetch || secForFetch.symbol,
                        name: data.longName || secForFetch.name,
                        symbolStatus: 'resolved',
                        symbolSource: secForFetch.symbolSource || 'yahoo',
                        symbolLastTried: secForFetch.symbolLastTried || now.toISOString(),
                        quoteType: mapYahooQuoteType(data.quoteType) || secForFetch.quoteType,
                        marketCap: data.marketCap,
                        trailingPE: data.trailingPE,
                        dividendYield: data.dividendYield,
                        fiftyTwoWeekHigh: data.fiftyTwoWeekHigh,
                        fiftyTwoWeekLow: data.fiftyTwoWeekLow,
                        totalRevenue: data.totalRevenue,
                        forwardPE: data.forwardPE,
                        epsTrailingTwelveMonths: data.epsTrailingTwelveMonths,
                        epsForward: data.epsForward,
                        earningsHistory: data.earningsHistory,
                        country: data.country,
                        sector: data.sector,
                        industry: data.industry,
                        annualDividendRate: data.annualDividendRate,
                        dividendHistory: nextDividendHistory,
                        upcomingDividends: data.upcomingDividends || [],
                        dividendHistorySynced: true,
                        lastSync: now.toISOString()
                    };
                    hasChanges = true;
                    syncedCount += 1;
                    console.log(`[MarketData] Updated ${symbolToFetch}`);
                }
            } else {
                securities[isin] = {
                    ...secForFetch,
                    symbolStatus: 'unresolved',
                    symbolLastTried: now.toISOString()
                };
                hasChanges = true;
                console.warn(`[MarketData] Failed to fetch ${symbolToFetch}:`, res.statusText);
            }
        } catch (e) {
            console.error(`[MarketData] Error syncing ${symbolToFetch}`, e);
        } finally {
            if (Number.isFinite(delayMs) && delayMs > 0) {
                await delay(delayMs);
            }
        }

        processedCount += 1;
        onProgress?.({ current: processedCount, total: targetIsins.length, symbol: symbolToFetch, stage: 'done' });
    };

    if (targetIsins.length > 0) {
        const workerCount = Math.max(1, Math.min(concurrency > 0 ? concurrency : 1, targetIsins.length));
        let nextIndex = 0;

        const worker = async () => {
            while (true) {
                if (hasTimeBudget && Date.now() - syncStartedAt >= maxTimeMs) {
                    notifyLimitReached();
                    return;
                }
                const currentIndex = nextIndex;
                if (currentIndex >= targetIsins.length) {
                    return;
                }
                nextIndex += 1;
                await processTarget(targetIsins[currentIndex]);
            }
        };

        await Promise.all(Array.from({ length: workerCount }, () => worker()));
    }

    if (syncedCount > 0 || attemptedCount > 0) {
        console.log(`[MarketData] Synced ${syncedCount} securities (attempted ${attemptedCount}).`);
    }

    if (hasChanges) {
        return {
            ...project,
            securities,
            transactions,
            modified: now.toISOString()
        };
    }

    return project;
};

// Start Repair Validation
export const repairProjectSecurities = (project: ProjectData): ProjectData => {
    const securities = { ...project.securities };
    let hasRepairs = false;

    project.transactions.forEach(tx => {
        if (tx.isin && !securities[tx.isin]) {
            console.log(`[Repair] Backfilling security for ${tx.isin}`);
            securities[tx.isin] = {
                isin: tx.isin,
                symbol: tx.isin, // Default fallback
                name: tx.name || tx.isin,
                currency: tx.currency,
                quoteType: 'Stock',
                priceHistory: {}
            };
            hasRepairs = true;
        }
    });

    if (hasRepairs) {
        return {
            ...project,
            securities,
            modified: new Date().toISOString()
        };
    }
    return project;
};

function mapYahooQuoteType(type: string): 'Stock' | 'ETF' | 'Fund' | 'Bond' | 'Crypto' | undefined {
    if (!type) return undefined;
    const t = type.toUpperCase();
    if (t === 'EQUITY') return 'Stock';
    if (t === 'ETF') return 'ETF';
    if (t === 'MUTUALFUND') return 'Fund';
    if (t === 'CRYPTOCURRENCY') return 'Crypto';
    return undefined;
}
