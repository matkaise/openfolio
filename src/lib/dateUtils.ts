import { startOfYear, subMonths, subYears } from 'date-fns';

const pad2 = (value: number) => String(value).padStart(2, '0');

export const parseDateOnlyUTC = (dateStr: string): Date => new Date(`${dateStr}T00:00:00Z`);

export const toDateKeyUTC = (date: Date): string => (
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
);

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
