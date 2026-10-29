import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import type { ImportEntry } from '../entries';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { freetradeFileImporter } from '../freetrade';
import { applyImportBatch } from '../importBatch';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'freetrade.csv'), 'utf-8');
const trading212 = readFileSync(path.join(fixtureDir, 'trading212.csv'), 'utf-8');
const etoro = readFileSync(path.join(fixtureDir, 'etoro.csv'), 'utf-8');
const target = { id: 'p1', name: 'Freetrade', isNew: true };
const lines = csv.trim().split('\n');
const header = lines[0];
const columns = header.split(',');

/** A data row from named cells; all other columns empty. */
const row = (cells: Record<string, string>) => columns.map((name) => cells[name] ?? '').join(',');

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

describe('Freetrade CSV detection', () => {
  it('recognises the activity feed export by its columns', () => {
    expect(freetradeFileImporter.detect(csv)).toBe('activity');
    expect(detectFileImporter(csv)?.id).toBe('freetrade');
  });

  it('does not take files of other brokers', () => {
    expect(freetradeFileImporter.detect(trading212)).toBeNull();
    expect(freetradeFileImporter.detect(etoro)).toBeNull();
    expect(freetradeFileImporter.detect(csv.replace(/,/g, ';'))).toBeNull();
  });
});

describe('Freetrade CSV', () => {
  const { batch, report } = freetradeFileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books orders in the account currency with stamp duty and FX fee as fee', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.fee, e.currency, e.orderId])).toEqual([
      ['2024-02-20', 'US0000000041', 2, -240, -0.94, 'GBP', 'EXORD0000003'],
      ['2024-01-21', 'US0000000031', 1, -4.95, undefined, 'GBP', 'EXORD0000002'],
      ['2024-01-05', 'GB0000000021', 100, -450, -2.25, 'GBP', 'EXORD0000001'],
      ['2024-01-04', 'IE0000000011', 10, -992.5, undefined, 'GBP', 'EXORD0000000']
    ]);
    expect(byKind('sell').map((e) => [e.isin, e.quantity, e.amount])).toEqual([['GB0000000021', -40, 200]]);
    expect(byKind('buy')[0].raw).toMatchObject({ ticker: 'EXTC', instrumentCurrency: 'USD', pricePerShare: 150 });
  });

  it('pays for a free share with a bonus deposit of its value', () => {
    expect(byKind('deposit').map((e) => [e.date, e.amount, e.description])).toEqual([
      ['2024-01-21', 4.95, 'Example Consumer (free share)'],
      ['2024-01-02', 2000, 'Top up']
    ]);
  });

  it('books dividends gross with the withheld tax from the export, never estimated', () => {
    expect(byKind('dividend').map((e) => [e.date, e.isin, e.amount])).toEqual([
      ['2024-04-10', 'GB0000000021', 5],
      ['2024-03-28', 'IE0000000011', 3],
      ['2024-03-27', 'US0000000041', 0.8]
    ]);
    expect(byKind('withholding_tax').map((e) => [e.isin, e.amount])).toEqual([['GB0000000021', -1], ['US0000000041', -0.12]]);
  });

  it('books interest and the withdrawal and keeps the cash consistent', () => {
    expect(byKind('interest').map((e) => e.amount)).toEqual([0.42]);
    expect(byKind('withdrawal').map((e) => e.amount)).toEqual([-500]);
    expect(cash(batch.entries)).toEqual({ GBP: 22.41 });
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ GBP: 22.41 });
  });

  it('ignores the monthly statement and reports nothing else', () => {
    expect(report.ignored).toEqual([{ line: 8, label: 'MONTHLY_STATEMENT' }]);
    expect(report.unsupported).toEqual([]);
    expect(report.rows).toBe(12);
    expect(report.period).toEqual({ from: '2024-01-02', to: '2024-04-18' });
  });
});

