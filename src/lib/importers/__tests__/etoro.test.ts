import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import type { ImportEntry } from '../entries';
import { etoroFileImporter } from '../etoro';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'etoro.csv'), 'utf-8');
const revolut = readFileSync(path.join(fixtureDir, 'revolut.csv'), 'utf-8');
const saxo = readFileSync(path.join(fixtureDir, 'saxo.csv'), 'utf-8');
const target = { id: 'p1', name: 'eToro', isNew: true };
const lines = csv.trim().split('\n');
const header = lines[0];

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

describe('eToro CSV detection', () => {
  it('recognises the Account Activity sheet with "Units / Contracts" or "Units"', () => {
    expect(etoroFileImporter.detect(csv)).toBe('contracts');
    expect(etoroFileImporter.detect(csv.replace('Units / Contracts', 'Units'))).toBe('units');
    expect(detectFileImporter(csv)?.id).toBe('etoro');
  });

  it('does not take other sheets or files of other brokers', () => {
    expect(etoroFileImporter.detect('Position ID,Action,Long / Short,Amount,Units,Open Date,Close Date\n1,Buy EXMP,Long,10,1,02/01/2024,03/01/2024\n')).toBeNull();
    expect(etoroFileImporter.detect(revolut)).toBeNull();
    expect(etoroFileImporter.detect(saxo)).toBeNull();
  });
});

describe('eToro CSV', () => {
  const { batch, report } = etoroFileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books stock and ETF positions as trades in USD under the eToro symbol', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.currency])).toEqual([
      ['2024-01-03', 'EXMP', 2.5, -500, 'USD'],
      ['2024-01-04', 'BRIT.L', 25.5, -200, 'USD'],
      ['2024-01-05', 'EXET', 1.2, -150, 'USD'],
      ['2024-01-08', 'EXMP', 0.25, -50, 'USD']
    ]);
    expect(byKind('sell').map((e) => [e.date, e.isin, e.quantity, e.amount])).toEqual([['2024-01-22', 'EXMP', -1.5, 330]]);
    // The instrument currency stays in the raw data; GBX is not turned into GBP
    expect(byKind('buy')[1].raw).toMatchObject({ instrumentCurrency: 'GBX', positionId: '3000000002', assetType: 'Stocks' });
    expect(byKind('sell')[0].raw).toMatchObject({ realizedEquityChange: 30 });
  });

  it('books net dividends, interest, stamp duty, deposits, withdrawals and the withdrawal fee', () => {
    expect(byKind('dividend').map((e) => [e.amount, e.isin])).toEqual([[0.85, 'EXMP'], [0.08, 'EXMP']]);
    expect(byKind('interest').map((e) => e.amount)).toEqual([0.42]);
    expect(byKind('fee').map((e) => [e.amount, e.isin, e.description])).toEqual([[-1, 'BRIT.L', 'SDRT BRIT.L/GBX'], [-5, undefined, 'Withdraw Fee']]);
    expect(byKind('deposit').map((e) => [e.amount, e.currency, e.description])).toEqual([[1085, 'USD', 'Deposit 1000.00 EUR eToroMoney']]);
    expect(byKind('withdrawal').map((e) => e.amount)).toEqual([-200]);
  });

  it('keeps the booked cash consistent and the stamp duty after merging', () => {
    // eToro balance 268.11 = booked 310.35 + CFD result 7.76 − crypto purchase 50 (both reported)
    expect(cash(batch.entries)).toEqual({ USD: 310.35 });
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ USD: 310.35 });
    expect(getLedger(project).filter((entry) => entry.kind === 'fee')).toHaveLength(2);
  });

  it('reports CFD and crypto rows and ignores conversion fees already in the converted amount', () => {
    expect(report.unsupported).toEqual([
      { line: 9, label: 'Open Position' },
      { line: 10, label: 'Overnight fee' },
      { line: 13, label: 'Open Position' },
      { line: 15, label: 'Position closed' }
    ]);
    expect(report.ignored).toEqual([
      { line: 3, label: 'Deposit Conversion Fee' },
      { line: 19, label: 'Withdrawal Conversion Fee' }
    ]);
    expect(report.rows).toBe(18);
    expect(report.period).toEqual({ from: '2024-01-02', to: '2024-02-10' });
  });
});

