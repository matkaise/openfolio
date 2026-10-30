import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileImportError, isPdfImporter, type FileImporter } from '../fileImport';
import { detectFileImporter, FILE_IMPORTERS, readImportFiles } from '../fileImporters';
import { classifyDegiroAccountDescription } from '@/lib/csvParser';
import { degiroFileImporter } from '../degiroFile';
import { parseDegiroFiles, type ImportBatch } from '../importBatch';
import { fileImportDe } from '@/lib/i18n/messages/fileImport.de';
import { fileImportEn } from '@/lib/i18n/messages/fileImport.en';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const accountCsv = readFileSync(path.join(fixtureDir, 'degiro-account.csv'), 'utf-8');
const tradesCsv = readFileSync(path.join(fixtureDir, 'degiro-transactions.csv'), 'utf-8');

const errorCode = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof FileImportError ? error.code : String(error);
  }
  return null;
};

describe('file importer registry', () => {
  it('has unique ids and a dated source for every importer', () => {
    expect(new Set(FILE_IMPORTERS.map((importer) => importer.id)).size).toBe(FILE_IMPORTERS.length);
    FILE_IMPORTERS.forEach((importer) => {
      expect(importer.sources.length).toBeGreaterThan(0);
      expect(importer.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('has an export guide and variant names in German and English for every importer', () => {
    FILE_IMPORTERS.forEach((importer) => {
      expect(fileImportDe.guides[importer.id]?.steps.length, importer.id).toBeGreaterThan(0);
      expect(fileImportEn.guides[importer.id]?.steps.length, importer.id).toBeGreaterThan(0);
      expect(Object.keys(fileImportEn.variants[importer.id] || {}), importer.id).toEqual(Object.keys(fileImportDe.variants[importer.id] || {}));
    });
  });

  it('gives every CSV fixture to exactly one importer, with a named variant', () => {
    const fixtures = ['ibkr-flex.xml', 'degiro-account.csv', 'degiro-transactions.csv', 'degiro-account-en.csv', 'degiro-transactions-en.csv', 'swissquote-en.csv', 'swissquote-de.csv', 'trading212.csv', 'traderepublic.csv', 'xtb-cash-operations.csv', 'xtb-legacy.csv', 'saxo.csv', 'schwab.csv', 'revolut.csv', 'etoro.csv', 'freetrade.csv', 'investengine.csv', 'avanza.csv', 'directa.csv', 'disnat.csv', 'finpension-3a.csv', 'finpension-bvg.csv'];
    fixtures.forEach((file) => {
      const text = readFileSync(path.join(fixtureDir, file), 'utf-8');
      const textImporters = FILE_IMPORTERS.filter((importer): importer is FileImporter => !isPdfImporter(importer));
      const matches = textImporters.filter((importer) => importer.detect(text) !== null);
      expect(matches.map((importer) => importer.id), file).toHaveLength(1);
      expect(fileImportDe.variants[matches[0].id]?.[matches[0].detect(text) as string], file).toBeTruthy();
    });
  });

  it('recognises files by content, not by name', () => {
    expect(detectFileImporter(tradesCsv)?.id).toBe('degiro');
    expect(detectFileImporter(accountCsv)?.id).toBe('degiro');
    expect(detectFileImporter('Date,Amount\n2024-01-01,5\n')).toBeUndefined();
  });
});

describe('readImportFiles', () => {
  it('reads DEGIRO exports like the existing parser and reports variant and period', () => {
    const { importer, result } = readImportFiles([
      { name: 'Transactions.csv', text: tradesCsv },
      { name: 'Account.csv', text: accountCsv }
    ]);
    expect(importer.id).toBe('degiro');
    expect(result.batch.entries).toEqual(parseDegiroFiles([tradesCsv, accountCsv]).entries);
    expect(result.report.variant).toBe('transactions+account');
    expect(result.report.period).toEqual({ from: expect.any(String), to: expect.any(String) });
    expect(result.report.period!.from <= result.report.period!.to).toBe(true);
    expect(result.report.unsupported).toEqual([]);
  });

  it('refuses unknown files and files of different brokers', () => {
    expect(errorCode(() => readImportFiles([{ name: 'x.csv', text: 'a,b\n1,2\n' }]))).toBe('unknownFormat');
    expect(errorCode(() => readImportFiles([
      { name: 'Transactions.csv', text: tradesCsv },
      { name: 'other.csv', text: 'a,b\n1,2\n' }
    ]))).toBe('unknownFormat');
    expect(errorCode(() => readImportFiles([]))).toBe('noRows');
  });
});

describe('DEGIRO in English', () => {
  const fixture = (name: string) => readFileSync(path.join(fixtureDir, name), 'utf-8');
  const summary = (batch: ImportBatch) => batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.currency, entry.isin, entry.internal]).sort();
  const de = readImportFiles([{ name: 'a.csv', text: tradesCsv }, { name: 'b.csv', text: accountCsv }]).result;
  const en = readImportFiles([{ name: 'a.csv', text: fixture('degiro-transactions-en.csv') }, { name: 'b.csv', text: fixture('degiro-account-en.csv') }]).result;

  it('books the same as the German export', () => {
    expect(en.report.variant).toBe('transactions-en+account-en');
    expect(summary(en.batch)).toEqual(summary(de.batch));
    expect(en.batch.cashBalances).toEqual(de.batch.cashBalances);
    expect(en.report.unsupported).toEqual([]);
  });

  it('classifies the row texts of English statements', () => {
    const type = (text: string) => classifyDegiroAccountDescription(text)?.type ?? null;
    expect(type('Buy 10 ACME INC@5.5 USD (US0000000001)')).toBeNull();
    expect(type('STOCK SPLIT: Sell 10 ACME INC@5.5 USD (US0000000001)')).toBeNull();
    expect(type('MERGER: Buy 2 ACME INC@25 EUR (US0000000001)')).toBeNull();
    expect(type('Dividend')).toBe('Dividend');
    expect(type('Fund Distribution')).toBe('Dividend');
    expect(type('Dividend Tax')).toBe('Tax');
    expect(type('Stamp Duty')).toBe('Tax');
    expect(type('Spanish Transaction Tax')).toBe('Tax');
    expect(type('DEGIRO Exchange Connection Fee 2024 (Xetra - XET)')).toBe('Fee');
    expect(type('ADR/GDR Pass-Through Fee')).toBe('Fee');
    expect(type('Flatex Interest Income')).toBe('Interest');
    expect(type('iDEAL Deposit')).toBe('Deposit');
    expect(type('Withdrawal')).toBe('Withdrawal');
    expect(type('Reservation iDEAL / Sofort Deposit')).toBe('Transfer');
    expect(type('Money Market fund conversion: Buy 0.1 at 100 EUR')).toBe('Transfer');
    expect(type('Transfer to your Cash Account at flatexDEGIRO Bank: 10.00 EUR')).toBe('Transfer');
    expect(type('Something new')).toBe('Adjustment');
  });

  it('refuses the older layout instead of reading shifted columns', () => {
    const older = 'Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,,Local value,,Value,,Exchange rate,Transaction costs,,Total,,Order ID\n';
    expect(degiroFileImporter.detect(older)).toBeNull();
    expect(degiroFileImporter.detect('Datum,Uhrzeit,Produkt,ISIN,Referenzbörse,Ausführungsort,Anzahl,Kurs,,Wert in Lokalwährung,,Wert,,Wechselkurs,Transaktionsgebühren,,Gesamt,,Order-ID\n')).toBeNull();
  });
});

describe('DEGIRO import report', () => {
  const accountHeader = accountCsv.split('\n', 1)[0];
  const tradesHeader = tradesCsv.split('\n', 1)[0];
  const orderId = '11111111-1111-4111-8111-111111111111';
  const accountBuy = `15-03-2024,15:30,15-03-2024,ACME CORP,US0000000001,Kauf 10 zu je 100 USD (US0000000001),,USD,-1000.00,USD,-1000.00,${orderId}`;
  const tradeBuy = `15-03-2024,15:30,ACME CORP,US0000000001,NDQ,XNAS,10,100.0000,USD,-1000.00,USD,-880.00,1.1364,-2.20,-1.00,-881.00,,${orderId}`;
  const read = (...files: [string, string[]][]) => readImportFiles(files.map(([name, lines]) => ({ name, text: lines.join('\n') }))).result;

  it('does not list trades that Transactions.csv books', () => {
    const { report } = read(['Account.csv', [accountHeader, accountBuy]], ['Transactions.csv', [tradesHeader, tradeBuy]]);
    expect(report.ignored).toEqual([]);
    expect(report.unsupported).toEqual([]);
  });

  it('reports trades that only Account.csv lists', () => {
    const { report } = read(['Account.csv', [accountHeader, accountBuy]]);
    expect(report.unsupported).toEqual([{ line: 2, label: 'Kauf 10 zu je 100 USD (US0000000001)' }]);
  });

  it('reports corporate action legs without their trade, and accepts them with it', () => {
    const leg = '20-05-2024,09:00,20-05-2024,ACME CORP,US0000000001,Aktiensplit: Kauf 20 zu je 50 USD,,USD,-1000.00,USD,0.00,';
    const tradeLeg = '20-05-2024,09:00,ACME CORP,US0000000001,NDQ,XNAS,20,50.0000,USD,-1000.00,USD,-880.00,1.1364,,,-880.00,,';
    expect(read(['Account.csv', [accountHeader, leg]]).report.unsupported).toHaveLength(1);
    expect(read(['Account.csv', [accountHeader, leg]], ['Transactions.csv', [tradesHeader, tradeLeg]]).report.unsupported).toEqual([]);
  });

  it('lists rows without an effect as ignored and counts wrapped rows once, with their file line', () => {
    const { report } = read(['Account.csv', [
      accountHeader,
      '04-01-2024,06:00,04-01-2024,MONEY MARKET,LU0000000003,Geldmarktfonds Umwandlung: Kauf 0.5 zu je 98.76 CHF,,,,CHF,100.00,',
      '03-01-2024,09:00,03-01-2024,ACME CORP,US0000000001,Einzahlung,,CHF,100.00,CHF,100.00,1111',
      ',,,,,,,,,,,2222',
      '02-01-2024,09:00,02-01-2024,,,Unbekannt ohne Datum,,CHF,0.00,CHF,0.00,'
    ]]);
    expect(report.rows).toBe(3);
    expect(report.ignored).toEqual([
      { line: 2, label: 'Geldmarktfonds Umwandlung: Kauf 0.5 zu je 98.76 CHF' },
      { line: 5, label: 'Unbekannt ohne Datum' }
    ]);
  });

  it('reports amounts it cannot place and trades with an unreadable date', () => {
    const account = read(['Account.csv', [accountHeader, 'kein Datum,,,,,Korrektur,,CHF,5.00,CHF,5.00,']]);
    expect(account.report.unsupported).toEqual([{ line: 2, label: 'Korrektur' }]);
    const trades = read(['Transactions.csv', [tradesHeader, tradeBuy.replace('15-03-2024', '2024/03/15')]]);
    expect(trades.batch.entries).toEqual([]);
    expect(trades.report.unsupported).toEqual([{ line: 2, label: 'ACME CORP' }]);
  });
});
