import { buildDegiroTradeKey } from '@/lib/csvParser';
import type { Transaction } from '@/types/domain';

export interface TransactionMergeResult {
    transactions: Transaction[];
    added: Transaction[];
    duplicates: number;
}

/**
 * Key that identifies the same trade across imports, without the per-file occurrence suffix.
 * Manual entries have no key: two identical manual entries are intentional.
 */
const baseDedupeKey = (tx: Transaction): string | null => {
    if (tx.broker === 'Manual') return null;
    // Flatex/DEGIRO rows imported before externalId existed still carry their raw CSV row.
    if (Array.isArray(tx.originalData) && tx.originalData.length >= 17) {
        return buildDegiroTradeKey(tx.originalData as string[]);
    }
    return `content:${tx.date}|${tx.isin || ''}|${tx.type}|${tx.shares ?? ''}|${tx.amount}|${tx.currency}`;
};

/** Numbers repeated keys (#2, #3, ...) in order, so identical rows inside one file stay distinct. */
const createKeyer = () => {
    const seen = new Map<string, number>();
    return (scope: string, tx: Transaction): string | null => {
        if (tx.externalId) return tx.externalId;
        const base = baseDedupeKey(tx);
        if (!base) return null;
        const counterKey = `${scope}|${base}`;
        const occurrence = (seen.get(counterKey) || 0) + 1;
        seen.set(counterKey, occurrence);
        return occurrence > 1 ? `${base}#${occurrence}` : base;
    };
};

/**
 * Adds imported trades to a portfolio and skips the ones that are already there
 * (same portfolio, broker and external id). New trades get an externalId so later
 * imports can match them directly.
 */
export const mergeImportedTransactions = (
    existing: Transaction[],
    incoming: Transaction[],
    portfolioId: string
): TransactionMergeResult => {
    const keyExisting = createKeyer();
    const known = new Set<string>();
    existing.forEach((tx) => {
        const scope = `${tx.portfolioId || ''}|${tx.broker}`;
        const key = keyExisting(scope, tx);
        if (key) known.add(`${scope}|${key}`);
    });

    const keyIncoming = createKeyer();
    const added: Transaction[] = [];
    let duplicates = 0;

    incoming.forEach((tx) => {
        const scope = `${portfolioId}|${tx.broker}`;
        const key = keyIncoming(scope, tx);
        if (key && known.has(`${scope}|${key}`)) {
            duplicates += 1;
            return;
        }
        if (key) known.add(`${scope}|${key}`);
        added.push({ ...tx, portfolioId, ...(key ? { externalId: key } : {}) });
    });

    return {
        transactions: added.length > 0 ? [...existing, ...added] : existing,
        added,
        duplicates
    };
};
