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

  it('does not treat Buy/Sell as external invested flow when explicit cash balances exist', () => {
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
    expect(result[1].invested).toBe(0);
    expect(result[2].invested).toBe(0);
  });

  it('reconstructs invested from Deposit/Withdrawal only when invested is missing', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 0, dividend: 0 },
      { date: '2024-01-02', value: 130, invested: 0, dividend: 0 },
      { date: '2024-01-03', value: 120, invested: 0, dividend: 0 }
    ];

    const transactions = [
      {
        id: 'd1',
        date: '2024-01-02',
        type: 'Deposit' as const,
        amount: 30,
        currency: 'EUR',
        broker: 'Test'
      },
      {
        id: 'w1',
        date: '2024-01-03',
        type: 'Withdrawal' as const,
        amount: -10,
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
    expect(result[1].invested).toBe(30);
    expect(result[2].invested).toBe(20);
  });

  it('infers external flow from explicit cash delta net of internal cash transactions', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 0, dividend: 0 },
      { date: '2024-01-02', value: 220, invested: 0, dividend: 0 },
      { date: '2024-01-03', value: 210, invested: 0, dividend: 0 }
    ];

    const transactions = [
      {
        id: 'f1',
        date: '2024-01-03',
        type: 'Fee' as const,
        amount: -20,
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
          '2024-01-01': 0,
          '2024-01-02': 100,
          '2024-01-03': 80
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

  it('keeps history unchanged when invested already exists', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 50, dividend: 0 },
      { date: '2024-01-02', value: 120, invested: 50, dividend: 0 }
    ];

    const cashAccounts = [
      {
        id: 'c1',
        name: 'Cash',
        currency: 'EUR',
        balanceHistory: {
          '2024-01-01': 10,
          '2024-01-02': 20
        }
      }
    ];

    const result = normalizeInvestedForExplicitCash(
      history,
      [],
      cashAccounts,
      null,
      'EUR'
    );

    expect(result).toBe(history);
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
