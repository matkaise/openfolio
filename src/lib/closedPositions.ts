import { convertCurrency } from '@/lib/fxUtils';
import type { ProjectData, Transaction } from '@/types/domain';

export interface ClosedPosition {
    isin: string;
    currency: string;
    name: string;
    quoteType: string;
    realized: number; // in the base currency: proceeds minus purchases
    lastDate: string;
}

const isTrade = (type: Transaction['type']) => type === 'Buy' || type === 'Sell' || type === 'Sparplan_Buy';
// Transaction.shares has no consistent sign; the type gives the direction
const size = (tx: Transaction) => Math.abs(tx.shares || 0);

/**
 * Positions that were bought and fully sold again, per security and trading currency, newest
 * first. The realized result is the sum of the signed trade amounts in the base currency.
 */
export const calculateClosedPositions = (project: ProjectData, transactions: Transaction[]): ClosedPosition[] => {
    const baseCurrency = project.settings.baseCurrency || 'EUR';
    const groups = new Map<string, { isin: string; currency: string; txs: Transaction[] }>();
    transactions.forEach((tx) => {
        if (!tx.isin || !isTrade(tx.type)) return;
        const currency = tx.currency?.trim() || baseCurrency;
        const key = `${tx.isin}__${currency}`;
        const group = groups.get(key) ?? { isin: tx.isin, currency, txs: [] };
        group.txs.push(tx);
        groups.set(key, group);
    });

    const closed: ClosedPosition[] = [];
    groups.forEach(({ isin, currency, txs }) => {
        let quantity = 0;
        let realized = 0;
        let lastDate = '';
        [...txs].sort((a, b) => a.date.localeCompare(b.date)).forEach((tx) => {
            quantity += tx.type === 'Sell' ? -size(tx) : size(tx);
            realized += convertCurrency(project.fxData, tx.amount, tx.currency || baseCurrency, baseCurrency, tx.date);
            if (tx.date > lastDate) lastDate = tx.date;
        });
        if (quantity > 0.0001 || quantity < -0.0001) return;
        const security = project.securities?.[isin];
        closed.push({ isin, currency, name: security?.name || isin, quoteType: security?.quoteType || 'Stock', realized, lastDate });
    });
    return closed.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
};
