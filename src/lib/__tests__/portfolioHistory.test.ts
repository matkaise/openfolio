import { describe, expect, it } from 'vitest';
import { calculatePortfolioHistory } from '../portfolioUtils';

describe('calculatePortfolioHistory', () => {
  it('does not treat trade cashflows as cash when no explicit cash flows exist', () => {
    const transactions = [
      {
        id: 't1',
        date: '2024-01-01',
        type: 'Buy' as const,
        isin: 'AAA',
        shares: 10,
        amount: -100,
        currency: 'EUR',
        broker: 'Test'
      },
      {
        id: 't2',
        date: '2024-01-02',
        type: 'Sell' as const,
        isin: 'AAA',
        shares: -5,
        amount: 50,
        currency: 'EUR',
        broker: 'Test'
      }
    ];

    const securities = [
      {
        isin: 'AAA',
        name: 'Test',
        currency: 'EUR',
        priceHistory: {
          '2024-01-01': 10,
          '2024-01-02': 10
        }
      }
    ];

    const history = calculatePortfolioHistory(
      transactions,
      securities,
      {},
      [],
      'EUR',
      'MAX',
      'daily'
    );

    const point = history.find((p) => p.date === '2024-01-02');
    expect(point).toBeTruthy();
    expect(point!.value).toBeCloseTo(50, 5);
  });
});
