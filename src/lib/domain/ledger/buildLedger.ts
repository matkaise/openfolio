import { classifyDegiroAccountDescription, parseDegiroAccountRow } from '@/lib/csvParser';
import type { CashMovement, ProjectData, Transaction } from '@/types/domain';

export type LedgerKind =
    | 'buy' | 'sell' | 'dividend' | 'withholding_tax' | 'tax' | 'fee' | 'interest'
    | 'deposit' | 'withdrawal' | 'fx' | 'transfer' | 'split' | 'adjustment';

/**
 * One booking, whatever it was imported from. Every figure (holdings, cash, dividends,
 * performance) is derived from these entries. Amounts keep the sign of the source:
 * positive = cash in, negative = cash out, in `currency`.
 */
export interface LedgerEntry {
    id: string; // stable: `${origin}:${stored id}`
    source: string; // broker / importer, e.g. 'Flatex', 'Manual', 'CSV'
    externalId?: string;
    portfolioId?: string;
    date: string; // YYYY-MM-DD (value date where known)
    kind: LedgerKind;
    isin?: string;
    name?: string;
    quantity?: number; // signed: + bought, - sold
    amount: number;
    currency: string;
    fee?: number;
    fxFee?: number;
    feeCurrency?: string;
    internal?: boolean; // moves money within the broker (FX legs, sweeps); not income, not a deposit
    description?: string;
    /** The stored record this entry was built from. */
    raw: { origin: 'transaction'; record: Transaction } | { origin: 'cashMovement'; record: CashMovement };
}

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

const isWithholdingTax = (description: string | undefined, isin: string | undefined) => (
    Boolean(isin) || /dividendensteuer|quellensteuer|withholding/i.test(description || '')
);

const cashMovementKind = (movement: { type: CashMovement['type']; isInternal?: boolean; description?: string; isin?: string }): LedgerKind => {
    switch (movement.type) {
        case 'Deposit': return 'deposit';
        case 'Withdrawal': return 'withdrawal';
        case 'Dividend': return 'dividend';
        case 'Tax': return isWithholdingTax(movement.description, movement.isin) ? 'withholding_tax' : 'tax';
        case 'Fee': return 'fee';
        case 'Interest': return 'interest';
        case 'Transfer': return /w(a|ä)hrungswechsel/i.test(movement.description || '') ? 'fx' : 'transfer';
        case 'Adjustment': return 'adjustment';
    }
};

/** Order id of a DEGIRO trade row (Transactions.csv, 17/18 columns). */
const tradeOrderId = (tx: Transaction): string | null => {
    if (tx.broker !== 'Flatex' || !Array.isArray(tx.originalData)) return null;
    const row = tx.originalData as string[];
    if (row.length < 17) return null;
    return (row[17] || row[16] || '').trim() || null;
};

/** Order id of an Account.csv row (column 11), if the row belongs to a trade. */
const accountRowOrderId = (movement: CashMovement): string | null => {
    if (!Array.isArray(movement.originalData)) return null;
    return ((movement.originalData as string[])[11] || '').trim() || null;
};

/** Account.csv rows that older versions stored as transactions (12 columns, raw row in originalData). */
const legacyAccountRow = (tx: Transaction): string[] | null => {
    if (tx.broker !== 'Flatex' || !Array.isArray(tx.originalData)) return null;
    const row = tx.originalData as string[];
    return row.length === 12 ? row : null;
};

const fromTransaction = (tx: Transaction): LedgerEntry => {
    const kind = TRANSACTION_KIND[tx.type] ?? 'adjustment';
    const shares = tx.shares ?? 0;
    const quantity = kind === 'buy' ? shares : kind === 'sell' ? -shares : undefined;
    return {
        id: `tx:${tx.id}`,
        source: tx.broker,
        externalId: tx.externalId,
        portfolioId: tx.portfolioId,
        date: tx.date.slice(0, 10),
        kind,
        isin: tx.isin,
        name: tx.name,
        ...(quantity !== undefined ? { quantity } : {}),
        amount: tx.amount,
        currency: tx.currency,
        ...(tx.fee ? { fee: tx.fee } : {}),
        ...(tx.fxFee ? { fxFee: tx.fxFee } : {}),
        ...(tx.feeCurrency ? { feeCurrency: tx.feeCurrency } : {}),
        raw: { origin: 'transaction', record: tx }
    };
};

/** Rebuilds a legacy account-row transaction with today's classification and its real sign. */
const fromLegacyAccountRow = (tx: Transaction, row: string[]): LedgerEntry | null => {
    const parsed = parseDegiroAccountRow(row);
    if (!parsed) return null;
    const classification = classifyDegiroAccountDescription(parsed.description);
    if (!classification) return null;
    const kind = cashMovementKind({ ...classification, description: parsed.description, isin: parsed.isin });
    return {
        id: `tx:${tx.id}`,
        source: tx.broker,
        portfolioId: tx.portfolioId,
        date: parsed.date,
        kind,
        isin: parsed.isin,
        name: parsed.name,
        amount: parsed.amount,
        currency: parsed.currency,
        ...(classification.isInternal ? { internal: true } : {}),
        description: parsed.description,
        raw: { origin: 'transaction', record: tx }
    };
};

