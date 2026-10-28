import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import type { ImportEntry } from '../entries';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { swissquoteFileImporter } from '../swissquote';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const english = readFileSync(path.join(fixtureDir, 'swissquote-en.csv'), 'utf-8');
const german = readFileSync(path.join(fixtureDir, 'swissquote-de.csv'), 'utf-8');
const degiro = readFileSync(path.join(fixtureDir, 'degiro-transactions.csv'), 'utf-8');
const target = { id: 'p1', name: 'Swissquote', isNew: true };

/** Cash per currency as the ledger books it: amount plus fees. */
const cash = (entries: ImportEntry[]) => {
  const totals: Record<string, number> = {};
  const add = (currency: string, value: number) => { totals[currency] = Math.round(((totals[currency] || 0) + value) * 100) / 100; };
  entries.forEach((entry) => {
    add(entry.currency, entry.amount);
    if (entry.fee) add(entry.feeCurrency || entry.currency, entry.fee);
  });
  return totals;
};

const errorOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof FileImportError) return { code: error.code, line: error.line };
    throw error;
  }
  return null;
};

const header = english.split('\n')[0];

describe('Swissquote CSV detection', () => {
  it('recognises the English and German variants by their header', () => {
    expect(swissquoteFileImporter.detect(english)).toBe('en-13');
    expect(swissquoteFileImporter.detect(german)).toBe('de-15');
    expect(swissquoteFileImporter.detect(`﻿${english.replace(/\n/g, '\r\n')}`)).toBe('en-13');
    expect(detectFileImporter(english)?.id).toBe('swissquote');
    expect(swissquoteFileImporter.detect(degiro)).toBeNull();
    expect(swissquoteFileImporter.detect('Date;Amount\n01-01-2024;5\n')).toBeNull();
  });
});

describe('Swissquote CSV (English, 13 columns)', () => {
  const { batch, report } = swissquoteFileImporter.parse(english);
  const trades = batch.entries.filter((entry) => entry.kind === 'buy' || entry.kind === 'sell');

  it('books both fills of one order and the sell with costs as fees', () => {
    expect(trades.map((entry) => [entry.kind, entry.quantity, entry.amount, entry.fee, entry.currency, entry.orderId])).toEqual([
      ['sell', -5, 550, -5, 'USD', '200000002'],
      ['buy', 5, -500, -2.5, 'USD', '200000001'],
      ['buy', 10, -1000, -5, 'USD', '200000001']
    ]);
    expect(new Set(trades.map((entry) => entry.externalId)).size).toBe(3);
    expect(trades.every((entry) => entry.isin === 'US0000000001' && entry.source === 'Swissquote')).toBe(true);
  });

  it('books cash rows with their kind and splits transfer costs off the withdrawal', () => {
    const others = batch.entries.filter((entry) => !trades.includes(entry));
    expect(others.map((entry) => [entry.date, entry.kind, entry.amount, entry.currency, Boolean(entry.internal)])).toEqual([
      ['2024-03-15', 'withdrawal', -500, 'CHF', false],
      ['2024-03-15', 'fee', -2, 'CHF', false],
      ['2024-03-14', 'fx', 540, 'CHF', true],
      ['2024-03-14', 'fx', -600, 'USD', true],
      ['2024-03-01', 'dividend', 7.5, 'USD', false],
      ['2024-01-31', 'fee', -21.62, 'CHF', false],
      ['2024-01-16', 'fx', 1600, 'USD', true],
      ['2024-01-16', 'fx', -1440, 'CHF', true],
      ['2024-01-15', 'deposit', 3000, 'CHF', false],
      ['2024-01-01', 'interest', -0.05, 'CHF', false]
    ]);
    expect(others.find((entry) => entry.kind === 'dividend')?.isin).toBe('US0000000001');
  });

  it('matches the balances of the export', () => {
    expect(cash(batch.entries)).toEqual({ CHF: 1576.33, USD: 45 });
    expect(trades.reduce((sum, entry) => sum + (entry.quantity || 0), 0)).toBe(10);
  });

  it('takes the closing balance per day and currency from the export', () => {
    expect(batch.cashBalances.slice(-3)).toEqual([
      { date: '2024-03-14', currency: 'CHF', balance: 2078.33, accountLabel: 'Swissquote' },
      { date: '2024-03-14', currency: 'USD', balance: 45, accountLabel: 'Swissquote' },
      { date: '2024-03-15', currency: 'CHF', balance: 1576.33, accountLabel: 'Swissquote' }
    ]);
  });

  it('gives the exported balances once merged into a portfolio', () => {
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ CHF: 1576.33, USD: 45 });
  });

  it('reports the split as not imported and the empty tax statement as ignored', () => {
    expect(report.unsupported).toEqual([{ line: 6, label: 'Stock split' }]);
    expect(report.ignored).toEqual([{ line: 15, label: 'Tax statement' }]);
    expect(report.rows).toBe(14);
    expect(report.period).toEqual({ from: '2024-01-01', to: '2024-03-15' });
  });
});

