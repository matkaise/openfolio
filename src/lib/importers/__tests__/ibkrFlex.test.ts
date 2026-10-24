import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFlexStatementResponse, parseIbkrFlexXml } from '../ibkrFlex';
import { applyImportBatch } from '../importBatch';
import { createEmptyProject } from '@/types/domain';

const xml = readFileSync(path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'ibkr-flex.xml'), 'utf-8');

describe('parseIbkrFlexXml', () => {
  const result = parseIbkrFlexXml(xml);

  it('reads stock trades with sign, fees and stable ids; skips FX and options', () => {
    expect(result.batch.broker).toBe('IBKR');
    expect(result.batch.transactions).toHaveLength(3);
    expect(result.batch.transactions[0]).toMatchObject({
      date: '2024-03-15', type: 'Buy', isin: 'US0000000001', name: 'ACME CORP', shares: 10, amount: -1000,
      currency: 'USD', fee: -1.25, feeCurrency: 'USD', externalId: 'ibkr:U0000001:trade:7001'
    });
    expect(result.batch.transactions[1]).toMatchObject({ type: 'Sell', shares: 4, amount: 500 });
    expect(result.batch.transactions[2]).toMatchObject({ date: '2024-06-20', name: 'EUROWIDGET AG & CO', currency: 'EUR' });
    expect(result.skipped).toEqual({ fx: 1, unsupported: 1 });
  });

  it('classifies cash transactions with their sign and ignores summary rows', () => {
    const byType = (type: string) => result.batch.cashMovements.filter((m) => m.type === type).map((m) => m.amount);
    expect(byType('Deposit')).toEqual([5000]);
    expect(byType('Withdrawal')).toEqual([-1000]);
    expect(byType('Dividend')).toEqual([5]);
    expect(byType('Tax')).toEqual([-0.75]);
    expect(byType('Interest')).toEqual([-3.21]);
    expect(byType('Fee')).toEqual([-1.5]);
    expect(result.batch.cashMovements.find((m) => m.type === 'Dividend')).toMatchObject({ isin: 'US0000000001', date: '2024-05-10' });
  });

  it('returns the open positions for reconciliation', () => {
    expect(result.positions).toEqual([
      { isin: 'US0000000001', symbol: 'ACME', quantity: 6 },
      { isin: 'DE0000000002', symbol: 'WDG', quantity: 20 }
    ]);
    expect(result.period).toEqual({ from: '2024-01-01', to: '2024-12-31', accountId: 'U0000001' });
  });

  it('can be imported twice without duplicates', () => {
    const target = { id: 'ib', name: 'IBKR', isNew: true };
    const first = applyImportBatch(createEmptyProject(), result.batch, target);
    const second = applyImportBatch(first.project, parseIbkrFlexXml(xml).batch, { ...target, isNew: false });
    expect(first.summary.addedTransactions).toBe(3);
    expect(second.summary.addedTransactions + second.summary.addedMovements).toBe(0);
  });

  it('rejects documents that are not Flex statements', () => {
    expect(() => parseIbkrFlexXml('<html>nope</html>')).toThrow(/Flex/);
  });
});

describe('parseFlexStatementResponse', () => {
  it('reads a successful SendRequest answer', () => {
    expect(parseFlexStatementResponse(
      '<FlexStatementResponse timestamp="x"><Status>Success</Status><ReferenceCode>1234567890</ReferenceCode><url>https://example/GetStatement</url></FlexStatementResponse>'
    )).toEqual({ status: 'success', referenceCode: '1234567890' });
  });

  it('marks "in progress" and rate limit errors as retryable', () => {
    const answer = (code: string) => parseFlexStatementResponse(
      `<FlexStatementResponse><Status>Fail</Status><ErrorCode>${code}</ErrorCode><ErrorMessage>msg ${code}</ErrorMessage></FlexStatementResponse>`
    );
    expect(answer('1019')).toEqual({ status: 'fail', code: 1019, message: 'msg 1019', retryable: true });
    expect(answer('1018')).toMatchObject({ retryable: true });
    expect(answer('1015')).toMatchObject({ retryable: false, message: 'msg 1015' });
  });

  it('returns null for a real statement', () => {
    expect(parseFlexStatementResponse(xml)).toBeNull();
  });
});
