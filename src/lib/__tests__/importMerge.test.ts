import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFlatexCsv } from '../csvParser';
import { mergeImportedTransactions } from '../importMerge';
import type { Transaction } from '@/types/domain';

const trades = () => parseFlatexCsv(readFileSync(path.join(__dirname, 'fixtures', 'degiro-transactions.csv'), 'utf-8'));

describe('mergeImportedTransactions (B3)', () => {
  it('skips every trade when the same file is imported twice', () => {
    const first = mergeImportedTransactions([], trades(), 'p1');
    const second = mergeImportedTransactions(first.transactions, trades(), 'p1');

    expect(first.added).toHaveLength(4);
    expect(second.added).toHaveLength(0);
    expect(second.duplicates).toBe(4);
    expect(second.transactions).toHaveLength(4);
  });

  it('assigns the target portfolio to new trades', () => {
    const { transactions } = mergeImportedTransactions([], trades(), 'p1');
    expect(transactions.every((tx) => tx.portfolioId === 'p1')).toBe(true);
  });

  it('imports the same trades into a different portfolio', () => {
    const first = mergeImportedTransactions([], trades(), 'p1');
    const second = mergeImportedTransactions(first.transactions, trades(), 'p2');
    expect(second.added).toHaveLength(4);
  });

  it('recognises trades imported by older versions without externalId', () => {
    const legacy = trades().map((tx): Transaction => {
      const copy = { ...tx, portfolioId: 'p1' };
      delete copy.externalId;
      return copy;
    });
    const result = mergeImportedTransactions(legacy, trades(), 'p1');

    expect(result.added).toHaveLength(0);
    expect(result.duplicates).toBe(4);
  });

  it('falls back to a content key for sources without ids and never dedupes manual entries', () => {
    const generic: Transaction = {
      id: 'g1', date: '2024-01-02', type: 'Buy', isin: 'DE0000000002', shares: 3, amount: -150, currency: 'EUR', broker: 'CSV'
    };
    const manual: Transaction = { ...generic, id: 'm1', broker: 'Manual' };

    const first = mergeImportedTransactions([manual], [generic], 'p1');
    const second = mergeImportedTransactions(first.transactions, [{ ...generic, id: 'g2' }], 'p1');

    expect(first.added).toHaveLength(1);
    expect(second.added).toHaveLength(0);
    expect(second.duplicates).toBe(1);
  });

  it('keeps identical rows that appear twice in one file', () => {
    const generic: Transaction = {
      id: 'g1', date: '2024-01-02', type: 'Buy', isin: 'DE0000000002', shares: 3, amount: -150, currency: 'EUR', broker: 'CSV'
    };
    const first = mergeImportedTransactions([], [generic, { ...generic, id: 'g2' }], 'p1');
    const again = mergeImportedTransactions(first.transactions, [{ ...generic, id: 'g3' }, { ...generic, id: 'g4' }], 'p1');

    expect(first.added).toHaveLength(2);
    expect(again.added).toHaveLength(0);
  });
});
