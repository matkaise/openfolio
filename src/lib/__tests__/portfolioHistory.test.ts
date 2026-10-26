import { describe, expect, it } from 'vitest';
import { calculatePortfolioHistory } from '../portfolioUtils';

describe('calculatePortfolioHistory', () => {
  it('keeps sale proceeds as cash when no account balances were imported', () => {
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
    // 5 shares at 10 plus the 50 from the sale; nothing was taken out
    expect(point!.value).toBeCloseTo(100, 5);
    expect(point!.invested).toBeCloseTo(100, 5);
  });

  it('does not count deposited money twice once it is invested', () => {
    const history = calculatePortfolioHistory(
      [
        { id: 'd', date: '2024-01-01', type: 'Deposit' as const, amount: 1000, currency: 'EUR', broker: 'Test' },
        { id: 'b', date: '2024-01-02', type: 'Buy' as const, isin: 'AAA', shares: 40, amount: -400, currency: 'EUR', broker: 'Test' }
      ],
      [{ isin: 'AAA', name: 'Test', currency: 'EUR', priceHistory: { '2024-01-01': 10, '2024-01-02': 10 } }],
      {},
      [],
      'EUR',
      'MAX',
      'daily'
    );
    const last = history[history.length - 1];
    expect(last.value).toBeCloseTo(1000, 5); // 400 in shares + 600 cash
    expect(last.invested).toBeCloseTo(1000, 5);
  });
});
