import { describe, it, expect } from 'vitest';
import { calculatePortfolioHistory, calculateTWRSeries } from './portfolioUtils';
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

describe('calculateTWRSeries', () => {
    it('counts a received dividend once with dividends and not at all without (K5)', () => {
        const sec: Security = { isin: 'A', name: 'A', currency: 'EUR', priceHistory: { '2024-01-01': 100, '2024-01-02': 100, '2024-01-03': 100 } };
        const txs: Transaction[] = [
            { id: '0', date: '2024-01-01', type: 'Deposit', amount: 100, currency: 'EUR', broker: 'T' },
            { id: '1', date: '2024-01-01', type: 'Buy', isin: 'A', amount: -100, shares: 1, currency: 'EUR', broker: 'T' },
            { id: '2', date: '2024-01-02', type: 'Dividend', isin: 'A', amount: 5, currency: 'EUR', broker: 'T' }
        ];
        const history = calculatePortfolioHistory(txs, [sec], { EUR: {} }, [], 'EUR', 'MAX', 'daily');
        expect(calculateTWRSeries(history, true).at(-1)?.value).toBeCloseTo(5, 6);
        expect(calculateTWRSeries(history, false).at(-1)?.value).toBeCloseTo(0, 6);
    });

    it('skips a period that starts with nothing invested instead of collapsing the index (H5)', () => {
        const series = calculateTWRSeries([
            { date: '2024-01-01', value: 100, invested: 100 },
            // Gain to 150 and a withdrawal of 150 on the same day: start value + flow = -50
            { date: '2024-01-02', value: 0, invested: -50 },
            { date: '2024-01-03', value: 100, invested: 50 },
            { date: '2024-01-04', value: 110, invested: 50 }
        ]);
        expect(series.every((p) => Number.isFinite(p.value))).toBe(true);
        expect(series.at(-1)?.value).toBeCloseTo(10, 6);
    });
});
