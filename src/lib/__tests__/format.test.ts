import { describe, expect, it } from 'vitest';
import { createFormatters } from '../format';

describe('createFormatters', () => {
  it('formats money in German style', () => {
    const f = createFormatters('de-DE', 'EUR');
    expect(f.money(1234.5)).toBe('1.234,50 €');
    expect(f.money(1234.5, { sign: true })).toBe('+1.234,50 €');
    expect(f.money(-5, { sign: true })).toBe('−5,00 €');
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
});
