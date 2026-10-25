import { convertCurrency } from '@/lib/fxUtils';
import type { CashMovement, FxData, Transaction } from '@/types/domain';

export interface TransactionSummary {
    count: number;
    volume: number; // sum of absolute amounts, base currency
    net: number;
    inflow: number;
    outflow: number; // positive number
    buyCount: number;
    sellCount: number;
    dividendCount: number;
    feeCount: number;
    otherCount: number;
}

/** Totals of a list of transactions in the base currency (for the transactions page). */
export const summarizeTransactions = (transactions: Transaction[], fxData: FxData, baseCurrency: string): TransactionSummary => {
    const summary: TransactionSummary = { count: transactions.length, volume: 0, net: 0, inflow: 0, outflow: 0, buyCount: 0, sellCount: 0, dividendCount: 0, feeCount: 0, otherCount: 0 };
    transactions.forEach((tx) => {
        const amount = convertCurrency(fxData, Number(tx.amount) || 0, tx.currency || baseCurrency, baseCurrency, tx.date);
        summary.net += amount;
        if (amount >= 0) summary.inflow += amount; else summary.outflow -= amount;
        summary.volume += amount >= 0 ? amount : -amount;
        if (tx.type === 'Buy' || tx.type === 'Sparplan_Buy') summary.buyCount += 1;
        else if (tx.type === 'Sell') summary.sellCount += 1;
        else if (tx.type === 'Dividend') summary.dividendCount += 1;
        else if (tx.type === 'Fee' || tx.type === 'Tax') summary.feeCount += 1;
        else summary.otherCount += 1;
    });
    return summary;
};

/** Counts and net amount of statement rows in the base currency. */
export const summarizeCashMovements = (movements: CashMovement[], fxData: FxData, baseCurrency: string) => {
    let internalCount = 0;
    let net = 0;
    movements.forEach((movement) => {
        if (movement.isInternal) internalCount += 1;
        net += convertCurrency(fxData, movement.amount, movement.currency, baseCurrency, movement.date);
    });
    return { count: movements.length, internalCount, externalCount: movements.length - internalCount, net };
};
