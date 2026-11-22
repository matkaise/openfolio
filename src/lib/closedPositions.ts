import { convertCurrency } from '@/lib/fxUtils';
import { buildSplitIgnoreDates, getTradeFeeCost } from '@/lib/portfolioUtils';
import type { ProjectData, Transaction } from '@/types/domain';

export interface ClosedPosition {
    isin: string;
    currency: string;
    name: string;
    quoteType: string;
    realized: number; // in the base currency: proceeds minus purchases and trade fees
    lastDate: string;
}

const isTrade = (type: Transaction['type']) => type === 'Buy' || type === 'Sell' || type === 'Sparplan_Buy';
// Transaction.shares has no consistent sign; the type gives the direction
const size = (tx: Transaction) => Math.abs(tx.shares || 0);

/**
 * Positions that were bought and fully sold again, newest first. Like the open holdings, one
 * position per ISIN whatever the trading currency (buy in USD, sell in EUR), with the
 * security's splits applied to the quantity. The realized result is the sum of the signed
 * trade amounts minus the trade fees, in the base currency.
 */
export const calculateClosedPositions = (project: ProjectData, transactions: Transaction[]): ClosedPosition[] => {
    const baseCurrency = project.settings.baseCurrency || 'EUR';
    const toBase = (amount: number, currency: string | undefined, date: string) => (
        convertCurrency(project.fxData, amount, currency || baseCurrency, baseCurrency, date)
    );

    const txByIsin: Record<string, Transaction[]> = {};
    transactions.forEach((tx) => {
        if (!tx.isin || !isTrade(tx.type)) return;
        (txByIsin[tx.isin] ??= []).push(tx);
    });
    const splitsByIsin: Record<string, Record<string, number>> = {};
    Object.keys(txByIsin).forEach((isin) => {
        const splits = project.securities?.[isin]?.splits;
        if (splits) splitsByIsin[isin] = splits;
    });
    // Split days the broker already booked as sell + buy must not be applied twice
    const ignoredSplitDates = buildSplitIgnoreDates(txByIsin, splitsByIsin, project.securities);

    const closed: ClosedPosition[] = [];
    Object.entries(txByIsin).forEach(([isin, txs]) => {
        const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
        const splits = Object.entries(splitsByIsin[isin] || {})
            .filter(([date, ratio]) => ratio > 0 && !ignoredSplitDates[isin]?.has(date))
            .sort(([a], [b]) => a.localeCompare(b));
        let splitIndex = 0;
        let quantity = 0;
        let realized = 0;
        let lastDate = '';
        sorted.forEach((tx) => {
            const day = tx.date.slice(0, 10);
            while (splitIndex < splits.length && splits[splitIndex][0] <= day) {
                if (quantity > 0) quantity *= splits[splitIndex][1];
                splitIndex += 1;
            }
            quantity += tx.type === 'Sell' ? -size(tx) : size(tx);
            realized += toBase(tx.amount, tx.currency, tx.date);
            const fee = getTradeFeeCost(tx);
            if (fee.cost) realized -= toBase(fee.cost, fee.currency, tx.date);
            if (tx.date > lastDate) lastDate = tx.date;
        });
        if (quantity > 0.0001 || quantity < -0.0001) return;
        const security = project.securities?.[isin];
        const lastTrade = sorted[sorted.length - 1];
        closed.push({
            isin,
            currency: security?.currency || lastTrade?.currency?.trim() || baseCurrency,
            name: security?.name || isin,
            quoteType: security?.quoteType || 'Stock',
            realized,
            lastDate
        });
    });
    return closed.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
};
