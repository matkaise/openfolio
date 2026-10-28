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
import { saxoFileImporter } from '../saxo';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'saxo.csv'), 'utf-8');
const swissquote = readFileSync(path.join(fixtureDir, 'swissquote-en.csv'), 'utf-8');
const trading212 = readFileSync(path.join(fixtureDir, 'trading212.csv'), 'utf-8');
const target = { id: 'p1', name: 'Saxo', isNew: true };
const lines = csv.trim().split('\n');
const header = lines[0];
const legacyHeader = 'Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,Exchange Description,Instrument Symbol,Event,Amount,Order ID,Conversion Rate';

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

/** The fixture as a semicolon file, the way a German or Dutch Excel saves it. */
const asSemicolon = (text: string) => text.trim().split('\n').map((line) => line
  .replace(/"([^"]*)"|,/g, (match, quoted) => (quoted !== undefined ? quoted : ';'))).join('\n');

describe('Saxo CSV detection', () => {
  it('recognises both column variants by their header', () => {
    expect(saxoFileImporter.detect(csv)).toBe('booked');
    expect(detectFileImporter(csv)?.id).toBe('saxo');
    const legacy = [legacyHeader, ',02-Jan-2024,02-Jan-2024,Cash Transfer,,,EUR,Unknown,,Deposit,500,,1'].join('\n');
    expect(saxoFileImporter.detect(legacy)).toBe('amount');
    expect(saxoFileImporter.detect(`﻿${csv.replace(/\n/g, '\r\n')}`)).toBe('booked');
    expect(saxoFileImporter.detect(asSemicolon(csv))).toBe('booked');
  });

  it('does not take files of other brokers', () => {
    expect(saxoFileImporter.detect(swissquote)).toBeNull();
    expect(saxoFileImporter.detect(trading212)).toBeNull();
    expect(saxoFileImporter.detect('Trade Date,Event\n02-Jan-2024,Deposit\n')).toBeNull();
  });
});

describe('Saxo CSV', () => {
  const { batch, report } = saxoFileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books trades from the event text with the booked difference as fee', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.currency, e.fee, e.orderId])).toEqual([
      ['2024-05-17', 'NL0000000001', 2, -220, 'EUR', -2.5, '5000000007'],
      ['2024-05-16', 'NL0000000004', 1, -50, 'EUR', -2.5, undefined],
      ['2024-05-16', 'NL0000000004', 1, -50, 'EUR', -2.5, undefined],
      ['2024-02-05', 'GB0000000003', 100, -25000, 'GBX', undefined, '5000000003'],
      ['2024-01-03', 'US0000000002', 5, -1000, 'USD', undefined, '5000000002'],
      ['2024-01-03', 'NL0000000001', 10, -1000, 'EUR', -2.5, '5000000001']
    ]);
    expect(byKind('sell').map((e) => [e.quantity, e.amount, e.fee, e.currency])).toEqual([[-4, 440, -2.5, 'EUR']]);
    expect(byKind('buy')[0].name).toBe('ACME NV');
  });

  it('books trades in another currency than the account with the conversion as FX legs', () => {
    expect(byKind('fx').map((e) => [e.date, e.amount, e.currency, e.internal])).toEqual([
      ['2024-02-05', 25000, 'GBX', true],
      ['2024-02-05', -292.1, 'EUR', true],
      ['2024-01-03', 1000, 'USD', true],
      ['2024-01-03', -925.4, 'EUR', true]
    ]);
  });

  it('books dividends net, withholding tax as booked and cash rows with their sign', () => {
    expect(byKind('dividend').map((e) => [e.amount, e.currency, e.isin])).toEqual([[3.68, 'EUR', 'US0000000002'], [12, 'EUR', 'NL0000000001']]);
    expect(byKind('withholding_tax').concat(byKind('tax')).map((e) => [e.amount, e.currency, e.isin])).toEqual([[-0.55, 'EUR', 'US0000000002']]);
    expect(byKind('deposit').map((e) => e.amount)).toEqual([5000]);
    expect(byKind('withdrawal').map((e) => e.amount)).toEqual([-500]);
    expect(byKind('fee').map((e) => e.amount)).toEqual([-1.25]);
    expect(byKind('interest').map((e) => e.amount)).toEqual([0.85]);
  });

  it('keeps the cash of the account consistent', () => {
    expect(cash(batch.entries)).toEqual({ EUR: 2404.73, USD: 0, GBX: 0 });
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ EUR: 2404.73, USD: 0, GBX: 0 });
  });

  it('reports the stock split as not imported', () => {
    expect(report.unsupported).toEqual([{ line: 7, label: 'Stock split' }]);
    expect(report.ignored).toEqual([]);
    expect(report.rows).toBe(15);
    expect(report.period).toEqual({ from: '2024-01-02', to: '2024-05-17' });
  });
});

