import { describe, expect, it } from 'vitest';
import { summarizeCashMovements, summarizeTransactions } from '../transactionSummary';
import { createEmptyProject, type Transaction } from '@/types/domain';

const fx = createEmptyProject().fxData;
const tx = (type: Transaction['type'], amount: number): Transaction => ({ id: type + amount, date: '2024-01-02', type, amount, currency: 'EUR', broker: 'Test' });

describe('summarizeTransactions', () => {
  it('splits inflow and outflow and counts by type', () => {
    const summary = summarizeTransactions([tx('Deposit', 1000), tx('Buy', -400), tx('Sparplan_Buy', -100), tx('Sell', 150), tx('Dividend', 5), tx('Fee', -2)], fx, 'EUR');
    expect(summary).toMatchObject({ count: 6, net: 653, inflow: 1155, outflow: 502, volume: 1657, buyCount: 2, sellCount: 1, dividendCount: 1, feeCount: 1, otherCount: 1 });
  });
});

describe('summarizeCashMovements', () => {
  it('counts internal moves and sums the rest', () => {
    const result = summarizeCashMovements([
      { id: 'a', date: '2024-01-02', type: 'Deposit', amount: 100, currency: 'EUR', broker: 'T' },
      { id: 'b', date: '2024-01-02', type: 'Transfer', amount: -50, currency: 'EUR', broker: 'T', isInternal: true }
    ], fx, 'EUR');
    expect(result).toEqual({ count: 2, internalCount: 1, externalCount: 1, net: 50 });
  });
});