describe('eToro number, date and row variants', () => {
  it('reads a CSV saved by a European Excel: semicolons, decimal comma, space thousands, parentheses', () => {
    const rows = [
      'Date;Type;Details;Amount;Units;Realized Equity Change;Realized Equity;Balance;Position ID;Asset type;NWA',
      '02/01/2024 09:00:00;Deposit;-; 1 757,95 ;-; 1 757,95 ; 1 757,95 ; 1 757,95 ;-;-; 0,00 ',
      '03/01/2024 15:30:00;Open Position;EXMP/USD; 1 000,00 ;0,5;0,00; 1 757,95 ; 757,95 ;3000000011;Stocks; 0,00 ',
      '04/01/2024 15:30:00;SDRT;EXMP/USD;(0,10);-;(0,10); 1 757,85 ; 757,85 ;3000000011;Stocks; 0,00 '
    ];
    expect(etoroFileImporter.detect(rows.join('\n'))).toBe('units');
    const { batch } = etoroFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.kind, e.amount, e.quantity])).toEqual([
      ['deposit', 1757.95, undefined],
      ['buy', -1000, 0.5],
      ['fee', -0.1, undefined]
    ]);
  });

  it('books positions of a copied trader and skips the empty copy start, reports the copy stop', () => {
    const rows = [
      header,
      '05/02/2024 09:00:00,Start Copy,ExampleTrader,0.00,-,0.00,"1,000.00",900.00,10000001,-,0.00',
      '05/02/2024 09:00:00,Open Position,EXCP/USD,60.00,3,0.00,"1,000.00",900.00,3000000021,Stocks,0.00',
      '06/02/2024 09:00:00,Stop Copy,ExampleTrader,40.00,-,0.00,"1,000.00",940.00,10000001,-,0.00'
    ];
    const { batch, report } = etoroFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.kind, e.isin, e.amount])).toEqual([['buy', 'EXCP', -60]]);
    expect(report.ignored).toEqual([{ line: 2, label: 'Start Copy' }]);
    expect(report.unsupported).toEqual([{ line: 4, label: 'Stop Copy' }]);
  });

  it('rejects mixed number formats, month-first and unexpected dates with the line', () => {
    expect(errorOf(() => etoroFileImporter.parse(csv.replace('500.00,2.5', '"500,25",2.5')))).toEqual({ code: 'invalidNumber', line: 4 });
    expect(errorOf(() => etoroFileImporter.parse(csv.replace('22/01/2024 15:45:00', '01/22/2024 15:45:00')))).toEqual({ code: 'invalidDate', line: 14 });
    expect(errorOf(() => etoroFileImporter.parse(csv.replace('03/01/2024 15:30:00', '3/1/2024 15:30')))).toEqual({ code: 'invalidDate', line: 4 });
    expect(errorOf(() => etoroFileImporter.parse(csv.replace('500.00,2.5', '500.00,2.5x')))).toEqual({ code: 'invalidNumber', line: 4 });
  });
});

describe('eToro re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), etoroFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(5);
    const again = applyImportBatch(first.project, etoroFileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    const overlap = [header, ...lines.slice(5, 16)].join('\n');
    const partial = applyImportBatch(first.project, etoroFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps two identical rows of one file apart', () => {
    const { summary } = applyImportBatch(createEmptyProject(), etoroFileImporter.parse([header, lines[3], lines[3]].join('\n')).batch, target);
    expect(summary.addedTransactions).toBe(2);
  });
});

describe('eToro error handling', () => {
  it('rejects an export without rows and files of unknown format', () => {
    expect(errorOf(() => readImportFiles([{ name: 'empty.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => etoroFileImporter.parse('Date,Type,Amount\n02/01/2024,Deposit,5\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });

  it('reports a position without symbol and a negative stock dividend instead of guessing', () => {
    const rows = [
      header,
      '03/01/2024 15:30:00,Open Position,-,50.00,1,0.00,100.00,50.00,3000000031,Stocks,0.00',
      '15/01/2024 00:10:00,Dividend,EXMP/USD,(0.30),-,(0.30),99.70,49.70,3000000032,Stocks,0.00'
    ];
    const { batch, report } = etoroFileImporter.parse(rows.join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'Open Position' }, { line: 3, label: 'Dividend' }]);
  });
});
