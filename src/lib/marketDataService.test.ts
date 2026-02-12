import { describe, expect, it } from 'vitest';
import { buildManualPriceHistory } from '@/lib/marketDataService';
import type { Transaction } from '@/types/domain';

describe('buildManualPriceHistory', () => {
  it('uses pricePerShare from originalData when available', () => {
    const txs: Transaction[] = [
      {
        id: '1',
        date: '2024-01-02',
        type: 'Buy',
        isin: 'TEST123',
        name: 'Test',
        shares: 10,
        amount: -1000,
        currency: 'EUR',
        broker: 'Manual',
        originalData: { pricePerShare: 123.45 }
      }
    ];

    const history = buildManualPriceHistory(txs, 'TEST123');
    expect(history['2024-01-02']).toBeCloseTo(123.45, 5);
  });

  it('falls back to amount/shares and ignores sells', () => {
    const txs: Transaction[] = [
      {
        id: '1',
        date: '2024-02-01',
        type: 'Buy',
        isin: 'ABC123',
        name: 'Test',
        shares: 4,
        amount: -200,
        currency: 'EUR',
        broker: 'Manual'
      },
      {
        id: '2',
        date: '2024-02-05',
        type: 'Sell',
        isin: 'ABC123',
        name: 'Test',
        shares: 1,
        amount: 50,
        currency: 'EUR',
        broker: 'Manual'
      }
    ];

    const history = buildManualPriceHistory(txs, 'ABC123');
    expect(history['2024-02-01']).toBeCloseTo(50, 5);
    expect(history['2024-02-05']).toBeUndefined();
  });
});
