import { describe, expect, it } from 'vitest';
import { calculateHoldings } from '../portfolioUtils';
import type { Security, Transaction } from '@/types/domain';

const security: Security = { isin: 'US0000000001', name: 'ACME CORP', currency: 'USD' };
const tx = (overrides: Partial<Transaction>): Transaction => ({
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

describe('calculateHoldings with fees (B15)', () => {
  it('adds transaction and FX fees to the cost basis', () => {
    const { holdings } = calculateHoldings(
      [tx({ fee: -1, fxFee: -2.2 })],
      [security],
      { [security.isin]: 100 },
      {},
      'USD'
    );

    expect(holdings[0].averageBuyPrice).toBeCloseTo(100.32, 6);
    expect(holdings[0].totalReturn).toBeCloseTo(-3.2, 6);
  });

  it('subtracts fees from sale proceeds in the realized result', () => {
    const { realizedPnL } = calculateHoldings(
      [
        tx({ fee: -1, fxFee: -2.2 }),
        tx({ date: '2024-09-10', type: 'Sell', shares: 4, amount: 500, fee: -1, fxFee: -1.1 })
      ],
      [security],
      { [security.isin]: 125 },
      {},
      'USD'
    );

    // proceeds 500 - 2.10 fees, cost 4 * 100.32
    expect(realizedPnL).toBeCloseTo(96.62, 6);
  });

  it('converts fees booked in the account currency', () => {
    const { holdings } = calculateHoldings(
      [tx({ fee: -1, fxFee: -2, feeCurrency: 'CHF' })],
      [security],
      { [security.isin]: 100 },
      { USD: { '2024-01-01': 1.1 }, CHF: { '2024-01-01': 0.9 } },
      'USD'
    );

    // 3 CHF = 3 / 0.9 EUR = 3.6667 USD
    expect(holdings[0].averageBuyPrice).toBeCloseTo(100 + (3 / 0.9 * 1.1) / 10, 6);
  });
});
