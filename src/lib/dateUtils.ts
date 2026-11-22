import { startOfYear, subMonths, subYears } from 'date-fns';

const pad2 = (value: number) => String(value).padStart(2, '0');

export const parseDateOnlyUTC = (dateStr: string): Date => new Date(`${dateStr}T00:00:00Z`);

export const toDateKeyUTC = (date: Date): string => (
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
);

/**
 * A calendar day ("2026-03-07", also the date part of an ISO timestamp) as local midnight.
 * `new Date("2026-03-07")` is UTC midnight and lands on the previous day west of UTC.
 */
export const parseCalendarDay = (value: string): Date => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
};

/**
 * Factor that brings a share count from `date` to today's basis: the product of all splits
 * after that day. Yahoo's dividend amounts (and prices) are adjusted for those splits, so a
 * historic dividend per share × historic shares must be scaled by it.
 */
export const splitFactorAfter = (splits: Record<string, number> | undefined, date: string, ignored?: Set<string>): number => {
    if (!splits) return 1;
    const day = date.slice(0, 10);
    let factor = 1;
    Object.entries(splits).forEach(([splitDay, ratio]) => {
        if (splitDay > day && ratio > 0 && !ignored?.has(splitDay)) factor *= ratio;
    });
    return factor;
};

export const toUtcTime = (dateStr: string): number => parseDateOnlyUTC(dateStr).getTime();

export const toDateKeyLocal = (date: Date): string => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
);

/**
 * Start of a chart range ('1M', '6M', 'YTD', '1J', '3J', '5J') relative to `now`, local time.
 * Uses date-fns so 31 March minus one month is 28/29 February, not 3 March.
 * Returns null for 'MAX' or unknown ranges.
 */
export const getRangeStartDate = (range: string, now: Date): Date | null => {
  switch (range) {
    case '1M': return subMonths(now, 1);
    case '6M': return subMonths(now, 6);
    case 'YTD': return startOfYear(now);
    case '1J': return subYears(now, 1);
    case '3J': return subYears(now, 3);
    case '5J': return subYears(now, 5);
    default: return null;
  }
};
