import type { CashMovement, LedgerEntry, LedgerKind, ProjectData, Transaction } from '@/types/domain';

// Conversions between the stored ledger and the views the rest of the app uses:
// Transaction (calculations, edit form, importer output) and CashMovement (statement rows).

const TRANSACTION_KIND: Record<Transaction['type'], LedgerKind> = {
    Buy: 'buy',
    Sparplan_Buy: 'buy',
    Sell: 'sell',
    Dividend: 'dividend',
    Tax: 'tax',
    Fee: 'fee',
    Interest: 'interest',
    Deposit: 'deposit',
    Withdrawal: 'withdrawal',
    Split: 'split'
};

const TRANSACTION_TYPE: Partial<Record<LedgerKind, Transaction['type']>> = {
    buy: 'Buy',
    sell: 'Sell',
    split: 'Split',
    dividend: 'Dividend',
    withholding_tax: 'Tax',
    tax: 'Tax',
    fee: 'Fee',
    interest: 'Interest',
    deposit: 'Deposit',
    withdrawal: 'Withdrawal'
};

const MOVEMENT_TYPE: Partial<Record<LedgerKind, CashMovement['type']>> = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    dividend: 'Dividend',
    withholding_tax: 'Tax',
    tax: 'Tax',
    fee: 'Fee',
    interest: 'Interest',
    fx: 'Transfer',
    transfer: 'Transfer',
    adjustment: 'Adjustment'
};

const isWithholdingTax = (description: string | undefined, isin: string | undefined) => (
    Boolean(isin) || /dividendensteuer|quellensteuer|withholding/i.test(description || '')
);

export const cashMovementKind = (movement: { type: CashMovement['type']; isInternal?: boolean; description?: string; isin?: string }): LedgerKind => {
    switch (movement.type) {
        case 'Deposit': return 'deposit';
        case 'Withdrawal': return 'withdrawal';
        case 'Dividend': return 'dividend';
        case 'Tax': return isWithholdingTax(movement.description, movement.isin) ? 'withholding_tax' : 'tax';
        case 'Fee': return 'fee';
        case 'Interest': return 'interest';
        case 'Transfer': return /w(a|ä)hrungswechsel|^fx[ -]/i.test(movement.description || '') ? 'fx' : 'transfer';
        case 'Adjustment': return 'adjustment';
    }
};

/** Order id of a DEGIRO trade row (Transactions.csv, 17/18 columns). */
const tradeOrderId = (tx: Transaction): string | undefined => {
    if (tx.broker !== 'Flatex' || !Array.isArray(tx.originalData)) return undefined;
    const row = tx.originalData as string[];
    if (row.length < 17) return undefined;
    return (row[17] || row[16] || '').trim() || undefined;
};

/** Order id of a DEGIRO Account.csv row (column 11), if the row belongs to a trade. */
const statementOrderId = (movement: Pick<CashMovement, 'broker' | 'originalData'>): string | undefined => {
    if (movement.broker !== 'Flatex' || !Array.isArray(movement.originalData)) return undefined;
    return ((movement.originalData as string[])[11] || '').trim() || undefined;
};

/** Size of a trade. Importers disagree on the sign of `shares` for sells; the type carries the direction. */
// eslint-disable-next-line no-restricted-syntax -- normalizes an unsigned field, not a cash amount
const tradeSize = (shares: number | undefined) => Math.abs(shares ?? 0);

