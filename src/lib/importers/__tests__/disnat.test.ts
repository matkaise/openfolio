import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import { disnatFileImporter } from '../disnat';
import type { ImportEntry } from '../entries';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'disnat.csv'), 'utf-8');
const directa = readFileSync(path.join(fixtureDir, 'directa.csv'), 'utf-8');
const target = { id: 'p1', name: 'Disnat', isNew: true };
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

/** The fixture as an English-locale Excel saves it with semicolons: decimal point, no quotes. */
const semicolonDot = lines.map((line) => line
  .replace(/"(-?\d+),(\d+)"/g, '$1.$2')
  .replace(/,/g, ';')).join('\n');

describe('Disnat CSV detection', () => {
  it('recognises the French account history saved with comma or semicolon', () => {
    expect(disnatFileImporter.detect(csv)).toBe('fr-comma');
    expect(disnatFileImporter.detect(semicolonDot)).toBe('fr-semicolon');
    expect(detectFileImporter(csv)?.id).toBe('disnat');
  });

  it('does not take other files', () => {
    expect(disnatFileImporter.detect(directa)).toBeNull();
  });
});

describe('Disnat CSV', () => {
  const { batch, report } = disnatFileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books trades under the symbol without "-C" and splits off the commission where it adds up', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.fee, e.currency])).toEqual([
      ['2024-01-10', 'EXUS', 5, -693.45, undefined, 'CAD'],
      ['2024-01-04', 'EXBK', 20, -1205, -9.95, 'CAD'],
      ['2024-01-04', 'EXEQ', 50, -2025, undefined, 'CAD']
    ]);
    expect(byKind('sell').map((e) => [e.date, e.isin, e.quantity, e.amount, e.fee])).toEqual([['2024-10-01', 'EXBK', -10, 651, -9.95]]);
    // USD price, CAD account: conversion and commission cannot be told apart
    expect(byKind('buy')[0].raw).toMatchObject({ priceCurrency: 'USD', commission: 6.95, symbol: 'EXUS', settlementDate: '2024-01-12' });
  });

  it('matches dividends to the traded symbol and books withholding, interest, fees and sales taxes on fees', () => {
    expect(byKind('dividend').map((e) => [e.date, e.isin, e.amount])).toEqual([['2024-04-15', 'EXUS', 8.45], ['2024-03-28', 'EXEQ', 12.5]]);
    expect(byKind('withholding_tax').map((e) => [e.isin, e.amount])).toEqual([['EXUS', -1.27]]);
    expect(byKind('interest').map((e) => e.amount)).toEqual([0.42]);
    expect(byKind('fee').map((e) => e.amount)).toEqual([-9.98, -5, -100]);
  });

  it('books contribution, cash transfer and withdrawal and keeps the cash consistent', () => {
    expect(byKind('deposit').map((e) => e.amount)).toEqual([250, 5000]);
    expect(byKind('withdrawal').map((e) => e.amount)).toEqual([-500]);
    expect(cash(batch.entries)).toEqual({ CAD: 1362.77 });
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ CAD: 1362.77 });
  });

  it('reports the transfer of securities', () => {
    expect(report.unsupported).toEqual([{ line: 3, label: 'TRANSFERT REÇU' }]);
    expect(report.ignored).toEqual([]);
    expect(report.rows).toBe(15);
    expect(report.period).toEqual({ from: '2024-01-03', to: '2024-12-18' });
  });

  it('reads the semicolon file with decimal points the same way', () => {
    const expected = batch.entries.map((e) => [e.kind, e.amount, e.fee, e.quantity]);
    expect(disnatFileImporter.parse(semicolonDot).batch.entries.map((e) => [e.kind, e.amount, e.fee, e.quantity])).toEqual(expected);
  });
});

describe('Disnat edge cases and errors', () => {
  it('books RESP grants as deposits and reports unknown types and options', () => {
    const rows = [
      header,
      '-,2025-07-31,SUBVENTION REEE,-,-,00801 REEE,-,0,-,CAN,0,"231,6",CAN',
      '-,2025-07-30,INCITATIF QUÉBÉCOIS,-,-,00101 IQEE (2024),-,0,-,CAN,0,25,CAN',
      '-,2025-08-01,ÉCHANGE,Actions,EXEQ-C,EXEMPLE ALL-EQ ETF,-,10,-,CAN,0,0,CAN',
      '2025-08-02,2025-08-03,ACHAT,Options,EXEQ-C,EXEQ CALL,CAN,1,"1,5",CAN,0,-150,CAN',
      '2025-08-02,2025-08-03,ACHAT,Actions,-,SANS SYMBOLE,CAN,1,10,CAN,0,-10,CAN'
    ];
    const { batch, report } = disnatFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.kind, e.amount])).toEqual([['deposit', 231.6], ['deposit', 25]]);
    expect(report.unsupported).toEqual([{ line: 4, label: 'ÉCHANGE' }, { line: 5, label: 'ACHAT' }, { line: 6, label: 'ACHAT' }]);
  });

  it('rejects mixed number formats and other dates with the line', () => {
    expect(errorOf(() => disnatFileImporter.parse(csv.replace('"0,42"', '0.42')))).toEqual({ code: 'invalidNumber', line: 9 });
    expect(errorOf(() => disnatFileImporter.parse(csv.replace('-,2024-03-28', '-,28/03/2024')))).toEqual({ code: 'invalidDate', line: 12 });
  });

  it('adds nothing on re-import or overlap and keeps identical rows apart', () => {
    const first = applyImportBatch(createEmptyProject(), disnatFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(4);
    const again = applyImportBatch(first.project, disnatFileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    const partial = applyImportBatch(first.project, disnatFileImporter.parse([header, ...lines.slice(4, 12)].join('\n')).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
    const twice = applyImportBatch(createEmptyProject(), disnatFileImporter.parse([header, lines[14], lines[14]].join('\n')).batch, target);
    expect(twice.summary.addedTransactions).toBe(2);
  });

  it('rejects an export without rows and unknown files', () => {
    expect(errorOf(() => readImportFiles([{ name: 'Historique.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => disnatFileImporter.parse('Date de règlement,Type de transaction\n2024-01-03,COTISATION\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });
});