describe('Swissquote CSV (German, 15 columns)', () => {
  const { batch, report } = swissquoteFileImporter.parse(german);

  it('books a USD trade from a CHF account with the conversion as internal FX legs', () => {
    const buy = batch.entries.find((entry) => entry.kind === 'buy');
    expect(buy).toMatchObject({ quantity: 2, amount: -200, fee: -3, currency: 'USD', orderId: '300000001' });
    const legs = batch.entries.filter((entry) => entry.kind === 'fx').map((entry) => [entry.amount, entry.currency]);
    expect(legs).toEqual([[-1.5, 'USD'], [1.35, 'CHF'], [203, 'USD'], [-182.7, 'CHF']]);
    expect(batch.entries.find((entry) => entry.kind === 'deposit')).toMatchObject({ amount: 1000, currency: 'CHF' });
    expect(batch.entries.find((entry) => entry.kind === 'fee')).toMatchObject({ amount: -10.81, currency: 'CHF' });
  });

  it('matches the balances of the export', () => {
    expect(cash(batch.entries)).toEqual({ CHF: 807.84, USD: 0 });
    expect(report.unsupported).toEqual([]);
  });
});

describe('Swissquote re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), swissquoteFileImporter.parse(english).batch, target);
    expect(first.summary.addedTransactions).toBe(3);

    const again = applyImportBatch(first.project, swissquoteFileImporter.parse(english).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    expect(getLedger(again.project)).toEqual(getLedger(first.project));

    const overlap = [header, ...english.trim().split('\n').slice(4, 9)].join('\n');
    const partial = applyImportBatch(first.project, swissquoteFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps two identical rows of one file apart', () => {
    const row = '20-02-2024 11:00:00;200000001;Buy;ACME;ACME CORP;US0000000001;1.0;100.00;0.00;0.00;-100.00;0.00;USD';
    const { batch } = swissquoteFileImporter.parse([header, row, row].join('\n'));
    const { summary } = applyImportBatch(createEmptyProject(), batch, target);
    expect(summary.addedTransactions).toBe(2);
  });

  it('keeps the same booking apart in different portfolios', () => {
    const first = applyImportBatch(createEmptyProject(), swissquoteFileImporter.parse(english).batch, target);
    const second = applyImportBatch(first.project, swissquoteFileImporter.parse(english).batch, { id: 'p2', name: 'Second', isNew: true });
    expect(second.summary.addedTransactions).toBe(3);
  });
});

describe('Swissquote error handling', () => {
  it('rejects numbers and dates in unexpected formats with the line', () => {
    const comma = english.replace('-1005.00', '-1005,00');
    expect(errorOf(() => swissquoteFileImporter.parse(comma))).toEqual({ code: 'invalidNumber', line: 9 });
    const date = english.replace('31-01-2024 18:00:00', '2024-01-31 18:00:00');
    expect(errorOf(() => swissquoteFileImporter.parse(date))).toEqual({ code: 'invalidDate', line: 10 });
  });

  it('rejects an export without rows', () => {
    expect(errorOf(() => readImportFiles([{ name: 'empty.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
  });

  it('reports a trade without ISIN instead of guessing the security', () => {
    const row = '20-02-2024 11:00:00;200000009;Buy;XYZ;SOME FUND;;1.0;10.00;0.00;0.00;-10.00;0.00;USD';
    const { batch, report } = swissquoteFileImporter.parse([header, row].join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'Buy' }]);
  });

  it('reports unknown booking types with a cash effect', () => {
    const row = '20-02-2024 11:00:00;00000000;Transfer in;ACME;ACME CORP;US0000000001;3.0;0.00;0.00;0.00;0.00;0.00;USD';
    const fee = '21-02-2024 11:00:00;00000000;Mystery charge;;;;1.0;4.00;0.00;0.00;-4.00;0.00;USD';
    const { report } = swissquoteFileImporter.parse([header, row, fee].join('\n'));
    expect(report.unsupported.map((note) => note.label)).toEqual(['Transfer in', 'Mystery charge']);
  });
});
