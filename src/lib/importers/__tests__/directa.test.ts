import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import { directaFileImporter } from '../directa';
import type { ImportEntry } from '../entries';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'directa.csv'), 'utf-8');
const revolut = readFileSync(path.join(fixtureDir, 'revolut.csv'), 'utf-8');
const target = { id: 'p1', name: 'Directa', isNew: true };
const lines = csv.trim().split('\n');
const headerIndex = lines.findIndex((line) => line.startsWith('Data operazione'));
const header = lines[headerIndex];
const data = lines.slice(headerIndex + 1);

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

describe('Directa CSV detection', () => {
  it('recognises the Movimenti export with and without metadata rows', () => {
    expect(directaFileImporter.detect(csv)).toBe('movimenti');
    expect(directaFileImporter.detect([header, ...data].join('\n'))).toBe('movimenti');
    // The metadata rows must not make the file look like another broker's (upstream issue #294)
    expect(detectFileImporter(csv)?.id).toBe('directa');
  });

  it('does not take other files', () => {
    expect(directaFileImporter.detect(revolut)).toBeNull();
    expect(directaFileImporter.detect(csv.replace(/,/g, ';'))).toBeNull();
  });
});

describe('Directa CSV', () => {
  const { batch, report } = directaFileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books trades with the EUR amount as cash effect and the order reference', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.orderId])).toEqual([
      ['2024-01-05', 'IT0000000333', 50, -500, 'R0000000004'],
      ['2024-01-05', 'IT0000000222', 1000, -985, 'R0000000003'],
      ['2024-01-03', 'IE0000000111', 20, -2001.5, 'R0000000002']
    ]);
    expect(byKind('sell').map((e) => [e.date, e.isin, e.quantity, e.amount])).toEqual([['2024-07-10', 'IT0000000333', -50, 560]]);
    expect(byKind('sell')[0].raw).toMatchObject({ account: 'C0000 ESEMPIO CONTO', ticker: 'ESP', valueDate: '12-07-2024' });
  });

  it('books distributions and coupons with their withheld tax, accrued interest and other taxes', () => {
    expect(byKind('dividend').map((e) => [e.isin, e.amount])).toEqual([['IE0000000111', 12]]);
    expect(byKind('interest').map((e) => [e.isin, e.amount])).toEqual([['IT0000000222', 15], ['IT0000000222', -12.3]]);
    expect(byKind('withholding_tax').map((e) => [e.isin, e.amount])).toEqual([['IT0000000222', -1.88], ['IE0000000111', -3.12]]);
    expect(byKind('tax').map((e) => [e.amount, e.description])).toEqual([
      [-15.6, 'Ritenuta su plusvalenza'],
      [-2.5, 'Bollo'],
      [-1, 'Tobin tax ESEMPIO SPA']
    ]);
  });

  it('books the deposit and the withdrawal and keeps the cash consistent', () => {
    expect(byKind('deposit').map((e) => e.amount)).toEqual([5000]);
    expect(byKind('withdrawal').map((e) => e.amount)).toEqual([-1000]);
    expect(cash(batch.entries)).toEqual({ EUR: 1064.1 });
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ EUR: 1064.1 });
  });

  it('skips the metadata and the empty trailing row', () => {
    expect(report.ignored).toEqual([{ line: 25, label: '' }]);
    expect(report.unsupported).toEqual([]);
    expect(report.rows).toBe(15);
    expect(report.period).toEqual({ from: '2024-01-02', to: '2024-07-31' });
  });
});

describe('Directa variants and edge cases', () => {
  it('books commissions as fee and reports financing and unknown types', () => {
    const rows = [
      header,
      '15-07-2024,15-07-2024,Commissioni,,,P000020,,0,-9,0,EUR,',
      '16-07-2024,16-07-2024,Finanziamento long,,,P000021,,0,250,0,EUR,',
      '17-07-2024,33-09-2024,Pippo,ESP,IT0000000333,,ESEMPIO SPA,200,666,0,EUR,Q1',
      '18-07-2024,18-07-2024,Acquisto,ESP,,,ESEMPIO SPA,1,-10,0,EUR,R9',
      '19-07-2024,19-07-2024,Vendita,ESP,IT0000000333,,ESEMPIO SPA,1,-10,0,EUR,R10'
    ];
    const { batch, report } = directaFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.kind, e.amount])).toEqual([['fee', -9]]);
    expect(report.unsupported).toEqual([
      { line: 3, label: 'Finanziamento long' },
      { line: 4, label: 'Pippo' },
      { line: 5, label: 'Acquisto' },
      { line: 6, label: 'Vendita' }
    ]);
  });

  it('keeps the foreign amount in the raw data and still books EUR', () => {
    const rows = [header, '20-07-2024,22-07-2024,Acquisto,EXUS,US0000000444,,EXAMPLE US INC,2,-184.2,-200,USD,R11'];
    const { batch } = directaFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.amount, e.currency])).toEqual([[-184.2, 'EUR']]);
    expect(batch.entries[0].raw).toMatchObject({ foreignAmount: -200, foreignCurrency: 'USD' });
  });

  it('rejects decimal commas and other date formats with the line', () => {
    expect(errorOf(() => directaFileImporter.parse(csv.replace('-2001.5,', '"-2001,5",')))).toEqual({ code: 'invalidNumber', line: 23 });
    expect(errorOf(() => directaFileImporter.parse(csv.replace('15-03-2024,15-03-2024,Provento', '2024-03-15,15-03-2024,Provento')))).toEqual({ code: 'invalidDate', line: 18 });
    expect(errorOf(() => directaFileImporter.parse(csv.replace('15-03-2024,15-03-2024,Provento', '15-13-2024,15-03-2024,Provento')))).toEqual({ code: 'invalidDate', line: 18 });
  });
});

describe('Directa re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), directaFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(4);
    const again = applyImportBatch(first.project, directaFileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    const overlap = [...lines.slice(0, headerIndex + 1), ...data.slice(3, 11)].join('\n');
    const partial = applyImportBatch(first.project, directaFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps identical rows apart and does not merge two accounts', () => {
    const buy = data[12];
    const { summary } = applyImportBatch(createEmptyProject(), directaFileImporter.parse([header, buy, buy].join('\n')).batch, target);
    expect(summary.addedTransactions).toBe(2);
    const first = applyImportBatch(createEmptyProject(), directaFileImporter.parse(csv).batch, target);
    const otherAccount = csv.replace('Conto : C0000 ESEMPIO CONTO', 'Conto : C0001 ALTRO CONTO');
    const second = applyImportBatch(first.project, directaFileImporter.parse(otherAccount).batch, { ...target, isNew: false });
    expect(second.summary.addedTransactions).toBe(4);
  });
});

describe('Directa error handling', () => {
  it('rejects an export without rows and unknown files', () => {
    expect(errorOf(() => readImportFiles([{ name: 'Movimenti.csv', text: `${lines.slice(0, headerIndex + 1).join('\n')}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => directaFileImporter.parse('Data operazione,Tipo operazione\n02-01-2024,Acquisto\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });
});
