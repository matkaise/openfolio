import { describe, expect, it } from 'vitest';
import { buildMwrSeries, normalizeInvestedForExplicitCash } from '../performanceUtils';

describe('normalizeInvestedForExplicitCash', () => {
  it('returns original history when no explicit cash balances exist', () => {
    const history = [{ date: '2024-01-01', value: 100, invested: 0, dividend: 0 }];
    const result = normalizeInvestedForExplicitCash(
      history,
      [],
      [],
      null,
      'EUR'
    );

    expect(result).toBe(history);
  });

  it('adds cumulative trade flow to invested when explicit cash balances exist', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 0, dividend: 0 },
      { date: '2024-01-02', value: 110, invested: 0, dividend: 0 },
      { date: '2024-01-03', value: 120, invested: 0, dividend: 0 }
    ];

    const transactions = [
      {
        id: 't1',
        date: '2024-01-02',
        type: 'Buy' as const,
        amount: -100,
        currency: 'EUR',
        broker: 'Test'
      }
    ];

    const cashAccounts = [
      {
        id: 'c1',
        name: 'Cash',
        currency: 'EUR',
        balanceHistory: {
          '2024-01-01': 1000
        }
      }
    ];

    const result = normalizeInvestedForExplicitCash(
      history,
      transactions,
      cashAccounts,
      null,
      'EUR'
    );

    expect(result[0].invested).toBe(0);
    expect(result[1].invested).toBe(100);
    expect(result[2].invested).toBe(100);
  });
});

describe('buildMwrSeries', () => {
  it('calculates relative performance from the start of history', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 100, dividend: 0 },
      { date: '2024-01-02', value: 110, invested: 100, dividend: 0 }
    ];

    const result = buildMwrSeries(history, '2024-01-01', '2024-01-02', {
      includeDividends: false,
      isFullRange: true
    });

    expect(result).toEqual([
      { date: '2024-01-01', value: 0 },
      { date: '2024-01-02', value: 10 }
    ]);
  });

  it('includes dividends in the performance calculation when enabled', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 100, dividend: 0 },
      { date: '2024-01-02', value: 102, invested: 100, dividend: 2 }
    ];

    const result = buildMwrSeries(history, '2024-01-01', '2024-01-02', {
      includeDividends: true,
      isFullRange: true
    });

    expect(result[1].value).toBeCloseTo(4, 4);
  });
});
