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
import { revolutFileImporter } from '../revolut';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'revolut.csv'), 'utf-8');
const trading212 = readFileSync(path.join(fixtureDir, 'trading212.csv'), 'utf-8');
const schwab = readFileSync(path.join(fixtureDir, 'schwab.csv'), 'utf-8');
const target = { id: 'p1', name: 'Revolut', isNew: true };
const lines = csv.trim().split('\n');
const header = lines[0];
const crypto = 'Symbol,Type,Quantity,Price,Value,Fees,Date\nBTC,Buy,0.00009518,"$105,058.55",$10.00,$0.24,"May 9, 2025, 10:03:50 AM"\n';

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

/** The fixture with another delimiter, as the app (tab) or a German Excel (semicolon) writes it. */
const withDelimiter = (delimiter: string) => lines.map((line) => line
  .replace(/"([^"]*)"|,/g, (match, quoted) => (quoted !== undefined ? quoted : delimiter))).join('\n');

describe('Revolut CSV detection', () => {
  it('recognises the investment account statement with comma, semicolon or tab', () => {
    expect(revolutFileImporter.detect(csv)).toBe('comma');
    expect(revolutFileImporter.detect(withDelimiter(';'))).toBe('semicolon');
    expect(revolutFileImporter.detect(withDelimiter('\t'))).toBe('tab');
    expect(detectFileImporter(csv)?.id).toBe('revolut');
  });

  it('does not take the crypto statement or files of other brokers', () => {
    expect(revolutFileImporter.detect(crypto)).toBeNull();
    expect(detectFileImporter(crypto)).toBeUndefined();
    expect(revolutFileImporter.detect(trading212)).toBeNull();
    expect(revolutFileImporter.detect(schwab)).toBeNull();
  });
});

describe('Revolut CSV', () => {
  const { batch, report } = revolutFileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books buys and sells with the total amount as cash effect', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.currency, e.fee])).toEqual([
      ['2024-01-03', 'EXA', 2.5, -250, 'USD', undefined],
      ['2024-01-04', 'EXB', 10, -500, 'USD', undefined],
      ['2024-04-02', 'EXE', 0.5, -40, 'EUR', undefined]
    ]);
    // 1 × $120.00 = $120.00; the $0.02 difference is a cost included in the total
    expect(byKind('sell').map((e) => [e.quantity, e.amount])).toEqual([[-1, 119.98]]);
    expect(byKind('sell')[0].raw).toMatchObject({ pricePerShare: 120, fxRate: '1.0850' });
  });

  it('books dividends net, the custody fee and cash rows with their sign', () => {
    expect(byKind('dividend').map((e) => [e.amount, e.currency, e.isin])).toEqual([[0.85, 'USD', 'EXA']]);
    expect(byKind('fee').map((e) => [e.amount, e.currency])).toEqual([[-1.25, 'USD']]);
    expect(byKind('deposit').map((e) => [e.amount, e.currency])).toEqual([[1500, 'USD'], [100, 'EUR']]);
    expect(byKind('withdrawal').map((e) => [e.amount, e.currency])).toEqual([[-300, 'USD']]);
  });

  it('keeps the cash per currency consistent', () => {
    expect(cash(batch.entries)).toEqual({ USD: 569.58, EUR: 60 });
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ USD: 569.58, EUR: 60 });
  });

  it('reports the stock split and the position transfer, ignores the empty cash transfer', () => {
    expect(report.unsupported).toEqual([
      { line: 8, label: 'STOCK SPLIT' },
      { line: 9, label: 'TRANSFER FROM REVOLUT TRADING LTD TO REVOLUT SECURITIES EUROPE UAB' }
    ]);
    expect(report.ignored).toEqual([{ line: 10, label: 'TRANSFER FROM REVOLUT BANK UAB TO REVOLUT SECURITIES EUROPE UAB' }]);
    expect(report.rows).toBe(12);
    expect(report.period).toEqual({ from: '2024-01-02', to: '2024-04-02' });
  });

  it('reads tab and semicolon files the same way', () => {
    const expected = batch.entries.map((e) => [e.kind, e.amount, e.quantity, e.currency]);
    expect(revolutFileImporter.parse(withDelimiter('\t')).batch.entries.map((e) => [e.kind, e.amount, e.quantity, e.currency])).toEqual(expected);
    expect(revolutFileImporter.parse(withDelimiter(';')).batch.entries.map((e) => [e.kind, e.amount, e.quantity, e.currency])).toEqual(expected);
  });
});

