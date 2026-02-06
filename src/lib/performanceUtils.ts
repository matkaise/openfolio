import { type HistoryPoint } from '@/types/portfolioView';

type TransactionDate = { date: string };

type BuildMwrOptions = {
  includeDividends: boolean;
  isFullRange: boolean;
  transactions?: TransactionDate[];
};

type PerformancePoint = { date: string; value: number };

export const buildMwrSeries = (
  sourceHistory: HistoryPoint[],
  rangeStart: string,
  rangeEnd: string,
  options: BuildMwrOptions
): PerformancePoint[] => {
  if (!sourceHistory.length) return [];

  const { includeDividends, isFullRange, transactions } = options;

  const periodData = rangeStart && rangeEnd
    ? sourceHistory.filter(d => d.date >= rangeStart && d.date <= rangeEnd)
    : sourceHistory;

  if (periodData.length === 0) return [];

  const startPoint = periodData[0];
  const getValue = (point: { value: number; dividend?: number }) =>
    point.value + (includeDividends ? (point.dividend || 0) : 0);

  let startValue = getValue(startPoint);
  const startInvested = startPoint.invested || 0;

  let isStartOfHistory = isFullRange;

  if (!isStartOfHistory && transactions && transactions.length > 0) {
    const firstTxDateStr = transactions.reduce((min, t) => t.date < min ? t.date : min, '9999-12-31');
    const firstTxTime = new Date(firstTxDateStr).setHours(0, 0, 0, 0);
    const startTime = new Date(startPoint.date).setHours(0, 0, 0, 0);
    if (Math.abs(startTime - firstTxTime) < 86400000) {
      isStartOfHistory = true;
    }
  }

  if (isStartOfHistory && startInvested > 0) {
    startValue = startInvested;
  }

  return periodData.map((point, index) => {
    if (index === 0) {
      if (isStartOfHistory) {
        const inv = point.invested || 0;
        const valueWithDividends = getValue(point);
        if (inv > 0) return { date: point.date, value: ((valueWithDividends - inv) / inv) * 100 };
        return { date: point.date, value: 0 };
      }
      return { date: point.date, value: 0 };
    }

    const currValue = getValue(point);
    const currInvested = point.invested || 0;
    const deltaInvested = currInvested - startInvested;
    const capitalAtWork = startValue + deltaInvested;

    let percent = 0;
    if (capitalAtWork > 0) {
      const profitPeriod = (currValue - startValue) - deltaInvested;
      percent = (profitPeriod / capitalAtWork) * 100;
    }

    return { date: point.date, value: percent };
  });
};
