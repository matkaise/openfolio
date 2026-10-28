import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { xtbFileImporter } from '../xtb';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const cash = readFileSync(path.join(fixtureDir, 'xtb-cash-operations.csv'), 'utf-8');
const legacy = readFileSync(path.join(fixtureDir, 'xtb-legacy.csv'), 'utf-8');
const tradeRepublic = readFileSync(path.join(fixtureDir, 'traderepublic.csv'), 'utf-8');
const NAME = 'EUR_account_2025-01-01_2025-06-30.csv';
const target = { id: 'p1', name: 'XTB', isNew: true };
const lines = cash.trim().split('\n');
const head = lines.slice(0, 5);
const data = lines.slice(5, -1);

/** The fixture as English Excel saves it: "," separator, decimal point. */
const commaSaved = lines
  .map((line) => line.split(';').map((cell) => (/^-?\d+,\d+$/.test(cell) ? cell.replace(',', '.') : cell)).join(','))
  .join('\n');

/** The ten-column layout of newer exports. */
const tenColumns = [
  ...head.slice(0, 4).map((line) => `${line};;`),
  'Type;Instrument;Ticker;Category;Time;Amount;ID;Comment;Product;Position ID',
  ...lines.slice(5).map((line) => {
    const [type, ticker, instrument, time, amount, id, comment, product] = line.split(';');
    return [type, instrument, ticker, '', time, amount, id, comment, product, ''].join(';');
  })
].join('\n');

const errorOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof FileImportError) return { code: error.code, line: error.line };
    throw error;
  }
  return null;
};

const parse = (text: string, name = NAME) => xtbFileImporter.parse(text, name);
const file = (...rows: string[]) => [...head, ...rows].join('\n');

describe('XTB CSV detection', () => {
  it('recognises the cash operations sheet in every layout and the former CSV export', () => {
    expect(xtbFileImporter.detect(cash)).toBe('cash-8');
    expect(xtbFileImporter.detect(commaSaved)).toBe('cash-8-comma');
    expect(xtbFileImporter.detect(tenColumns)).toBe('cash-10');
    expect(xtbFileImporter.detect(legacy)).toBe('legacy');
    expect(xtbFileImporter.detect(`﻿${cash.replace(/\n/g, '\r\n')}`)).toBe('cash-8');
    expect(detectFileImporter(cash)?.id).toBe('xtb');
    expect(detectFileImporter(legacy)?.id).toBe('xtb');
  });

  it('recognises by content, not by file name', () => {
    expect(xtbFileImporter.detect(tradeRepublic)).toBeNull();
    expect(xtbFileImporter.detect('Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\nDeposit;;;2025-01-02 09:00:00;100;1;Deposit;My Trades\n')).toBeNull();
    expect(errorOf(() => readImportFiles([{ name: NAME, text: 'a;b\n1;2\n' }]))).toEqual({ code: 'unknownFormat', line: undefined });
  });
});

describe('XTB cash operations', () => {
  const { batch, report } = parse(cash);
  const trades = batch.entries.filter((entry) => entry.kind === 'buy' || entry.kind === 'sell');
  const others = batch.entries.filter((entry) => !trades.includes(entry));

  it('books stock and ETF trades under the XTB ticker with quantity from the comment', () => {
    expect(trades.map((entry) => [entry.date, entry.kind, entry.isin, entry.name, entry.quantity, entry.amount, entry.currency])).toEqual([
      ['2025-01-03', 'buy', 'ACME.DE', 'Acme Corp', 10, -500, 'EUR'],
      ['2025-01-03', 'buy', 'ACME.DE', 'Acme Corp', 2, -100.4, 'EUR'],
      ['2025-01-06', 'buy', 'EXMP.US', 'Example Inc', 5, -460, 'EUR'],
      ['2025-02-10', 'sell', 'ACME.DE', 'Acme Corp', -6, 330, 'EUR'],
      ['2025-04-02', 'buy', 'WRLD.DE', 'World Equity ETF', 0.5, -99.9, 'EUR']
    ]);
    expect(trades[1].raw).toMatchObject({ pricePerShare: 50.2, product: 'My Trades' });
  });

  it('keeps withholding tax as tax, not as a fee, and books the other cash rows', () => {
    expect(others.map((entry) => [entry.date, entry.kind, entry.amount, entry.isin])).toEqual([
      ['2025-01-02', 'deposit', 2000, undefined],
      ['2025-01-03', 'tax', -0.6, 'ACME.DE'],
      ['2025-02-03', 'interest', 1.5, undefined],
      ['2025-02-03', 'tax', -0.28, undefined],
      ['2025-02-10', 'fee', -0.66, 'ACME.DE'],
      ['2025-03-14', 'dividend', 2.3, 'EXMP.US'],
      ['2025-03-14', 'withholding_tax', -0.35, 'EXMP.US'],
      ['2025-04-01', 'withdrawal', -200, undefined]
    ]);
  });

  it('reports CFD rows, the spin-off and the transfer to another account as not imported', () => {
    expect(report.unsupported).toEqual([
      { line: 21, label: 'Close trade' },
      { line: 22, label: 'Swap' },
      { line: 23, label: 'Dividend' },
      { line: 24, label: 'Spinoff' },
      { line: 25, label: 'Transfer' }
    ]);
    expect(report.ignored).toEqual([
      { line: 18, label: 'Subaccount transfer' },
      { line: 19, label: 'Subaccount transfer' }
    ]);
    expect(report.rows).toBe(20);
    expect(report.period).toEqual({ from: '2025-01-02', to: '2025-04-02' });
  });

  it('adds up to the booked part of the total and to the holdings', () => {
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    // Total row 1009.11 minus the not imported rows (-12.50, -0.40, -0.80, 1.20, 50.00)
    expect(deriveCashBalances(getLedger(project))).toEqual({ EUR: 971.61 });
    const position = (ticker: string) => trades.filter((entry) => entry.isin === ticker).reduce((sum, entry) => sum + (entry.quantity || 0), 0);
    expect([position('ACME.DE'), position('EXMP.US'), position('WRLD.DE')]).toEqual([6, 5, 0.5]);
    expect(project.securities['ACME.DE']).toMatchObject({ symbol: 'ACME.DE', name: 'Acme Corp' });
  });

  it('reads the comma-separated and the ten-column layout the same way', () => {
    const strip = (entries: typeof batch.entries) => entries.map((entry) => ({ ...entry, raw: undefined }));
    expect(strip(parse(commaSaved).batch.entries)).toEqual(strip(batch.entries));
    expect(strip(parse(tenColumns).batch.entries)).toEqual(strip(batch.entries));
  });

  it('takes the account currency from the file name and refuses a file without it', () => {
    expect(parse(cash, 'USD_account_2025.csv').batch.entries.every((entry) => entry.currency === 'USD')).toBe(true);
    expect(errorOf(() => parse(cash, 'cash-operations.csv'))).toEqual({ code: 'missingCurrency', line: undefined });
    expect(errorOf(() => readImportFiles([{ name: 'export.csv', text: cash }]))).toEqual({ code: 'missingCurrency', line: undefined });
    expect(readImportFiles([{ name: NAME, text: cash }]).importer.id).toBe('xtb');
  });
});

