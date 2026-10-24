import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addBrokerConnection, connectionTarget, getBrokerConnections, importFromConnection, removeBrokerConnection } from '../connections';
import { parseDegiroFiles } from '@/lib/importers/importBatch';
import { createEmptyProject, type BrokerConnection } from '@/types/domain';

const tradesCsv = readFileSync(path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'degiro-transactions.csv'), 'utf-8');
const connection: BrokerConnection = {
  id: 'c1', kind: 'degiro-folder', label: 'Downloads', portfolioId: 'p1', createdAt: '2026-10-24T10:00:00Z'
};

describe('broker connections', () => {
  it('adds and removes connections in the project settings', () => {
    const project = addBrokerConnection(createEmptyProject(), connection);
    expect(getBrokerConnections(project)).toEqual([connection]);
    expect(getBrokerConnections(removeBrokerConnection(project, 'c1'))).toEqual([]);
  });

  it('creates the target portfolio if it does not exist', () => {
    expect(connectionTarget(createEmptyProject(), connection)).toEqual({ id: 'p1', name: 'Downloads', isNew: true });
  });

  it('imports a scan and records the result; a second identical scan adds nothing', () => {
    const scan = { files: ['Transactions.csv'], newestModified: 5000 };
    const base = addBrokerConnection(createEmptyProject(), connection);

    const first = importFromConnection(base, connection, parseDegiroFiles([tradesCsv]), scan, '2026-10-24T11:00:00Z');
    const updated = getBrokerConnections(first.project)[0];
    expect(first.summary.addedTransactions).toBe(4);
    expect(updated).toMatchObject({ lastFileModified: 5000, lastResult: { added: 4, duplicates: 0, files: ['Transactions.csv'] } });

    const second = importFromConnection(first.project, updated, parseDegiroFiles([tradesCsv]), scan, '2026-10-24T12:00:00Z');
    expect(second.summary.addedTransactions).toBe(0);
    expect(second.project.transactions).toHaveLength(4);
  });
});
