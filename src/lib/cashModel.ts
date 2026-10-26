import type { Transaction } from '@/types/domain';

// Cash of a portfolio without imported account balances, derived from its bookings.
// Sale proceeds, dividends, interest and deposits add to the cash of their currency; buys
// (with their fees), fees, taxes and withdrawals take from it. When an outflow needs more
// than the cash of its currency, the difference counts as newly invested money: the owner
// paid it in, even if the deposit was never booked.
//
// A shortfall in one currency is first covered from the cash of the other currencies (base
// currency first), as a broker converts automatically; only the rest is new money. Imported
// account statements, when present, replace this model.

export interface CashState {
    baseCurrency: string;
    byCurrency: Record<string, number>;
    /** Money put in from outside, in the base currency: deposits − withdrawals + uncovered outflows. */
    invested: number;
}

/** Converts an amount of `currency` on `date` into the base currency. */
export type ToBase = (amount: number, currency: string, date: string) => number;

export const createCashState = (baseCurrency = 'EUR'): CashState => ({ baseCurrency, byCurrency: {}, invested: 0 });

const isTrade = (type: Transaction['type']) => type === 'Buy' || type === 'Sparplan_Buy' || type === 'Sell';
const CASH_TYPES = new Set<Transaction['type']>(['Deposit', 'Withdrawal', 'Dividend', 'Tax', 'Fee', 'Interest']);

/** Covers `shortfall` (in the base currency) from the other currencies' cash; returns the rest. */
const coverFromOtherCurrencies = (state: CashState, except: string, shortfall: number, date: string, toBase: ToBase): number => {
    const sources = Object.keys(state.byCurrency)
        .filter((currency) => currency !== except && state.byCurrency[currency] > 0)
        .sort((a, b) => (a === state.baseCurrency ? -1 : b === state.baseCurrency ? 1 : a.localeCompare(b)));
    let rest = shortfall;
    for (const currency of sources) {
        if (rest <= 0) break;
        const cash = state.byCurrency[currency];
        const available = toBase(cash, currency, date);
        if (!(available > 0)) continue;
        const used = Math.min(available, rest);
        state.byCurrency[currency] = cash * (1 - used / available);
        rest -= used;
    }
    return rest;
};

const book = (state: CashState, currency: string, amount: number, date: string, toBase: ToBase) => {
    if (!amount) return;
    const next = (state.byCurrency[currency] ?? 0) + amount;
    state.byCurrency[currency] = Math.max(0, next);
    if (next < 0) {
        state.invested += coverFromOtherCurrencies(state, currency, toBase(-next, currency, date), date, toBase);
    }
};

/** Applies one booking. Order matters: replay inflows of a day before its buys. */
export const applyToCash = (state: CashState, tx: Transaction, toBase: ToBase): void => {
    const currency = tx.currency || 'EUR';
    const date = tx.date.slice(0, 10);
    if (tx.type === 'Deposit' || tx.type === 'Withdrawal') {
        state.invested += toBase(tx.amount || 0, currency, date);
    }
    if (isTrade(tx.type) || CASH_TYPES.has(tx.type)) {
        book(state, currency, tx.amount || 0, date, toBase);
    }
    if (isTrade(tx.type)) {
        // Without account statements there are no FX legs, so the FX fee is paid from cash too
        const feeCurrency = tx.feeCurrency || currency;
        book(state, feeCurrency, (tx.fee || 0) + (tx.fxFee || 0), date, toBase);
    }
};

/** Same-day order: money comes in before it goes out (sell and buy on one day = rebalancing). */
export const cashOrder = (tx: Transaction): number => {
    if (tx.type === 'Deposit' || tx.type === 'Dividend' || tx.type === 'Sell' || tx.type === 'Interest') return 0;
    if (tx.type === 'Buy' || tx.type === 'Sparplan_Buy') return 2;
    if (tx.type === 'Withdrawal' || tx.type === 'Fee' || tx.type === 'Tax') return 3;
    return 1;
};

export const sortForCash = (transactions: Transaction[]): Transaction[] => (
    [...transactions].sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || cashOrder(a) - cashOrder(b))
);

export const replayCash = (transactions: Transaction[], toBase: ToBase, baseCurrency = 'EUR'): CashState => {
    const state = createCashState(baseCurrency);
    sortForCash(transactions).forEach((tx) => applyToCash(state, tx, toBase));
    return state;
};
