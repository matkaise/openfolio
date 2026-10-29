import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileImportError } from '../fileImport';
import { detectFileImporter, FILE_IMPORTERS, readImportFiles } from '../fileImporters';
import { parseDegiroFiles } from '../importBatch';
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
    const fixtures = ['degiro-account.csv', 'degiro-transactions.csv', 'swissquote-en.csv', 'swissquote-de.csv', 'trading212.csv', 'traderepublic.csv', 'xtb-cash-operations.csv', 'xtb-legacy.csv', 'saxo.csv', 'schwab.csv', 'revolut.csv', 'etoro.csv'];
    fixtures.forEach((file) => {
      const text = readFileSync(path.join(fixtureDir, file), 'utf-8');
      const matches = FILE_IMPORTERS.filter((importer) => importer.detect(text) !== null);
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
