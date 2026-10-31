import {
    parseDegiroAccountCsv,
    parseDegiroTradesCsv,
    parseFlatexCashBalancesCsv,
    type CashBalanceImportPoint
} from '@/lib/csvParser';
import { hash53 } from '@/lib/hash';
import { dropDuplicateTradeFees, sortLedger } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import type { CashAccount, LedgerEntry, ProjectData, Security } from '@/types/domain';
import { createComdirectOverlap } from './comdirectOverlap';
import { isTradeEntry, type ImportEntry } from './entries';

/** What an importer (CSV file, broker connection) hands to the app. */
export interface ImportBatch {
    source: string;
    entries: ImportEntry[];
    cashBalances: CashBalanceImportPoint[];
}

export interface ImportTarget {
    id: string;
    name: string;
    isNew: boolean;
}

export interface ImportSummary {
    addedTransactions: number; // trades
    duplicateTransactions: number;
    addedMovements: number; // every other booking
    duplicateMovements: number;
    balancePoints: number;
}

export const emptyImportBatch = (source: string): ImportBatch => ({ source, entries: [], cashBalances: [] });

/** Parses DEGIRO exports (Transactions.csv and/or Account.csv); each file is recognised by its header. */
export const parseDegiroFiles = (texts: string[]): ImportBatch => {
    const batch = emptyImportBatch('Flatex');
    texts.forEach((text) => {
        batch.entries.push(...parseDegiroTradesCsv(text), ...parseDegiroAccountCsv(text));
        batch.cashBalances.push(...parseFlatexCashBalancesCsv(text));
    });
    return batch;
};

export const isEmptyImportBatch = (batch: ImportBatch): boolean => (
    batch.entries.length === 0 && batch.cashBalances.length === 0
);

/** Appends batches of the same source (e.g. several files of one folder scan). */
export const concatImportBatches = (source: string, batches: ImportBatch[]): ImportBatch => ({
    source,
    entries: batches.flatMap((batch) => batch.entries),
    cashBalances: batches.flatMap((batch) => batch.cashBalances)
});

/** Key for sources without ids. Manual entries have none: two identical manual entries are intentional. */
const contentKey = (entry: Pick<LedgerEntry, 'date' | 'isin' | 'kind' | 'quantity' | 'amount' | 'currency' | 'description'>) => (
    `content:${entry.date}|${entry.isin || ''}|${entry.kind}|${entry.quantity ?? ''}|${entry.amount}|${entry.currency}|${entry.description || ''}`
);

/** Numbers repeated content keys (#2, #3, ...) in order, so identical rows inside one file stay distinct. */
const createKeyer = () => {
    const seen = new Map<string, number>();
    return (scope: string, entry: ImportEntry | LedgerEntry): string | null => {
        if (entry.externalId) return entry.externalId;
        if (entry.source === 'Manual') return null;
        const base = contentKey(entry);
        const counterKey = `${scope}|${base}`;
        const occurrence = (seen.get(counterKey) || 0) + 1;
        seen.set(counterKey, occurrence);
        return occurrence > 1 ? `${base}#${occurrence}` : base;
    };
};

/**
 * Merges an import into the project's ledger. Pure and deterministic (ids derive from the
 * dedupe keys), so it can run inside a React state updater and be repeated for a preview.
 * Bookings already in the target portfolio (same source and key) are skipped and counted as
 * duplicates, and so are DEGIRO statement fee rows that their trade already carries and
 * comdirect bookings the other import path (API or PDF) already holds.
 */
