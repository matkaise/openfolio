import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import { FileImportError } from '../fileImport';
import { detectFileImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { tradeRepublicFileImporter } from '../traderepublic';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const comma = readFileSync(path.join(fixtureDir, 'traderepublic.csv'), 'utf-8');
const swissquote = readFileSync(path.join(fixtureDir, 'swissquote-en.csv'), 'utf-8');
const target = { id: 'p1', name: 'Trade Republic', isNew: true };
const [header, ...lines] = comma.trim().split('\n');

/** The same file with ";" and unquoted cells, as older exports look. */
const semicolon = comma.replace(/","/g, '";"').replace(/"/g, '');

const errorOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof FileImportError) return { code: error.code, line: error.line };
    throw error;
  }
  return null;
};

/** Replaces one cell of a data row of the fixture (0-based row, column by header name). */
const withCell = (rowIndex: number, name: string, value: string) => {
  const columns = header.replace(/"/g, '').split(',');
  const cells = lines[rowIndex].slice(1, -1).split('","');
  cells[columns.indexOf(name)] = value;
  return `"${cells.join('","')}"`;
};

describe('Trade Republic CSV detection', () => {
  it('recognises the transaction export with either separator', () => {
    expect(tradeRepublicFileImporter.detect(comma)).toBe('comma');
    expect(tradeRepublicFileImporter.detect(semicolon)).toBe('semicolon');
    expect(tradeRepublicFileImporter.detect(`﻿${comma.replace(/\n/g, '\r\n')}`)).toBe('comma');
    expect(detectFileImporter(comma)?.id).toBe('traderepublic');
    expect(detectFileImporter(semicolon)?.id).toBe('traderepublic');
  });

  it('does not take pytr exports or other brokers for the native export', () => {
    expect(tradeRepublicFileImporter.detect('Datum;Typ;Wert;Notiz;ISIN;Anzahl;Gebühren;Steuern\n2024-01-02;Kauf;-5;ETF;IE0000000002;0,1;;\n')).toBeNull();
    expect(tradeRepublicFileImporter.detect('Date;Type;Value;Note;ISIN;Shares;Fees;Taxes\n2024-01-02;Buy;-5;ETF;IE0000000002;0.1;;\n')).toBeNull();
    expect(tradeRepublicFileImporter.detect(swissquote)).toBeNull();
  });
});

describe('Trade Republic CSV', () => {
  const { batch, report } = tradeRepublicFileImporter.parse(comma);
  const trades = batch.entries.filter((entry) => entry.kind === 'buy' || entry.kind === 'sell');
  const others = batch.entries.filter((entry) => !trades.includes(entry));

  it('books trades with their fee, partial fills apart and savings plans marked', () => {
    expect(trades.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee, Boolean(entry.savingsPlan)])).toEqual([
      ['2025-01-06', 'buy', 'DE0000000001', 10, -500, -1, false],
      ['2025-01-06', 'buy', 'DE0000000001', 2, -100.2, -1, false],
      ['2025-01-15', 'buy', 'IE0000000002', 1.234567, -100, undefined, true],
      ['2025-02-10', 'buy', 'US0000000003', 20, -200, -1, false],
      ['2025-02-12', 'buy', 'DE0000000004', 100, -99, -1, false],
      ['2025-05-05', 'sell', 'DE0000000001', -6, 360, -1, false],
      ['2025-05-15', 'sell', 'DE0000000004', -100, 100, undefined, false]
    ]);
    expect(trades.every((entry) => entry.currency === 'EUR' && entry.source === 'Trade Republic')).toBe(true);
    expect(new Set(batch.entries.map((entry) => entry.externalId)).size).toBe(batch.entries.length);
  });

  it('books taxes, dividends with their tax and the dividend reversal', () => {
    expect(others.map((entry) => [entry.date, entry.kind, entry.amount, entry.isin])).toEqual([
      ['2025-01-02', 'deposit', 1010, undefined],
      ['2025-01-02', 'fee', -10, undefined],
      ['2025-01-03', 'deposit', 2000, undefined],
      ['2025-01-28', 'tax', -0.15, 'IE0000000002'],
      ['2025-02-03', 'interest', 5, undefined],
      ['2025-02-03', 'tax', -1.32, undefined],
      ['2025-03-14', 'dividend', 12, 'US0000000003'],
      ['2025-03-14', 'withholding_tax', -3.17, 'US0000000003'],
      ['2025-03-14', 'dividend', -12, 'US0000000003'],
      ['2025-03-14', 'withholding_tax', 3.17, 'US0000000003'],
      ['2025-03-14', 'dividend', 12, 'US0000000003'],
      ['2025-03-14', 'withholding_tax', -1.8, 'US0000000003'],
      ['2025-04-01', 'withdrawal', -25.5, undefined],
      ['2025-04-01', 'deposit', 0.26, undefined],
      ['2025-05-05', 'tax', -2.37, 'DE0000000001'],
      ['2025-05-15', 'dividend', 2, 'DE0000000004'],
      ['2025-05-15', 'withholding_tax', -0.53, 'DE0000000004'],
      ['2025-06-02', 'withdrawal', -300, undefined],
      ['2025-06-30', 'tax', 0.4, undefined]
    ]);
  });

  it('keeps the foreign currency amount and drops payment details from the stored row', () => {
    const dividend = others.find((entry) => entry.kind === 'dividend');
    expect(dividend?.raw).toMatchObject({ fields: { original_amount: '13.00', original_currency: 'USD', fx_rate: '0.923077' } });
    const transfer = others.find((entry) => entry.amount === 2000);
    expect(JSON.stringify(transfer?.raw)).not.toContain('counterparty');
  });

  it('adds up to the cash and holdings of the export', () => {
    const { project } = applyImportBatch(createEmptyProject(), batch, target);
    expect(deriveCashBalances(getLedger(project))).toEqual({ EUR: 2143.79 });
    const position = (isin: string) => Math.round(trades.filter((entry) => entry.isin === isin).reduce((sum, entry) => sum + (entry.quantity || 0), 0) * 1e6) / 1e6;
    expect([position('DE0000000001'), position('IE0000000002'), position('US0000000003'), position('DE0000000004')]).toEqual([6, 1.234567, 20, 0]);
  });

  it('reports crypto and the split as not imported and rows without effect as ignored', () => {
    expect(report.unsupported).toEqual([
      { line: 7, label: 'TRADING / BUY' },
      { line: 23, label: 'CORPORATE_ACTION / SPLIT' }
    ]);
    expect(report.ignored).toEqual([
      { line: 9, label: 'CASH / PRE_DETERMINED_TAX_BASE' },
      { line: 20, label: 'CORPORATE_ACTION / REDEMPTION' }
    ]);
    expect(report.rows).toBe(23);
    expect(report.variant).toBe('comma');
    expect(report.period).toEqual({ from: '2025-01-02', to: '2025-06-30' });
  });

  it('reads the semicolon export the same way', () => {
    const other = tradeRepublicFileImporter.parse(semicolon);
    const withoutRaw = (entries: typeof batch.entries) => entries.map((entry) => ({ ...entry, raw: undefined }));
    expect(withoutRaw(other.batch.entries)).toEqual(withoutRaw(batch.entries));
    expect(other.report.variant).toBe('semicolon');
  });
});

