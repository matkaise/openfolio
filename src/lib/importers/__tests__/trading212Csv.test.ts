import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { FileImportError } from '../fileImport';
import { detectFileImporter } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { trading212FileImporter } from '../trading212Csv';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'trading212.csv'), 'utf-8');
const swissquote = readFileSync(path.join(fixtureDir, 'swissquote-en.csv'), 'utf-8');
const target = { id: 'p1', name: 'Trading 212', isNew: true };
const header = csv.split('\n')[0];

const errorOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof FileImportError) return { code: error.code, line: error.line };
    throw error;
  }
  return null;
};

describe('Trading 212 CSV detection', () => {
  it('recognises the history export by its columns, in any column order', () => {
    expect(trading212FileImporter.detect(csv)).toBe('standard');
    expect(trading212FileImporter.detect(csv.replace('Action,Time,', 'Action,Time (UTC),'))).toBe('utc');
    expect(detectFileImporter(csv)?.id).toBe('trading212');
    expect(trading212FileImporter.detect(swissquote)).toBeNull();
    const minimal = 'Action,Time,ISIN,Ticker,Name,Notes,ID,No. of shares,Price / share,Currency (Price / share),Exchange rate,Total,Currency (Total)\n';
    expect(trading212FileImporter.detect(minimal)).toBe('standard');
  });
});

describe('Trading 212 CSV', () => {
  const { batch, report } = trading212FileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books trades in the instrument currency with every cost column as fee', () => {
    expect(byKind('buy').map((e) => [e.isin, e.quantity, e.amount, e.currency, e.fee, e.feeCurrency, e.orderId])).toEqual([
      ['US0000000001', 2.5, -250, 'USD', -0.34, 'EUR', 'EOF0000000001'],
      ['GB0000000003', 10, -2500, 'GBX', -0.13, 'GBP', 'EOF0000000002']
    ]);
    expect(byKind('sell').map((e) => [e.quantity, e.amount, e.fee])).toEqual([[-1, 120, -0.16]]);
    // The second cost currency of the GBX buy becomes its own fee row
    expect(byKind('fee').map((e) => [e.amount, e.currency, e.orderId])).toEqual([[-0.04, 'EUR', 'EOF0000000002']]);
  });

  it('books dividends net with the withholding tax in the text, and cash rows with their sign', () => {
    expect(byKind('dividend')).toEqual([expect.objectContaining({
      amount: 0.97, currency: 'EUR', isin: 'US0000000001', description: 'Dividend (Dividend) (USD 0.19 withholding tax)'
    })]);
    expect(byKind('deposit').map((e) => e.amount)).toEqual([1000]);
    expect(byKind('withdrawal').map((e) => e.amount)).toEqual([-200]);
    expect(byKind('interest').map((e) => e.amount)).toEqual([0.12]);
    expect(byKind('fx').map((e) => [e.amount, e.currency, e.internal])).toEqual([[-50, 'EUR', true], [54, 'USD', true]]);
  });

  it('reports the split and the card payment as not imported', () => {
    expect(report.unsupported).toEqual([{ line: 9, label: 'Stock split open' }, { line: 11, label: 'Card debit' }]);
    expect(report.ignored).toEqual([]);
    expect(report.period).toEqual({ from: '2024-01-02', to: '2024-03-10' });
    expect(report.rows).toBe(10);
  });

  it('adds nothing on a second import and keeps rows without id apart', () => {
    const first = applyImportBatch(createEmptyProject(), batch, target);
    expect(first.summary.addedTransactions).toBe(3);
    const again = applyImportBatch(first.project, trading212FileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);

    const dividend = csv.split('\n')[4];
    const twice = trading212FileImporter.parse([header, dividend, dividend].join('\n'));
    expect(applyImportBatch(createEmptyProject(), twice.batch, target).summary.addedMovements).toBe(2);
  });
});

describe('Trading 212 CSV errors', () => {
  it('rejects unexpected number and date formats with the line', () => {
    expect(errorOf(() => trading212FileImporter.parse(csv.replace('228.41,', '"228,41",')))).toEqual({ code: 'invalidNumber', line: 3 });
    expect(errorOf(() => trading212FileImporter.parse(csv.replace('2024-01-04 10:00:00', '04/01/2024 10:00')))).toEqual({ code: 'invalidDate', line: 4 });
    expect(errorOf(() => trading212FileImporter.parse(`${header}\n`))).toEqual({ code: 'noRows', line: undefined });
  });

  it('reports a trade without ISIN', () => {
    const row = 'Market buy,2024-01-03 14:30:01,,XYZ,"Unknown",,EOF9,1,10.00,USD,1.1,,"EUR",9.10,"EUR",,,,,,,,,,';
    const { batch, report } = trading212FileImporter.parse([header, row].join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'Market buy' }]);
  });
});
