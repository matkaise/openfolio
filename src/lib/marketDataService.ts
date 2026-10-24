import { ProjectData, type Security, type Transaction } from '@/types/domain';
import { parseYahooQuoteResponse, type YahooQuoteResponse } from '@/lib/schemas/api';
import { createLogger } from '@/lib/logger';

const log = createLogger('MarketData');

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

// Backoff before each retry of a transient Yahoo error (rate limit, 5xx).
const DEFAULT_RETRY_DELAYS_MS = [1000, 3000];

const isTransientStatus = (status: number) => status === 429 || status >= 500;

/**
 * Calls /api/yahoo and retries transient failures. Returns the last response;
 * `transient` tells the caller whether a failure says anything about the symbol.
 */
const fetchYahooWithRetry = async (
    body: { symbol: string; from: string },
    retryDelaysMs: number[]
): Promise<{ res: Response; transient: boolean }> => {
    for (let attempt = 0; ; attempt += 1) {
        const res = await fetch('/api/yahoo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) return { res, transient: false };

        let transient = isTransientStatus(res.status);
        try {
            const payload = await res.clone().json() as { transient?: boolean };
            if (typeof payload?.transient === 'boolean') transient = payload.transient;
        } catch {
            // Non-JSON error body: rely on the status code
        }

        if (!transient || attempt >= retryDelaysMs.length) return { res, transient };
        log.warn(`Yahoo busy for ${body.symbol} (HTTP ${res.status}), retrying...`);
        await delay(retryDelaysMs[attempt]);
    }
};

type DividendHistoryItem = { date: string; amount: number };

/**
 * One entry per payment date; incoming (newer) data wins. Yahoo restates past amounts,
 * e.g. after a split, so keying by date+amount would count the same dividend twice.
 */
export const mergeDividendHistory = (
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
            merged.set(item.date, { date: item.date, amount });
        }
    };

    add(existing);
    add(incoming);

    return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
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

const HOURS = 1000 * 60 * 60;
// How long to wait before syncing a security again, and before retrying an unknown symbol.
const RESYNC_AFTER_HOURS = 24;
const RETRY_UNRESOLVED_AFTER_HOURS = 24;

/**
 * Whether a security should be fetched now. The single source for the sync itself, the
 * startup check and the data sources page. Unknown symbols are retried once a day only;
 * otherwise every app start would re-run the sync (and mark the project as changed).
 */
export const securityNeedsSync = (sec: Security, now: Date, options?: { force?: boolean }): boolean => {
    if (sec.ignoreMarketData || sec.symbolStatus === 'ignored') return false;
    if (!(sec.symbol || sec.isin)) return false;
    if (options?.force) return true;

    if (sec.symbolStatus === 'unresolved') {
        const lastTried = sec.symbolLastTried ? Date.parse(sec.symbolLastTried) : NaN;
        return !Number.isFinite(lastTried) || (now.getTime() - lastTried) / HOURS >= RETRY_UNRESOLVED_AFTER_HOURS;
    }

    if (!sec.lastSync) return true;
    const hoursSinceSync = (now.getTime() - new Date(sec.lastSync).getTime()) / HOURS;
    const missingHistory = !sec.priceHistory || Object.keys(sec.priceHistory).length === 0;
    return hoursSinceSync > RESYNC_AFTER_HOURS || missingHistory || hasMissingDividendData(sec);
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
        log.warn('Resolve ticker failed', e);
        return null;
    }
};

export type SecurityPatches = Record<string, Partial<Security>>;

/** Removes the "System" split transactions older versions created; splits live on the security now. */
export const removeLegacySplitTransactions = (project: ProjectData): ProjectData => {
    const transactions = project.transactions.filter(t => t.type !== 'Split' || t.broker !== 'System');
    return transactions.length === project.transactions.length ? project : { ...project, transactions };
};

/**
 * Applies sync results to the *current* project. A field that changed since the sync
 * started (baseline) was edited meanwhile and is kept; securities deleted meanwhile stay deleted.
 */
export const applySecurityPatches = (
    current: ProjectData,
    patches: SecurityPatches,
    baseline: Record<string, Security>
): ProjectData => {
    let securities: Record<string, Security> | null = null;
    Object.entries(patches).forEach(([isin, patch]) => {
        const target = (securities || current.securities)[isin];
        if (!target) return;
        const base = baseline[isin];
        const next: Security = { ...target };
        let changed = false;
        (Object.keys(patch) as (keyof Security)[]).forEach((key) => {
            if (base && target[key] !== base[key]) return; // edited during the sync
            (next as unknown as Record<string, unknown>)[key] = patch[key];
            changed = true;
        });
        if (!changed) return;
        securities = { ...(securities || current.securities), [isin]: next };
    });
    return securities ? { ...current, securities } : current;
};

