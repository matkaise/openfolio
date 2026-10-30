import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyDegiroAccountDescription, parseDegiroAccountCsv, parseDegiroTradesCsv, parseFlatexCashBalancesCsv } from '../csvParser';

describe('parseFlatexCashBalancesCsv', () => {
  it('keeps the end-of-day balance per currency even for reverse-chronological rows', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      // Reverse-chronological like broker exports
      '02-01-2024,18:00,02-01-2024,MAIN,,, ,CHF,-100,CHF,900,',
      '02-01-2024,12:00,02-01-2024,MAIN,,, ,CHF,100,CHF,1000,',
      '01-01-2024,09:00,01-01-2024,MAIN,,, ,CHF,0,CHF,1000,'
    ].join('\n');

    const points = parseFlatexCashBalancesCsv(csv).filter((p) => p.currency === 'CHF');
    const byDate = points.find((p) => p.date === '2024-01-02');

    expect(points.length).toBe(2);
    expect(byDate?.balance).toBe(900);
  });

  it('prefers value date for effective cash date', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      '03-01-2024,08:00,02-01-2024,MAIN,,, ,CHF,10,CHF,1010,',
      '01-01-2024,08:00,01-01-2024,MAIN,,, ,CHF,0,CHF,1000,'
    ].join('\n');

    const points = parseFlatexCashBalancesCsv(csv).filter((p) => p.currency === 'CHF');
    const dates = points.map((p) => p.date);

    expect(dates).toContain('2024-01-02');
    expect(dates).not.toContain('2024-01-03');
  });

  it('keeps the first row on equal time when input is reverse-chronological', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      '03-11-2025,00:05,02-11-2025,ACME,AU0000000003,W\u00e4hrungswechsel (Ausbuchung),1.6500,AUD,-1260.00,AUD,0.00,order-1',
      '03-11-2025,00:05,02-11-2025,ACME,AU0000000003,Verkauf 1\u2019200 zu je 1.05 AUD,,AUD,1260.00,AUD,1260.00,order-1'
    ].join('\n');

    const points = parseFlatexCashBalancesCsv(csv).filter((p) => p.currency === 'AUD');
    expect(points).toEqual([
      { currency: 'AUD', date: '2025-11-02', balance: 0 }
    ]);
  });

  it('merges sparse continuation lines before parsing balances', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      '23-06-2025,14:21,23-06-2025,ACME,US0000000001,W\u00e4hrungswechsel (Ausbuchung),1.0500,EUR,-1000.00,EUR,0.00,aaaaaaaa-bbbb-4ccc-',
      ',,,,,,,,,,,8ddd-eeeeeeeeeeee'
    ].join('\n');

    const points = parseFlatexCashBalancesCsv(csv).filter((p) => p.currency === 'EUR');
    expect(points).toEqual([
      { currency: 'EUR', date: '2025-06-23', balance: 0 }
    ]);
  });
});

describe('parseDegiroAccountCsv', () => {
  it('extracts deposit and withdrawal movements from account csv', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      '03-01-2024,10:00,03-01-2024,,,Einzahlung,,CHF,1000.00,CHF,1000.00,',
      '04-01-2024,10:00,04-01-2024,,,Auszahlung von Ihrem Geldkonto bei der flatexDEGIRO Bank: 250.00 CHF,,,CHF,750.00,'
    ].join('\n');

    const movements = parseDegiroAccountCsv(csv);
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({ kind: 'deposit', amount: 1000, currency: 'CHF' });
    expect(movements[1]).toMatchObject({ kind: 'withdrawal', amount: -250, currency: 'CHF' });
  });

  it('marks fx exchange as internal transfer and ignores buy/sell rows', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      '03-01-2024,09:00,03-01-2024,,,W\u00e4hrungswechsel (Ausbuchung),,CHF,-100.00,CHF,0.00,',
      '03-01-2024,09:00,03-01-2024,ABC,US0000000001,Kauf 1 zu je 100 USD (US0000000001),,USD,-100.00,USD,-100.00,'
    ].join('\n');

    const movements = parseDegiroAccountCsv(csv);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ kind: 'fx', internal: true, currency: 'CHF', amount: -100 });
  });

  const accountHeader = 'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID';

  it('keeps identical rows of one order as separate bookings', () => {
    const fill = '03-01-2024,09:00,03-01-2024,ABC,US0000000001,W\u00e4hrungswechsel (Einbuchung),,USD,100.00,USD,100.00,11111111-1111-4111-8111-111111111111';
    const movements = parseDegiroAccountCsv([accountHeader, fill, fill].join('\n'));
    expect(movements).toHaveLength(2);
    expect(new Set(movements.map((m) => m.externalId)).size).toBe(2);
  });

  it('books a cash sweep as an internal pair, not as a withdrawal', () => {
    const movements = parseDegiroAccountCsv([
      accountHeader,
      "04-01-2024,06:00,04-01-2024,,,Auszahlung von Ihrem Geldkonto bei der flatexDEGIRO Bank: 1\u2019250.00 CHF,,,,CHF,0.00,",
      '04-01-2024,06:00,04-01-2024,FLATEX CHF BANKACCOUNT,NLFLATEXACNT,Degiro Cash Sweep Transfer,,CHF,1250.00,CHF,1250.00,'
    ].join('\n'));
    expect(movements.map((m) => [m.kind, m.amount, m.internal])).toEqual(expect.arrayContaining([
      ['transfer', -1250, true],
      ['transfer', 1250, true]
    ]));
  });

  it('does not take a price in the text for an amount', () => {
    const movements = parseDegiroAccountCsv([
      accountHeader,
      '04-01-2024,06:00,04-01-2024,CHF MONEY MARKET,LU0000000003,Geldmarktfonds Umwandlung: Kauf 0.5 zu je 9876.54 CHF,,,,CHF,100.00,',
      '04-01-2024,06:00,04-01-2024,CHF MONEY MARKET,LU0000000003,Geldmarktfonds Umwandlung: Verkauf 0.5 zu je 9876.54 CHF,,CHF,4938.27,CHF,100.00,'
    ].join('\n'));
    expect(movements.map((m) => m.amount)).toEqual([4938.27]);
  });

  it('leaves the legs of corporate actions to Transactions.csv', () => {
    ['Aktiensplit: Verkauf 10 zu je 5 USD', 'Fusion: Kauf 2 zu je 25 EUR', 'ISIN-\u00c4nderung: Kauf 10 zu je 5 USD'].forEach((text) => {
      expect(classifyDegiroAccountDescription(text)).toBeNull();
    });
    expect(classifyDegiroAccountDescription('Geldmarktfonds Umwandlung: Kauf 1 zu je 5 EUR')).toMatchObject({ type: 'Transfer', isInternal: true });
  });
});

