import { cashMovementKind } from '@/lib/domain/ledger/ledger';
import type { CashMovement, LedgerEntry, LedgerKind } from '@/types/domain';

// What importers (CSV files, broker APIs) produce: ledger entries without id and portfolio.
// Both are assigned when the batch is merged into a project (applyImportBatch).

export type ImportEntry = Omit<LedgerEntry, 'id' | 'portfolioId'>;

/** Statement categories importers classify rows into; mapped to a ledger kind here. */
export type StatementType = CashMovement['type'];

const optional = <K extends string, V>(key: K, value: V | undefined | null | '' | 0): Partial<Record<K, V>> => (
    value === undefined || value === null || value === '' || value === 0 ? {} : { [key]: value } as Record<K, V>
);

/** A buy or sell. `quantity` is the size of the trade; its sign follows `side`. */
export const tradeEntry = (input: {
    source: string;
    externalId?: string;
    orderId?: string;
    date: string;
    side: 'buy' | 'sell';
    savingsPlan?: boolean;
    isin: string;
    name?: string;
    quantity: number;
    amount: number; // signed cash effect: negative for buys
    currency: string;
    fee?: number; // negative = cost
    fxFee?: number;
    feeCurrency?: string;
    fxRate?: number;
    raw?: unknown;
}): ImportEntry => {
    const size = Math.abs(input.quantity);
    return {
        source: input.source,
        ...optional('externalId', input.externalId),
        ...optional('orderId', input.orderId),
        date: input.date.slice(0, 10),
        kind: input.side,
        ...(input.savingsPlan ? { savingsPlan: true } : {}),
        isin: input.isin,
        ...optional('name', input.name),
        quantity: input.side === 'sell' ? -size : size,
        amount: input.amount,
        currency: input.currency,
        ...optional('fee', input.fee),
        ...optional('fxFee', input.fxFee),
        ...((input.fee || input.fxFee) && input.feeCurrency ? { feeCurrency: input.feeCurrency } : {}),
        ...optional('fxRate', input.fxRate),
        ...(input.raw !== undefined ? { raw: input.raw } : {})
    };
};

/** A statement row (deposit, dividend, tax, fee, interest, FX leg, ...) with its sign from the source. */
export const statementEntry = (input: {
    source: string;
    externalId?: string;
    orderId?: string;
    date: string;
    type: StatementType;
    kind?: LedgerKind; // overrides the kind derived from `type` (e.g. 'fx' for currency exchange legs)
    amount: number;
    currency: string;
    description?: string;
    isin?: string;
    name?: string;
    internal?: boolean;
    raw?: unknown;
}): ImportEntry => ({
    source: input.source,
    ...optional('externalId', input.externalId),
    ...optional('orderId', input.orderId),
    date: input.date.slice(0, 10),
    kind: input.kind ?? cashMovementKind({ type: input.type, description: input.description, isin: input.isin }),
    ...optional('isin', input.isin),
    ...optional('name', input.name),
    amount: input.amount,
    currency: input.currency,
    ...(input.internal ? { internal: true } : {}),
    ...optional('description', input.description),
    ...(input.raw !== undefined ? { raw: input.raw } : {})
});

export const isTradeEntry = (entry: Pick<LedgerEntry, 'kind'>): boolean => (
    entry.kind === 'buy' || entry.kind === 'sell' || entry.kind === 'split'
);
