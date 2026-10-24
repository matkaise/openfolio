import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseComdirectData, type ComdirectData } from '../comdirect';
import { applyImportBatch } from '../importBatch';
import { reconcilePositions } from '@/lib/brokers/reconcile';
import { createEmptyProject } from '@/types/domain';

const data = JSON.parse(readFileSync(path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'comdirect.json'), 'utf-8')) as ComdirectData;

describe('parseComdirectData', () => {
  const result = parseComdirectData(data);

  it('turns booked depot transactions into signed trades', () => {
    const txs = result.batch.transactions;
    expect(result.batch.broker).toBe('comdirect');
    expect(txs).toHaveLength(3);
    expect(txs.find((t) => t.isin === 'DE0000000002')).toMatchObject({
      date: '2024-06-20', type: 'Buy', shares: 20, amount: -1000, currency: 'EUR', externalId: 'comdirect:D-UUID-1:T2'
    });
    expect(txs.find((t) => t.type === 'Sell')).toMatchObject({ date: '2024-09-10', shares: 4, amount: 460 });
  });

  it('skips pending bookings and reports depot transfers it cannot value', () => {
    expect(result.skipped).toEqual({ notBooked: 2, transfers: 1 });
    expect(result.warnings[0]).toContain('OTHER INC');
  });

  it('maps settlement account bookings and leaves trade settlements to the depot', () => {
    const byType = (type: string) => result.batch.cashMovements.filter((m) => m.type === type).map((m) => m.amount);
    expect(byType('Deposit')).toEqual([5000]);
    expect(byType('Withdrawal')).toEqual([-1000]);
    expect(byType('Dividend')).toEqual([3.42]);
    expect(byType('Interest')).toEqual([0.85]);
    expect(byType('Fee')).toEqual([-4.9]);
    expect(result.batch.cashMovements.find((m) => m.type === 'Dividend')).toMatchObject({ isin: 'US0000000001' });
    expect(result.batch.cashMovements.some((m) => m.description.includes('WP-KAUF'))).toBe(false);
  });

  it('imports idempotently and matches the depot positions', () => {
    const target = { id: 'cd', name: 'comdirect', isNew: true };
    const first = applyImportBatch(createEmptyProject(), result.batch, target);
    const second = applyImportBatch(first.project, parseComdirectData(data).batch, { ...target, isNew: false });
    expect(second.summary.addedTransactions + second.summary.addedMovements).toBe(0);
    expect(reconcilePositions(first.project, 'cd', result.positions)).toEqual([]);
  });
});

describe('remittance text', () => {
  it('drops line numbers but keeps other numbers', () => {
    const data2 = JSON.parse(JSON.stringify(data)) as ComdirectData;
    data2.accountTransactions = [{
      reference: 'X', bookingStatus: 'BOOKED', bookingDate: '2024-02-01', amount: { value: '-10', unit: 'EUR' },
      transactionType: { key: 'TRANSFER', text: 'Überweisung' }, remittanceInfo: '01Miete Konto 12345678 02Februar'
    }];
    expect(parseComdirectData(data2).batch.cashMovements[0].description).toBe('Miete Konto 12345678 Februar');
  });
});
