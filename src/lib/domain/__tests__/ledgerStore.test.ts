import { describe, expect, it } from 'vitest';
import { createEmptyProject, type CashMovement, type Transaction } from '@/types/domain';
import {
  addTransactions, bookingPortfolioIds, filterTransactions, getCashMovements, getTransactions,
  hasTransaction, removePortfolioBookings, removeTransaction, updateTransaction
} from '../ledger/store';

const tx = (id: string, portfolioId = 'p1'): Transaction => ({
  id, date: '2024-01-02', type: 'Buy', isin: 'DE0000000002', shares: 1, amount: -10, currency: 'EUR', broker: 'Test', portfolioId
});
const movement = (id: string, portfolioId: string): CashMovement => ({
  id, date: '2024-01-02', type: 'Deposit', amount: 100, currency: 'EUR', broker: 'Test', portfolioId
});

describe('ledger store', () => {
  it('reads empty lists from a missing project', () => {
    expect(getTransactions(null)).toEqual([]);
    expect(getCashMovements(undefined)).toEqual([]);
  });

  it('adds, updates and removes without touching the input', () => {
    const empty = createEmptyProject();
    const one = addTransactions(empty, [tx('a')]);
    expect(getTransactions(empty)).toEqual([]);
    expect(hasTransaction(one, 'a')).toBe(true);

    const updated = updateTransaction(one, { ...tx('a'), amount: -12 });
    expect(getTransactions(updated)[0].amount).toBe(-12);
    expect(updateTransaction(one, tx('unknown'))).toBe(one);

    expect(getTransactions(removeTransaction(updated, 'a'))).toEqual([]);
    expect(removeTransaction(updated, 'unknown')).toBe(updated);
  });

  it('filters and removes the bookings of a portfolio', () => {
    const project = { ...createEmptyProject(), transactions: [tx('a', 'p1'), tx('b', 'p2')], cashMovements: [movement('m', 'p2')] };
    expect(getTransactions(filterTransactions(project, (t) => t.id === 'b')).map((t) => t.id)).toEqual(['b']);
    expect(bookingPortfolioIds(project)).toEqual(['p1', 'p2']);

    const withoutP2 = removePortfolioBookings(project, 'p2');
    expect(getTransactions(withoutP2).map((t) => t.id)).toEqual(['a']);
    expect(getCashMovements(withoutP2)).toEqual([]);
  });
});