export const applyImportBatch = (
    project: ProjectData,
    batch: ImportBatch,
    target: ImportTarget
): { project: ProjectData; summary: ImportSummary } => {
    const portfolios = project.portfolios || [];
    const updatedPortfolios = target.isNew && !portfolios.some((p) => p.id === target.id)
        ? [...portfolios, { id: target.id, name: target.name }]
        : portfolios;
    const ledger = getLedger(project);

    const keyExisting = createKeyer();
    const known = new Set<string>();
    ledger.forEach((entry) => {
        const scope = `${entry.portfolioId || ''}|${entry.source}`;
        const key = keyExisting(scope, entry);
        if (key) known.add(`${scope}|${key}`);
    });

    const keyIncoming = createKeyer();
    const comdirect = createComdirectOverlap(ledger.filter((entry) => entry.portfolioId === target.id));
    const added: LedgerEntry[] = [];
    let duplicateTrades = 0;
    let duplicateOthers = 0;
    batch.entries.forEach((entry, index) => {
        const scope = `${target.id}|${entry.source}`;
        const key = keyIncoming(scope, entry);
        if ((key && known.has(`${scope}|${key}`)) || comdirect.covers(entry)) {
            if (isTradeEntry(entry)) duplicateTrades += 1; else duplicateOthers += 1;
            return;
        }
        if (key) known.add(`${scope}|${key}`);
        added.push({
            ...entry,
            id: `le-${hash53(`${scope}|${key ?? `${batch.source}#${index}`}`)}`,
            portfolioId: target.id,
            ...(key ? { externalId: key } : {})
        });
    });

    let securities = project.securities;
    added.forEach((entry) => {
        if (!isTradeEntry(entry) || !entry.isin || securities[entry.isin]) return;
        const security: Security = {
            isin: entry.isin,
            symbol: entry.isin, // resolved to a ticker by the next market sync
            name: entry.name || entry.isin,
            currency: entry.currency,
            quoteType: 'Stock',
            priceHistory: {}
        };
        securities = { ...securities, [entry.isin]: security };
    });

    // Cash balances: one account per portfolio, currency and source
    const accountKey = (account: Pick<CashAccount, 'portfolioId' | 'currency' | 'sourceKey'>) =>
        `${account.portfolioId || ''}|${account.currency}|${account.sourceKey || ''}`;
    const accounts = new Map<string, CashAccount>((project.cashAccounts || []).map((a) => [accountKey(a), a]));
    batch.cashBalances.forEach((point) => {
        const sourceKey = point.accountKey || '';
        const key = `${target.id}|${point.currency}|${sourceKey}`;
        const existing = accounts.get(key);
        accounts.set(key, existing
            ? { ...existing, balanceHistory: { ...(existing.balanceHistory || {}), [point.date]: point.balance } }
            : {
                id: `acc-${hash53(key)}`,
                name: `${target.name} ${point.currency} ${point.accountLabel || 'Konto'}`,
                portfolioId: target.id,
                currency: point.currency,
                ...(sourceKey ? { sourceKey } : {}),
                balanceHistory: { [point.date]: point.balance }
            });
    });

    const { entries: nextLedger } = dropDuplicateTradeFees(sortLedger([...ledger, ...added]));
    const surviving = new Set(nextLedger.map((entry) => entry.id));
    const addedTrades = added.filter((entry) => isTradeEntry(entry)).length;
    const addedOthers = added.filter((entry) => !isTradeEntry(entry) && surviving.has(entry.id)).length;
    const droppedNew = added.length - addedTrades - addedOthers;
    const droppedExisting = ledger.length + added.length - nextLedger.length - droppedNew;

    const ledgerChanged = addedTrades + addedOthers > 0 || droppedExisting > 0;
    const changed = ledgerChanged || batch.cashBalances.length > 0 || updatedPortfolios !== portfolios;

    return {
        project: changed
            ? {
                ...project,
                portfolios: updatedPortfolios,
                ledger: ledgerChanged ? nextLedger : ledger,
                securities,
                cashAccounts: Array.from(accounts.values()),
                modified: new Date().toISOString()
            }
            : project,
        summary: {
            addedTransactions: addedTrades,
            duplicateTransactions: duplicateTrades,
            addedMovements: addedOthers,
            duplicateMovements: duplicateOthers + droppedNew,
            balancePoints: batch.cashBalances.length
        }
    };
};
