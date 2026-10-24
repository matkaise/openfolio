import {
    parseFlatexCashBalancesCsv,
    parseFlatexCashMovementsCsv,
    parseFlatexCsv,
    type CashBalanceImportPoint,
    type CashMovementImportEntry
} from '@/lib/csvParser';
import { hash53 } from '@/lib/hash';
import { mergeImportedTransactions } from '@/lib/importMerge';
import type { CashAccount, CashMovement, ProjectData, Security, Transaction } from '@/types/domain';

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
 * Merges an import into the project. Pure and deterministic (ids are derived from stable
 * keys), so it can run inside a React state updater and be repeated for a preview.
 * Trades and account rows already in the target portfolio are skipped and counted.
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

    // Trades
    const merged = mergeImportedTransactions(project.transactions, batch.transactions, target.id);
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

    // Account rows (dividends, taxes, deposits, ...)
    const movements = new Map<string, CashMovement>(
        (project.cashMovements || []).map((m) => [`${m.portfolioId || ''}|${movementKey(m)}`, m])
    );
    let addedMovements = 0;
    let duplicateMovements = 0;
    batch.cashMovements.forEach((movement) => {
        const sourceKey = movementKey(movement);
        const key = `${target.id}|${sourceKey}`;
        if (movements.has(key)) {
            duplicateMovements += 1;
            return;
        }
        addedMovements += 1;
        movements.set(key, {
            id: `mv-${hash53(key)}`,
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
        });
    });

    const changed = merged.added.length > 0 || addedMovements > 0 || batch.cashBalances.length > 0
        || updatedPortfolios !== portfolios;

    return {
        project: changed
            ? {
                ...project,
                portfolios: updatedPortfolios,
                transactions: merged.transactions,
                securities,
                cashAccounts: Array.from(accounts.values()),
                cashMovements: Array.from(movements.values()),
                modified: new Date().toISOString()
            }
            : project,
        summary: {
            addedTransactions: merged.added.length,
            duplicateTransactions: merged.duplicates,
            addedMovements,
            duplicateMovements,
            balancePoints: batch.cashBalances.length
        }
    };
};
