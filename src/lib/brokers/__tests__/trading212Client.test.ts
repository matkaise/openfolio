import { describe, expect, it, vi } from 'vitest';
import { fetchTrading212Data, Trading212Error } from '../trading212Client';

const KEY = 'demo-key-12345678';
const SECRET = 'demo-secret-abcdefgh';
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: async () => body
}) as unknown as Response;
const noSleep = async () => {};

const routes = (overrides: Record<string, Response[]> = {}) => {
  const queues: Record<string, Response[]> = {
    '/api/v0/equity/history/orders?limit=50': [json({ items: [{ fill: { filledAt: '2024-09-10T16:00:00Z' } }], nextPagePath: '/api/v0/equity/history/orders?limit=50&cursor=1' })],
    '/api/v0/equity/history/orders?limit=50&cursor=1': [json({ items: [{ fill: { filledAt: '2024-03-15T15:30:00Z' } }], nextPagePath: null })],
    '/api/v0/equity/history/dividends?limit=50': [json({ items: [{ paidOn: '2024-05-10T08:00:00Z' }], nextPagePath: null })],
    '/api/v0/equity/history/transactions?limit=50': [json({ items: [{ dateTime: '2024-01-05T09:00:00Z' }], nextPagePath: null })],
    '/api/v0/equity/positions': [json([{ quantity: 6 }])],
    ...overrides
  };
  return vi.fn(async (url: string) => {
    const path = url.replace(/^https:\/\/(live|demo)\.trading212\.com/, '');
    const next = queues[path]?.shift();
    if (!next) throw new Error(`unexpected ${path}`);
    return next;
  });
};

describe('fetchTrading212Data', () => {
  it('pages through all history endpoints with Basic auth', async () => {
    const fetchImpl = routes();
    const data = await fetchTrading212Data({ apiKey: KEY, apiSecret: SECRET, environment: 'demo' }, { fetchImpl, sleep: noSleep });

    expect(data.orders).toHaveLength(2);
    expect(data.dividends).toHaveLength(1);
    expect(data.transactions).toHaveLength(1);
    expect(data.positions).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://demo.trading212.com/api/v0/equity/history/orders?limit=50');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${KEY}:${SECRET}`).toString('base64')}`);
  });

  it('stops paging once a page is older than the last sync', async () => {
    // Page 2 is older than `since` and points to a page 3 that must not be requested
    const fetchImpl = routes({
      '/api/v0/equity/history/orders?limit=50&cursor=1': [json({ items: [{ fill: { filledAt: '2024-03-15T15:30:00Z' } }], nextPagePath: '/api/v0/equity/history/orders?limit=50&cursor=2' })]
    });
    const data = await fetchTrading212Data({ apiKey: KEY, apiSecret: SECRET, environment: 'demo' }, { fetchImpl, sleep: noSleep, since: '2024-06-01' });
    expect(data.orders).toHaveLength(2);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('cursor=2'))).toBe(false);
  });

  it('waits and retries when rate limited', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = routes({
      '/api/v0/equity/positions': [json({}, 429, { 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 2) }), json([])]
    });
    await fetchTrading212Data({ apiKey: KEY, apiSecret: SECRET, environment: 'demo' }, { fetchImpl, sleep });
    expect(sleep).toHaveBeenCalled();
  });

  it('reports invalid credentials without echoing them', async () => {
    const fetchImpl = vi.fn(async () => json({}, 401));
    const error = await fetchTrading212Data({ apiKey: KEY, apiSecret: SECRET, environment: 'live' }, { fetchImpl, sleep: noSleep }).catch((e) => e);
    expect(error).toBeInstanceOf(Trading212Error);
    expect(error.message).toMatch(/API-Schlüssel/);
    expect(error.message).not.toContain(SECRET);
  });

  it('refuses page paths that leave the API', async () => {
    const fetchImpl = routes({
      '/api/v0/equity/history/orders?limit=50': [json({ items: [], nextPagePath: 'https://evil.example/steal' })]
    });
    await expect(fetchTrading212Data({ apiKey: KEY, apiSecret: SECRET, environment: 'demo' }, { fetchImpl, sleep: noSleep }))
      .rejects.toThrow(/Seitenpfad/);
  });
});
