import { ProjectData, type Transaction } from '@/types/domain';

type ResolveTickerResult = {
    status: 'resolved' | 'unresolved' | 'error';
    symbol?: string;
    isin?: string;
    name?: string;
    currency?: string;
    source?: 'kursliste' | 'openfigi' | 'yahoo';
    matchBy?: 'isin' | 'valor' | 'wkn' | 'symbol' | 'input';
};

const isBuyType = (type: Transaction['type']) => type === 'Buy' || type === 'Sparplan_Buy';

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

export const syncProjectQuotes = async (project: ProjectData, force: boolean = false): Promise<ProjectData> => {
    const now = new Date();
    const securities = { ...project.securities };
    let hasChanges = false;

    // Filter out old "System" split transactions as we now store them in Security
    // This is a one-time migration/cleanup
    const transactions = project.transactions.filter(t => t.type !== 'Split' || t.broker !== 'System');

    if (transactions.length !== project.transactions.length) {
        console.log(`[MarketData] Removed ${project.transactions.length - transactions.length} legacy split transactions.`);
        hasChanges = true;
    }

    let syncedCount = 0;

    for (const isin of Object.keys(securities)) {
        const sec = securities[isin];

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
            continue;
        }

        const lastSync = sec.lastSync ? new Date(sec.lastSync) : new Date(0);
        const diffHours = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

        const missingHistory = !sec.priceHistory || Object.keys(sec.priceHistory).length === 0;
        const missingDividends = !sec.dividendHistorySynced || sec.dividendHistory === undefined || sec.upcomingDividends === undefined;

        const shouldSync = force || diffHours > 24 || missingHistory || missingDividends;
        if (!shouldSync) continue;

        let symbolToFetch = sec.symbol || sec.isin;

        const shouldResolve = !sec.symbol || sec.symbol === sec.isin || sec.symbolStatus === 'unresolved';
        const canRetryResolve = force || sec.symbolStatus !== 'unresolved';

        if (shouldResolve && canRetryResolve) {
            const resolveResult = await resolveSecuritySymbol(symbolToFetch || '', sec.currency, sec.isin, sec.name);
            if (resolveResult?.status === 'resolved' && resolveResult.symbol) {
                symbolToFetch = resolveResult.symbol;
                securities[isin] = {
                    ...sec,
                    symbol: resolveResult.symbol,
                    name: resolveResult.name || sec.name,
                    currency: resolveResult.currency || sec.currency,
                    symbolStatus: 'resolved',
                    symbolSource: resolveResult.source || 'unknown',
                    symbolLastTried: now.toISOString()
                };
                hasChanges = true;
            } else if (resolveResult?.status === 'unresolved') {
                securities[isin] = {
                    ...sec,
                    symbolStatus: 'unresolved',
                    symbolSource: resolveResult.source || 'unknown',
                    symbolLastTried: now.toISOString()
                };
                hasChanges = true;
                if (!sec.symbol || sec.symbol === sec.isin) {
                    continue;
                }
            }
        }

        if (!symbolToFetch) continue;
        const secForFetch = securities[isin];

        try {
            // Determine start date: lastSync or default full history
            // If we have existing history, we only need new data? 
            // Currently simpler to re-fetch relevant chunk or full. 
            // Let's fetch from lastSync if available, UNLESS force is true (repair mode)
            const missingHistory = !sec.priceHistory || Object.keys(sec.priceHistory).length === 0;
            const missingDividends = !sec.dividendHistorySynced || sec.dividendHistory === undefined || sec.upcomingDividends === undefined;
            const requiresFullHistory = force || !sec.lastSync || missingHistory || missingDividends;
            const from = requiresFullHistory ? '1970-01-01' : sec.lastSync.split('T')[0];

            const res = await fetch('/api/yahoo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: symbolToFetch, from })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.history) {
                    securities[isin] = {
                        ...secForFetch,
                        priceHistory: { ...(sec.priceHistory || {}), ...data.history },
                        splits: { ...(sec.splits || {}), ...data.splits }, // Store splits in security
                        currency: data.currency || sec.currency,
                        symbol: data.symbol || symbolToFetch || sec.symbol,
                        name: data.longName || sec.name, // Update Name if available (e.g. Amazon.com, Inc.)
                        symbolStatus: 'resolved',
                        symbolSource: secForFetch.symbolSource || 'yahoo',
                        symbolLastTried: secForFetch.symbolLastTried || now.toISOString(),
                        quoteType: mapYahooQuoteType(data.quoteType) || sec.quoteType, // Update Type
                        // Metrics
                        marketCap: data.marketCap,
                        trailingPE: data.trailingPE,
                        dividendYield: data.dividendYield,
                        fiftyTwoWeekHigh: data.fiftyTwoWeekHigh,
                        fiftyTwoWeekLow: data.fiftyTwoWeekLow,
                        // Advanced Metrics
                        totalRevenue: data.totalRevenue,
                        forwardPE: data.forwardPE,
                        epsTrailingTwelveMonths: data.epsTrailingTwelveMonths,
                        epsForward: data.epsForward,
                        earningsHistory: data.earningsHistory,
                        // Profile
                        country: data.country,
                        sector: data.sector,
                        industry: data.industry,
                        // Dividends
                        annualDividendRate: data.annualDividendRate,
                        dividendHistory: data.dividendHistory || [],
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
        }
    }

    if (syncedCount > 0) {
        console.log(`[MarketData] Synced ${syncedCount} securities.`);
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