export const entryFromTransaction = (tx: Transaction): LedgerEntry => {
    const kind = TRANSACTION_KIND[tx.type] ?? 'adjustment';
    const quantity = kind === 'buy' || kind === 'split'
        ? tradeSize(tx.shares)
        : kind === 'sell' ? -tradeSize(tx.shares) : undefined;
    const orderId = tradeOrderId(tx);
    return {
        id: tx.id,
        source: tx.broker,
        ...(tx.externalId ? { externalId: tx.externalId } : {}),
        ...(orderId ? { orderId } : {}),
        ...(tx.portfolioId ? { portfolioId: tx.portfolioId } : {}),
        date: tx.date.slice(0, 10),
        kind,
        ...(tx.type === 'Sparplan_Buy' ? { savingsPlan: true } : {}),
        ...(tx.isin ? { isin: tx.isin } : {}),
        ...(tx.name ? { name: tx.name } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
        amount: tx.amount,
        currency: tx.currency,
        ...(tx.fee ? { fee: tx.fee } : {}),
        ...(tx.fxFee ? { fxFee: tx.fxFee } : {}),
        ...(tx.feeCurrency ? { feeCurrency: tx.feeCurrency } : {}),
        ...(tx.exchangeRate ? { fxRate: tx.exchangeRate } : {}),
        ...(tx.originalData !== undefined ? { raw: tx.originalData } : {})
    };
};

export const entryFromCashMovement = (movement: CashMovement): LedgerEntry => {
    const orderId = statementOrderId(movement);
    return {
        id: movement.id,
        source: movement.broker,
        ...(movement.sourceKey ? { externalId: movement.sourceKey } : {}),
        ...(orderId ? { orderId } : {}),
        ...(movement.portfolioId ? { portfolioId: movement.portfolioId } : {}),
        date: movement.date.slice(0, 10),
        kind: cashMovementKind(movement),
        ...(movement.isin ? { isin: movement.isin } : {}),
        ...(movement.name ? { name: movement.name } : {}),
        amount: movement.amount,
        currency: movement.currency,
        ...(movement.isInternal ? { internal: true } : {}),
        ...(movement.description ? { description: movement.description } : {}),
        ...(movement.originalData !== undefined ? { raw: movement.originalData } : {})
    };
};

/** Transaction view; null for entries that are no transaction (FX legs, transfers, adjustments). */
export const entryToTransaction = (entry: LedgerEntry): Transaction | null => {
    const type = entry.kind === 'buy' && entry.savingsPlan ? 'Sparplan_Buy' : TRANSACTION_TYPE[entry.kind];
    if (!type) return null;
    return {
        id: entry.id,
        date: entry.date,
        type,
        ...(entry.isin ? { isin: entry.isin } : {}),
        name: entry.name || entry.description,
        ...(entry.quantity !== undefined ? { shares: entry.quantity } : {}),
        amount: entry.amount,
        currency: entry.currency,
        ...(entry.fxRate ? { exchangeRate: entry.fxRate } : {}),
        ...(entry.fee ? { fee: entry.fee } : {}),
        ...(entry.fxFee ? { fxFee: entry.fxFee } : {}),
        ...(entry.feeCurrency ? { feeCurrency: entry.feeCurrency } : {}),
        ...(entry.externalId ? { externalId: entry.externalId } : {}),
        broker: entry.source,
        ...(entry.portfolioId ? { portfolioId: entry.portfolioId } : {}),
        ...(entry.raw !== undefined ? { originalData: entry.raw } : {})
    };
};

/** Statement view; null for trades and splits (their cash shows in the trade). */
export const entryToCashMovement = (entry: LedgerEntry): CashMovement | null => {
    const type = MOVEMENT_TYPE[entry.kind];
    if (!type) return null;
    return {
        id: entry.id,
        date: entry.date,
        type,
        amount: entry.amount,
        currency: entry.currency,
        ...(entry.description || entry.name ? { description: entry.description || entry.name } : {}),
        ...(entry.isin ? { isin: entry.isin } : {}),
        ...(entry.name ? { name: entry.name } : {}),
        broker: entry.source,
        ...(entry.portfolioId ? { portfolioId: entry.portfolioId } : {}),
        ...(entry.internal ? { isInternal: true } : {}),
        ...(entry.externalId ? { sourceKey: entry.externalId } : {}),
        ...(entry.raw !== undefined ? { originalData: entry.raw } : {})
    };
};

/**
 * Transactions for the calculations (holdings, history, dividends, performance).
 * Internal moves (FX legs, sweeps) and adjustments are left out.
 */
export const ledgerToTransactions = (entries: LedgerEntry[]): Transaction[] => {
    const result: Transaction[] = [];
    entries.forEach((entry) => {
        if (entry.internal) return;
        const tx = entryToTransaction(entry);
        if (tx) result.push(tx);
    });
    return result;
};

/**
 * DEGIRO books a trade's fee twice: on the trade row and as a statement row. The trade keeps
 * it (cost basis); statement fee rows of a trade in the same portfolio are dropped. Runs on
 * import, whichever of the two files comes first.
 */
export const dropDuplicateTradeFees = (entries: LedgerEntry[]): { entries: LedgerEntry[]; dropped: number } => {
    const tradeOrders = new Set(
        entries
            .filter((entry) => (entry.kind === 'buy' || entry.kind === 'sell') && entry.orderId)
            .map((entry) => `${entry.portfolioId || ''}|${entry.orderId}`)
    );
    if (tradeOrders.size === 0) return { entries, dropped: 0 };
    const kept = entries.filter((entry) => !(
        entry.kind === 'fee' && entry.orderId && tradeOrders.has(`${entry.portfolioId || ''}|${entry.orderId}`)
    ));
    return { entries: kept, dropped: entries.length - kept.length };
};

/** Stable sort by date; entries of one day keep their order. */
export const sortLedger = (entries: LedgerEntry[]): LedgerEntry[] => entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .map(({ entry }) => entry);

export const getProjectLedger = (project: Pick<ProjectData, 'ledger'> | null | undefined): LedgerEntry[] => project?.ledger ?? [];

const roundCents = (value: number) => Math.round(value * 100) / 100;

/**
 * Cash per currency as the ledger books it, to compare with the broker's balances.
 * Trade fees are charged in the fee currency. The FX fee (DEGIRO AutoFX) is not a booking
 * of its own: it is priced into the conversion legs, so it only counts for the cost basis.
 */
export const deriveCashBalances = (entries: LedgerEntry[]): Record<string, number> => {
    const balances: Record<string, number> = {};
    const add = (currency: string, amount: number) => {
        if (!amount) return;
        balances[currency] = (balances[currency] ?? 0) + amount;
    };
    for (const entry of entries) {
        add(entry.currency, entry.amount);
        if (entry.fee) add(entry.feeCurrency || entry.currency, entry.fee);
    }
    for (const currency of Object.keys(balances)) balances[currency] = roundCents(balances[currency]);
    return balances;
};
