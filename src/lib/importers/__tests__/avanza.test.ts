import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import { avanzaFileImporter } from '../avanza';
import type { ImportEntry } from '../entries';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const csv = readFileSync(path.join(fixtureDir, 'avanza.csv'), 'utf-8');
const swissquote = readFileSync(path.join(fixtureDir, 'swissquote-de.csv'), 'utf-8');
const target = { id: 'p1', name: 'Avanza', isNew: true };
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

describe('Avanza CSV detection', () => {
  it('recognises the Swedish transaction export, also with the older "Courtage" column', () => {
    expect(avanzaFileImporter.detect(csv)).toBe('sv');
    expect(avanzaFileImporter.detect(csv.replace('Courtage (SEK)', 'Courtage'))).toBe('sv');
    expect(detectFileImporter(csv)?.id).toBe('avanza');
  });

  it('does not take other files', () => {
    expect(avanzaFileImporter.detect(swissquote)).toBeNull();
    expect(avanzaFileImporter.detect(csv.replace(/;/g, ','))).toBeNull();
  });
});

describe('Avanza CSV', () => {
  const { batch, report } = avanzaFileImporter.parse(csv);
  const byKind = (kind: string) => batch.entries.filter((entry) => entry.kind === kind);

  it('books trades with the courtage as fee and the SEK amount as cash effect', () => {
    expect(byKind('buy').map((e) => [e.date, e.isin, e.quantity, e.amount, e.fee, e.currency])).toEqual([
      ['2024-01-08', 'SE0000000031', 10, -950, -1, 'SEK'],
      ['2024-01-04', 'US0000000021', 3, -4860.4, -6.95, 'SEK'],
      ['2024-01-03', 'SE0000000011', 25.5, -5100, undefined, 'SEK']
    ]);
    expect(byKind('sell').map((e) => [e.isin, e.quantity, e.amount])).toEqual([['SE0000000011', -10.5, 2310]]);
    expect(byKind('buy')[1].raw).toMatchObject({ account: 'ISK', instrumentCurrency: 'USD', exchangeRate: '10,765', pricePerShare: 150.5 });
    expect(byKind('sell')[0].raw).toMatchObject({ result: '210' });
  });

  it('books the dividend with its foreign withholding tax, interest, yield tax and fee refund', () => {
    expect(byKind('dividend').map((e) => [e.amount, e.isin])).toEqual([[15.9, 'US0000000021']]);
    expect(byKind('withholding_tax').map((e) => [e.amount, e.isin])).toEqual([[-2.39, 'US0000000021']]);
    expect(byKind('interest').map((e) => e.amount)).toEqual([1.25]);
    expect(byKind('tax').map((e) => [e.amount, e.description])).toEqual([[-12, 'Avkastningsskatt']]);
    expect(byKind('fee').map((e) => e.amount)).toEqual([3.4]);
  });

  it('books deposits and withdrawals of all accounts and keeps the cash consistent', () => {
    expect(byKind('deposit').map((e) => e.amount)).toEqual([1000, 12000]);
    expect(byKind('withdrawal').map((e) => e.amount)).toEqual([-1000]);
    expect(cash(batch.entries)).toEqual({ SEK: 3397.81 });
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ SEK: 3397.81 });
  });

  it('reports the fund switch rows instead of dropping them', () => {
    expect(report.unsupported).toEqual([
      { line: 2, label: 'Övrigt: Exempel Bank C' },
      { line: 3, label: 'Övrigt: Exempel Bank B (fondbyte)' }
    ]);
    expect(report.ignored).toEqual([]);
    expect(report.rows).toBe(14);
    expect(report.period).toEqual({ from: '2024-01-02', to: '2024-05-10' });
  });
});

describe('Avanza variants and edge cases', () => {
  it('books a buy on a currency account without splitting off the SEK courtage', () => {
    const rows = [header, '2024-07-01;ISK;Köp;Example Tech;1;150;-151;USD;10,5;1;USD;US0000000021;'];
    const { batch } = avanzaFileImporter.parse(rows.join('\n'));
    expect(batch.entries.map((e) => [e.amount, e.fee, e.currency])).toEqual([[-151, undefined, 'USD']]);
    expect(batch.entries[0].raw).toMatchObject({ courtage: 10.5 });
  });

  it('reports unknown types and other rows with an amount, ignores empty ones', () => {
    const rows = [
      header,
      '2024-07-01;ISK;Preliminärskatt;Utdelning EXSE;;;-30;SEK;;;;SE0000000011;',
      '2024-07-01;ISK;Övrigt;Okänd händelse;;;5;SEK;;;;;',
      '2024-07-01;ISK;Övrigt;Information;;;;;;;;;',
      '2024-07-01;ISK;Köp;Okänt värdepapper;1;10;-10;SEK;0;;SEK;;'
    ];
    const { batch, report } = avanzaFileImporter.parse(rows.join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([
      { line: 2, label: 'Preliminärskatt: Utdelning EXSE' },
      { line: 3, label: 'Övrigt: Okänd händelse' },
      { line: 5, label: 'Köp' }
    ]);
    expect(report.ignored).toEqual([{ line: 4, label: 'Övrigt: Information' }]);
  });

  it('rejects decimal points, thousands separators and non-ISO dates with the line', () => {
    expect(errorOf(() => avanzaFileImporter.parse(csv.replace('-951;', '-951.00;')))).toEqual({ code: 'invalidNumber', line: 10 });
    expect(errorOf(() => avanzaFileImporter.parse(csv.replace(';12000;', ';12 000;')))).toEqual({ code: 'invalidNumber', line: 15 });
    expect(errorOf(() => avanzaFileImporter.parse(csv.replace('2024-04-30;ISK', '30.04.2024;ISK')))).toEqual({ code: 'invalidDate', line: 7 });
  });
});

describe('Avanza re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), avanzaFileImporter.parse(csv).batch, target);
    expect(first.summary.addedTransactions).toBe(4);
    const again = applyImportBatch(first.project, avanzaFileImporter.parse(csv).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    const overlap = [header, ...lines.slice(4, 12)].join('\n');
    const partial = applyImportBatch(first.project, avanzaFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps identical rows apart, also the same row in two accounts', () => {
    const buy = lines[9];
    const otherAccount = buy.replace(';9876543;', ';ISK;');
    const { summary } = applyImportBatch(createEmptyProject(), avanzaFileImporter.parse([header, buy, buy, otherAccount].join('\n')).batch, target);
    expect(summary.addedTransactions).toBe(3);
  });
});

describe('Avanza error handling', () => {
  it('rejects an export without rows and unknown files', () => {
    expect(errorOf(() => readImportFiles([{ name: 'transaktioner.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    expect(errorOf(() => avanzaFileImporter.parse('Datum;Konto;Belopp\n2024-01-02;ISK;5\n'))).toEqual({ code: 'unknownFormat', line: undefined });
  });
});
