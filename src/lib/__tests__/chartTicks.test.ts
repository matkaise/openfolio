import { describe, expect, it } from 'vitest';
import { calendarTicks } from '@/lib/chartTicks';

const days = (from: string, count: number) => {
    const start = Date.parse(`${from}T00:00:00Z`);
    return Array.from({ length: count }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
};

describe('calendarTicks', () => {
    it('keeps automatic ticks for short spans', () => {
        expect(calendarTicks(days('2026-10-01', 30), 29)).toBeUndefined();
    });

    it('puts one tick on the first day of each month, skipping the partial first month', () => {
        const dates = days('2025-11-22', 366);
        const ticks = calendarTicks(dates, 365)!;
        expect(ticks[0]).toBe('2025-12-01');
        expect(ticks.at(-1)).toBe('2026-11-01');
        expect(new Set(ticks.map((d) => d.slice(0, 7))).size).toBe(ticks.length);
        expect(ticks).toHaveLength(12);
    });

    it('thins long monthly series and keeps the latest tick', () => {
        const dates = days('2024-11-22', 731);
        const ticks = calendarTicks(dates, 730, 6)!;
        expect(ticks.length).toBeLessThanOrEqual(6);
        expect(ticks.at(-1)).toBe('2026-11-01');
    });

    it('uses yearly ticks beyond three years', () => {
        const dates = days('2020-06-01', 6 * 365);
        const ticks = calendarTicks(dates, 6 * 365)!;
        expect(ticks.every((d) => d.endsWith('-01-01'))).toBe(true);
    });
});
