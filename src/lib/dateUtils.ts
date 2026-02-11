const pad2 = (value: number) => String(value).padStart(2, '0');

export const parseDateOnlyUTC = (dateStr: string): Date => new Date(`${dateStr}T00:00:00Z`);

export const toDateKeyUTC = (date: Date): string => (
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
);

export const toUtcTime = (dateStr: string): number => parseDateOnlyUTC(dateStr).getTime();
