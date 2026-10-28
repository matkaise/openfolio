import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import type { ImportEntry } from '../entries';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { schwabFileImporter } from '../schwab';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'schwab.csv'), 'utf-8');
const trading212 = readFileSync(path.join(fixtureDir, 'trading212.csv'), 'utf-8');
const saxo = readFileSync(path.join(fixtureDir, 'saxo.csv'), 'utf-8');
const target = { id: 'p1', name: 'Schwab', isNew: true };
const lines = csv.trim().split('\n');
const header = lines[0];
const footer = lines[lines.length - 1];
const titled = `"Transactions  for account XXXX-1234 as of 03/29/2024 06:00 PM ET"\n${csv}`;

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

describe('Schwab CSV detection', () => {
  it('recognises the history export with and without title row', () => {
    expect(schwabFileImporter.detect(csv)).toBe('standard');
    expect(schwabFileImporter.detect(titled)).toBe('titled');
    expect(schwabFileImporter.detect(csv.replace(/"/g, ''))).toBe('standard');
    expect(detectFileImporter(csv)?.id).toBe('schwab');
  });

  it('does not take positions exports or files of other brokers', () => {
    const positions = '"Positions for account Personal ...436 as of 04:48 PM ET, 2024/05/19"\n"Symbol","Description","Quantity","Price","Market Value"\n"BNDX","BOND ETF","330","$48.73","$1608.9"\n';
    expect(schwabFileImporter.detect(positions)).toBeNull();
    expect(schwabFileImporter.detect(trading212)).toBeNull();
    expect(schwabFileImporter.detect(saxo)).toBeNull();
  });
});

describe('Schwab CSV', () => {
  const { batch, report } = schwabFileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books buys, reinvested shares and sells with fees and commissions', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.fee, e.currency])).toEqual([
      ['2024-02-15', 'FUNDX', 2.5, -25, undefined, 'USD'],
      ['2024-01-10', 'FUNDX', 1000, -1000, undefined, 'USD'],
      ['2024-01-05', 'EXMP', 20, -2000, -0.65, 'USD'],
      ['2024-01-05', 'ADRX', 50, -1000, undefined, 'USD']
    ]);
    expect(byKind('sell').map((e) => [e.quantity, e.amount, e.fee])).toEqual([[-10, 1200, -0.65]]);
    expect(byKind('buy')[2]).toMatchObject({ name: 'EXAMPLE CORP', raw: expect.objectContaining({ asOf: '2024-01-04' }) });
  });

  it('books dividends, foreign tax and ADR fees on the security, cash rows with their sign', () => {
    expect(byKind('dividend').map((e) => [e.amount, e.isin])).toEqual([[10, 'ADRX'], [25, 'FUNDX']]);
    expect(byKind('withholding_tax').map((e) => [e.amount, e.isin, e.description])).toEqual([[-1.5, 'ADRX', 'Foreign Tax Paid: EXAMPLE ADR LTD SPONSORED ADR']]);
    expect(byKind('fee').map((e) => [e.amount, e.isin])).toEqual([[-0.2, 'ADRX'], [-12.5, undefined], [-12.5, undefined]]);
    expect(byKind('interest').map((e) => e.amount)).toEqual([1.25, -0.4]);
    expect(byKind('deposit').map((e) => e.amount)).toEqual([5000]);
    expect(byKind('withdrawal').map((e) => e.amount)).toEqual([-500]);
  });

  it('matches the total row of the export', () => {
    expect(cash(batch.entries)).toEqual({ USD: 1682.85 });
    expect(footer).toContain('$1,682.85');
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ USD: 1682.85 });
  });

  it('reports the split and the journaled shares, skips the total row', () => {
    expect(report.unsupported).toEqual([{ line: 8, label: 'Stock Split' }, { line: 17, label: 'Journaled Shares' }]);
    expect(report.ignored).toEqual([]);
    expect(report.rows).toBe(17);
    expect(report.period).toEqual({ from: '2024-01-02', to: '2024-03-28' });
  });

  it('reads the older export with title row the same way', () => {
    const older = schwabFileImporter.parse(titled);
    expect(older.batch.entries.map((e) => e.externalId)).toEqual(batch.entries.map((e) => e.externalId));
    expect(older.report.unsupported.map((note) => note.line)).toEqual([9, 18]);
  });
});

describe('Schwab re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), schwabFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(5);
    const again = applyImportBatch(first.project, schwabFileImporter.parse(titled).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);

    const overlap = [header, ...lines.slice(3, 12)].join('\n');
    const partial = applyImportBatch(first.project, schwabFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps the two identical advisor fees apart', () => {
    const { summary } = applyImportBatch(createEmptyProject(), schwabFileImporter.parse([header, lines[10], lines[11]].join('\n')).batch, target);
    expect(summary.addedMovements).toBe(2);
  });
});

describe('Schwab error handling', () => {
  it('rejects non-US numbers and dates with the line', () => {
    expect(errorOf(() => schwabFileImporter.parse(csv.replace('"$1,199.35"', '"1.199,35 $"')))).toEqual({ code: 'invalidNumber', line: 3 });
    expect(errorOf(() => schwabFileImporter.parse(csv.replace('"03/01/2024","Cash Dividend"', '"2024-03-01","Cash Dividend"')))).toEqual({ code: 'invalidDate', line: 5 });
    expect(errorOf(() => schwabFileImporter.parse(csv.replace('"02/28/2024"', '"13/28/2024"')))).toEqual({ code: 'invalidDate', line: 7 });
  });

  it('rejects an export without rows', () => {
    expect(errorOf(() => readImportFiles([{ name: 'empty.csv', text: `${header}\n${footer}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => schwabFileImporter.parse('Date,Amount\n01/02/2024,$5.00\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });

  it('reports trades without symbol, options and corporate actions', () => {
    const rows = [
      header,
      '"01/05/2024","Buy","","UNKNOWN SECURITY","5","$10.00","","-$50.00"',
      '"01/06/2024","Buy to Open","EXMP 03/15/2024 120.00 C","CALL EXAMPLE CORP","1","$2.00","$0.66","-$200.66"',
      '"10/14/2024 as of 10/10/2024","Cash In Lieu","FUNDX","EXAMPLE INCOME FUND","","","","$5.49"',
      '"07/26/2021","Stock Merger","171439102","OLD CORP XXXMANDATORY MERGER EFF: 07/26/21","-50","","",""',
      '"05/22/2023","Security Transfer","EXMP","EXAMPLE CORP","-5","","",""',
      '"05/23/2023","Journal","","JOURNAL FRM ...123","","","","$100.00"'
    ];
    const { batch, report } = schwabFileImporter.parse(rows.join('\n'));
    expect(report.unsupported.map((note) => note.label)).toEqual(['Buy', 'Buy to Open', 'Cash In Lieu', 'Stock Merger', 'Security Transfer']);
    expect(batch.entries.map((e) => [e.kind, e.amount])).toEqual([['deposit', 100]]);
  });
});
