import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        console.error('[YahooAPI] Starting request...');
        let yahooFinance;
        try {
            const pkg = require('yahoo-finance2');
            const Exported = pkg.default || pkg;

            // Check if it's a class/function and instantiate
            if (typeof Exported === 'function') {
                yahooFinance = new Exported();
                console.error('[YahooAPI] Instantiated new YahooFinance class');
            } else {
                yahooFinance = Exported;
                console.error('[YahooAPI] Using existing instance');
            }
        } catch (err) {
            console.error('[YahooAPI] Require failed:', err);
            throw err;
        }
        // console.log('[YahooAPI] Keys:', Object.keys(yahooFinance || {}));

        const body = await req.json();
        const { symbol, range, interval } = body;

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
        }

        const queryOptions = {
            period1: body.from || '1970-01-01',
            interval: interval || '1d' as '1d' // Cast to expected type
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

            quotes.forEach((q: any) => {
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
                    Object.values(rawSplits).forEach((s: any) => {
                        let dateStr = new Date(s.date instanceof Date ? s.date : (s.date < 100000000000 ? s.date * 1000 : s.date)).toISOString().split('T')[0];
                        if (s.numerator && s.denominator) {
                            splits[dateStr] = s.numerator / s.denominator;
                        }
                    });
                }
                if (result.events.dividends) {
                    const rawDivs = result.events.dividends;
                    Object.values(rawDivs).forEach((d: any) => {
                        let dateStr = new Date(d.date instanceof Date ? d.date : (d.date < 100000000000 ? d.date * 1000 : d.date)).toISOString().split('T')[0];
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
            const earningsHistory = earnings.earningsChart?.quarterly?.map((q: any) => ({
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
        } catch (innerErr: any) {
            console.log('[YahooAPI] Library Error (Log):', innerErr.message);
            // console.log(JSON.stringify(innerErr));
            throw innerErr;
        }

    } catch (error: any) {
        console.error('Yahoo API Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch data' }, { status: 500 });
    }
}
