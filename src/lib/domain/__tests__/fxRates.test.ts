import { describe, expect, it } from 'vitest';
import { findMissingFxCurrencies, getFxTable } from '../fx/rates';
import { createEmptyProject } from '@/types/domain';

const rates = {
  USD: { '2024-01-02': 1.10, '2024-01-03': 1.12, '2024-01-05': 1.20 },
  CHF: { '2024-01-02': 0.95 },
  GBP: { '2024-01-02': 0.86 }
};

describe('getFxTable', () => {
  const fx = getFxTable(rates);

  it('uses the last rate on or before the date', () => {
    expect(fx.rateAt('USD', '2024-01-02')).toBe(1.10);
    expect(fx.rateAt('USD', '2024-01-04')).toBe(1.12); // no fixing on that day
    expect(fx.rateAt('USD', '2030-01-01')).toBe(1.20);
  });

  it('answers out-of-order queries correctly (no forward-only cursor, B9)', () => {
    expect(fx.rateAt('USD', '2024-01-05')).toBe(1.20);
    expect(fx.rateAt('USD', '2024-01-02')).toBe(1.10);
    expect(fx.rateAt('USD', '2024-01-03')).toBe(1.12);
  });

  it('accepts UTC timestamps', () => {
    expect(fx.rateAt('USD', Date.UTC(2024, 0, 3))).toBe(1.12);
  });

  it('uses the latest rate without a date', () => {
    expect(fx.rateAt('USD')).toBe(1.20);
  });

  it('returns null instead of guessing when a rate is missing (B11)', () => {
    expect(fx.rateAt('JPY', '2024-01-02')).toBeNull();
    expect(fx.rateAt('USD', '2023-12-31')).toBeNull(); // before the first fixing
    expect(fx.convert(100, 'JPY', 'EUR', '2024-01-02')).toBeNull();
  });

  it('converts via EUR', () => {
    expect(fx.convert(110, 'USD', 'EUR', '2024-01-02')).toBeCloseTo(100, 10);
    expect(fx.convert(110, 'USD', 'CHF', '2024-01-02')).toBeCloseTo(95, 10);
    expect(fx.convert(42, 'CHF', 'CHF')).toBe(42);
  });

  it('handles minor units such as pence', () => {
    expect(fx.convert(8600, 'GBp', 'EUR', '2024-01-02')).toBeCloseTo(100, 10);
    expect(fx.convert(8600, 'GBX', 'GBP', '2024-01-02')).toBeCloseTo(86, 10);
  });

  it('is cached per rates object and rebuilt for new data', () => {
    expect(getFxTable(rates)).toBe(fx);
    expect(getFxTable({ ...rates })).not.toBe(fx);
  });
});

describe('findMissingFxCurrencies', () => {
  it('lists currencies in use that have no rates', () => {
    const project = createEmptyProject();
    project.fxData.rates = rates;
    project.settings.baseCurrency = 'CHF';
    project.transactions = [
      { id: '1', date: '2024-01-02', type: 'Buy', isin: 'X', shares: 1, amount: -1, currency: 'JPY', broker: 'T' },
      { id: '2', date: '2024-01-02', type: 'Buy', isin: 'Y', shares: 1, amount: -1, currency: 'GBp', broker: 'T' }
    ];
    project.securities = { X: { isin: 'X', name: 'X', currency: 'SEK' } };

    expect(findMissingFxCurrencies(project)).toEqual(['JPY', 'SEK']);
  });
});