describe('Trade Republic re-import and overlap', () => {
  it('adds nothing when the same file or an overlapping part is imported again', () => {
    const first = applyImportBatch(createEmptyProject(), tradeRepublicFileImporter.parse(comma).batch, target);
    expect(first.summary.addedTransactions).toBe(7);

    const again = applyImportBatch(first.project, tradeRepublicFileImporter.parse(comma).batch, { ...target, isNew: false });
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    expect(getLedger(again.project)).toEqual(getLedger(first.project));

    const overlap = [header, ...lines.slice(8, 16)].join('\n');
    const partial = applyImportBatch(first.project, tradeRepublicFileImporter.parse(overlap).batch, { ...target, isNew: false });
    expect(partial.summary.addedTransactions + partial.summary.addedMovements).toBe(0);
  });

  it('keeps identical trades with their own transaction ids apart and skips a repeated id', () => {
    const twin = withCell(2, 'transaction_id', '00000000-0000-4000-8000-000000000099');
    const { batch, report } = tradeRepublicFileImporter.parse([header, lines[2], twin, lines[2]].join('\n'));
    expect(applyImportBatch(createEmptyProject(), batch, target).summary.addedTransactions).toBe(2);
    expect(report.ignored).toEqual([{ line: 4, label: 'TRADING / BUY' }]);
  });

  it('keeps identical rows without transaction id apart', () => {
    const row = withCell(2, 'transaction_id', '');
    const { batch } = tradeRepublicFileImporter.parse([header, row, row].join('\n'));
    expect(applyImportBatch(createEmptyProject(), batch, target).summary.addedTransactions).toBe(2);
  });
});

describe('Trade Republic error handling', () => {
  it('rejects numbers and dates in unexpected formats with the line', () => {
    expect(errorOf(() => tradeRepublicFileImporter.parse([header, withCell(2, 'amount', '-500,00')].join('\n')))).toEqual({ code: 'invalidNumber', line: 2 });
    expect(errorOf(() => tradeRepublicFileImporter.parse([header, withCell(2, 'date', '06.01.2025')].join('\n')))).toEqual({ code: 'invalidDate', line: 2 });
  });

  it('rejects an empty export and a file with several accounts', () => {
    expect(errorOf(() => readImportFiles([{ name: 'empty.csv', text: `${header}\n` }]))).toEqual({ code: 'noRows', line: undefined });
    const junior = withCell(1, 'account_type', 'JUNIOR');
    expect(errorOf(() => tradeRepublicFileImporter.parse([header, lines[0], junior].join('\n')))).toEqual({ code: 'severalAccounts', line: undefined });
    expect(tradeRepublicFileImporter.parse([header, junior].join('\n')).batch.entries).toHaveLength(1);
  });

  it('reports unknown booking types with an effect and ignores those without', () => {
    const merger = withCell(2, 'category', 'CASH').replace('"BUY"', '"MERGER"');
    const empty = withCell(0, 'type', 'INSTRUCTION').replace('"1010.000000"', '""').replace('"-10.00"', '""');
    const { batch, report } = tradeRepublicFileImporter.parse([header, merger, empty].join('\n'));
    expect(batch.entries).toEqual([]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'CASH / MERGER' }]);
    expect(report.ignored).toEqual([{ line: 3, label: 'CASH / INSTRUCTION' }]);
  });
});
