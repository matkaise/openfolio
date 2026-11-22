/**
 * Explicit axis ticks at the first point of each month (or year), thinned to at most `maxTicks`.
 * Letting Recharts pick ticks by index repeats month names ("Jan Jan") on daily data.
 * Short spans return undefined and keep the automatic day ticks.
 */
export const calendarTicks = (dates: string[], spanDays: number, maxTicks = 12): string[] | undefined => {
    if (spanDays <= 62 || dates.length < 2) return undefined;
    const byYear = spanDays > 3 * 365;
    const firsts: string[] = [];
    let lastKey = '';
    dates.forEach((date) => {
        const key = byYear ? date.slice(0, 4) : date.slice(0, 7);
        if (key !== lastKey) {
            firsts.push(date);
            lastKey = key;
        }
    });
    // The first bucket usually starts mid-period; its label would sit right next to the second one.
    const ticks = firsts.length > 2 ? firsts.slice(1) : firsts;
    const step = Math.max(1, Math.ceil(ticks.length / maxTicks));
    return ticks.filter((_, index) => (ticks.length - 1 - index) % step === 0);
};
