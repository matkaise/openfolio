import { z } from 'zod';
import type { ProjectData } from '@/types/domain';
import { describeIssues, numberRecord, optionalNumber, optionalString } from './common';

// Lenient on purpose: unknown fields pass through (newer app versions, legacy fields) and
// missing collections get defaults. Strict only where a wrong type would break calculations.

const transactionSchema = z.object({
    id: z.string().min(1),
    date: z.string().min(1),
    type: z.string().min(1),
    isin: optionalString,
    name: optionalString,
    shares: optionalNumber,
    amount: z.number().finite(),
    currency: z.string().min(1),
    exchangeRate: optionalNumber,
    fee: optionalNumber,
    fxFee: optionalNumber,
    feeCurrency: optionalString,
    externalId: optionalString,
    broker: z.string().default(''),
    portfolioId: optionalString
}).passthrough();

const securitySchema = z.object({
    isin: z.string().min(1),
    name: z.string().default(''),
    currency: z.string().default('EUR'),
    symbol: optionalString,
    priceHistory: numberRecord.optional(),
    splits: numberRecord.optional()
}).passthrough();

const cashAccountSchema = z.object({
    id: z.string().min(1),
    name: z.string().default(''),
    currency: z.string().min(1),
    portfolioId: optionalString,
    balanceHistory: numberRecord.optional()
}).passthrough();

const cashMovementSchema = z.object({
    id: z.string().min(1),
    date: z.string().min(1),
    type: z.string().min(1),
    amount: z.number().finite(),
    currency: z.string().min(1),
    broker: z.string().default(''),
    portfolioId: optionalString
}).passthrough();

const projectSchema = z.object({
    version: z.number().default(1),
    id: z.string().min(1),
    name: z.string().default('Mein Portfolio'),
    created: z.string().default(''),
    modified: z.string().default(''),
    settings: z.object({ baseCurrency: z.string().min(1).default('EUR') }).passthrough().default({}),
    portfolios: z.array(z.object({ id: z.string().min(1), name: z.string().default('') }).passthrough()).default([]),
    transactions: z.array(transactionSchema).default([]),
    securities: z.record(securitySchema).default({}),
    cashAccounts: z.array(cashAccountSchema).default([]),
    cashMovements: z.array(cashMovementSchema).default([]),
    fxData: z.object({
        baseCurrency: z.literal('EUR').default('EUR'),
        rates: z.record(numberRecord).default({}),
        lastUpdated: z.string().default('')
    }).passthrough().default({})
}).passthrough();

export class ProjectFormatError extends Error {
    constructor(detail: string) {
        super(`Die Projektdatei ist beschädigt oder hat ein unbekanntes Format: ${detail}`);
        this.name = 'ProjectFormatError';
    }
}

/** Validates loaded project data before anything calculates with it. */
export const parseProjectData = (value: unknown): ProjectData => {
    const result = projectSchema.safeParse(value);
    if (!result.success) throw new ProjectFormatError(describeIssues(result.error));
    return result.data as unknown as ProjectData;
};

const numberRecordMap = z.record(numberRecord);

/** Cleans lazily loaded { key: { date: number } } sections; unreadable sections become empty. */
export const parseNumberRecordMap = (value: unknown): Record<string, Record<string, number>> => {
    const result = numberRecordMap.safeParse(value);
    return result.success ? result.data : {};
};
