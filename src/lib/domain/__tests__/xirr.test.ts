import { describe, expect, it } from 'vitest';
import { annualizedReturnFromHistory, xirr } from '../performance/xirr';

describe('xirr', () => {
  it('finds 10 % for one year from 100 to 110', () => {
    expect(xirr([{ date: '2024-01-01', amount: -100 }, { date: '2025-01-01', amount: 110 }])).toBeCloseTo(0.1, 3);
  });

  it('weights a later deposit by its shorter holding time', () => {
    // -1000 at t0, -1000 after half a year, 2150 after one year: about 10 % p.a.
    const rate = xirr([
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-07-01', amount: -1000 },
      { date: '2025-01-01', amount: 2150 }
    ]);
    expect(rate).toBeGreaterThan(0.09);
    expect(rate).toBeLessThan(0.11);
  });

  it('handles losses', () => {
    expect(xirr([{ date: '2024-01-01', amount: -100 }, { date: '2025-01-01', amount: 80 }])).toBeCloseTo(-0.2, 3);
  });

  it('returns null without both in- and outflows', () => {
    expect(xirr([{ date: '2024-01-01', amount: -100 }])).toBeNull();
    expect(xirr([{ date: '2024-01-01', amount: 100 }, { date: '2025-01-01', amount: 10 }])).toBeNull();
  });
});

describe('annualizedReturnFromHistory', () => {
  it('uses changes of "invested" as deposits and the last value as payout', () => {
    const history = [
      { date: '2024-01-01', value: 100, invested: 100 },
      { date: '2024-07-01', value: 205, invested: 200 },
      { date: '2025-01-01', value: 215, invested: 200 }
    ];
    const rate = annualizedReturnFromHistory(history);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0.08);
    expect(rate!).toBeLessThan(0.12);
  });

  it('does not annualize less than a month of history', () => {
    expect(annualizedReturnFromHistory([
      { date: '2024-01-01', value: 100, invested: 100 },
      { date: '2024-01-10', value: 103, invested: 100 }
    ])).toBeNull();
  });
});
