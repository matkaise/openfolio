import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildManualPriceHistory, syncProjectQuotes } from '@/lib/marketDataService';
import { createEmptyProject, type ProjectData, type Transaction } from '@/types/domain';

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

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

describe('syncProjectQuotes', () => {
  it('uses incremental from-date during force sync when history already exists', async () => {
    const base = createEmptyProject();
    const isin = 'CH000000001';
    const project: ProjectData = {
      ...base,
      securities: {
        [isin]: {
          isin,
          name: 'Test AG',
          symbol: 'TST',
          currency: 'CHF',
          priceHistory: { '2025-01-10': 100 },
          dividendHistory: [],
          upcomingDividends: [],
          dividendHistorySynced: true,
          lastSync: '2025-01-10T15:30:00.000Z'
        }
      }
    };

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const bodyRaw = init?.body ? String(init.body) : '{}';
      const body = JSON.parse(bodyRaw) as { symbol?: string; from?: string };

      expect(body.symbol).toBe('TST');
      expect(body.from).toBe('2025-01-10');

      return {
        ok: true,
        json: async () => ({
          history: { '2025-01-11': 101 },
          splits: {},
          currency: 'CHF',
          symbol: 'TST',
          longName: 'Test AG',
          quoteType: 'EQUITY',
          dividendHistory: [],
          upcomingDividends: []
        })
      } as Response;
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const updated = await syncProjectQuotes(project, true, undefined, {
      maxPerRun: 0,
      maxTimeMs: 0,
      delayMs: 0
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updated).not.toBe(project);
    expect(updated.securities[isin].priceHistory?.['2025-01-10']).toBe(100);
    expect(updated.securities[isin].priceHistory?.['2025-01-11']).toBe(101);
  });

  it('keeps existing dividend history on incremental sync when API returns no new dividends', async () => {
    const base = createEmptyProject();
    const isin = 'CH000000002';
    const project: ProjectData = {
      ...base,
      securities: {
        [isin]: {
          isin,
          name: 'Dividend AG',
          symbol: 'DVD',
          currency: 'CHF',
          priceHistory: { '2025-01-10': 200 },
          dividendHistory: [{ date: '2024-06-15', amount: 1.25 }],
          upcomingDividends: [],
          dividendHistorySynced: true,
          lastSync: '2025-01-10T15:30:00.000Z'
        }
      }
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        history: { '2025-01-11': 201 },
        splits: {},
        currency: 'CHF',
        symbol: 'DVD',
        longName: 'Dividend AG',
        quoteType: 'EQUITY',
        dividendHistory: [],
        upcomingDividends: []
      })
    } as Response));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const updated = await syncProjectQuotes(project, false, undefined, {
      maxPerRun: 0,
      maxTimeMs: 0,
      delayMs: 0
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updated.securities[isin].dividendHistory).toEqual([{ date: '2024-06-15', amount: 1.25 }]);
    expect(updated.securities[isin].priceHistory?.['2025-01-11']).toBe(201);
  });

  it('backfills full history when dividend signal exists but dividend history is empty', async () => {
    const base = createEmptyProject();
    const isin = 'CH000000003';
    const project: ProjectData = {
      ...base,
      securities: {
        [isin]: {
          isin,
          name: 'Yield Corp',
          symbol: 'YLD',
          currency: 'CHF',
          priceHistory: { '2025-01-10': 300 },
          dividendYield: 0.02,
          dividendHistory: [],
          upcomingDividends: [],
          dividendHistorySynced: true,
          lastSync: '2025-01-10T15:30:00.000Z'
        }
      }
    };

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const bodyRaw = init?.body ? String(init.body) : '{}';
      const body = JSON.parse(bodyRaw) as { symbol?: string; from?: string };
      expect(body.symbol).toBe('YLD');
      expect(body.from).toBe('1970-01-01');

      return {
        ok: true,
        json: async () => ({
          history: { '2025-01-11': 301 },
          splits: {},
          currency: 'CHF',
          symbol: 'YLD',
          longName: 'Yield Corp',
          quoteType: 'EQUITY',
          dividendHistory: [{ date: '2024-03-15', amount: 2.5 }],
          upcomingDividends: []
        })
      } as Response;
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const updated = await syncProjectQuotes(project, false, undefined, {
      maxPerRun: 0,
      maxTimeMs: 0,
      delayMs: 0
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updated.securities[isin].dividendHistory).toEqual([{ date: '2024-03-15', amount: 2.5 }]);
  });
});
