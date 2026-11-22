import { describe, expect, it } from 'vitest';
import { initialPricePerShare, resolveEditedAmount } from '../transactionEdit';

describe('resolveEditedAmount', () => {
  it('keeps the stored amount without quantity or price (deposit, imported dividend)', () => {
    expect(resolveEditedAmount({ type: 'Deposit', shares: '', pricePerShare: '', storedAmount: 250 })).toBe(250);
    expect(resolveEditedAmount({ type: 'Buy', shares: '10', pricePerShare: '', storedAmount: -500 })).toBe(-500);
  });

  it('computes quantity × price for trades with the sign of the type', () => {
    expect(resolveEditedAmount({ type: 'Buy', shares: '10', pricePerShare: '50.5', storedAmount: -1 })).toBe(-505);
    expect(resolveEditedAmount({ type: 'Sell', shares: '-4', pricePerShare: '125', storedAmount: 1 })).toBe(500);
    // Quantity and price are hidden for non-trades and must not change the amount
    expect(resolveEditedAmount({ type: 'Dividend', shares: '8', pricePerShare: '0.68', storedAmount: 5 })).toBe(5);
  });

  it('signs the stored amount by the new type when quantity or price is missing', () => {
    expect(resolveEditedAmount({ type: 'Sell', shares: '', pricePerShare: '', storedAmount: -500 })).toBe(500);
    expect(resolveEditedAmount({ type: 'Withdrawal', shares: '', pricePerShare: '', storedAmount: 250 })).toBe(-250);
    expect(resolveEditedAmount({ type: 'Deposit', shares: '', pricePerShare: '', storedAmount: -250 })).toBe(250);
    expect(resolveEditedAmount({ type: 'Fee', shares: '3', pricePerShare: '10', storedAmount: 4 })).toBe(-4);
  });
});

describe('initialPricePerShare', () => {
  it('prefills the price of a trade from amount and quantity', () => {
    expect(initialPricePerShare({ type: 'Buy', amount: -505, shares: 10 })).toBe(50.5);
    expect(initialPricePerShare({ type: 'Sell', amount: 500, shares: -4, pricePerShare: 126 })).toBe(126);
    expect(initialPricePerShare({ type: 'Deposit', amount: 100 })).toBeUndefined();
  });
});
