import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTrading212Data, type Trading212Data } from '../trading212';
import { applyImportBatch, type ImportBatch } from '../importBatch';
import { isTradeEntry } from '../entries';
import { reconcilePositions } from '@/lib/brokers/reconcile';
import { createEmptyProject } from '@/types/domain';

const trades = (batch: ImportBatch) => batch.entries.filter(isTradeEntry);
const statement = (batch: ImportBatch) => batch.entries.filter((e) => !isTradeEntry(e));

const data = JSON.parse(readFileSync(path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'trading212.json'), 'utf-8')) as Trading212Data;

describe('parseTrading212Data', () => {
  const result = parseTrading212Data(data);

  it('turns filled trades into signed transactions with fees', () => {
    const txs = trades(result.batch);
    expect(result.batch.source).toBe('Trading212');
    expect(txs).toHaveLength(3);
    expect(txs.find((t) => t.date === '2024-03-15')).toMatchObject({
      kind: 'buy', isin: 'US0000000001', name: 'Acme Corp', quantity: 10, amount: -1000, currency: 'USD',
      fee: -1.38, feeCurrency: 'EUR', externalId: 't212:fill:60001'
    });
    expect(txs.find((t) => t.date === '2024-09-10')).toMatchObject({ kind: 'sell', quantity: -4, amount: 500 });
    // GBX (pence) is kept as quoted; the FX table converts it
    expect(txs.find((t) => t.date === '2024-06-20')).toMatchObject({ currency: 'GBX', amount: -5000, fee: -0.29 });
  });

  it('skips unfilled orders and corporate-action fills', () => {
    expect(result.skipped).toEqual({ unfilled: 1, corporateActions: 1 });
  });

  it('maps dividends and account transactions with their sign', () => {
    const byKind = (kind: string) => statement(result.batch).filter((m) => m.kind === kind).map((m) => m.amount);
    expect(byKind('dividend')).toEqual([3.91]);
    expect(byKind('deposit')).toEqual([5000]);
    expect(byKind('withdrawal')).toEqual([-1000]);
    expect(byKind('fee')).toEqual([-2.5]);
    expect(byKind('interest')).toEqual([1.23]);
    expect(statement(result.batch).find((m) => m.kind === 'dividend')).toMatchObject({ isin: 'US0000000001', date: '2024-05-10' });
  });

  it('can be imported twice and matches the broker positions', () => {
    const target = { id: 't2', name: 'Trading 212', isNew: true };
    const first = applyImportBatch(createEmptyProject(), result.batch, target);
    const second = applyImportBatch(first.project, parseTrading212Data(data).batch, { ...target, isNew: false });

    expect(second.summary.addedTransactions + second.summary.addedMovements).toBe(0);
    expect(reconcilePositions(first.project, 't2', result.positions)).toEqual([]);
  });
});
