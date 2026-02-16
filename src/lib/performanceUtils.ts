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

  // If history already contains invested signal (as produced by calculatePortfolioHistory),
  // keep it unchanged. Reconstructing invested from Buy/Sell flows creates false cashflow spikes.
  const hasInvestedSignal = sourceHistory.some((point) => Math.abs(point.invested || 0) > 0.0000001);
  if (hasInvestedSignal) {
    return sourceHistory;
  }

  const toTime = (dateStr: string) => toUtcTime(dateStr);
  const explicitExternalFlows = transactions
    .filter(tx => tx.type === 'Deposit' || tx.type === 'Withdrawal')
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
        flow: tx.type === 'Deposit' ? amountBase : -amountBase
      };
    })
    .filter((entry) => Number.isFinite(entry.flow) && Math.abs(entry.flow) > 0.0000001);

  const sortedHistory = [...sourceHistory].sort((a, b) => a.date.localeCompare(b.date));

  const inferredExternalMap = new Map<number, number>();
  if (explicitExternalFlows.length === 0 && sortedHistory.length > 0) {
    const accountTimelines = cashAccounts
      .filter((account) => account.balanceHistory && Object.keys(account.balanceHistory).length > 0)
      .map((account) => {
        const history = account.balanceHistory || {};
        const dates = Object.keys(history).sort();
        const times = dates.map((date) => toTime(date));
        return {
          account,
          history,
          dates,
          times,
          idx: -1
        };
      });

    const internalCashByTime = new Map<number, number>();
    transactions
      .filter((tx) =>
        tx.type === 'Buy'
        || tx.type === 'Sell'
        || tx.type === 'Sparplan_Buy'
        || tx.type === 'Dividend'
        || tx.type === 'Fee'
        || tx.type === 'Tax'
      )
      .forEach((tx) => {
        const amountBase = convertCurrency(
          fxData,
          tx.amount || 0,
          tx.currency,
          baseCurrency,
          tx.date
        );
        if (!Number.isFinite(amountBase) || Math.abs(amountBase) < 0.0000001) return;
        const time = toTime(tx.date);
        internalCashByTime.set(time, (internalCashByTime.get(time) || 0) + amountBase);
      });

    let previousTotalCashBase: number | null = null;

    sortedHistory.forEach((point) => {
      const pointTime = toTime(point.date);
      let totalCashBase = 0;
      let hasCashSnapshotUpdate = false;

      accountTimelines.forEach((timeline) => {
        while (timeline.idx + 1 < timeline.times.length && timeline.times[timeline.idx + 1] <= pointTime) {
          timeline.idx += 1;
        }

        if (timeline.idx < 0) return;
        const date = timeline.dates[timeline.idx];
        const balance = timeline.history[date] || 0;
        if (Math.abs(balance) < 0.0000001) return;
        if (Object.prototype.hasOwnProperty.call(timeline.history, point.date)) {
          hasCashSnapshotUpdate = true;
        }

        totalCashBase += convertCurrency(
          fxData,
          balance,
          timeline.account.currency,
          baseCurrency,
          point.date
        );
      });

      if (previousTotalCashBase === null) {
        previousTotalCashBase = totalCashBase;
        return;
      }

      const deltaCash = totalCashBase - previousTotalCashBase;
      previousTotalCashBase = totalCashBase;
      if (!hasCashSnapshotUpdate) return;

      const internalCashImpact = internalCashByTime.get(pointTime) || 0;
      const inferredExternalFlow = deltaCash - internalCashImpact;

      if (Number.isFinite(inferredExternalFlow) && Math.abs(inferredExternalFlow) > 0.5) {
        inferredExternalMap.set(pointTime, inferredExternalFlow);
      }
    });
  }

  const externalFlowMap = new Map<number, number>();
  explicitExternalFlows.forEach((entry) => {
    externalFlowMap.set(entry.time, (externalFlowMap.get(entry.time) || 0) + entry.flow);
  });
  inferredExternalMap.forEach((flow, time) => {
    externalFlowMap.set(time, (externalFlowMap.get(time) || 0) + flow);
  });

  if (externalFlowMap.size === 0) return sourceHistory;
  const externalFlows = Array.from(externalFlowMap.entries())
    .map(([time, flow]) => ({ time, flow }))
    .sort((a, b) => a.time - b.time);

  let flowIndex = 0;
  let cumulativeExternalFlow = 0;

  return sourceHistory.map(point => {
    const pointTime = toTime(point.date);
    while (flowIndex < externalFlows.length && externalFlows[flowIndex].time <= pointTime) {
      cumulativeExternalFlow += externalFlows[flowIndex].flow;
      flowIndex += 1;
    }

    return {
      ...point,
      invested: (point.invested || 0) + cumulativeExternalFlow
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
