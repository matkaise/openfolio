import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { calculateHoldings } from '../portfolioUtils';
import type { Security, Transaction } from '@/types/domain';

// Property tests (brief §3): invariants that must hold for any valid trade sequence.
// Single currency (EUR), so no FX is involved; average cost method.

const ISIN = 'DE0000000001';
const security: Security = { isin: ISIN, name: 'SYNTHETIC AG', currency: 'EUR' };

type Step = { buy: boolean; shares: number; price: number; fee: number };

const stepArb = fc.record({
  buy: fc.boolean(),
  shares: fc.integer({ min: 1, max: 500 }),
  price: fc.integer({ min: 1, max: 100000 }).map((cents) => cents / 100),
  fee: fc.integer({ min: 0, max: 1000 }).map((cents) => cents / 100)
});

/** Turns random steps into a valid sequence: a sell never exceeds the current position. */
const toTransactions = (steps: Step[]): Transaction[] => {
  let position = 0;
  const txs: Transaction[] = [];
  steps.forEach((step, index) => {
    const date = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
    const shares = step.buy ? step.shares : Math.min(step.shares, position);
    if (shares === 0) return;
    position += step.buy ? shares : -shares;
    const value = Math.round(shares * step.price * 100) / 100;
    txs.push({
      id: `t${index}`,
      date,
      type: step.buy ? 'Buy' : 'Sell',
      isin: ISIN,
      shares,
      amount: step.buy ? -value : value,
      currency: 'EUR',
      fee: -step.fee,
      broker: 'Test'
    });
  });
  return txs;
};

const sharesOf = (txs: Transaction[]) => txs.reduce((sum, tx) => sum + (tx.type === 'Sell' ? -1 : 1) * (tx.shares || 0), 0);
const cashFlowOf = (txs: Transaction[]) => txs.reduce((sum, tx) => sum + tx.amount + (tx.fee || 0), 0);

const run = (txs: Transaction[], quote: number, splits?: Record<string, number>) =>
  calculateHoldings(txs, [{ ...security, ...(splits ? { splits } : {}) }], { [ISIN]: quote }, {}, 'EUR');

const PRICE = fc.integer({ min: 1, max: 100000 }).map((cents) => cents / 100);

describe('holdings properties', () => {
  it('quantity equals bought minus sold shares', () => {
    fc.assert(fc.property(fc.array(stepArb, { maxLength: 40 }), PRICE, (steps, quote) => {
      const txs = toTransactions(steps);
      const { holdings } = run(txs, quote);
      const expected = sharesOf(txs);
      expect(holdings[0]?.quantity ?? 0).toBeCloseTo(expected, 6);
    }));
  });

  it('buying and selling the same quantity leaves no position and realizes all cash flows', () => {
    fc.assert(fc.property(fc.array(stepArb.filter((s) => s.buy), { minLength: 1, maxLength: 20 }), PRICE, PRICE, (buys, sellPrice, quote) => {
      const bought = toTransactions(buys);
      const total = sharesOf(bought);
      const sell: Transaction = {
        id: 'sell', date: '2030-01-01', type: 'Sell', isin: ISIN, shares: total,
        amount: Math.round(total * sellPrice * 100) / 100, currency: 'EUR', broker: 'Test'
      };
      const txs = [...bought, sell];
      const { holdings, realizedPnL } = run(txs, quote);
      expect(holdings).toHaveLength(0);
      expect(realizedPnL).toBeCloseTo(cashFlowOf(txs), 4);
    }));
  });

  it('realized plus unrealized result equals net cash flow plus current value', () => {
    fc.assert(fc.property(fc.array(stepArb, { maxLength: 40 }), PRICE, (steps, quote) => {
      const txs = toTransactions(steps);
      const { holdings, realizedPnL } = run(txs, quote);
      const value = holdings[0]?.value ?? 0;
      const unrealized = holdings[0]?.totalReturn ?? 0;
      expect(realizedPnL + unrealized).toBeCloseTo(cashFlowOf(txs) + value, 4);
    }));
  });

  it('does not depend on the order of the input list', () => {
    const shuffledArb = fc.array(stepArb, { maxLength: 25 })
      .map(toTransactions)
      .chain((txs) => fc.tuple(fc.constant(txs), fc.shuffledSubarray(txs, { minLength: txs.length, maxLength: txs.length })));
    fc.assert(fc.property(shuffledArb, PRICE, ([txs, shuffled], quote) => {
      const a = run(txs, quote);
      const b = run(shuffled, quote);
      expect(b.realizedPnL).toBeCloseTo(a.realizedPnL, 6);
      expect(b.holdings[0]?.quantity ?? 0).toBeCloseTo(a.holdings[0]?.quantity ?? 0, 6);
      expect(b.holdings[0]?.value ?? 0).toBeCloseTo(a.holdings[0]?.value ?? 0, 6);
    }));
  });

  it('a split multiplies the quantity and keeps the cost basis', () => {
    fc.assert(fc.property(fc.array(stepArb.filter((s) => s.buy), { minLength: 1, maxLength: 10 }), fc.integer({ min: 2, max: 20 }), PRICE, (buys, ratio, quote) => {
      const txs = toTransactions(buys);
      const before = run(txs, quote).holdings[0];
      const after = run(txs, quote / ratio, { '2029-06-01': ratio }).holdings[0];
      expect(after.quantity).toBeCloseTo(before.quantity * ratio, 6);
      expect(after.averageBuyPrice * after.quantity).toBeCloseTo(before.averageBuyPrice * before.quantity, 4);
      expect(after.value).toBeCloseTo(before.value, 4);
    }));
  });
});
