import { describe, expect, it } from 'vitest';
import { calculateAnalysisMetrics, summarizeTwrSeries } from '../analysisService';

describe('calculateAnalysisMetrics', () => {
  it('computes monthly returns from the TWR series', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 100, dividend: 0 },
      { date: '2024-01-31', value: 110, invested: 100, dividend: 0 },
      { date: '2024-02-01', value: 120, invested: 100, dividend: 0 },
      { date: '2024-02-29', value: 132, invested: 100, dividend: 0 }
    ];

    const metrics = calculateAnalysisMetrics(history, 0);

    expect(metrics.monthlyReturnsMap?.['2024-01']).toBeCloseTo(10, 5);
    expect(metrics.monthlyReturnsMap?.['2024-02']).toBeCloseTo(20, 5);
  });

  it('reports max drawdown using TWR index values', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 100, dividend: 0 },
      { date: '2024-01-02', value: 120, invested: 100, dividend: 0 },
      { date: '2024-01-03', value: 90, invested: 100, dividend: 0 },
      { date: '2024-01-04', value: 130, invested: 100, dividend: 0 }
    ];

    const metrics = calculateAnalysisMetrics(history, 0);

    expect(metrics.maxDrawdown).toBeCloseTo(-25, 4);
    expect(metrics.maxDrawdownDate).toBe('2024-01-03');
  });
});

describe('summarizeTwrSeries', () => {
  it('returns the total and the annual return of a TWR series', () => {
    const summary = summarizeTwrSeries([
      { date: '2022-01-01', value: 0 },
      { date: '2023-01-01', value: 10 },
      { date: '2024-01-01', value: 21 }
    ]);
    expect(summary?.total).toBeCloseTo(21, 6);
    expect(summary?.annualized).toBeCloseTo(10, 1);
    expect(summary?.since).toBe('2022-01-01');
  });

  it('gives no annual figure for less than a year and nothing for a single point', () => {
    expect(summarizeTwrSeries([{ date: '2024-01-01', value: 0 }, { date: '2024-06-01', value: 5 }])?.annualized).toBeNull();
    expect(summarizeTwrSeries([{ date: '2024-01-01', value: 0 }])).toBeNull();
  });
});
