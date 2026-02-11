import { describe, expect, it } from 'vitest';
import { parseDateOnlyUTC, toDateKeyUTC, toUtcTime } from '../dateUtils';

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