describe('Freetrade variants and edge cases', () => {
  it('books a sell with FX fee gross and keeps a dividend without gross/net at its net amount', () => {
    const rows = [
      header,
      row({ Title: 'Example Tech', Type: 'ORDER', Timestamp: '2024-05-02T14:00:00.000Z', 'Account Currency': 'GBP', 'Total Amount': '119.53', 'Buy / Sell': 'SELL', Ticker: 'EXTC', ISIN: 'US0000000041', 'Stamp Duty': '0.00', Quantity: '1.00000000', 'Order ID': 'EXORD0000009', 'Instrument Currency': 'USD', 'Total Shares Amount': '150.00', 'FX Fee (BPS)': '39', 'FX Fee Amount': '0.47' }),
      row({ Title: 'Example Tech', Type: 'PROPERTY', Timestamp: '2024-05-03T14:00:00.000Z', 'Account Currency': 'GBP', 'Total Amount': '0.07', ISIN: 'US0000000041', 'Instrument Currency': 'USD', 'Dividend Withheld Tax Percentage': '20', 'Dividend Withheld Tax Amount': '0.02' })
    ];
    const { batch } = freetradeFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.kind, e.amount, e.fee])).toEqual([['sell', 120, -0.47], ['dividend', 0.07, undefined]]);
  });

  it('reports unknown types with an amount and orders without ISIN or side', () => {
    const rows = [
      header,
      row({ Title: 'Example Corp', Type: 'CORPORATE_ACTION', Timestamp: '2024-05-02T14:00:00.000Z', 'Account Currency': 'GBP', 'Total Amount': '12.00', ISIN: 'GB0000000099' }),
      row({ Title: 'Notice', Type: 'NOTICE', Timestamp: '2024-05-02T14:00:00.000Z' }),
      row({ Title: 'Example Corp', Type: 'ORDER', Timestamp: '2024-05-02T14:00:00.000Z', 'Account Currency': 'GBP', 'Total Amount': '12.00', 'Buy / Sell': 'BUY', Ticker: 'EXCP', Quantity: '1' }),
      row({ Title: 'Example Corp', Type: 'ORDER', Timestamp: '2024-05-02T14:00:00.000Z', 'Account Currency': 'GBP', 'Total Amount': '12.00', ISIN: 'GB0000000099', Quantity: '1' })
    ];
    const { batch, report } = freetradeFileImporter.parse(rows.join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'CORPORATE_ACTION' }, { line: 4, label: 'ORDER' }, { line: 5, label: 'ORDER' }]);
    expect(report.ignored).toEqual([{ line: 3, label: 'NOTICE' }]);
  });

  it('rejects thousands separators, decimal commas and non-ISO dates with the line', () => {
    expect(errorOf(() => freetradeFileImporter.parse(csv.replace('2000.00', '"2,000.00"')))).toEqual({ code: 'invalidNumber', line: 13 });
    expect(errorOf(() => freetradeFileImporter.parse(csv.replace('452.25', '"452,25"')))).toEqual({ code: 'invalidNumber', line: 11 });
    expect(errorOf(() => freetradeFileImporter.parse(csv.replace('2024-03-15T00:00:00.000Z', '15/03/2024 00:00')))).toEqual({ code: 'invalidDate', line: 7 });
  });
});

describe('Freetrade re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), freetradeFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(5);
    const again = applyImportBatch(first.project, freetradeFileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    const overlap = [header, ...lines.slice(3, 10)].join('\n');
    const partial = applyImportBatch(first.project, freetradeFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps two identical rows of one file apart', () => {
    const { summary } = applyImportBatch(createEmptyProject(), freetradeFileImporter.parse([header, lines[11], lines[11]].join('\n')).batch, target);
    expect(summary.addedTransactions).toBe(2);
  });
});

describe('Freetrade error handling', () => {
  it('rejects an export without rows and unknown files', () => {
    expect(errorOf(() => readImportFiles([{ name: 'empty.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => freetradeFileImporter.parse('Title,Type,Timestamp\nTop up,TOP_UP,2024-01-02T00:00:00Z\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });
});