describe('parseDegiroTradesCsv', () => {
  const TRADES_HEADER = 'Datum,Uhrzeit,Produkt,ISIN,Referenzbörse,Ausführungsort,Anzahl,Kurs,,Wert in Lokalwährung,,Wert CHF,Wechselkurs,AutoFX-Gebühr,Transaktionsgebühren und/oder Fremdkosten,Gesamt CHF,Order-ID,';
  const fixture = readFileSync(path.join(__dirname, 'fixtures', 'degiro-transactions.csv'), 'utf-8');

  it('keeps fees and the AutoFX fee in the account currency (B15)', () => {
    const txs = parseDegiroTradesCsv(fixture);
    const firstBuy = txs.find((tx) => tx.date === '2024-03-15');

    expect(txs).toHaveLength(4);
    expect(firstBuy).toMatchObject({
      kind: 'buy',
      quantity: 10,
      orderId: '11111111-1111-4111-8111-111111111111',
      amount: -1000,
      currency: 'USD',
      fee: -1,
      fxFee: -2.2,
      feeCurrency: 'CHF'
    });
  });

  it('gives every trade a stable external id built from the order id (B3)', () => {
    const first = parseDegiroTradesCsv(fixture);
    const second = parseDegiroTradesCsv(fixture);

    expect(first.map((tx) => tx.externalId)).toEqual(second.map((tx) => tx.externalId));
    expect(first.find((tx) => tx.date === '2024-03-15')?.externalId)
      .toContain('11111111-1111-4111-8111-111111111111');
    expect(new Set(first.map((tx) => tx.externalId)).size).toBe(4);
  });

  it('separates partial fills that share an order id', () => {
    const csv = [
      TRADES_HEADER,
      '15-03-2024,15:31,ACME CORP,US0000000001,NDQ,XNAS,4,100.5000,USD,-402.00,USD,-353.75,1.1364,-0.88,-1.00,-354.75,,order-a',
      '15-03-2024,15:30,ACME CORP,US0000000001,NDQ,XNAS,6,100.0000,USD,-600.00,USD,-528.00,1.1364,-1.32,0.00,-528.00,,order-a',
      '15-03-2024,15:30,ACME CORP,US0000000001,NDQ,XNAS,6,100.0000,USD,-600.00,USD,-528.00,1.1364,-1.32,0.00,-528.00,,order-a'
    ].join('\n');

    const ids = parseDegiroTradesCsv(csv).map((tx) => tx.externalId);
    expect(new Set(ids).size).toBe(3);
  });

  it('reads German decimal commas once per file (B14)', () => {
    const csv = [
      TRADES_HEADER,
      '01-12-2025,13:43,ACME CORP,US0000000001,TDG,XGAT,"122,5","17,5559",EUR,"-2.150,60",EUR,"-2.024,67","1,0622","-5,06","-3,90","-2.028,57",,order-b'
    ].join('\n');

    const [tx] = parseDegiroTradesCsv(csv);
    expect(tx.quantity).toBeCloseTo(122.5, 6);
    expect(tx.amount).toBeCloseTo(-2150.6, 6);
    expect(tx.fee).toBeCloseTo(-3.9, 6);
    expect(tx.fxFee).toBeCloseTo(-5.06, 6);
  });

  it('reads dot decimals with comma thousands', () => {
    const csv = [
      TRADES_HEADER,
      '01-12-2025,13:43,ACME CORP,US0000000001,TDG,XGAT,"1,000",1.2346,USD,"-1,234.57",USD,"-1,086.36",1.1364,0.00,-1.00,"-1,087.36",,order-c'
    ].join('\n');

    const [tx] = parseDegiroTradesCsv(csv);
    expect(tx.quantity).toBe(1000);
    expect(tx.amount).toBeCloseTo(-1234.57, 6);
  });
});
