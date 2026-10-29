import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import type { ImportEntry } from '../entries';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { finpensionFileImporter } from '../finpension';
import { applyImportBatch } from '../importBatch';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const pillar3a = readFileSync(path.join(fixtureDir, 'finpension-3a.csv'), 'utf-8');
const bvg = readFileSync(path.join(fixtureDir, 'finpension-bvg.csv'), 'utf-8');
const swissquote = readFileSync(path.join(fixtureDir, 'swissquote-en.csv'), 'utf-8');
const target = { id: 'p1', name: 'Finpension', isNew: true };
const lines3a = pillar3a.trim().split('\n');
const header = lines3a[0];

const cash = (entries: ImportEntry[]) => {
  const totals: Record<string, number> = {};
  entries.forEach((entry) => { totals[entry.currency] = Math.round(((totals[entry.currency] || 0) + entry.amount + (entry.fee || 0)) * 100) / 100; });
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

describe('Finpension CSV detection', () => {
  it('recognises the transaction report and tells 3a from vested benefits (BVG)', () => {
    expect(finpensionFileImporter.detect(pillar3a)).toBe('3a');
    expect(finpensionFileImporter.detect(bvg)).toBe('bvg');
    expect(finpensionFileImporter.detect([header, '2024-06-30;Interests;;;;CHF;1.0;;0.45;0.45'].join('\n'))).toBe('report');
    expect(detectFileImporter(pillar3a)?.id).toBe('finpension');
    expect(detectFileImporter(bvg)?.id).toBe('finpension');
  });

  it('does not take other files', () => {
    expect(finpensionFileImporter.detect(swissquote)).toBeNull();
    expect(finpensionFileImporter.detect(pillar3a.replace(/;/g, ','))).toBeNull();
  });
});

describe('Finpension 3a', () => {
  const { batch, report } = finpensionFileImporter.parse(pillar3a);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books buys and sells in CHF with the cash flow as amount', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.currency])).toEqual([
      ['2024-07-11', 'CH0000000011', 0.3, -480, 'CHF'],
      ['2024-01-08', 'CH0000000022', 3, -3000, 'CHF'],
      ['2024-01-08', 'CH0000000011', 2.5, -3750, 'CHF']
    ]);
    expect(byKind('sell').map((e) => [e.isin, e.quantity, e.amount])).toEqual([['CH0000000022', -0.5, 505]]);
    expect(byKind('buy')[0].raw).toMatchObject({ pricePerShare: 1600, assetCurrency: 'CHF', variant: '3a' });
  });

  it('books dividend, interest, the flat-rate fee and the deposit', () => {
    expect(byKind('dividend').map((e) => [e.isin, e.amount])).toEqual([['CH0000000022', 12.6]]);
    expect(byKind('interest').map((e) => e.amount)).toEqual([0.45]);
    expect(byKind('fee').map((e) => e.amount)).toEqual([-2.1]);
    expect(byKind('deposit').map((e) => e.amount)).toEqual([7056]);
  });

  it('keeps the booked cash consistent with the balance column and imports daily balances', () => {
    // Balance 345.15 = booked 341.95 + the unknown "Tax refund" row (reported)
    expect(cash(batch.entries)).toEqual({ CHF: 341.95 });
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ CHF: 341.95 });
    expect(batch.cashBalances.map((point) => [point.date, point.balance])).toEqual([
      ['2024-01-05', 7056], ['2024-01-08', 306], ['2024-04-07', 303.9], ['2024-05-10', 316.5],
      ['2024-06-30', 316.95], ['2024-07-11', 341.95], ['2024-07-12', 345.15]
    ]);
  });

  it('reports the unknown category', () => {
    expect(report.unsupported).toEqual([{ line: 2, label: 'Tax refund' }]);
    expect(report.ignored).toEqual([]);
    expect(report.rows).toBe(9);
    expect(report.period).toEqual({ from: '2024-01-05', to: '2024-07-12' });
  });
});

describe('Finpension vested benefits (BVG)', () => {
  const { batch, report } = finpensionFileImporter.parse(bvg);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('takes the direction of a portfolio transaction from the cash flow', () => {
    expect(byKind('buy').map((e) => [e.date, e.quantity, e.amount])).toEqual([['2024-10-29', 0.1, -165], ['2024-10-22', 3, -4800]]);
    expect(byKind('sell').map((e) => [e.date, e.quantity, e.amount])).toEqual([['2025-06-02', -0.02, 34]]);
  });

  it('books the transfer of vested benefits, distributions, interest and fee', () => {
    expect(byKind('deposit').map((e) => [e.amount, e.description])).toEqual([[5000, 'Transfer vested benefits']]);
    expect(byKind('dividend').map((e) => [e.isin, e.amount])).toEqual([['CH0000000011', 1.65]]);
    expect(byKind('interest').map((e) => e.amount)).toEqual([0.05]);
    expect(byKind('fee').map((e) => e.amount)).toEqual([-0.35]);
    expect(cash(batch.entries)).toEqual({ CHF: 70.35 });
    expect(batch.cashBalances.at(-1)).toMatchObject({ date: '2025-06-02', balance: 70.35, currency: 'CHF' });
    expect(report).toMatchObject({ variant: 'bvg', rows: 7, ignored: [], unsupported: [] });
  });

  it('reports a transfer out as withdrawal and inconsistent trades instead of guessing', () => {
    const rows = [
      header,
      '2025-07-01;"Transfer vested benefits";;;0.000000;CHF;1.0;0.000000;-70.350000;0.000000',
      '2025-07-02;Buy;"Exempel Index Fund Equity World A";CH0000000011;1.000000;CHF;1.0;1700.000000;1700.000000;1700.000000',
      '2025-07-03;Sell;"Exempel Index Fund Equity World A";;-1.000000;CHF;1.0;1700.000000;1700.000000;3400.000000'
    ];
    const { batch, report } = finpensionFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.kind, e.amount])).toEqual([['withdrawal', -70.35]]);
    expect(report.unsupported).toEqual([{ line: 3, label: 'Buy' }, { line: 4, label: 'Sell' }]);
  });
});

describe('Finpension formats, re-import and errors', () => {
  it('rejects decimal commas and other dates with the line', () => {
    expect(errorOf(() => finpensionFileImporter.parse(pillar3a.replace('-2.100000', '"-2,100000"')))).toEqual({ code: 'invalidNumber', line: 7 });
    expect(errorOf(() => finpensionFileImporter.parse(pillar3a.replace('2024-06-30;', '30.06.2024;')))).toEqual({ code: 'invalidDate', line: 5 });
  });

  it('adds nothing when the same report or an overlapping one is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), finpensionFileImporter.parse(pillar3a).batch, target);
    expect(first.summary.addedTransactions).toBe(4);
    const again = applyImportBatch(first.project, finpensionFileImporter.parse(pillar3a).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    const overlap = [header, ...lines3a.slice(2, 7)].join('\n');
    const partial = applyImportBatch(first.project, finpensionFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps identical rows apart', () => {
    const { summary } = applyImportBatch(createEmptyProject(), finpensionFileImporter.parse([header, lines3a[2], lines3a[2]].join('\n')).batch, target);
    expect(summary.addedTransactions).toBe(2);
  });

  it('rejects an empty report and unknown files', () => {
    expect(errorOf(() => readImportFiles([{ name: 'transaction_report.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => finpensionFileImporter.parse('Date;Category;Cash Flow\n2024-01-05;Deposit;1\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });
});