describe('Revolut number, date and currency formats', () => {
  it('reads decimal commas, currency codes and resolves "1,500" by quantity × price', () => {
    const rows = [
      header,
      '2024-05-02T10:00:00Z,EXA,BUY - MARKET,"1,500",$2.00,"$3,000.00",USD,1.07',
      '2024-05-03T10:00:00Z,EXA,BUY - MARKET,"1,500",$2000.00,"$3,000.00",USD,1.07',
      '2024-05-04T10:00:00Z,EXG,BUY - MARKET,10,250.00 GBX,"2500,00 GBX",GBX,0.0117',
      '2024-05-05T10:00:00Z,EXP,BUY - MARKET,"1,234.5",£1.00,"£1,234.50",GBP,1.17',
      '06.05.2024 10:00:00,,CASH TOP-UP,,,"12,50 €",EUR,1'
    ];
    const { batch } = revolutFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.date, e.quantity, e.amount, e.currency])).toEqual([
      ['2024-05-02', 1500, -3000, 'USD'],
      ['2024-05-03', 1.5, -3000, 'USD'],
      ['2024-05-04', 10, -2500, 'GBX'],
      ['2024-05-05', 1234.5, -1234.5, 'GBP'],
      ['2024-05-06', undefined, 12.5, 'EUR']
    ]);
  });

  it('books a dividend tax correction as tax and never a split as a buy', () => {
    const rows = [
      header,
      '2024-05-02T10:00:00Z,EXA,DIVIDEND,,,$1.00,USD,1.07',
      '2024-05-02T10:00:01Z,EXA,DIVIDEND TAX (CORRECTION),,,-$0.15,USD,1.07',
      '2024-05-03T10:00:00Z,EXA,STOCK SPLIT,3,,$0,USD,1.07'
    ];
    const { batch, report } = revolutFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.kind, e.amount, e.isin])).toEqual([['dividend', 1, 'EXA'], ['withholding_tax', -0.15, 'EXA']]);
    expect(report.unsupported.map((note) => note.label)).toEqual(['STOCK SPLIT']);
  });

  it('rejects unexpected numbers and dates with the line', () => {
    expect(errorOf(() => revolutFileImporter.parse(csv.replace('-$1.25', '-$1.2.5')))).toEqual({ code: 'invalidNumber', line: 5 });
    // "2,500" without price cannot be told apart from 2.5
    expect(errorOf(() => revolutFileImporter.parse(csv.replace('2.5,$100.00', '"2,500",')))).toEqual({ code: 'invalidNumber', line: 3 });
    expect(errorOf(() => revolutFileImporter.parse(csv.replace('2024-02-15T12:00:00.789Z', '02/15/2024 12:00')))).toEqual({ code: 'invalidDate', line: 6 });
  });
});

describe('Revolut re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), revolutFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(4);
    const again = applyImportBatch(first.project, revolutFileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    const overlap = [header, ...lines.slice(3, 9)].join('\n');
    const partial = applyImportBatch(first.project, revolutFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps two identical rows of one file apart', () => {
    const { summary } = applyImportBatch(createEmptyProject(), revolutFileImporter.parse([header, lines[2], lines[2]].join('\n')).batch, target);
    expect(summary.addedTransactions).toBe(2);
  });
});

describe('Revolut error handling', () => {
  it('rejects an export without rows', () => {
    expect(errorOf(() => readImportFiles([{ name: 'empty.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => revolutFileImporter.parse(crypto))).toEqual({ code: 'unknownFormat', line: undefined });
  });

  it('reports a trade without ticker instead of guessing the security', () => {
    const { batch, report } = revolutFileImporter.parse([header, '2024-05-02T10:00:00Z,,BUY - MARKET,1,$10.00,$10.00,USD,1.07'].join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'BUY - MARKET' }]);
  });
});
