import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGenericCashBalances, buildGenericTransactions, guessCsvMapping, parseGenericCsv } from '../genericCsv';
import { applyImportBatch, emptyImportBatch } from '../importBatch';
import { createEmptyProject } from '@/types/domain';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const accountCsv = readFileSync(path.join(fixtureDir, 'degiro-account.csv'), 'utf-8');

const SECURITIES_CSV = [
  'Datum;ISIN;Bezeichnung;Anzahl;Kurs;Währung',
  '15.03.2024;DE0000000002;EUROWIDGET AG;10;50,25;EUR',
  '20.06.2024;US0000000001;ACME CORP;-4;1.234,50;USD',
  '21.06.2024;;OHNE ISIN;3;10;EUR'
].join('\n');

describe('parseGenericCsv', () => {
  it('detects the delimiter, names empty headers and merges wrapped continuation lines', () => {
    const { headers, rows } = parseGenericCsv(accountCsv);
    expect(headers[8]).toBe('Spalte 9');
    expect(headers[9]).toBe('Saldo');
    const wrapped = rows.find((row) => row[5].startsWith('Kauf 20'));
    expect(wrapped?.[11]).toBe('22222222-2222-4222-8222-222222222222');
    expect(rows).toHaveLength(31);
  });

  it('reads semicolon files and quoted cells', () => {
    const { headers, rows } = parseGenericCsv('a;b\n"x;y";"say ""hi"""');
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toEqual([['x;y', 'say "hi"']]);
  });
});

describe('guessCsvMapping', () => {
  it('maps German security columns and the day-first date format', () => {
    const { headers, rows } = parseGenericCsv(SECURITIES_CSV);
    const { mapping, dateFormat } = guessCsvMapping(headers, rows, 'security');
    expect(mapping).toEqual({ date: 'Datum', identifier: 'ISIN', shares: 'Anzahl', price: 'Kurs', currency: 'Währung' });
    expect(dateFormat).toBe('dmy');
  });
});

describe('buildGenericTransactions', () => {
  it('builds signed buys and sells and reports rows with missing fields', () => {
    const { headers, rows } = parseGenericCsv(SECURITIES_CSV);
    const { mapping, dateFormat } = guessCsvMapping(headers, rows, 'security');
    const { entries, errors } = buildGenericTransactions({ headers, rows, mapping, dateFormat, defaultCurrency: 'EUR' });

    expect(entries.map(({ source, date, kind, isin, name, quantity, amount, currency }) => ({ source, date, kind, isin, name, quantity, amount, currency }))).toEqual([
      { source: 'CSV', date: '2024-03-15', kind: 'buy', isin: 'DE0000000002', name: 'EUROWIDGET AG', quantity: 10, amount: -502.5, currency: 'EUR' },
      { source: 'CSV', date: '2024-06-20', kind: 'sell', isin: 'US0000000001', name: 'ACME CORP', quantity: -4, amount: 4938, currency: 'USD' }
    ]);
    expect(errors).toEqual(['Zeile 4: Pflichtfelder fehlen.']);
  });
});

describe('buildGenericCashBalances', () => {
  it('reads the DEGIRO balances from the unnamed column next to "Saldo"', () => {
    const { headers, rows } = parseGenericCsv(accountCsv);
    const { mapping, dateFormat } = guessCsvMapping(headers, rows, 'cash');
    const { cashPoints, entries } = buildGenericCashBalances({ headers, rows, mapping, dateFormat, defaultCurrency: 'CHF' });

    const last = (currency: string) => cashPoints.filter((p) => p.currency === currency).at(-1)?.balance;
    expect(last('CHF')).toBe(2812.92);
    expect(last('EUR')).toBe(8.82);
    expect(last('USD')).toBe(-0.1);

    // Trades are not cash movements; FX legs are internal transfers
    expect(entries.some((m) => m.description?.startsWith('Kauf'))).toBe(false);
    expect(entries.filter((m) => m.description?.startsWith('Währungswechsel')).every((m) => m.internal && m.kind === 'fx')).toBe(true);
  });

  it('rebuilds balances from amounts when there is no balance column', () => {
    const csv = 'Datum,Betrag,Währung,Beschreibung\n2024-01-05,1000,EUR,Einzahlung\n2024-02-01,-2.5,EUR,Gebühr\n2024-02-01,-100,EUR,Auszahlung';
    const { headers, rows } = parseGenericCsv(csv);
    const { mapping, dateFormat } = guessCsvMapping(headers, rows, 'cash');
    const { cashPoints, entries, errors } = buildGenericCashBalances({ headers, rows, mapping, dateFormat, defaultCurrency: 'EUR' });

    expect(errors).toEqual([]);
    expect(cashPoints).toEqual([
      { date: '2024-01-05', currency: 'EUR', balance: 1000 },
      { date: '2024-02-01', currency: 'EUR', balance: 897.5 }
    ]);
    expect(entries.map((m) => [m.kind, m.amount])).toEqual([['deposit', 1000], ['withdrawal', -100], ['fee', -2.5]]);
  });
});

describe('generic CSV import', () => {
  it('does not duplicate trades when the same file is imported again, but keeps identical rows inside one file', () => {
    const csv = SECURITIES_CSV + '\n15.03.2024;DE0000000002;EUROWIDGET AG;10;50,25;EUR';
    const { headers, rows } = parseGenericCsv(csv);
    const { mapping, dateFormat } = guessCsvMapping(headers, rows, 'security');
    const batch = () => ({ ...emptyImportBatch('CSV'), entries: buildGenericTransactions({ headers, rows, mapping, dateFormat, defaultCurrency: 'EUR' }).entries });
    const target = { id: 'p1', name: 'CSV', isNew: true };

    const first = applyImportBatch(createEmptyProject(), batch(), target);
    const second = applyImportBatch(first.project, batch(), { ...target, isNew: false });

    expect(first.summary.addedTransactions).toBe(3); // two identical buys stay two buys
    expect(second.summary).toMatchObject({ addedTransactions: 0, duplicateTransactions: 3 });
  });
});
