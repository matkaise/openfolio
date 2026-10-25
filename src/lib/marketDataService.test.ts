import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySecurityPatches, buildManualPriceHistory, mergeDividendHistory, securityNeedsSync, syncProjectQuotes, syncSecurityPatches } from '@/lib/marketDataService';
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

  describe('Yahoo errors (B7)', () => {
    const isin = 'IE0000000009';
    const makeProject = (): ProjectData => ({
      ...createEmptyProject(),
      securities: {
        [isin]: {
          isin,
          name: 'Some ETC',
          symbol: 'ETC1',
          symbolStatus: 'resolved',
          currency: 'USD',
          priceHistory: { '2025-01-10': 50 },
          dividendHistory: [],
          upcomingDividends: [],
          dividendHistorySynced: true,
          lastSync: '2025-01-10T15:30:00.000Z'
        }
      }
    });
    const okResponse = {
      ok: true,
      status: 200,
      json: async () => ({ history: { '2025-01-11': 51 }, splits: {}, currency: 'USD', symbol: 'ETC1', dividendHistory: [], upcomingDividends: [] })
    } as Response;
    const errorResponse = (status: number, transient: boolean) => ({
      ok: false,
      status,
      statusText: 'error',
      json: async () => ({ error: 'error', transient })
    } as Response);
    const syncOptions = { maxPerRun: 0, maxTimeMs: 0, delayMs: 0, retryDelaysMs: [0, 0] };

    it('retries a transient error and then uses the data', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(errorResponse(503, true))
        .mockResolvedValueOnce(errorResponse(503, true))
        .mockResolvedValueOnce(okResponse);
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const updated = await syncProjectQuotes(makeProject(), true, undefined, syncOptions);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(updated.securities[isin].priceHistory?.['2025-01-11']).toBe(51);
    });

    it('keeps the symbol status when Yahoo stays unavailable', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock = vi.fn().mockResolvedValue(errorResponse(503, true));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const project = makeProject();
      const updated = await syncProjectQuotes(project, true, undefined, syncOptions);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(updated.securities[isin].symbolStatus).toBe('resolved');
      expect(updated.securities[isin].lastSync).toBe('2025-01-10T15:30:00.000Z');
    });

    it('marks the symbol unresolved when Yahoo does not know it', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock = vi.fn().mockResolvedValue(errorResponse(404, false));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const updated = await syncProjectQuotes(makeProject(), true, undefined, syncOptions);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(updated.securities[isin].symbolStatus).toBe('unresolved');
    });
  });
});

describe('mergeDividendHistory (B12)', () => {
  it('keeps one entry per date and lets the newer amount win', () => {
    // Yahoo restates past dividends after a split: same date, new amount
    const merged = mergeDividendHistory(
      [{ date: '2024-06-15', amount: 2.0 }, { date: '2024-09-15', amount: 2.0 }],
      [{ date: '2024-06-15', amount: 0.5 }, { date: '2024-12-15', amount: 0.5 }]
    );

    expect(merged).toEqual([
      { date: '2024-06-15', amount: 0.5 },
      { date: '2024-09-15', amount: 2.0 },
      { date: '2024-12-15', amount: 0.5 }
    ]);
  });
});

