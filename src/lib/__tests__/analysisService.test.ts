import { describe, expect, it } from 'vitest';
import { calculateAnalysisMetrics } from '../analysisService';

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
