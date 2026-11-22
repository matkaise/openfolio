import { describe, expect, it } from 'vitest';
import { createFormatters, currencySymbol, parseTypedAmount } from '../format';

describe('createFormatters', () => {
  it('formats money in German style', () => {
    const f = createFormatters('de-DE', 'EUR');
    expect(f.money(1234.5)).toBe('1.234,50 €');
    expect(f.money(1234.5, { sign: true })).toBe('+1.234,50 €');
    expect(f.money(-5, { sign: true })).toBe('−5,00 €');
  });

  it('shows pence (GBp) as GBX instead of 100× too many pounds', () => {
    const f = createFormatters('de-DE', 'EUR');
    expect(f.moneyIn(500, 'GBp')).not.toContain('£');
    expect(f.moneyIn(500, 'GBp')).toContain('500,00');
    expect(f.moneyIn(5, 'gbp')).toContain('£');
  });

  it('does not throw for currency codes Intl cannot show', () => {
    const f = createFormatters('de-DE', 'EUR');
    const plain = (value: string) => value.replace(/\u00a0/g, ' ');
    expect(plain(f.moneyIn(5, '€'))).toBe('5,00 €');
    expect(plain(f.moneyIn(-5, 'USDT ', { sign: true }))).toBe('−5,00 USDT');
    expect(plain(f.moneyIn(5, 'EUR '))).toBe('5,00 €');
    expect(plain(createFormatters('de-DE', 'EURO').money(1))).toBe('1,00 EURO');
  });

  it('uses the Swiss apostrophe for de-CH', () => {
    const f = createFormatters('de-CH', 'CHF');
    // ICU versions differ between ' and ’ as group separator
    expect(f.money(248913.4)).toMatch(/248['’]913\.40/);
  });

  it('splits the integer and the fraction part for the hero number', () => {
    const f = createFormatters('de-DE', 'EUR');
    expect(f.moneyParts(248913.4)).toEqual({ main: '248.913', rest: ',40 €' });
  });

  it('formats percentages with sign', () => {
    const f = createFormatters('de-DE', 'EUR');
    expect(f.percent(12.345, { sign: true })).toBe('+12,35 %');
    expect(f.percent(-0.5, { sign: true })).toBe('−0,50 %');
  });
});

describe('date formatting', () => {
  it('follows the date locale of the interface language', () => {
    expect(createFormatters('de-DE', 'EUR', 'de-DE').date('2026-03-07T12:00:00')).toBe('07.03.2026');
    expect(createFormatters('en-US', 'EUR', 'en-GB').date('2026-03-07T12:00:00')).toBe('07/03/2026');
  });

  it('keeps the number format independent of the date locale', () => {
    const f = createFormatters('de-DE', 'EUR', 'en-GB');
    expect(f.money(1234.5)).toMatch(/^1\.234,50\s€$/);
    expect(f.date('2026-03-07T12:00:00', { day: 'numeric', month: 'short' })).toBe('7 Mar');
  });

  it('treats a date-only string as a calendar day in every time zone', () => {
    expect(createFormatters('de-DE', 'EUR', 'de-DE').date('2026-03-07')).toBe('07.03.2026');
  });
});

describe('parseTypedAmount', () => {
  it('reads thousands separators and a short decimal part', () => {
    expect(parseTypedAmount('100.000')).toBe(100000);
    expect(parseTypedAmount('100,000')).toBe(100000);
    expect(parseTypedAmount('100000.00')).toBe(100000);
    expect(parseTypedAmount('1.234,56')).toBe(1234.56);
    expect(parseTypedAmount("1'000'000 €")).toBe(1000000);
    expect(parseTypedAmount('abc')).toBeNaN();
  });
});

describe('currencySymbol', () => {
  it('gives the short symbol of the base currency', () => {
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('CHF')).toBe('CHF');
  });
});
