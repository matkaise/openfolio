import { describe, expect, it } from 'vitest';
import { isCacheFor } from '../inputCache';

describe('isCacheFor', () => {
  const transactions = [{ id: '1' }];
  const securities = { A: { priceHistory: {} } };

  it('hits only for the same key and the very same input objects', () => {
    const cache = { key: 'p1|EUR', inputs: [transactions, securities] };
    expect(isCacheFor(cache, 'p1|EUR', [transactions, securities])).toBe(true);
    expect(isCacheFor(cache, 'p1|CHF', [transactions, securities])).toBe(false);
  });

  it('misses after a market sync replaced the securities (stale analysis)', () => {
    const cache = { key: 'p1', inputs: [transactions, securities] };
    const synced = { A: { priceHistory: { '2024-01-02': 10 } } };
    expect(isCacheFor(cache, 'p1', [transactions, synced])).toBe(false);
  });

  it('misses without a cache or with a different number of inputs', () => {
    expect(isCacheFor(null, 'p1', [])).toBe(false);
    expect(isCacheFor({ key: 'p1', inputs: [transactions] }, 'p1', [transactions, securities])).toBe(false);
  });
});
