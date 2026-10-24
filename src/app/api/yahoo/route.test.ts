import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const yahoo = {
  chart: vi.fn(),
  quote: vi.fn(),
  quoteSummary: vi.fn()
};

vi.mock('yahoo-finance2', () => ({
  default: class {
    chart = yahoo.chart;
    quote = yahoo.quote;
    quoteSummary = yahoo.quoteSummary;
  }
}));

const makeRequest = (body: unknown) => new NextRequest('http://localhost/api/yahoo', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' }
});

const chartResult = (overrides: Record<string, unknown> = {}) => ({
  quotes: [{ date: new Date('2026-10-22T13:30:00Z'), close: 10 }],
  meta: { currency: 'USD', symbol: 'ETF1', regularMarketPrice: 10, exchangeTimezoneName: 'America/New_York' },
  ...overrides
});

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { name: 'HTTPError', code: status });

describe('yahoo route', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    yahoo.chart.mockReset().mockResolvedValue(chartResult());
    yahoo.quote.mockReset().mockResolvedValue({ longName: 'Some ETF', quoteType: 'ETF' });
    yahoo.quoteSummary.mockReset().mockResolvedValue({});
  });

  it('still returns the price history when quoteSummary fails (B7)', async () => {
    yahoo.quoteSummary.mockRejectedValue(new Error('No fundamentals data found for any of the summaryTypes=earnings'));

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ symbol: 'ETF1' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.history).toEqual({ '2026-10-22': 10 });
    expect(data.longName).toBe('Some ETF');
  });

  it('still returns the price history when quote fails', async () => {
    yahoo.quote.mockRejectedValue(new Error('Quote not found'));

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ symbol: 'ETF1' }));

    expect(res.status).toBe(200);
    expect((await res.json()).history).toEqual({ '2026-10-22': 10 });
  });

  it('reports rate limits and server errors as transient (503)', async () => {
    const { POST } = await import('./route');

    yahoo.chart.mockRejectedValue(httpError(429));
    const limited = await POST(makeRequest({ symbol: 'ETF1' }));
    expect(limited.status).toBe(503);
    expect((await limited.json()).transient).toBe(true);

    yahoo.chart.mockRejectedValue(httpError(502));
    expect((await POST(makeRequest({ symbol: 'ETF1' }))).status).toBe(503);
  });

  it('reports an unknown symbol as 404', async () => {
    yahoo.chart.mockRejectedValue(new Error('No data found, symbol may be delisted'));

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ symbol: 'NOPE' }));

    expect(res.status).toBe(404);
    expect((await res.json()).transient).toBe(false);
  });

  it('dates daily candles in the exchange time zone (B8)', async () => {
    // ASX opens 10:00 AEDT = 23:00 UTC on the previous day
    yahoo.chart.mockResolvedValue(chartResult({
      quotes: [{ date: new Date('2026-10-22T23:00:00Z'), close: 5 }],
      meta: { currency: 'AUD', symbol: 'XYZ.AX', exchangeTimezoneName: 'Australia/Sydney' },
      events: { dividends: { a: { date: new Date('2026-10-22T23:00:00Z'), amount: 0.1 } } }
    }));

    const { POST } = await import('./route');
    const data = await (await POST(makeRequest({ symbol: 'XYZ.AX' }))).json();

    expect(data.history).toEqual({ '2026-10-23': 5 });
    expect(data.dividendHistory).toEqual([{ date: '2026-10-23', amount: 0.1 }]);
  });

  it('falls back to UTC dates for an unknown time zone', async () => {
    yahoo.chart.mockResolvedValue(chartResult({
      meta: { currency: 'USD', symbol: 'ETF1', exchangeTimezoneName: 'Not/AZone' }
    }));

    const { POST } = await import('./route');
    const data = await (await POST(makeRequest({ symbol: 'ETF1' }))).json();

    expect(data.history).toEqual({ '2026-10-22': 10 });
  });

  it('returns the dividend yield as a fraction from either source (B13)', async () => {
    const { POST } = await import('./route');

    yahoo.quoteSummary.mockResolvedValue({ summaryDetail: { dividendYield: 0.0045 } });
    yahoo.quote.mockResolvedValue({ dividendYield: 0.45 });
    expect((await (await POST(makeRequest({ symbol: 'ETF1' }))).json()).dividendYield).toBeCloseTo(0.0045, 8);

    // quote() reports percent: 0.45 means 0.45 %
    yahoo.quoteSummary.mockResolvedValue({});
    expect((await (await POST(makeRequest({ symbol: 'ETF1' }))).json()).dividendYield).toBeCloseTo(0.0045, 8);
  });
});