describe('Saxo number, date and column variants', () => {
  it('reads the semicolon file of a German or Dutch Excel the same way', () => {
    const semicolon = saxoFileImporter.parse(asSemicolon(csv)).batch.entries;
    expect(semicolon.map((e) => [e.kind, e.amount, e.currency])).toEqual(saxoFileImporter.parse(csv).batch.entries.map((e) => [e.kind, e.amount, e.currency]));
  });

  it('reads amounts with a decimal point and thousands separators', () => {
    const rows = [
      legacyHeader,
      '12345678,03-Jan-2024,05-Jan-2024,Trade,ACME NV,NL0000000001,EUR,Euronext Amsterdam,ACME:xams,"Buy 1,000 @ 10.00 EUR","-10,012.50",1,1',
      '12345678,2024-01-02,2024-01-02,Cash Transfer,,,EUR,Unknown,,Deposit,12000.00,,1',
      '12345678,02.01.2024,02.01.2024,Cash amount,,,EUR,,,Custody Fee,-1.5,,1'
    ];
    const { batch, report } = saxoFileImporter.parse(rows.join('\n'));
    expect(report.variant).toBe('amount');
    expect(batch.entries.map((e) => [e.date, e.kind, e.quantity, e.amount, e.fee])).toEqual([
      ['2024-01-03', 'buy', 1000, -10000, -12.5],
      ['2024-01-02', 'deposit', undefined, 12000, undefined],
      ['2024-01-02', 'fee', undefined, -1.5, undefined]
    ]);
  });

  it('rejects ambiguous or mixed number formats and unknown dates with the line', () => {
    const ambiguous = [legacyHeader, '1,02-Jan-2024,02-Jan-2024,Cash Transfer,,,EUR,Unknown,,Deposit,"1,500",,1'].join('\n');
    expect(errorOf(() => saxoFileImporter.parse(ambiguous))).toEqual({ code: 'invalidNumber', line: 2 });
    const mixed = csv.replace('"0,85"', '0.85');
    expect(errorOf(() => saxoFileImporter.parse(mixed))).toEqual({ code: 'invalidNumber', line: 6 });
    const slash = csv.replace('20-Mar-2024', '03/20/2024');
    expect(errorOf(() => saxoFileImporter.parse(slash))).toEqual({ code: 'invalidDate', line: 9 });
    const event = csv.replace('Sell 4 @ 110.00 EUR', 'Sell 4 @ 110,00 EUR');
    expect(errorOf(() => saxoFileImporter.parse(event))).toEqual({ code: 'invalidNumber', line: 8 });
  });
});

describe('Saxo re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), saxoFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(7);
    const again = applyImportBatch(first.project, saxoFileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    expect(getLedger(again.project)).toEqual(getLedger(first.project));

    const overlap = [header, ...lines.slice(1, 9)].join('\n');
    const partial = applyImportBatch(first.project, saxoFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps identical rows of one file apart', () => {
    const { summary } = applyImportBatch(createEmptyProject(), saxoFileImporter.parse([header, lines[2], lines[3]].join('\n')).batch, target);
    expect(summary.addedTransactions).toBe(2);
  });
});

describe('Saxo error handling', () => {
  it('rejects an export without rows', () => {
    expect(errorOf(() => readImportFiles([{ name: 'empty.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => readImportFiles([{ name: 'empty.csv', text: '' }]))).toEqual({ code: 'unknownFormat', line: undefined });
    expect(errorOf(() => saxoFileImporter.parse('Hello,World\n1,2\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });

  it('reports a trade without ISIN instead of guessing the security', () => {
    const row = '12345678,03-Jan-2024,05-Jan-2024,Trade,Some Fund,,EUR,Unknown,FUND:xams,Buy 1 @ 10.00 EUR,"-12,50",,1,No,';
    const { batch, report } = saxoFileImporter.parse([header, row].join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'Buy 1 @ 10.00 EUR' }]);
  });

  it('reports converted rows when the account currency is not known', () => {
    const row = '12345678,03-Jan-2024,05-Jan-2024,Trade,Example Software Inc.,US0000000002,USD,NASDAQ,EXSW:xnas,Buy 5 @ 200.00 USD,"-925,40",5000000002,"0,9254",No,';
    const { batch, report } = saxoFileImporter.parse([header, row].join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'Buy 5 @ 200.00 USD' }]);
  });

  it('reports corporate actions, derivatives and unknown cash rows, ignores empty information rows', () => {
    const rows = [
      header,
      '12345678,10-Apr-2024,10-Apr-2024,Corporate action,ACME NV,NL0000000001,EUR,Euronext Amsterdam,ACME:xams,Spin-off,0,,1,No,',
      '12345678,11-Apr-2024,11-Apr-2024,Cash amount,,,EUR,,,Correction,"-3,00",,1,No,',
      '12345678,12-Apr-2024,12-Apr-2024,Cash amount,,,EUR,,,Notice,0,,1,No,',
      '12345678,13-Apr-2024,13-Apr-2024,Trade,ACME Call 120,NL0000000001,EUR,Eurex,ACME/C120,Buy 1 @ 2.00 EUR,"-202,00",,1,Yes,Stock'
    ];
    const { batch, report } = saxoFileImporter.parse(rows.join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported.map((note) => note.label)).toEqual(['Spin-off', 'Correction', 'Buy 1 @ 2.00 EUR']);
    expect(report.ignored.map((note) => note.label)).toEqual(['Notice']);
  });
});
