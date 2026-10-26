import { z } from 'zod';
import { CURRENT_PROJECT_VERSION, type ProjectData } from '@/types/domain';
import { describeIssues, numberRecord, optionalNumber, optionalString } from './common';
import { getT } from '@/lib/i18n';

// Lenient on purpose: unknown fields pass through (newer app versions, legacy fields) and
// missing collections get defaults. Strict only where a wrong type would break calculations.

const LEDGER_KINDS = [
    'buy', 'sell', 'dividend', 'withholding_tax', 'tax', 'fee', 'interest',
    'deposit', 'withdrawal', 'fx', 'transfer', 'split', 'adjustment'
] as const;

const ledgerEntrySchema = z.object({
    id: z.string().min(1),
    source: z.string().default(''),
    externalId: optionalString,
    orderId: optionalString,
    portfolioId: optionalString,
    date: z.string().min(1),
    kind: z.enum(LEDGER_KINDS),
    isin: optionalString,
    name: optionalString,
    quantity: optionalNumber,
    amount: z.number().finite(),
    currency: z.string().min(1),
    fee: optionalNumber,
    fxFee: optionalNumber,
    feeCurrency: optionalString,
    fxRate: optionalNumber
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

const projectSchema = z.object({
    version: z.literal(CURRENT_PROJECT_VERSION),
    id: z.string().min(1),
    name: z.string().default('Mein Portfolio'),
    created: z.string().default(''),
    modified: z.string().default(''),
    settings: z.object({ baseCurrency: z.string().min(1).default('EUR') }).passthrough().default({}),
    portfolios: z.array(z.object({ id: z.string().min(1), name: z.string().default('') }).passthrough()).default([]),
    ledger: z.array(ledgerEntrySchema).default([]),
    securities: z.record(securitySchema).default({}),
    cashAccounts: z.array(cashAccountSchema).default([]),
    fxData: z.object({
        baseCurrency: z.literal('EUR').default('EUR'),
        rates: z.record(numberRecord).default({}),
        lastUpdated: z.string().default('')
    }).passthrough().default({})
}).passthrough();

export class ProjectFormatError extends Error {
    constructor(detail: string, complete = false) {
        super(complete ? detail : getT().services.project.corrupt(detail));
        this.name = 'ProjectFormatError';
    }
}

/** Validates loaded project data before anything calculates with it. */
export const outdatedProjectMessage = () => getT().services.project.outdated;

export const parseProjectData = (value: unknown): ProjectData => {
    const version = (value as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version < CURRENT_PROJECT_VERSION) throw new ProjectFormatError(outdatedProjectMessage(), true);
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