const diffSecurity = (before: Security | undefined, after: Security): Partial<Security> | null => {
    const patch: Partial<Security> = {};
    let changed = false;
    (Object.keys(after) as (keyof Security)[]).forEach((key) => {
        if (before && before[key] === after[key]) return;
        (patch as Record<string, unknown>)[key] = after[key];
        changed = true;
    });
    return changed ? patch : null;
};

/**
 * Fetches market data for the project's securities and returns the changes per ISIN.
 * The project is not modified; apply the result with applySecurityPatches.
 */
export const syncSecurityPatches = async (
    project: ProjectData,
    force: boolean = false,
    onProgress?: (progress: MarketSyncProgress) => void,
    options?: {
        maxPerRun?: number;
        maxTimeMs?: number;
        delayMs?: number;
        concurrency?: number;
        retryDelaysMs?: number[];
    }
): Promise<SecurityPatches> => {
    const retryDelaysMs = options?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
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

    const transactions = project.transactions;

    let syncedCount = 0;
    let attemptedCount = 0;
    let processedCount = 0;

    const shouldSyncIsins = Object.keys(securities).filter((isin) => {
        const sec = securities[isin];
        return Boolean(sec) && securityNeedsSync(sec, now, { force });
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
        log.info(`Sync time budget reached (${maxTimeMs}ms). Stopping early.`);
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

        if (!securityNeedsSync(sec, now, { force })) {
            processedCount += 1;
            onProgress?.({ current: processedCount, total: targetIsins.length, symbol: fallbackSymbol, stage: 'skip' });
            return;
        }

        let symbolToFetch = sec.symbol || sec.isin;
        // securityNeedsSync already limits retries of unknown symbols to once a day
        const shouldResolve = !sec.symbol || sec.symbol === sec.isin || sec.symbolStatus === 'unresolved';

        if (shouldResolve) {
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
            const from = requiresFullHistory || !secForFetch.lastSync ? '1970-01-01' : secForFetch.lastSync.split('T')[0];

            const { res, transient } = await fetchYahooWithRetry({ symbol: symbolToFetch, from }, retryDelaysMs);

            if (res.ok) {
                let data: YahooQuoteResponse | null = null;
                try {
                    data = parseYahooQuoteResponse(await res.json());
                } catch (error) {
                    log.warn(`Unexpected answer for ${symbolToFetch}:`, error instanceof Error ? error.message : error);
                }
                if (data) {
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
                    log.debug(`Updated ${symbolToFetch}`);
                }
            } else if (transient) {
                // Yahoo is busy or down: the symbol is fine, try again on the next sync.
                log.warn(`Yahoo unavailable for ${symbolToFetch} (HTTP ${res.status}), keeping status.`);
            } else {
                securities[isin] = {
                    ...secForFetch,
                    symbolStatus: 'unresolved',
                    symbolLastTried: now.toISOString()
                };
                hasChanges = true;
                log.warn(`Failed to fetch ${symbolToFetch}:`, res.statusText);
            }
        } catch (e) {
            log.error(`Error syncing ${symbolToFetch}`, e);
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
        log.info(`Synced ${syncedCount} securities (attempted ${attemptedCount}).`);
    }

    const patches: SecurityPatches = {};
    if (hasChanges) {
        Object.entries(securities).forEach(([isin, sec]) => {
            const patch = diffSecurity(project.securities[isin], sec);
            if (patch) patches[isin] = patch;
        });
    }
    return patches;
};

/** Convenience for callers that own the project: sync and apply in one step. */
export const syncProjectQuotes = async (
    project: ProjectData,
    force: boolean = false,
    onProgress?: (progress: MarketSyncProgress) => void,
    options?: Parameters<typeof syncSecurityPatches>[3]
): Promise<ProjectData> => {
    const patches = await syncSecurityPatches(project, force, onProgress, options);
    if (Object.keys(patches).length === 0) return project;
    return { ...applySecurityPatches(project, patches, project.securities), modified: new Date().toISOString() };
};

// Start Repair Validation
export const repairProjectSecurities = (project: ProjectData): ProjectData => {
    const securities = { ...project.securities };
    let hasRepairs = false;

    project.transactions.forEach(tx => {
        if (tx.isin && !securities[tx.isin]) {
            log.debug(`Repair: backfilling security for ${tx.isin}`);
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

function mapYahooQuoteType(type: string | undefined): 'Stock' | 'ETF' | 'Fund' | 'Bond' | 'Crypto' | undefined {
    if (!type) return undefined;
    const t = type.toUpperCase();
    if (t === 'EQUITY') return 'Stock';
    if (t === 'ETF') return 'ETF';
    if (t === 'MUTUALFUND') return 'Fund';
    if (t === 'CRYPTOCURRENCY') return 'Crypto';
    return undefined;
}
