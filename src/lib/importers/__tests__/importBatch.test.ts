import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyImportBatch, parseDegiroFiles } from '../importBatch';
import { createEmptyProject } from '@/types/domain';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const accountCsv = readFileSync(path.join(fixtureDir, 'degiro-account.csv'), 'utf-8');
const tradesCsv = readFileSync(path.join(fixtureDir, 'degiro-transactions.csv'), 'utf-8');
const target = { id: 'p1', name: 'DEGIRO', isNew: true };

describe('parseDegiroFiles', () => {
  it('recognises both DEGIRO exports by their header', () => {
    const batch = parseDegiroFiles([accountCsv, tradesCsv]);
    expect(batch.transactions).toHaveLength(4);
    expect(batch.cashMovements.length).toBeGreaterThan(0);
    expect(batch.cashBalances.length).toBeGreaterThan(0);
  });
});

describe('applyImportBatch', () => {
  it('adds trades, account rows, balances, securities and the new portfolio', () => {
    const { project, summary } = applyImportBatch(createEmptyProject(), parseDegiroFiles([accountCsv, tradesCsv]), target);

    expect(project.portfolios).toEqual([{ id: 'p1', name: 'DEGIRO' }]);
    expect(project.transactions).toHaveLength(4);
    expect(Object.keys(project.securities).sort()).toEqual(['DE0000000002', 'US0000000001']);
    expect(project.cashAccounts?.map((a) => a.currency).sort()).toEqual(['CHF', 'EUR', 'USD']);
    expect(project.cashAccounts?.find((a) => a.currency === 'CHF')?.balanceHistory?.['2024-12-02']).toBe(2819.15);
    expect(summary).toMatchObject({ addedTransactions: 4, duplicateTransactions: 0, duplicateMovements: 0 });
    expect(summary.addedMovements).toBe(project.cashMovements?.length);
  });

  it('adds nothing when the same files are imported again', () => {
    const batch = parseDegiroFiles([accountCsv, tradesCsv]);
    const first = applyImportBatch(createEmptyProject(), batch, target);
    const second = applyImportBatch(first.project, parseDegiroFiles([accountCsv, tradesCsv]), { ...target, isNew: false });

    expect(second.summary).toMatchObject({ addedTransactions: 0, duplicateTransactions: 4, addedMovements: 0 });
    expect(second.summary.duplicateMovements).toBe(first.summary.addedMovements);
    expect(second.project.transactions).toHaveLength(4);
    expect(second.project.cashMovements).toHaveLength(first.project.cashMovements?.length ?? 0);
    expect(second.project.portfolios).toHaveLength(1);
  });

  it('is deterministic, so React may run it twice', () => {
    const base = createEmptyProject();
    const batch = parseDegiroFiles([accountCsv, tradesCsv]);
    const a = applyImportBatch(base, batch, target).project;
    const b = applyImportBatch(base, batch, target).project;
    expect({ ...b, modified: a.modified }).toEqual(a);
  });

  it('keeps existing security data', () => {
    const base = createEmptyProject();
    base.securities = { US0000000001: { isin: 'US0000000001', name: 'My ACME', symbol: 'ACME', currency: 'USD', symbolStatus: 'resolved' } };
    const { project } = applyImportBatch(base, parseDegiroFiles([tradesCsv]), target);
    expect(project.securities.US0000000001).toMatchObject({ name: 'My ACME', symbol: 'ACME', symbolStatus: 'resolved' });
  });
});
