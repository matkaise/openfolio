import { NextRequest, NextResponse } from 'next/server';

type Interval = '1d';

type YahooChartQuote = { date?: number | Date; close?: number };
type YahooChartSplit = { date: number | Date; numerator?: number; denominator?: number };
type YahooChartDividend = { date: number | Date; amount?: number };

type YahooChartResult = {
    quotes?: YahooChartQuote[];
    meta?: { currency?: string; symbol?: string; regularMarketPrice?: number };
    events?: {
        splits?: Record<string, YahooChartSplit>;
        dividends?: Record<string, YahooChartDividend>;
    };
};

type YahooQuoteResult = {
    longName?: string;
    shortName?: string;
    currency?: string;
    quoteType?: string;
    marketCap?: number;
    trailingPE?: number;
    dividendYield?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    epsTrailingTwelveMonths?: number;
    epsForward?: number;
};

type YahooQuoteSummary = {
    financialData?: { totalRevenue?: number };
    defaultKeyStatistics?: { forwardPE?: number; trailingEps?: number; forwardEps?: number };
    earnings?: { earningsChart?: { quarterly?: { date: string; actual?: number }[] } };
    assetProfile?: { country?: string; sector?: string; industry?: string };
    calendarEvents?: { exDividendDate?: number | Date; dividendDate?: number | Date; earnings?: unknown };
    summaryDetail?: { currency?: string; dividendYield?: number; dividendRate?: number };
};

type YahooFinanceLike = {
    chart: (symbol: string, options: { period1: string; interval: Interval }) => Promise<YahooChartResult>;
    quote: (symbol: string) => Promise<YahooQuoteResult>;
    quoteSummary: (symbol: string, options: { modules: string[] }) => Promise<YahooQuoteSummary>;
};