describe('patch-based market sync (B4)', () => {
  const isin = 'US0000000001';
  const otherIsin = 'DE0000000002';
  const snapshot = (): ProjectData => ({
    ...createEmptyProject(),
    securities: {
      [isin]: {
        isin, name: 'ACME', symbol: 'ACME', symbolStatus: 'resolved', currency: 'USD',
        priceHistory: { '2025-01-10': 50 }, dividendHistory: [], upcomingDividends: [],
        dividendHistorySynced: true, lastSync: '2025-01-10T15:30:00.000Z'
      },
      [otherIsin]: { isin: otherIsin, name: 'Widget', symbol: 'WDG', currency: 'EUR', ignoreMarketData: true, symbolStatus: 'ignored' }
    }
  });

  const mockYahoo = () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ history: { '2025-01-11': 51 }, splits: {}, currency: 'USD', symbol: 'ACME', longName: 'ACME Corp', dividendHistory: [], upcomingDividends: [] })
    } as Response) as unknown as typeof fetch;
  };

  it('returns only patches and leaves the snapshot untouched', async () => {
    mockYahoo();
    const before = snapshot();
    const patches = await syncSecurityPatches(before, true, undefined, { maxPerRun: 0, maxTimeMs: 0, delayMs: 0 });

    expect(Object.keys(patches)).toEqual([isin]);
    expect(patches[isin].priceHistory).toEqual({ '2025-01-10': 50, '2025-01-11': 51 });
    expect(before.securities[isin].priceHistory).toEqual({ '2025-01-10': 50 });
  });

  it('keeps changes made while the sync was running', async () => {
    mockYahoo();
    const before = snapshot();
    const patches = await syncSecurityPatches(before, true, undefined, { maxPerRun: 0, maxTimeMs: 0, delayMs: 0 });

    // Meanwhile: a new transaction, a renamed security, a new ticker mapping elsewhere
    const current: ProjectData = {
      ...before,
      ledger: [{ id: 'new', source: 'Manual', date: '2025-01-11', kind: 'buy', isin, quantity: 1, amount: -51, currency: 'USD' }],
      securities: {
        ...before.securities,
        [isin]: { ...before.securities[isin], name: 'My ACME' },
        [otherIsin]: { ...before.securities[otherIsin], symbol: 'WDG.DE' }
      }
    };

    const merged = applySecurityPatches(current, patches, before.securities);

    expect(merged.ledger).toHaveLength(1);
    expect(merged.securities[otherIsin].symbol).toBe('WDG.DE');
    expect(merged.securities[isin].name).toBe('My ACME'); // user edit wins over longName from Yahoo
    expect(merged.securities[isin].priceHistory?.['2025-01-11']).toBe(51);
  });

  it('drops patches for securities deleted during the sync', () => {
    const before = snapshot();
    const current = { ...before, securities: { [otherIsin]: before.securities[otherIsin] } };
    const merged = applySecurityPatches(current, { [isin]: { lastSync: 'x' } }, before.securities);
    expect(merged.securities[isin]).toBeUndefined();
  });
});

describe('securityNeedsSync (B18)', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  const base = { isin: 'XX0000000001', name: 'X', currency: 'USD' };

  it('does not retry an unresolvable symbol within 24 hours', () => {
    expect(securityNeedsSync({ ...base, symbolStatus: 'unresolved', symbolLastTried: hoursAgo(1) }, now)).toBe(false);
  });

  it('retries an unresolvable symbol after 24 hours', () => {
    expect(securityNeedsSync({ ...base, symbolStatus: 'unresolved', symbolLastTried: hoursAgo(25) }, now)).toBe(true);
  });

  it('syncs resolved securities without history or older than a day', () => {
    expect(securityNeedsSync({ ...base, symbol: 'X', symbolStatus: 'resolved' }, now)).toBe(true);
    expect(securityNeedsSync({
      ...base, symbol: 'X', symbolStatus: 'resolved', priceHistory: { '2026-10-23': 1 },
      dividendHistory: [], upcomingDividends: [], dividendHistorySynced: true, lastSync: hoursAgo(2)
    }, now)).toBe(false);
    expect(securityNeedsSync({
      ...base, symbol: 'X', symbolStatus: 'resolved', priceHistory: { '2026-10-23': 1 },
      dividendHistory: [], upcomingDividends: [], dividendHistorySynced: true, lastSync: hoursAgo(30)
    }, now)).toBe(true);
  });

  it('never syncs ignored securities', () => {
    expect(securityNeedsSync({ ...base, symbolStatus: 'ignored' }, now)).toBe(false);
    expect(securityNeedsSync({ ...base, ignoreMarketData: true }, now)).toBe(false);
  });

  it('lets a forced sync retry anything that is not ignored', () => {
    expect(securityNeedsSync({ ...base, symbolStatus: 'unresolved', symbolLastTried: hoursAgo(1) }, now, { force: true })).toBe(true);
  });
});
