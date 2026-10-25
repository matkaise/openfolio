import type { Transaction } from '@/types/domain';

/**
 * Amount of an edited transaction. With quantity and price it is quantity × price, signed by
 * the type (buy = cash out, sell and dividend = cash in); otherwise the stored amount stays.
 * Used for the preview and for saving, so both always agree.
 */
export const resolveEditedAmount = (input: {
    type: Transaction['type'] | string;
    shares: string;
    pricePerShare: string;
    storedAmount: number;
}): number => {
    const shares = input.shares.trim() === '' ? NaN : Number(input.shares);
    const price = input.pricePerShare.trim() === '' ? NaN : Number(input.pricePerShare);
    if (!Number.isFinite(shares) || !Number.isFinite(price)) return input.storedAmount;
    const total = Math.abs(shares) * price;
    if (input.type === 'Buy' || input.type === 'Sparplan_Buy') return -Math.abs(total);
    if (input.type === 'Sell' || input.type === 'Dividend') return Math.abs(total);
    return total;
};
