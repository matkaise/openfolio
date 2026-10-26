import { z } from 'zod';
import { getT } from '@/lib/i18n';
import { describeIssues, numberRecord, optionalNumber, optionalString } from './common';

const ecbResponseSchema = z.object({
    success: z.boolean(),
    count: optionalNumber,
    error: optionalString,
    data: z.array(z.object({ date: z.string().min(1), rates: numberRecord })).default([])
});

export type EcbResponse = z.infer<typeof ecbResponseSchema>;

export const parseEcbResponse = (value: unknown): EcbResponse => {
    const result = ecbResponseSchema.safeParse(value);
    if (!result.success) throw new Error(getT().services.unexpectedEcb(describeIssues(result.error)));
    return result.data;
};

/** Keeps only list items of the form { date: string, amount: number }. */
const datedAmounts = <T extends z.ZodRawShape>(extra: T) => z.preprocess(
    (value) => (Array.isArray(value)
        ? value.filter((item) => item && typeof item === 'object' && typeof item.date === 'string' && typeof item.amount === 'number' && Number.isFinite(item.amount))
        : []),
    z.array(z.object({ date: z.string(), amount: z.number() }).extend(extra).passthrough())
);

const yahooQuoteResponseSchema = z.object({
    history: numberRecord,
    splits: numberRecord.default({}),
    currency: optionalString,
    symbol: optionalString,
    longName: optionalString,
    quoteType: optionalString,
    dividendHistory: datedAmounts({}),
    upcomingDividends: z.preprocess(
        (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && typeof item.exDate === 'string') : []),
        z.array(z.object({ exDate: z.string(), paymentDate: optionalString, amount: optionalNumber }).passthrough())
    ),
    earningsHistory: z.preprocess(
        (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && typeof item.date === 'string' && typeof item.eps === 'number') : undefined),
        z.array(z.object({ date: z.string(), eps: z.number() })).optional()
    ),
    marketCap: optionalNumber,
    trailingPE: optionalNumber,
    dividendYield: optionalNumber,
    fiftyTwoWeekHigh: optionalNumber,
    fiftyTwoWeekLow: optionalNumber,
    totalRevenue: optionalNumber,
    forwardPE: optionalNumber,
    epsTrailingTwelveMonths: optionalNumber,
    epsForward: optionalNumber,
    annualDividendRate: optionalNumber,
    country: optionalString,
    sector: optionalString,
    industry: optionalString
}).passthrough();

export type YahooQuoteResponse = z.infer<typeof yahooQuoteResponseSchema>;

export const parseYahooQuoteResponse = (value: unknown): YahooQuoteResponse => {
    const result = yahooQuoteResponseSchema.safeParse(value);
    if (!result.success) throw new Error(getT().services.unexpectedQuotes(describeIssues(result.error)));
    return result.data;
};
