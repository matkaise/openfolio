import { describe, expect, it } from 'vitest';
import { getRangeStartDate, parseDateOnlyUTC, toDateKeyLocal, toDateKeyUTC, toUtcTime } from '../dateUtils';

describe('dateUtils', () => {
  it('parses date-only strings in UTC', () => {
    const date = parseDateOnlyUTC('2024-01-02');
    expect(date.getUTCFullYear()).toBe(2024);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(2);
  });

  it('formats UTC date keys', () => {
    const date = new Date(Date.UTC(2024, 5, 7));
    expect(toDateKeyUTC(date)).toBe('2024-06-07');
  });

  it('converts date-only strings to UTC timestamps', () => {
    expect(toUtcTime('2024-01-02')).toBe(Date.UTC(2024, 0, 2));
  });
});

describe('getRangeStartDate (B19)', () => {
  const start = (range: string, now: Date) => {
    const date = getRangeStartDate(range, now);
    if (!date) throw new Error(`no start for ${range}`);
    return toDateKeyLocal(date);
  };

  it('clamps month arithmetic to the end of the shorter month', () => {
    // setMonth(m - 1) on 31 March gave 3 March
    expect(start('1M', new Date(2026, 2, 31))).toBe('2026-02-28');
    expect(start('6M', new Date(2026, 7, 31))).toBe('2026-02-28');
  });

  it('handles 29 February for yearly ranges', () => {
    expect(start('1J', new Date(2028, 1, 29))).toBe('2027-02-28');
  });

  it('supports YTD and the multi-year ranges', () => {
    expect(start('YTD', new Date(2026, 9, 24))).toBe('2026-01-01');
    expect(start('3J', new Date(2026, 9, 24))).toBe('2023-10-24');
    expect(start('5J', new Date(2026, 9, 24))).toBe('2021-10-24');
  });

  it('returns null for MAX and unknown ranges', () => {
    expect(getRangeStartDate('MAX', new Date(2026, 9, 24))).toBeNull();
  });
});