describe('XTB former CSV export', () => {
  const { batch, report } = parse(legacy, 'EUR_legacy.csv');

  it('books trades, interest, dividend and withholding tax and reports the CFD result', () => {
    expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.quantity])).toEqual([
      ['2025-01-02', 'deposit', 1000, undefined],
      ['2025-01-03', 'buy', -200, 4],
      ['2025-01-03', 'buy', -200, 4],
      ['2025-02-03', 'interest', 0.75, undefined],
      ['2025-02-03', 'tax', -0.14, undefined],
      ['2025-03-14', 'dividend', 4, undefined],
      ['2025-03-14', 'withholding_tax', -1.06, undefined]
    ]);
    expect(report.unsupported).toEqual([{ line: 9, label: 'Profit/Loss (FX/CFD)' }]);
    expect(report.variant).toBe('legacy');
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ EUR: 603.55 });
  });

  it('keeps two identical buys with their own operation ids apart', () => {
    const { summary } = applyImportBatch(createEmptyProject(), batch, target);
    expect(summary.addedTransactions).toBe(2);
  });
});

describe('XTB re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), parse(cash).batch, target);
    expect(first.summary.addedTransactions).toBe(5);

    const again = applyImportBatch(first.project, parse(cash).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    expect(getLedger(again.project)).toEqual(getLedger(first.project));

    const overlap = applyImportBatch(first.project, parse(file(...data.slice(3, 12))).batch, { ...target, isNew: false });
    expect(overlap.summary.addedTransactions + overlap.summary.addedMovements).toBe(0);
  });

  it('skips a repeated operation id and keeps rows without id apart', () => {
    const repeated = parse(file(data[1], data[1]));
    expect(repeated.batch.entries).toHaveLength(1);
    expect(repeated.report.ignored).toEqual([{ line: 7, label: 'Stock purchase' }]);

    const withoutId = data[1].replace(';1002;', ';;');
    const { batch } = parse(file(withoutId, withoutId));
    expect(applyImportBatch(createEmptyProject(), batch, target).summary.addedTransactions).toBe(2);
  });

  it('keeps the same operation id of different accounts apart', () => {
    const first = applyImportBatch(createEmptyProject(), parse(cash).batch, target);
    const otherAccount = cash.replace('Account number;00000000', 'Account number;11111111');
    const second = applyImportBatch(first.project, parse(otherAccount).batch, { ...target, isNew: false });
    expect(second.summary.addedTransactions).toBe(5);
  });
});

describe('XTB error handling', () => {
  it('rejects numbers and dates in unexpected formats with the line', () => {
    expect(errorOf(() => parse(file(data[1].replace('-500,00', '-500.00'))))).toEqual({ code: 'invalidNumber', line: 6 });
    expect(errorOf(() => parse(file(data[1].replace('2025-01-03 10:00:00', '2025/01/03 10:00'))))).toEqual({ code: 'invalidDate', line: 6 });
  });

  it('rejects an export without rows', () => {
    expect(errorOf(() => parse(`${head.join('\n')}\nTotal;;;;0;;;\n`))).toEqual({ code: 'noRows', line: undefined });
  });

  it('reports a trade without readable quantity and unknown types', () => {
    const noQuantity = data[1].replace('OPEN BUY 10 @ 50.00', 'Order 4711');
    const unknown = 'Vklad odměny;;;2025-01-09 09:00:00;5;1099;Bonus;My Trades';
    const empty = 'Info;;;2025-01-09 09:00:00;0;1098;Note;My Trades';
    const { batch, report } = parse(file(noQuantity, unknown, empty));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 6, label: 'Stock purchase' }, { line: 7, label: 'Vklad odměny' }]);
    expect(report.ignored).toEqual([{ line: 8, label: 'Info' }]);
  });
});
