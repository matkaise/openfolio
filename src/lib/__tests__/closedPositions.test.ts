import { describe, expect, it } from 'vitest';
import { calculateClosedPositions } from '../closedPositions';
import { createEmptyProject, type Transaction } from '@/types/domain';

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2024-01-02', type: 'Buy', isin: 'DE0000000002', shares: 10, amount: -500, currency: 'EUR', broker: 'Test', ...overrides
});

describe('calculateClosedPositions', () => {
  it('lists fully sold positions with their realized result, newest first', () => {
    const project = createEmptyProject();
    const closed = calculateClosedPositions(project, [
      tx({}),
      tx({ date: '2024-06-01', type: 'Sell', shares: -10, amount: 620 }),
      tx({ isin: 'US0000000001', date: '2024-02-01', amount: -100, shares: 1 }),
      tx({ isin: 'US0000000001', date: '2024-08-01', type: 'Sell', shares: 1, amount: 90 }),
      tx({ isin: 'XX0000000003', shares: 5, amount: -50 })
    ]);
    expect(closed.map((p) => [p.isin, p.realized, p.lastDate])).toEqual([
      ['US0000000001', -10, '2024-08-01'],
      ['DE0000000002', 120, '2024-06-01']
    ]);
  });

  it('treats a buy in USD and a sell in EUR as one position and subtracts the fees (H4)', () => {
    const project = createEmptyProject();
    const closed = calculateClosedPositions(project, [
      tx({ isin: 'US0000000001', currency: 'EUR', amount: -100, shares: 1, fee: -10 }),
      tx({ isin: 'US0000000001', date: '2024-03-01', type: 'Sell', currency: 'EUR', amount: 150, shares: 1 })
    ]);
    expect(closed.map((p) => p.realized)).toEqual([40]);

    const fx = { ...project, fxData: { ...project.fxData, rates: { USD: { '2024-01-02': 2 } } } };
    const mixed = calculateClosedPositions(fx, [
      tx({ isin: 'US0000000002', currency: 'USD', amount: -200, shares: 1 }),
      tx({ isin: 'US0000000002', date: '2024-03-01', type: 'Sell', currency: 'EUR', amount: 150, shares: 1 })
    ]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0].realized).toBeCloseTo(50, 6);
  });

  it('applies a split between buy and sell', () => {
    const project = {
      ...createEmptyProject(),
      securities: { DE0000000002: { isin: 'DE0000000002', name: 'Split AG', currency: 'EUR', priceHistory: {}, splits: { '2024-03-01': 10 } } }
    };
    const closed = calculateClosedPositions(project, [
      tx({ shares: 1, amount: -100 }),
      tx({ date: '2024-06-01', type: 'Sell', shares: 10, amount: 120 })
    ]);
    expect(closed.map((p) => p.realized)).toEqual([20]);
  });
});
