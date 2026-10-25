import { describe, expect, it } from 'vitest';
import { resolveEditedAmount } from '../transactionEdit';

describe('resolveEditedAmount', () => {
  it('keeps the stored amount without quantity or price (deposit, imported dividend)', () => {
    expect(resolveEditedAmount({ type: 'Deposit', shares: '', pricePerShare: '', storedAmount: 250 })).toBe(250);
    expect(resolveEditedAmount({ type: 'Buy', shares: '10', pricePerShare: '', storedAmount: -500 })).toBe(-500);
  });

  it('computes quantity × price with the sign of the type', () => {
    expect(resolveEditedAmount({ type: 'Buy', shares: '10', pricePerShare: '50.5', storedAmount: -1 })).toBe(-505);
    expect(resolveEditedAmount({ type: 'Sell', shares: '-4', pricePerShare: '125', storedAmount: 1 })).toBe(500);
    expect(resolveEditedAmount({ type: 'Dividend', shares: '8', pricePerShare: '0.68', storedAmount: 0 })).toBeCloseTo(5.44, 6);
  });
});
