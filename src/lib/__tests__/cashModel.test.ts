import { describe, expect, it } from 'vitest';
import { applyToCash, createCashState, replayCash } from '../cashModel';
import type { Transaction } from '@/types/domain';

const identity = (amount: number) => amount;
const tx = (id: string, type: Transaction['type'], amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, date: `2024-01-0${id}`, type, amount, currency: 'EUR', broker: 'Test', ...extra
});

describe('cash model (no imported account balances)', () => {
  it('keeps sale proceeds as cash until the next buy uses them', () => {
    const state = replayCash([
      tx('1', 'Buy', -100, { isin: 'A', shares: 1 }),
      tx('2', 'Sell', 120, { isin: 'A', shares: 1 }),
      tx('3', 'Buy', -50, { isin: 'B', shares: 1 })
    ], identity, 'EUR');
    expect(state.byCurrency.EUR).toBeCloseTo(70, 6);
    expect(state.invested).toBeCloseTo(100, 6); // the second buy needed no new money
  });

  it('subtracts buys from deposited cash instead of counting the money twice', () => {
    const state = replayCash([tx('1', 'Deposit', 1000), tx('2', 'Buy', -400, { isin: 'A', shares: 4, fee: -1 })], identity, 'EUR');
    expect(state.byCurrency.EUR).toBeCloseTo(599, 6);
    expect(state.invested).toBeCloseTo(1000, 6);
  });

  it('counts the part of a buy that the cash does not cover as new money', () => {
    const state = replayCash([tx('1', 'Deposit', 100), tx('2', 'Buy', -300, { isin: 'A', shares: 3 })], identity, 'EUR');
    expect(state.byCurrency.EUR).toBeCloseTo(0, 6);
    expect(state.invested).toBeCloseTo(300, 6);
  });

  it('pays a buy in another currency from existing cash before counting new money (base currency first)', () => {
    const toEur = (amount: number, currency: string) => (currency === 'USD' ? amount / 2 : amount); // 1 EUR = 2 USD
    const state = createCashState('EUR');
    applyToCash(state, tx('1', 'Deposit', 1000), toEur);
    applyToCash(state, tx('2', 'Buy', -1600, { currency: 'USD', isin: 'A', shares: 1 }), toEur); // 800 EUR
    expect(state.byCurrency.USD).toBeCloseTo(0, 6);
    expect(state.byCurrency.EUR).toBeCloseTo(200, 6);
    expect(state.invested).toBeCloseTo(1000, 6);

    applyToCash(state, tx('3', 'Buy', -1000, { currency: 'USD', isin: 'B', shares: 1 }), toEur); // 500 EUR, 200 available
    expect(state.byCurrency.EUR).toBeCloseTo(0, 6);
    expect(state.invested).toBeCloseTo(1300, 6);
  });

  it('charges fees in their own currency', () => {
    const state = createCashState('EUR');
    applyToCash(state, tx('1', 'Sell', 500, { currency: 'USD', isin: 'A', shares: 5, fee: -2, feeCurrency: 'CHF' }), identity);
    expect(state.byCurrency.CHF).toBeCloseTo(0, 6);
    expect(state.byCurrency.USD).toBeCloseTo(498, 6); // the CHF fee came out of the USD proceeds
    expect(state.invested).toBeCloseTo(0, 6);
  });

  it('adds dividends and interest, and lowers the invested amount on withdrawals', () => {
    const state = replayCash([tx('1', 'Deposit', 100), tx('2', 'Dividend', 5), tx('3', 'Withdrawal', -50)], identity, 'EUR');
    expect(state.byCurrency.EUR).toBeCloseTo(55, 6);
    expect(state.invested).toBeCloseTo(50, 6);
  });
});
