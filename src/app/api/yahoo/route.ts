import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('YahooAPI');

type Interval = '1d';

type YahooChartQuote = { date?: number | Date; close?: number };
type YahooChartSplit = { date: number | Date; numerator?: number; denominator?: number };
type YahooChartDividend = { date: number | Date; amount?: number };

type YahooChartResult = {
    quotes?: YahooChartQuote[];
    meta?: { currency?: string; symbol?: string; regularMarketPrice?: number; exchangeTimezoneName?: string };
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

const SUMMARY_MODULES = ['financialData', 'defaultKeyStatistics', 'earnings', 'assetProfile', 'calendarEvents', 'summaryDetail'];

/** 429, 5xx and network problems: worth retrying later, the symbol itself is fine. */
const isTransientYahooError = (error: unknown): boolean => {
    const status = (error as { code?: unknown })?.code;
    if (typeof status === 'number') return status === 429 || status >= 500;
    const message = error instanceof Error ? error.message : String(error);
    return /too many requests|rate limit|timed? ?out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|socket hang up/i.test(message);
};

const normalizeDate = (value: number | Date) => {
    if (value instanceof Date) return value;
    const ts = value < 100000000000 ? value * 1000 : value;
    return new Date(ts);
};

/**
 * Yahoo stamps daily candles with the session start in exchange time (ASX 10:00 AEDT is
 * 23:00 UTC the day before), so the calendar day must be read in that time zone.
 */
const createDateKeyFormatter = (timeZone: string | undefined) => {
    let formatter: Intl.DateTimeFormat | null = null;
    if (timeZone) {
        try {
            formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
        } catch {
            formatter = null; // unknown zone: fall back to UTC
        }
    }

    return (value: number | Date) => {
        const d = normalizeDate(value);
        if (formatter) {
            const parts = formatter.formatToParts(d);
            const get = (type: string) => parts.find((p) => p.type === type)?.value;
            return `${get('year')}-${get('month')}-${get('day')}`;
        }
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
};

/** summaryDetail reports a fraction (0.0045), quote() reports percent (0.45). Always return a fraction. */
const normalizeDividendYield = (summaryYield: number | undefined, quoteYield: number | undefined): number | undefined => {
    if (typeof summaryYield === 'number' && Number.isFinite(summaryYield) && summaryYield > 0) return summaryYield;
    if (typeof quoteYield === 'number' && Number.isFinite(quoteYield) && quoteYield > 0) return quoteYield / 100;
    return undefined;
};

export async function POST(req: NextRequest) {
    try {
        log.debug('Starting request...');
        let yahooFinance: YahooFinanceLike;
        try {
            const pkg = await import('yahoo-finance2');
            const exported = (pkg as { default?: unknown }).default ?? pkg;

            // Check if it's a class/function and instantiate
            if (typeof exported === 'function') {
                yahooFinance = new (exported as new () => YahooFinanceLike)();
                log.debug('Instantiated new YahooFinance class');
            } else {
                yahooFinance = exported as YahooFinanceLike;
                log.debug('Using existing instance');
            }
        } catch (err: unknown) {
            log.error('Import failed:', err);
            throw err;
        }

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

        if (!yahooFinance.chart) {
            log.error('Critical: .chart() method missing on instance!');
            throw new Error('Library instance missing chart method');
        }

        log.debug(`Fetching chart for ${symbol}`, JSON.stringify(queryOptions));

        // Only the chart is required. Many ETFs, ETCs and funds have no fundamentals
        // (e.g. no "earnings" module), which must not hide a perfectly valid price history.
        const [chartSettled, quoteSettled, summarySettled] = await Promise.allSettled([
            yahooFinance.chart(symbol, queryOptions),
            yahooFinance.quote(symbol),
            yahooFinance.quoteSummary(symbol, { modules: SUMMARY_MODULES })
        ]);

        if (chartSettled.status === 'rejected') {
            const transient = isTransientYahooError(chartSettled.reason);
            const message = chartSettled.reason instanceof Error ? chartSettled.reason.message : String(chartSettled.reason);
            log.warn(`Chart failed for ${symbol} (${transient ? 'transient' : 'not found'}):`, message);
            return NextResponse.json({ error: message, transient }, { status: transient ? 503 : 404 });
        }
        if (quoteSettled.status === 'rejected') {
            log.info(`quote() failed for ${symbol}, continuing without it`);
        }
        if (summarySettled.status === 'rejected') {
            log.info(`quoteSummary() failed for ${symbol}, continuing without it`);
        }

        const result = chartSettled.value;
        const quoteResult: YahooQuoteResult = quoteSettled.status === 'fulfilled' ? (quoteSettled.value || {}) : {};
        const summaryResult: YahooQuoteSummary = summarySettled.status === 'fulfilled' ? (summarySettled.value || {}) : {};
        const quotes = result.quotes || [];
        const meta = result.meta || {};

        const history: Record<string, number> = {};
        const toDateKey = createDateKeyFormatter(meta.exchangeTimezoneName);

        quotes.forEach((q) => {
            if (q.date && q.close) {
                const dateStr = toDateKey(q.date);
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
                    const dateStr = toDateKey(s.date);
                    if (s.numerator && s.denominator) {
                        splits[dateStr] = s.numerator / s.denominator;
                    }
                });
            }
            if (result.events.dividends) {
                const rawDivs = result.events.dividends;
                Object.values(rawDivs).forEach((d) => {
                    const dateStr = toDateKey(d.date);
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
                exDate: toDateKey(calendarEvents.exDividendDate),
                paymentDate: calendarEvents.dividendDate ? toDateKey(calendarEvents.dividendDate) : undefined,
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
            dividendYield: normalizeDividendYield(summaryDetail.dividendYield, quoteResult.dividendYield),
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

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to fetch data';
        log.error('Request failed:', error);
        return NextResponse.json({ error: message, transient: isTransientYahooError(error) }, { status: 500 });
    }
}
