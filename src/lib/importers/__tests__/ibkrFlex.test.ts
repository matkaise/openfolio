import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readImportFiles } from '../fileImporters';
import { parseFlexStatementResponse, parseIbkrFlexXml } from '../ibkrFlex';
import { applyImportBatch, type ImportBatch } from '../importBatch';
import { isTradeEntry } from '../entries';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { createEmptyProject } from '@/types/domain';

const trades = (batch: ImportBatch) => batch.entries.filter(isTradeEntry);
const statement = (batch: ImportBatch) => batch.entries.filter((e) => !isTradeEntry(e));

const xml = readFileSync(path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'ibkr-flex.xml'), 'utf-8');

describe('parseIbkrFlexXml', () => {
  const result = parseIbkrFlexXml(xml);

  it('reads stock trades with sign, fees and stable ids', () => {
    const txs = trades(result.batch);
    expect(result.batch.source).toBe('IBKR');
    expect(txs).toHaveLength(3);
    expect(txs[0]).toMatchObject({
      date: '2024-03-15', kind: 'buy', isin: 'US0000000001', name: 'ACME CORP', quantity: 10, amount: -1000,
      currency: 'USD', fee: -1.25, feeCurrency: 'USD', externalId: 'ibkr:U0000001:trade:7001'
    });
    expect(txs[1]).toMatchObject({ kind: 'sell', quantity: -4, amount: 500 });
    expect(txs[2]).toMatchObject({ date: '2024-06-20', name: 'EUROWIDGET AG & CO', currency: 'EUR' });
  });

  it('classifies cash transactions with their sign and ignores summary rows', () => {
    const byKind = (...kinds: string[]) => statement(result.batch).filter((m) => kinds.includes(m.kind)).map((m) => m.amount);
    expect(byKind('deposit')).toEqual([5000]);
    expect(byKind('withdrawal')).toEqual([-1000]);
    expect(byKind('dividend')).toEqual([5]);
    expect(byKind('withholding_tax')).toEqual([-0.75]);
    expect(byKind('tax')).toEqual([-0.3]);
    expect(byKind('interest')).toEqual([-3.21]);
    expect(byKind('fee')).toEqual([-2, -1.5]);
    expect(statement(result.batch).find((m) => m.kind === 'dividend')).toMatchObject({ isin: 'US0000000001', date: '2024-05-10' });
  });

  it('books a currency conversion as two internal legs and its commission', () => {
    const legs = statement(result.batch).filter((m) => m.kind === 'fx');
    expect(legs.map((m) => [m.amount, m.currency, m.internal])).toEqual([[1000, 'EUR', true], [-1080, 'USD', true]]);
    expect(statement(result.batch).find((m) => m.kind === 'fee')).toMatchObject({ amount: -2, currency: 'USD', date: '2024-06-19' });
  });

  it('reports what it does not book, with its file line', () => {
    const lineOf = (text: string) => xml.split('\n').findIndex((line) => line.includes(text)) + 1;
    expect(result.unsupported).toEqual([
      { line: lineOf('assetCategory="OPT"'), label: 'OPT ACME 240621C00110000' },
      { line: lineOf('<CorporateAction '), label: 'CorporateAction FS ACME' },
      { line: lineOf('<Transfer '), label: 'Transfer ACATS WDG' }
    ]);
    expect(result.ignored).toEqual([]);
    expect(result.rows).toBe(14);
  });

  it('keeps cash balanced per currency', () => {
    expect(deriveCashBalances(result.batch.entries.map((entry, index) => ({ ...entry, id: String(index) })))).toEqual({
      USD: 2414.99, // without the option: not booked, reported above
      EUR: -3
    });
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

  const flex = (body: string, statementAttributes = 'accountId="U0000001" fromDate="20240101" toDate="20241231"') => (
    `<FlexQueryResponse type="AF"><FlexStatements count="1">\n<FlexStatement ${statementAttributes}>\n${body}\n</FlexStatement>\n</FlexStatements></FlexQueryResponse>`
  );
  const trade = (attributes: string) => `<Trade currency="USD" assetCategory="STK" symbol="ACME" isin="US0000000001" tradeDate="20240315" levelOfDetail="EXECUTION" ${attributes} />`;

  it('reverses a trade with a cancellation row instead of doubling it', () => {
    const { batch } = parseIbkrFlexXml(flex([
      trade('transactionID="1" quantity="-4" proceeds="500" ibCommission="-1" buySell="SELL"'),
      trade('transactionID="2" quantity="4" proceeds="-500" ibCommission="1" buySell="SELL (Ca.)"'),
      trade('transactionID="3" quantity="10" proceeds="-1000" ibCommission="-1" buySell="BUY"'),
      trade('transactionID="4" quantity="-10" proceeds="1000" ibCommission="1" buySell="BUY (Ca.)"')
    ].join('\n')));
    expect(batch.entries.map((e) => [e.kind, e.quantity, e.amount, e.fee])).toEqual([
      ['sell', -4, 500, -1], ['buy', 4, -500, 1], ['buy', 10, -1000, -1], ['sell', -10, 1000, 1]
    ]);
    expect(batch.entries.reduce((sum, e) => sum + (e.quantity || 0), 0)).toBe(0);
  });

  it('books the taxes of a trade on their own', () => {
    const { batch } = parseIbkrFlexXml(flex(trade('transactionID="1" quantity="10" proceeds="-1000" ibCommission="-1" taxes="-5" buySell="BUY"')));
    expect(batch.entries.map((e) => [e.kind, e.amount, e.externalId])).toEqual([
      ['buy', -1000, 'ibkr:U0000001:trade:1'],
      ['tax', -5, 'ibkr:U0000001:trade:1:tax']
    ]);
  });

  it('does not merge rows whose id fields are empty or N/A', () => {
    const { batch } = parseIbkrFlexXml(flex([
      trade('transactionID="N/A" tradeID="0" dateTime="20240315;100000" conid="1" quantity="1" tradePrice="5" proceeds="-5"'),
      trade('transactionID="N/A" tradeID="0" dateTime="20240315;100000" conid="1" quantity="1" tradePrice="5" proceeds="-5"'),
      '<CashTransaction currency="USD" dateTime="20240315" amount="-1" type="Other Fees" description="DATA" transactionID="" levelOfDetail="DETAIL" />',
      '<CashTransaction currency="USD" dateTime="20240315" amount="-1" type="Other Fees" description="DATA" levelOfDetail="DETAIL" />'
    ].join('\n')));
    const target = { id: 'ib', name: 'IBKR', isNew: true };
    const first = applyImportBatch(createEmptyProject(), batch, target);
    expect(first.summary).toMatchObject({ addedTransactions: 2, addedMovements: 2 });
    const second = applyImportBatch(first.project, batch, { ...target, isNew: false });
    expect(second.summary).toMatchObject({ addedTransactions: 0, addedMovements: 0 });
  });

  it('links dividends without an ISIN to the security of the trades', () => {
    const { batch } = parseIbkrFlexXml(flex('<CashTransaction currency="USD" symbol="ACME" isin="" dateTime="20240315" amount="5" type="Dividends" transactionID="1" levelOfDetail="DETAIL" />'));
    expect(batch.entries[0]).toMatchObject({ kind: 'dividend', isin: 'ACME' });
  });

  it('skips summary levels and reports rows it cannot date', () => {
    const result = parseIbkrFlexXml(flex([
      trade('transactionID="1" quantity="1" proceeds="-5" levelOfDetail="SYMBOL_SUMMARY"').replace('levelOfDetail="EXECUTION" ', ''),
      '<Trade assetCategory="STK" symbol="ACME" currency="USD" quantity="1" proceeds="-5" transactionID="2" tradeDate="03/15/2024" />',
      '<CashTransaction currency="BASE_SUMMARY" amount="5" type="Dividends" levelOfDetail="SUMMARY" />',
      '<CashTransaction currency="USD" dateTime="15-Mar-24" amount="5" type="Dividends" levelOfDetail="DETAIL" />'
    ].join('\n')));
    expect(result.batch.entries).toEqual([]);
    expect(result.unsupported.map((note) => note.label)).toEqual(['STK ACME', 'Dividends']);
  });

  it('reports order summaries of a query without executions', () => {
    const result = parseIbkrFlexXml(flex('<Order symbol="ACME" quantity="1" levelOfDetail="ORDER" />'));
    expect(result.unsupported).toEqual([{ line: 3, label: 'Order ACME' }]);
  });

  it('reads several statements: accounts, whole period, latest positions', () => {
    const statementOf = (from: string, to: string, position: string, account = 'U0000001') => (
      `<FlexStatement accountId="${account}" fromDate="${from}" toDate="${to}">\n<OpenPosition assetCategory="STK" symbol="ACME" isin="US0000000001" position="${position}" />\n</FlexStatement>`
    );
    const days = parseIbkrFlexXml(`<FlexQueryResponse>${statementOf('20240101', '20240101', '1')}${statementOf('20240102', '20240102', '2')}</FlexQueryResponse>`);
    expect(days.accounts).toEqual(['U0000001']);
    expect(days.period).toMatchObject({ from: '2024-01-01', to: '2024-01-02' });
    expect(days.positions.map((p) => p.quantity)).toEqual([2]);
    const two = parseIbkrFlexXml(`<FlexQueryResponse>${statementOf('20240101', '20240131', '1')}${statementOf('20240101', '20240131', '2', 'U0000002')}</FlexQueryResponse>`);
    expect(two.accounts).toEqual(['U0000001', 'U0000002']);
  });

  it('uses the account of the statement when rows do not name one', () => {
    const { batch } = parseIbkrFlexXml(flex(trade('transactionID="7" quantity="1" proceeds="-5"')));
    expect(batch.entries[0].externalId).toBe('ibkr:U0000001:trade:7');
  });

  it('rejects documents that are not Flex statements', () => {
    expect(() => parseIbkrFlexXml('<html>nope</html>')).toThrow(/Flex/);
  });
});

describe('Flex XML as a file import', () => {
  it('is recognised by content and reported like every other file', () => {
    const { importer, result } = readImportFiles([{ name: 'statement.xml', text: xml }]);
    expect(importer.id).toBe('ibkr');
    expect(result.report).toMatchObject({ variant: 'activity', period: { from: '2024-01-01', to: '2024-12-31' }, rows: 14 });
    expect(result.report.unsupported.map((note) => note.label)).toEqual(['OPT ACME 240621C00110000', 'CorporateAction FS ACME', 'Transfer ACATS WDG']);
    expect(result.batch.entries).toEqual(parseIbkrFlexXml(xml).batch.entries);
  });

  it('adds nothing on top of the Flex connection', () => {
    const target = { id: 'ib', name: 'IBKR', isNew: true };
    const synced = applyImportBatch(createEmptyProject(), parseIbkrFlexXml(xml).batch, target);
    const file = readImportFiles([{ name: 'statement.xml', text: xml }]).result;
    const again = applyImportBatch(synced.project, file.batch, { ...target, isNew: false });
    expect(again.summary).toMatchObject({ addedTransactions: 0, addedMovements: 0 });
  });

  it('refuses a file with several accounts and other Flex reports', () => {
    const statement = (account: string) => `<FlexStatement accountId="${account}" fromDate="20240101" toDate="20240131"></FlexStatement>`;
    expect(() => readImportFiles([{ name: 'x.xml', text: `<FlexQueryResponse type="AF">${statement('U1')}${statement('U2')}</FlexQueryResponse>` }]))
      .toThrow(expect.objectContaining({ code: 'severalAccounts' }));
    expect(() => readImportFiles([{ name: 'x.xml', text: `<FlexQueryResponse type="TCF">${statement('U1')}</FlexQueryResponse>` }]))
      .toThrow(expect.objectContaining({ code: 'unknownFormat' }));
    expect(() => readImportFiles([{ name: 'x.xml', text: '<FlexStatementResponse><Status>Fail</Status></FlexStatementResponse>' }]))
      .toThrow(expect.objectContaining({ code: 'unknownFormat' }));
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
