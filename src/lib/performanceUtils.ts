import { type HistoryPoint } from '@/types/portfolioView';
import { type CashAccount, type FxData, type Transaction } from '@/types/domain';
import { convertCurrency } from '@/lib/fxUtils';
import { toUtcTime } from '@/lib/dateUtils';

type TransactionDate = { date: string };

type BuildMwrOptions = {
  includeDividends: boolean;
  isFullRange: boolean;
  transactions?: TransactionDate[];
};

type PerformancePoint = { date: string; value: number };
export type PerformanceSmoothing = '1d' | '7d' | '1m';

export const normalizeInvestedForExplicitCash = (
  sourceHistory: HistoryPoint[],
  transactions: Transaction[],
  cashAccounts: CashAccount[],
  fxData: FxData | null | undefined,
  baseCurrency: string
): HistoryPoint[] => {
  if (sourceHistory.length === 0) return sourceHistory;

  const hasExplicitCashBalances = cashAccounts.some(
    account => !!account.balanceHistory && Object.keys(account.balanceHistory).length > 0
  );
  if (!hasExplicitCashBalances) {
    return sourceHistory;
  }

  const toTime = (dateStr: string) => toUtcTime(dateStr);

  const tradeFlows = transactions
    .filter(tx => tx.type === 'Buy' || tx.type === 'Sparplan_Buy' || tx.type === 'Sell')
    .map(tx => {
      const amountBase = convertCurrency(
        fxData,
        Math.abs(tx.amount || 0),
        tx.currency,
        baseCurrency,
        tx.date
      );

      return {
        time: toTime(tx.date),
        flow: (tx.type === 'Sell' ? -1 : 1) * amountBase
      };
    })
    .sort((a, b) => a.time - b.time);

  if (tradeFlows.length === 0) {
    return sourceHistory;
  }

  let flowIndex = 0;
  let cumulativeTradeFlow = 0;

  return sourceHistory.map(point => {
    const pointTime = toTime(point.date);
    while (flowIndex < tradeFlows.length && tradeFlows[flowIndex].time <= pointTime) {
      cumulativeTradeFlow += tradeFlows[flowIndex].flow;
      flowIndex += 1;
    }

    return {
      ...point,
      invested: point.invested + cumulativeTradeFlow
    };
  });
};

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
    const firstTxTime = toUtcTime(firstTxDateStr);
    const startTime = toUtcTime(startPoint.date);
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

const resolveSmoothingWindowDays = (option: PerformanceSmoothing): number => {
  if (option === '7d') return 7;
  if (option === '1m') return 30;
  return 1;
};

export const smoothPerformanceSeries = (
  series: PerformancePoint[],
  option: PerformanceSmoothing
): PerformancePoint[] => {
  if (!series.length) return series;

  const windowDays = resolveSmoothingWindowDays(option);
  if (windowDays <= 1) return series;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const result: PerformancePoint[] = [];

  let startIndex = 0;
  let runningSum = 0;

  for (let i = 0; i < sorted.length; i++) {
    const currentTime = toUtcTime(sorted[i].date);
    runningSum += sorted[i].value;

    while (startIndex < i) {
      const startTime = toUtcTime(sorted[startIndex].date);
      if (currentTime - startTime <= windowMs) break;
      runningSum -= sorted[startIndex].value;
      startIndex += 1;
    }

    const windowCount = i - startIndex + 1;
    const smoothed = windowCount > 0 ? runningSum / windowCount : sorted[i].value;
    result.push({ date: sorted[i].date, value: smoothed });
  }

  return result;
};
