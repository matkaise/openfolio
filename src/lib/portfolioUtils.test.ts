import { describe, it, expect } from 'vitest';
import { calculatePortfolioHistory } from './portfolioUtils';
import { Transaction, Security } from '../types/domain';

describe('calculatePortfolioHistory', () => {
    const securities: Security[] = [
        { isin: 'A', name: 'Stock A', currency: 'EUR', priceHistory: { '2021-01-01': 100, '2021-01-02': 100, '2021-01-03': 100 } },
        { isin: 'B', name: 'Stock B', currency: 'EUR', priceHistory: { '2021-01-01': 100, '2021-01-02': 100, '2021-01-03': 100 } }
    ];
    const fxRates = { 'EUR': {} };

    it('keeps the value when selling and buying on the same day (rebalancing)', () => {
        const transactions: Transaction[] = [
            { id: '1', date: '2021-01-01', type: 'Buy', isin: 'A', amount: -100, shares: 1, currency: 'EUR', broker: 'Test' },
            { id: '2', date: '2021-01-02', type: 'Sell', isin: 'A', amount: 100, shares: 1, currency: 'EUR', broker: 'Test' },
            { id: '3', date: '2021-01-02', type: 'Buy', isin: 'B', amount: -100, shares: 1, currency: 'EUR', broker: 'Test' }
        ];

        const history = calculatePortfolioHistory(transactions, securities, fxRates, [], 'EUR', 'MAX', 'daily');
        const day2 = history.find(h => h.date === '2021-01-02');

        expect(day2?.value).toBeCloseTo(100, 6);
    });

    it('keeps sale proceeds as cash until the next buy (no cash data imported)', () => {
        const transactionsGap: Transaction[] = [
            { id: '1', date: '2021-01-01', type: 'Buy', isin: 'A', amount: -100, shares: 1, currency: 'EUR', broker: 'Test' },
            { id: '2', date: '2021-01-02', type: 'Sell', isin: 'A', amount: 100, shares: 1, currency: 'EUR', broker: 'Test' },
            { id: '3', date: '2021-01-03', type: 'Buy', isin: 'B', amount: -100, shares: 1, currency: 'EUR', broker: 'Test' }
        ];

        const historyGap = calculatePortfolioHistory(transactionsGap, securities, fxRates, [], 'EUR', 'MAX', 'daily');
        const gapDay2 = historyGap.find(h => h.date === '2021-01-02');

        expect(gapDay2?.value).toBeCloseTo(100, 6);
        expect(historyGap.find(h => h.date === '2021-01-03')?.value).toBeCloseTo(100, 6);
    });
});
