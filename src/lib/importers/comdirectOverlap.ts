import type { LedgerEntry } from '@/types/domain';
import { isTradeEntry, type ImportEntry } from './entries';

// The comdirect API and the comdirect PDFs book the same transactions under the same
// source, but share no ids: one depot can be synced and fed with PDFs. A booking of one
// path is a duplicate if the other path already holds it: trades by trade date, security
// and quantity; income by the net amount that reached the account within a few days,
// because the API only knows that amount. Every booking covers one of the other path, so
// two equal trades of one day stay two trades. What the API does not report stays: the
// tax of a PDF trade has no counterpart, so it is kept.

/** Prefix of the ids of PDF bookings. */
export const COMDIRECT_PDF_ID = 'comdirect-pdf:';

const INCOME_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

type Entry = ImportEntry | LedgerEntry;
type Origin = 'api' | 'pdf';
type Income = { origin: Origin; isin?: string; date: string; net: number };

const originOf = (entry: Entry): Origin | null => {
    if (entry.source !== 'comdirect') return null;
    return entry.externalId?.startsWith(COMDIRECT_PDF_ID) ? 'pdf' : 'api';
};

const tradeKey = (origin: Origin, entry: Entry) => `${origin}|${entry.date}|${entry.isin}|${entry.kind}|${Math.abs(entry.quantity ?? 0).toFixed(6)}`;

const isIncome = (entry: Entry) => entry.kind === 'dividend' || entry.kind === 'interest';

/** What reached the account: PDFs keep it in `raw` because they book the income gross. */
const incomeOf = (origin: Origin, entry: Entry): Income => ({
    origin,
    isin: entry.isin,
    date: entry.date,
    net: origin === 'pdf' ? (entry.raw as { net?: number } | undefined)?.net ?? entry.amount : entry.amount
});

const matches = (a: Income, b: Income) => (
    a.origin !== b.origin
    && Math.round(a.net * 100) === Math.round(b.net * 100)
    && (!a.isin || !b.isin || a.isin === b.isin)
    && Math.abs(Date.parse(a.date) - Date.parse(b.date)) <= INCOME_DAYS * DAY_MS
);

/** `covers` tells whether an incoming booking is already there by the other import path. */
export const createComdirectOverlap = (portfolioLedger: LedgerEntry[]) => {
    const trades = new Map<string, number>();
    const income: Income[] = [];
    const coveredIncome = new Set<string>();
    portfolioLedger.forEach((entry) => {
        const origin = originOf(entry);
        if (!origin) return;
        if (isTradeEntry(entry)) trades.set(tradeKey(origin, entry), (trades.get(tradeKey(origin, entry)) || 0) + 1);
        else if (isIncome(entry)) income.push(incomeOf(origin, entry));
    });

    return {
        covers: (entry: ImportEntry): boolean => {
            const origin = originOf(entry);
            if (!origin) return false;
            // Withholding tax and tax of a covered PDF dividend: the API's net amount includes them
            if (coveredIncome.has((entry.externalId || '').replace(/:(?:withholding|tax)$/, ''))) return true;
            if (isTradeEntry(entry)) {
                const key = tradeKey(origin === 'pdf' ? 'api' : 'pdf', entry);
                const left = trades.get(key) || 0;
                if (left > 0) trades.set(key, left - 1);
                return left > 0;
            }
            if (!isIncome(entry)) return false;
            const incoming = incomeOf(origin, entry);
            const found = income.findIndex((other) => matches(incoming, other));
            if (found < 0) return false;
            income.splice(found, 1);
            if (origin === 'pdf' && entry.externalId) coveredIncome.add(entry.externalId);
            return true;
        }
    };
};
