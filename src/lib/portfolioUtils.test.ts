
import { describe, it, expect } from 'vitest';
import { calculatePortfolioHistory } from './portfolioUtils';
import { Transaction, Security } from '../types/domain';

describe('calculatePortfolioHistory', () => {
    it('should NOT have a value spike (drop to zero) during rebalancing (Sell then Buy)', () => {
        const securities: Security[] = [
            { isin: 'A', name: 'Stock A', currency: 'EUR', priceHistory: { '2021-01-01': 100, '2021-01-02': 100, '2021-01-03': 100 } },
            { isin: 'B', name: 'Stock B', currency: 'EUR', priceHistory: { '2021-01-01': 100, '2021-01-02': 100, '2021-01-03': 100 } }
        ];

        // Scenario: 
        // Jan 1: Buy A
        // Jan 2: Sell A, then Buy B (Rebalance)
        // Jan 3: Hold B
        const transactions: Transaction[] = [
            { id: '1', date: '2021-01-01', type: 'Buy', isin: 'A', amount: -100, shares: 1, currency: 'EUR' },
            { id: '2', date: '2021-01-02', type: 'Sell', isin: 'A', amount: 100, shares: 1, currency: 'EUR' },
            { id: '3', date: '2021-01-02', type: 'Buy', isin: 'B', amount: -100, shares: 1, currency: 'EUR' }
        ];

        const fxRates = { 'EUR': {} };

        const history = calculatePortfolioHistory(
            transactions,
            securities,
            fxRates,
            [],
            'EUR',
            'MAX',
            'daily'
        );

        // Find value on Jan 2
        const day2 = history.find(h => h.date === '2021-01-02');

        // With current buggy logic, Sell reduces Invested/Value, Buy increases it. 
        // If sorting puts Sell first, and we sample at end of day, it *should* be fine IF we hold B.
        // BUT, if we have explicit cash flow logic disabled, does the Sell proceeds count as value?
        // In this test case:
        // Day 2 processing:
        // 1. Sell A -> Qty A=0. Value A=0. Cash not tracked (default).
        // 2. Buy B -> Qty B=1. Value B=100.
        // End of Day 2: Value = 100.

        // Wait, why did the user see a spike?
        // Maybe the Buy happened the NEXT day? Or time range issue?
        // Or maybe "Sell" date was recorded but "Buy" was slightly later?
        // The user said "Spike down".

        // Let's try: Sell on Jan 2. Buy on Jan 3.
        // Jan 2 Value should be 100 (Cash). 
        // If logic ignores cash, Jan 2 Value = 0. SPIKE!

        const transactionsGap: Transaction[] = [
            { id: '1', date: '2021-01-01', type: 'Buy', isin: 'A', amount: -100, shares: 1, currency: 'EUR' },
            { id: '2', date: '2021-01-02', type: 'Sell', isin: 'A', amount: 100, shares: 1, currency: 'EUR' },
            { id: '3', date: '2021-01-03', type: 'Buy', isin: 'B', amount: -100, shares: 1, currency: 'EUR' }
        ];

        const historyGap = calculatePortfolioHistory(
            transactionsGap,
            securities,
            fxRates,
            [],
            'EUR',
            'MAX',
            'daily'
        );

        const gapDay2 = historyGap.find(h => h.date === '2021-01-02');

        console.log('Day 2 Value (Gap Scenario):', gapDay2?.value);

        // Expect value to be ~100 (Cash preserved)
        expect(gapDay2?.value).toBeGreaterThan(90);
    });
});
