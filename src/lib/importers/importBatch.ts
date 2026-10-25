import {
    parseFlatexCashBalancesCsv,
    parseFlatexCashMovementsCsv,
    parseFlatexCsv,
    type CashBalanceImportPoint,
    type CashMovementImportEntry
} from '@/lib/csvParser';
import { hash53 } from '@/lib/hash';
import { mergeImportedTransactions } from '@/lib/importMerge';
import { dropDuplicateTradeFees, entryFromCashMovement, entryFromTransaction, ledgerToTransactions, sortLedger } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import type { CashAccount, LedgerEntry, ProjectData, Security, Transaction } from '@/types/domain';

/** What an importer (CSV file, broker connection) hands to the app. */
export interface ImportBatch {
    broker: string;
    transactions: Transaction[];
    cashMovements: CashMovementImportEntry[];
    cashBalances: CashBalanceImportPoint[];
}

export interface ImportTarget {
    id: string;
    name: string;
    isNew: boolean;
}

export interface ImportSummary {
    addedTransactions: number;
    duplicateTransactions: number;
    addedMovements: number;
    duplicateMovements: number;
    balancePoints: number;
}

export const emptyImportBatch = (broker: string): ImportBatch => ({
    broker,
    transactions: [],
    cashMovements: [],
    cashBalances: []
});

/** Parses DEGIRO exports (Transactions.csv and/or Account.csv); each file is recognised by its header. */
export const parseDegiroFiles = (texts: string[]): ImportBatch => {
    const batch = emptyImportBatch('Flatex');
    texts.forEach((text) => {
        batch.transactions.push(...parseFlatexCsv(text));
        batch.cashMovements.push(...parseFlatexCashMovementsCsv(text));
        batch.cashBalances.push(...parseFlatexCashBalancesCsv(text));
    });
    return batch;
};

export const isEmptyImportBatch = (batch: ImportBatch): boolean => (
    batch.transactions.length === 0 && batch.cashMovements.length === 0 && batch.cashBalances.length === 0
);

const movementKey = (movement: { date: string; currency: string; amount: number; description?: string; sourceKey?: string }) => (
    movement.sourceKey || `${movement.date}|${movement.currency}|${movement.amount}|${movement.description || ''}`
);

/**
 * Merges an import into the project's ledger. Pure and deterministic (ids are derived from
 * stable keys), so it can run inside a React state updater and be repeated for a preview.
 * Bookings already in the target portfolio are skipped and counted as duplicates, and so are
 * DEGIRO statement fee rows that the trade already carries.
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

    // Trades: dedupe against the trades already in the ledger
    const existingTrades = ledgerToTransactions(ledger.filter((entry) => entry.kind === 'buy' || entry.kind === 'sell' || entry.kind === 'split'));
    const merged = mergeImportedTransactions(existingTrades, batch.transactions, target.id);
    const tradeEntries: LedgerEntry[] = merged.added.map((tx) => entryFromTransaction({
        ...tx,
        id: `le-${hash53(`${target.id}|${tx.broker}|${tx.externalId ?? tx.id}`)}`
    }));

    let securities = project.securities;
    merged.added.forEach((tx) => {
        if (!tx.isin || securities[tx.isin]) return;
        const security: Security = {
            isin: tx.isin,
            symbol: tx.isin, // resolved to a ticker by the next market sync
            name: tx.name || tx.isin,
            currency: tx.currency,
            quoteType: 'Stock',
            priceHistory: {}
        };
        securities = { ...securities, [tx.isin]: security };
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

    // Statement rows (dividends, taxes, deposits, FX legs, ...)
    const knownMovements = new Set(
        ledger
            .filter((entry) => entry.kind !== 'buy' && entry.kind !== 'sell' && entry.kind !== 'split' && entry.externalId)
            .map((entry) => `${entry.portfolioId || ''}|${entry.externalId}`)
    );
    const movementEntries: LedgerEntry[] = [];
    let duplicateMovements = 0;
    batch.cashMovements.forEach((movement) => {
        const sourceKey = movementKey(movement);
        const key = `${target.id}|${sourceKey}`;
        if (knownMovements.has(key)) {
            duplicateMovements += 1;
            return;
        }
        knownMovements.add(key);
        movementEntries.push(entryFromCashMovement({
            id: `le-${hash53(key)}`,
            date: movement.date,
            type: movement.type,
            amount: movement.amount,
            currency: movement.currency,
            description: movement.description,
            ...(movement.isin ? { isin: movement.isin } : {}),
            ...(movement.name ? { name: movement.name } : {}),
            broker: batch.broker,
            portfolioId: target.id,
            isInternal: movement.isInternal,
            sourceKey,
            originalData: movement.originalData
        }));
    });

    const added = [...tradeEntries, ...movementEntries];
    const { entries: nextLedger, dropped } = dropDuplicateTradeFees(sortLedger([...ledger, ...added]));
    const surviving = new Set(nextLedger.map((entry) => entry.id));
    const addedMovements = movementEntries.filter((entry) => surviving.has(entry.id)).length;
    const droppedExisting = dropped - (movementEntries.length - addedMovements);

    const ledgerChanged = tradeEntries.length + addedMovements > 0 || droppedExisting > 0;
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
            addedTransactions: tradeEntries.length,
            duplicateTransactions: merged.duplicates,
            addedMovements,
            duplicateMovements: duplicateMovements + (movementEntries.length - addedMovements),
            balancePoints: batch.cashBalances.length
        }
    };
};
