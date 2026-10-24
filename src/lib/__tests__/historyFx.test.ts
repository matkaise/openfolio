import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculatePortfolioHistory } from '../portfolioUtils';
import type { Security, Transaction } from '@/types/domain';

describe('calculatePortfolioHistory FX (B9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('converts old trade prices with the rate of their own date', () => {
    const fxRates = { USD: { '2022-01-03': 1.0, '2025-06-02': 2.0 } };
    const securities: Security[] = [
      { isin: 'A', name: 'A', currency: 'USD', priceHistory: { '2022-01-03': 50 } },
      // No price history: valued from its trade price
      { isin: 'B', name: 'B', currency: 'USD' }
    ];
    const transactions: Transaction[] = [
      { id: '1', date: '2022-01-03', type: 'Buy', isin: 'A', shares: 1, amount: -50, currency: 'USD', broker: 'T' },
      // Bought for 100 EUR when 1 EUR = 1 USD, i.e. a price of 100 USD
      { id: '2', date: '2022-01-04', type: 'Buy', isin: 'B', shares: 1, amount: -100, currency: 'EUR', broker: 'T' }
    ];

    const history = calculatePortfolioHistory(transactions, securities, fxRates, [], 'EUR', '1J', 'daily');
    const last = history[history.length - 1];

    // A: 50 USD = 25 EUR, B: 100 USD = 50 EUR at today's rate of 2.0
    expect(last.value).toBeCloseTo(75, 6);
  });
});