export async function POST(req: NextRequest) {
    try {
        console.error('[YahooAPI] Starting request...');
        let yahooFinance: YahooFinanceLike;
        try {
            const pkg = await import('yahoo-finance2');
            const exported = (pkg as { default?: unknown }).default ?? pkg;

            // Check if it's a class/function and instantiate
            if (typeof exported === 'function') {
                yahooFinance = new (exported as new () => YahooFinanceLike)();
                console.error('[YahooAPI] Instantiated new YahooFinance class');
            } else {
                yahooFinance = exported as YahooFinanceLike;
                console.error('[YahooAPI] Using existing instance');
            }
        } catch (err: unknown) {
            console.error('[YahooAPI] Import failed:', err);
            throw err;
        }
        // console.log('[YahooAPI] Keys:', Object.keys(yahooFinance || {}));

        const body: { symbol?: string; interval?: Interval; from?: string } = await req.json();
        const { symbol } = body;

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
        }

        const intervalValue: Interval = body.interval === '1d' ? '1d' : '1d';
        const queryOptions = {
            period1: body.from || '1970-01-01',
            interval: intervalValue
        };

        console.log(`[YahooAPI] Fetching historical for ${symbol}`, JSON.stringify(queryOptions));

        if (!yahooFinance.chart) {
            console.error('[YahooAPI] Critical: .chart() method missing on instance!');
            throw new Error('Library instance missing chart method');
        }

        console.log(`[YahooAPI] Fetching chart for ${symbol}`, JSON.stringify(queryOptions));

        try {
            // Parallel fetch for Chart, Quote, and QuoteSummary (Deep Data)
            const [chartResult, quoteResult, summaryResult] = await Promise.all([
                yahooFinance.chart(symbol, queryOptions),
                yahooFinance.quote(symbol),
                yahooFinance.quoteSummary(symbol, { modules: ['financialData', 'defaultKeyStatistics', 'earnings', 'assetProfile', 'calendarEvents', 'summaryDetail'] })
            ]);

            const result = chartResult;
            const quotes = result.quotes || [];
            const meta = result.meta || {};
            // console.log(`[YahooAPI] Success, rows: ${quotes.length}, currency: ${meta.currency}, Name: ${quoteResult.longName}`);

            const history: Record<string, number> = {};

            quotes.forEach((q) => {
                if (q.date && q.close) {
                    const dateStr = new Date(q.date).toISOString().split('T')[0];
                    history[dateStr] = q.close;
                }
            });

            // Process Splits
            const splits: Record<string, number> = {};
            const dividendHistory: { date: string, amount: number }[] = [];

            if (result.events) {
                if (result.events.splits) {
                    const rawSplits = result.events.splits;
                    Object.values(rawSplits).forEach((s) => {
                        const dateStr = new Date(s.date instanceof Date ? s.date : (s.date < 100000000000 ? s.date * 1000 : s.date)).toISOString().split('T')[0];
                        if (s.numerator && s.denominator) {
                            splits[dateStr] = s.numerator / s.denominator;
                        }
                    });
                }
                if (result.events.dividends) {
                    const rawDivs = result.events.dividends;
                    Object.values(rawDivs).forEach((d) => {
                        const dateStr = new Date(d.date instanceof Date ? d.date : (d.date < 100000000000 ? d.date * 1000 : d.date)).toISOString().split('T')[0];
                        if (d.amount) {
                            dividendHistory.push({ date: dateStr, amount: d.amount });
                        }
                    });
                }
            }

            // Extract Advanced Metrics
            const financialData = summaryResult?.financialData || {};
            const keyStats = summaryResult?.defaultKeyStatistics || {};
            const earnings = summaryResult?.earnings || {};
            const assetProfile = summaryResult?.assetProfile || {};
            const calendarEvents = summaryResult?.calendarEvents || {};
            const summaryDetail = summaryResult?.summaryDetail || {};

            // Map Earnings History
            const earningsHistory = earnings.earningsChart?.quarterly?.map((q) => ({
                date: q.date, // e.g. "4Q2023"
                eps: q.actual
            })) || [];

            // Upcoming Dividends (using exDate or dividendDate from calendarEvents)
            const upcomingDividends = [];
            if (calendarEvents.earnings) {
                // Calendar events usually has earnings, not always dividends directly listed as a list
                // yahoo-finance2 types are tricky here.
                // However, calendarEvents often has 'exDividendDate' and 'dividendDate'
            }
            if (calendarEvents.exDividendDate) {
                upcomingDividends.push({
                    exDate: new Date(calendarEvents.exDividendDate).toISOString().split('T')[0],
                    paymentDate: calendarEvents.dividendDate ? new Date(calendarEvents.dividendDate).toISOString().split('T')[0] : undefined,
                    amount: undefined // Often not provided in calendar events summary, or is in earnings
                });
            }

            const resolvedCurrency = meta.currency || quoteResult.currency || summaryDetail.currency;

            return NextResponse.json({
                history,
                splits,
                currency: resolvedCurrency,
                symbol: meta.symbol,
                price: meta.regularMarketPrice,
                // Enhanced Data from Quote
                quoteType: quoteResult.quoteType, // e.g. EQUITY, ETF, MUTUALFUND
                longName: quoteResult.longName || quoteResult.shortName || meta.symbol,
                marketCap: quoteResult.marketCap,
                trailingPE: quoteResult.trailingPE,
                dividendYield: summaryDetail.dividendYield || quoteResult.dividendYield,
                fiftyTwoWeekHigh: quoteResult.fiftyTwoWeekHigh,
                fiftyTwoWeekLow: quoteResult.fiftyTwoWeekLow,
                // Advanced Data from QuoteSummary
                totalRevenue: financialData.totalRevenue,
                forwardPE: keyStats.forwardPE,
                epsTrailingTwelveMonths: keyStats.trailingEps || quoteResult.epsTrailingTwelveMonths,
                epsForward: keyStats.forwardEps || quoteResult.epsForward,
                earningsHistory,
                // New Profile Data
                country: assetProfile.country,
                sector: assetProfile.sector,
                industry: assetProfile.industry,
                // Dividends
                annualDividendRate: summaryDetail.dividendRate,
                dividendHistory,
                upcomingDividends
            });
        } catch (innerErr: unknown) {
            const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
            console.log('[YahooAPI] Library Error (Log):', message);
            // console.log(JSON.stringify(innerErr));
            throw innerErr;
        }

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to fetch data';
        console.error('Yahoo API Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
