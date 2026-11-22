import type { Transaction } from '@/types/domain';

const NEGATIVE_TYPES = new Set(['Buy', 'Sparplan_Buy', 'Withdrawal', 'Tax', 'Fee']);
const POSITIVE_TYPES = new Set(['Sell', 'Dividend', 'Deposit', 'Interest']);
const TRADE_TYPES = new Set(['Buy', 'Sparplan_Buy', 'Sell']);

export const isTradeType = (type: string) => TRADE_TYPES.has(type);

/** Cash direction of a type: buys, withdrawals, taxes and fees take money out. */
const signByType = (type: string, value: number): number => {
    if (NEGATIVE_TYPES.has(type)) return -Math.abs(value);
    if (POSITIVE_TYPES.has(type)) return Math.abs(value);
    return value;
};

/**
 * Amount of an edited transaction. For trades with quantity and price it is quantity × price;
 * otherwise the stored amount stays. Either way the sign follows the (possibly changed) type,
 * so switching buy ↔ sell or deposit ↔ withdrawal flips it. Used for the preview and for
 * saving, so both always agree.
 */
export const resolveEditedAmount = (input: {
    type: Transaction['type'] | string;
    shares: string;
    pricePerShare: string;
    storedAmount: number;
}): number => {
    const shares = input.shares.trim() === '' ? NaN : Number(input.shares);
    const price = input.pricePerShare.trim() === '' ? NaN : Number(input.pricePerShare);
    if (isTradeType(input.type) && Number.isFinite(shares) && Number.isFinite(price)) {
        return signByType(input.type, Math.abs(shares) * price);
    }
    return signByType(input.type, input.storedAmount);
};

/** Price per share to prefill the edit form: stored price, else amount ÷ quantity of a trade. */
export const initialPricePerShare = (tx: { type: string; amount: number; shares?: number; quantity?: number; pricePerShare?: number; price?: number }): number | undefined => {
    const stored = tx.pricePerShare ?? tx.price;
    if (stored !== undefined && stored !== null && Number.isFinite(Number(stored))) return Number(stored);
    const quantity = Math.abs(tx.shares ?? tx.quantity ?? 0);
    if (!isTradeType(tx.type) || !(quantity > 0) || !tx.amount) return undefined;
    return Math.round((Math.abs(tx.amount) / quantity) * 1e6) / 1e6;
};
