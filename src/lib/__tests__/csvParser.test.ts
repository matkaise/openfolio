import { describe, expect, it } from 'vitest';
import { parseFlatexCashBalancesCsv, parseFlatexCashMovementsCsv } from '../csvParser';

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

describe('parseFlatexCashMovementsCsv', () => {
  it('extracts deposit and withdrawal movements from account csv', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      '03-01-2024,10:00,03-01-2024,,,Einzahlung,,CHF,1000.00,CHF,1000.00,',
      '04-01-2024,10:00,04-01-2024,,,Auszahlung von Ihrem Geldkonto bei der flatexDEGIRO Bank: 250.00 CHF,,,CHF,750.00,'
    ].join('\n');

    const movements = parseFlatexCashMovementsCsv(csv);
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({ type: 'Deposit', amount: 1000, currency: 'CHF' });
    expect(movements[1]).toMatchObject({ type: 'Withdrawal', amount: -250, currency: 'CHF' });
  });

  it('marks fx exchange as internal transfer and ignores buy/sell rows', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      '03-01-2024,09:00,03-01-2024,,,W\u00e4hrungswechsel (Ausbuchung),,CHF,-100.00,CHF,0.00,',
      '03-01-2024,09:00,03-01-2024,ABC,US0000000001,Kauf 1 zu je 100 USD (US0000000001),,USD,-100.00,USD,-100.00,'
    ].join('\n');

    const movements = parseFlatexCashMovementsCsv(csv);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: 'Transfer', isInternal: true, currency: 'CHF', amount: -100 });
  });
});
