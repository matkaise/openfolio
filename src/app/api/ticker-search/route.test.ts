import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const makeRequest = (body: unknown) => new NextRequest('http://localhost/api/ticker-search', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' }
});

describe('ticker-search route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when query is missing', async () => {
    const { POST } = await import('./route');
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('maps yahoo results into matches', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        quotes: [
          { symbol: 'AAPL', shortname: 'Apple', exchDisp: 'NASDAQ', currency: 'USD', quoteType: 'EQUITY' },
          { symbol: 'AAPL', shortname: 'Apple Duplicate', exchDisp: 'NASDAQ' },
          { symbol: 'SAP.DE', longname: 'SAP SE', exchDisp: 'XETRA', currency: 'EUR', quoteType: 'EQUITY' }
        ]
      })
    })) as unknown as typeof fetch;

    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(makeRequest({ query: 'apple' }));
    const data = await res.json();

    expect(Array.isArray(data.matches)).toBe(true);
    expect(data.matches.length).toBe(2);
    expect(data.matches[0].symbol).toBe('AAPL');
    expect(data.matches[1].symbol).toBe('SAP.DE');
  });
});
