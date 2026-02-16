import { describe, expect, it } from 'vitest';
import { parseFlatexCashBalancesCsv } from '../csvParser';

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
      '03-11-2025,00:05,02-11-2025,EOS,AU000000EOS8,W\u00e4hrungswechsel (Ausbuchung),1.9037,AUD,-8561.70,AUD,0.00,order-1',
      '03-11-2025,00:05,02-11-2025,EOS,AU000000EOS8,Verkauf 1\u2019359 zu je 6.3 AUD,,AUD,8561.70,AUD,8561.70,order-1'
    ].join('\n');

    const points = parseFlatexCashBalancesCsv(csv).filter((p) => p.currency === 'AUD');
    expect(points).toEqual([
      { currency: 'AUD', date: '2025-11-02', balance: 0 }
    ]);
  });

  it('merges sparse continuation lines before parsing balances', () => {
    const csv = [
      'Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung,FX,\u00c4nderung,,Saldo,,Order-ID',
      '23-06-2025,14:21,23-06-2025,HIMS,US4330001060,W\u00e4hrungswechsel (Ausbuchung),1.0677,EUR,-20544.84,EUR,0.00,80f5eafa-1980-4668-',
      ',,,,,,,,,,,a0f6-116081112db4'
    ].join('\n');

    const points = parseFlatexCashBalancesCsv(csv).filter((p) => p.currency === 'EUR');
    expect(points).toEqual([
      { currency: 'EUR', date: '2025-06-23', balance: 0 }
    ]);
  });
});
