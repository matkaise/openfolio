import { describe, expect, it } from 'vitest';
import { calculateHoldings, calculatePortfolioHistory } from '../portfolioUtils';
import type { Security, Transaction } from '@/types/domain';

// 1 EUR = 1.25 USD throughout
const fxRates = { USD: { '2024-01-01': 1.25 } };
const security: Security = { isin: 'US0000000001', name: 'ACME CORP', currency: 'USD', priceHistory: { '2024-01-01': 100 } };
const trade = (overrides: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  date: '2024-03-15',
  type: 'Buy',
  isin: security.isin,
  shares: 10,
  amount: -1000,
  currency: 'USD',
  broker: 'Test',
  ...overrides
});

describe('holdings across trading currencies (B10)', () => {
  it('closes a position bought in USD and sold in EUR', () => {
    const { holdings } = calculateHoldings(
      [
        trade({}),
        trade({ date: '2024-09-10', type: 'Sell', shares: 10, amount: 850, currency: 'EUR' })
      ],
      [security],
      { [security.isin]: 100 },
      fxRates,
      'EUR'
    );

    expect(holdings).toHaveLength(0);
  });

  it('keeps one position with the remaining shares and a base-currency cost basis', () => {
    const { holdings, realizedPnL } = calculateHoldings(
      [
        trade({}), // 1000 USD = 800 EUR
        trade({ date: '2024-09-10', type: 'Sell', shares: 4, amount: 360, currency: 'EUR' })
      ],
      [security],
      { [security.isin]: 100 },
      fxRates,
      'EUR'
    );

    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(6);
    expect(holdings[0].averageBuyPrice).toBeCloseTo(80, 6); // EUR per share
    expect(holdings[0].averageBuyPriceInOriginalCurrency).toBeCloseTo(100, 6); // USD per share
    expect(holdings[0].currency).toBe('USD');
    expect(realizedPnL).toBeCloseTo(360 - 4 * 80, 6);
  });

  it('agrees with the history chart', () => {
    const transactions = [
      trade({}),
      trade({ date: '2024-09-10', type: 'Sell', shares: 4, amount: 360, currency: 'EUR' })
    ];
    const { holdings } = calculateHoldings(transactions, [security], { [security.isin]: 100 }, fxRates, 'EUR');
    const history = calculatePortfolioHistory(transactions, [security], fxRates, [], 'EUR', 'MAX', 'daily');

    expect(history[history.length - 1].value).toBeCloseTo(holdings[0].value, 6);
  });
});
