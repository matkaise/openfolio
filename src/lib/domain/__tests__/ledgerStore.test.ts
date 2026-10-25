import { describe, expect, it } from 'vitest';
import { createEmptyProject, type CashMovement, type Transaction } from '@/types/domain';
import { entryFromCashMovement } from '../ledger/ledger';
import {
  addTransactions, bookingPortfolioIds, getCashMovements, getLedger, getTransactions,
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

  it('removes the bookings of a portfolio', () => {
    const project = addTransactions({ ...createEmptyProject(), ledger: [entryFromCashMovement(movement('m', 'p2'))] }, [tx('a', 'p1'), tx('b', 'p2')]);
    expect(bookingPortfolioIds(project)).toEqual(['p2', 'p1']);
    expect(getCashMovements(project).map((m) => m.id)).toEqual(['m']);

    const withoutP2 = removePortfolioBookings(project, 'p2');
    expect(getTransactions(withoutP2).map((t) => t.id)).toEqual(['a']);
    expect(getCashMovements(withoutP2)).toEqual([]);
  });

  it('keeps a withholding tax and the source row when an entry is edited', () => {
    const tax = entryFromCashMovement({ ...movement('w', 'p1'), type: 'Tax', amount: -0.75, isin: 'US0000000001', originalData: ['row'] });
    const project = { ...createEmptyProject(), ledger: [tax] };
    const view = getTransactions(project)[0];
    const edited = updateTransaction(project, { ...view, amount: -0.8, originalData: undefined });
    expect(getLedger(edited)[0]).toMatchObject({ kind: 'withholding_tax', amount: -0.8, raw: ['row'] });
  });

  it('shows statement rows in the transactions but leaves internal moves to the statement view', () => {
    const fxLeg = entryFromCashMovement({ ...movement('fx', 'p1'), type: 'Transfer', description: 'Währungswechsel (Ausbuchung)', isInternal: true });
    const deposit = entryFromCashMovement(movement('d', 'p1'));
    const project = { ...createEmptyProject(), ledger: [fxLeg, deposit] };
    expect(getTransactions(project).map((t) => t.id)).toEqual(['d']);
    expect(getCashMovements(project).map((m) => m.id)).toEqual(['fx', 'd']);
  });
});
