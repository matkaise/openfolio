import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { investEngineFileImporter } from '../investengine';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'investengine.csv'), 'utf-8');
const freetrade = readFileSync(path.join(fixtureDir, 'freetrade.csv'), 'utf-8');
const target = { id: 'p1', name: 'InvestEngine', isNew: true };
const lines = csv.trim().split('\n');
const header = lines[0];

const errorOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof FileImportError) return { code: error.code, line: error.line };
    throw error;
  }
  return null;
};

describe('InvestEngine CSV detection', () => {
  it('recognises the trading statement by its columns', () => {
    expect(investEngineFileImporter.detect(csv)).toBe('trading-statement');
    expect(detectFileImporter(csv)?.id).toBe('investengine');
  });

  it('does not take other files', () => {
    expect(investEngineFileImporter.detect(freetrade)).toBeNull();
    expect(investEngineFileImporter.detect('Date,Description,Amount,Balance\n02/01/24,Deposit,£100.00,£100.00\n')).toBeNull();
  });
});

describe('InvestEngine trading statement', () => {
  const { batch, report } = investEngineFileImporter.parse(csv);

  it('books buys and sells in GBP with the total trade value as cash effect', () => {
    expect(batch.entries.map((e) => [e.date, e.kind, e.isin, e.name, e.quantity, e.amount, e.currency, e.fee])).toEqual([
      ['2024-01-02', 'buy', 'IE0000000101', 'Example Global Equity ETF', 12.5, -1250, 'GBP', undefined],
      ['2024-01-02', 'buy', 'IE0000000202', 'Example Gilts ETF, Dist', 10, -125, 'GBP', undefined],
      ['2024-02-01', 'buy', 'IE0000000101', 'Example Global Equity ETF', 2, -220, 'GBP', undefined],
      ['2024-02-01', 'buy', 'IE0000000101', 'Example Global Equity ETF', 0.1, -11, 'GBP', undefined],
      ['2024-02-01', 'buy', 'IE0000000101', 'Example Global Equity ETF', 0.1, -11, 'GBP', undefined],
      ['2024-04-30', 'sell', 'IE0000000101', 'Example Global Equity ETF', -3, 361.5, 'GBP', undefined]
    ]);
    expect(batch.entries[5].raw).toMatchObject({ pricePerShare: 120.5, settlementDate: '02/05/24', broker: 'None' });
  });

  it('reports variant, period and no skipped rows', () => {
    expect(report).toMatchObject({ variant: 'trading-statement', rows: 6, ignored: [], unsupported: [], period: { from: '2024-01-02', to: '2024-04-30' } });
  });

  it('reports other transaction types and rows without ISIN instead of guessing', () => {
    const rows = [
      header,
      'Example Global Equity ETF / ISIN IE0000000101,Transfer in,5.000000,,,03/05/24 10:00:00,03/05/24,None',
      'Example Global Equity ETF,Buy,1.000000,£110.00,£110.00,03/05/24 10:00:00,07/05/24,None',
      'Example Global Equity ETF / ISIN IE0000000101,Note,,,,03/05/24 10:00:00,,'
    ];
    const result = investEngineFileImporter.parse(rows.join('\n'));
    expect(result.batch.entries).toEqual([]);
    expect(result.report.unsupported).toEqual([{ line: 2, label: 'Transfer in' }, { line: 3, label: 'Buy' }]);
    expect(result.report.ignored).toEqual([{ line: 4, label: 'Note' }]);
  });

  it('rejects other number and date formats with the line', () => {
    expect(errorOf(() => investEngineFileImporter.parse(csv.replace('£125.00', '"£125,00"')))).toEqual({ code: 'invalidNumber', line: 3 });
    expect(errorOf(() => investEngineFileImporter.parse(csv.replace('£125.00', '€125.00')))).toEqual({ code: 'invalidNumber', line: 3 });
    expect(errorOf(() => investEngineFileImporter.parse(csv.replace('30/04/24 14:13:11', '04/30/24 14:13:11')))).toEqual({ code: 'invalidDate', line: 7 });
    expect(errorOf(() => investEngineFileImporter.parse(csv.replace('30/04/24 14:13:11', '2024-04-30 14:13:11')))).toEqual({ code: 'invalidDate', line: 7 });
  });
});

describe('InvestEngine re-import, overlap and identical trades', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), investEngineFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(6);
    const again = applyImportBatch(first.project, investEngineFileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    const overlap = [header, ...lines.slice(2, 6)].join('\n');
    const partial = applyImportBatch(first.project, investEngineFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions).toBe(0);
  });

  it('keeps the two identical buys of the fixture apart', () => {
    const { summary } = applyImportBatch(createEmptyProject(), investEngineFileImporter.parse([header, lines[4], lines[5]].join('\n')).batch, target);
    expect(summary.addedTransactions).toBe(2);
  });
});

describe('InvestEngine error handling', () => {
  it('rejects an export without rows and unknown files', () => {
    expect(errorOf(() => readImportFiles([{ name: 'GIA_Trading_statement.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => investEngineFileImporter.parse('Security,Type\nX,Buy\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });
});
