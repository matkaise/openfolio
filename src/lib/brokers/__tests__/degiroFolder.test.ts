import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDegiroExportName, scanDegiroFolder, type DirectoryLike } from '../degiroFolder';
import { isTradeEntry } from '@/lib/importers/entries';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const accountCsv = readFileSync(path.join(fixtureDir, 'degiro-account.csv'), 'utf-8');
const tradesCsv = readFileSync(path.join(fixtureDir, 'degiro-transactions.csv'), 'utf-8');

const folder = (files: { name: string; text: string; modified: number }[]): DirectoryLike => ({
  async *values() {
    for (const f of files) {
      yield { kind: 'file' as const, name: f.name, getFile: async () => new File([f.text], f.name, { lastModified: f.modified }) };
    }
    yield { kind: 'directory' as const, name: 'Unterordner' };
  }
});

describe('isDegiroExportName', () => {
  it('matches the export names including browser download suffixes', () => {
    expect(isDegiroExportName('Account.csv')).toBe(true);
    expect(isDegiroExportName('Transactions (1).csv')).toBe(true);
    expect(isDegiroExportName('account (12).CSV')).toBe(true);
    expect(isDegiroExportName('Kontoauszug.pdf')).toBe(false);
    expect(isDegiroExportName('bank-export.csv')).toBe(false);
  });
});

describe('scanDegiroFolder', () => {
  it('reads new DEGIRO exports into one batch', async () => {
    const result = await scanDegiroFolder(folder([
      { name: 'Account.csv', text: accountCsv, modified: 2000 },
      { name: 'Transactions (1).csv', text: tradesCsv, modified: 3000 },
      { name: 'other.csv', text: 'a,b\n1,2', modified: 4000 }
    ]));

    expect(result.files).toEqual(['Account.csv', 'Transactions (1).csv']);
    expect(result.batch.entries.filter(isTradeEntry)).toHaveLength(4);
    expect(result.batch.entries.filter((e) => !isTradeEntry(e)).length).toBeGreaterThan(0);
    expect(result.newestModified).toBe(3000);
  });

  it('skips files that were already imported', async () => {
    const result = await scanDegiroFolder(folder([
      { name: 'Account.csv', text: accountCsv, modified: 2000 },
      { name: 'Transactions.csv', text: tradesCsv, modified: 3000 }
    ]), { modifiedAfter: 2000 });

    expect(result.files).toEqual(['Transactions.csv']);
    expect(result.batch.entries.filter((e) => !isTradeEntry(e))).toHaveLength(0);
  });

  it('ignores CSVs with the right name but foreign content', async () => {
    const result = await scanDegiroFolder(folder([{ name: 'Account.csv', text: 'Date,Amount\n2024-01-01,5', modified: 1 }]));
    expect(result.files).toEqual([]);
    expect(result.newestModified).toBe(0);
  });
});
