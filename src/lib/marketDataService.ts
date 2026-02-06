import { ProjectData, ISIN } from '@/types/domain';

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

    const toUpdate: ISIN[] = [];

    // Identify securities to update
    for (const isin in securities) {
        const sec = securities[isin];
        // Allow mapped Ticker. If no symbol, try ISIN (Yahoo usually needs Ticker though)
        // We probably need a ISIN->Ticker mapping service later. 
        // For now, rely on what we have or user input.
        // Flatex Import uses ISIN. 
        // Yahoo often accepts ISIN directly or we need to find the ticker.
        // Try ISIN directly first.
        const symbol = sec.symbol || sec.isin;

        if (!symbol) continue;

        const lastSync = sec.lastSync ? new Date(sec.lastSync) : new Date(0);
        const diffHours = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

        const missingHistory = !sec.priceHistory || Object.keys(sec.priceHistory).length === 0;
        const missingDividends = !sec.dividendHistorySynced || sec.dividendHistory === undefined || sec.upcomingDividends === undefined;

        if (force || diffHours > 24 || missingHistory || missingDividends) {
            toUpdate.push(isin);
        }
    }

    console.log(`[MarketData] Syncing ${toUpdate.length} securities...`);

    // Process in parallel (batches of 5 to be nice?)
    for (const isin of toUpdate) {
        const sec = securities[isin];
        const symbol = sec.symbol || sec.isin;

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
                body: JSON.stringify({ symbol, from })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.history) {
                    securities[isin] = {
                        ...sec,
                        priceHistory: { ...(sec.priceHistory || {}), ...data.history },
                        splits: { ...(sec.splits || {}), ...data.splits }, // Store splits in security
                        currency: data.currency || sec.currency,
                        symbol: data.symbol || sec.symbol,
                        name: data.longName || sec.name, // Update Name if available (e.g. Amazon.com, Inc.)
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
                    console.log(`[MarketData] Updated ${symbol}`);
                }
            } else {
                console.warn(`[MarketData] Failed to fetch ${symbol}:`, res.statusText);
            }
        } catch (e) {
            console.error(`[MarketData] Error syncing ${symbol}`, e);
        }
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