const fromCashMovement = (movement: CashMovement): LedgerEntry => {
    // Older imports did not store the security; the raw Account.csv row still has it.
    const row = Array.isArray(movement.originalData) ? movement.originalData as string[] : null;
    const isin = movement.isin || (row?.[4] || '').trim() || undefined;
    const name = movement.name || (row?.[3] || '').trim() || undefined;
    return {
        id: `cash:${movement.id}`,
        source: movement.broker,
        externalId: movement.sourceKey,
        portfolioId: movement.portfolioId,
        date: movement.date.slice(0, 10),
        kind: cashMovementKind({ ...movement, isin }),
        ...(isin ? { isin } : {}),
        ...(name ? { name } : {}),
        amount: movement.amount,
        currency: movement.currency,
        ...(movement.isInternal ? { internal: true } : {}),
        description: movement.description,
        raw: { origin: 'cashMovement', record: movement }
    };
};

/**
 * Builds the ledger from the stored transactions and cash movements.
 *
 * Trade fees booked again as Account.csv rows are skipped when the trade itself is in
 * the portfolio, since the trade carries them.
 *
 * Older versions turned Account.csv dividend/interest rows into transactions as well as
 * cash movements, and counted withholding tax and debit interest as dividends. Those
 * transactions are dropped when the same portfolio has imported account rows (the cash
 * movements are complete), otherwise they are reclassified from their raw row.
 */
export const buildLedger = (project: Pick<ProjectData, 'transactions' | 'cashMovements'>): LedgerEntry[] => {
    const movements = project.cashMovements || [];
    const portfoliosWithAccountRows = new Set(
        movements.filter((m) => m.broker === 'Flatex').map((m) => m.portfolioId || '')
    );
    // Trade fees appear twice in DEGIRO exports: on the trade row and as an account row.
    // The trade keeps them (cost basis); the account row is skipped when its trade is known.
    const tradeOrders = new Set(
        (project.transactions || [])
            .map((tx) => {
                const orderId = tradeOrderId(tx);
                return orderId ? `${tx.portfolioId || ''}|${orderId}` : null;
            })
            .filter((key): key is string => key !== null)
    );

    const entries: LedgerEntry[] = [];
    (project.transactions || []).forEach((tx) => {
        const legacyRow = legacyAccountRow(tx);
        if (!legacyRow) {
            entries.push(fromTransaction(tx));
            return;
        }
        if (portfoliosWithAccountRows.has(tx.portfolioId || '')) return;
        const entry = fromLegacyAccountRow(tx, legacyRow);
        if (entry) entries.push(entry);
    });
    movements.forEach((movement) => {
        if (movement.type === 'Fee') {
            const orderId = accountRowOrderId(movement);
            if (orderId && tradeOrders.has(`${movement.portfolioId || ''}|${orderId}`)) return;
        }
        entries.push(fromCashMovement(movement));
    });

    // Stable order: by date, then as stored
    return entries
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
        .map(({ entry }) => entry);
};

const TRANSACTION_TYPE: Partial<Record<LedgerKind, Transaction['type']>> = {
    dividend: 'Dividend',
    withholding_tax: 'Tax',
    tax: 'Tax',
    fee: 'Fee',
    interest: 'Interest',
    deposit: 'Deposit',
    withdrawal: 'Withdrawal'
};

/**
 * Transaction view of the ledger for calculations that still take transactions.
 * Stored transactions are returned unchanged; cash movements and reclassified legacy rows
 * become signed transactions. Internal moves (FX legs, sweeps) and adjustments are left out.
 */
export const ledgerToTransactions = (entries: LedgerEntry[]): Transaction[] => {
    const result: Transaction[] = [];
    entries.forEach((entry) => {
        if (entry.internal) return;
        if (entry.raw.origin === 'transaction' && !legacyAccountRow(entry.raw.record)) {
            result.push(entry.raw.record);
            return;
        }
        const type = TRANSACTION_TYPE[entry.kind];
        if (!type) return;
        result.push({
            id: entry.id,
            date: entry.date,
            type,
            ...(entry.isin ? { isin: entry.isin } : {}),
            name: entry.name || entry.description,
            amount: entry.amount,
            currency: entry.currency,
            broker: entry.source,
            portfolioId: entry.portfolioId
        });
    });
    return result;
};

// Ledger per project state; a new project object (any change) rebuilds it.
const ledgerCache = new WeakMap<object, LedgerEntry[]>();

export const getProjectLedger = (project: ProjectData): LedgerEntry[] => {
    let ledger = ledgerCache.get(project);
    if (!ledger) {
        ledger = buildLedger(project);
        ledgerCache.set(project, ledger);
    }
    return ledger;
};
