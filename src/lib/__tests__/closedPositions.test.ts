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
});
