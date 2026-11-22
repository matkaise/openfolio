import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurrencyService, chooseEcbSyncMode } from '../currencyService';
import { parseEcbXml } from '../ecbXml';

describe('chooseEcbSyncMode', () => {
  const today = '2026-10-24';

  it('loads the full history for a project without FX data', () => {
    expect(chooseEcbSyncMode('', today)).toBe('hist');
  });

  it('loads the last 90 days when the app was closed for a week', () => {
    // eurofxref-daily.xml only has one day; a week offline would leave 4 trading days empty.
    expect(chooseEcbSyncMode('2026-10-17', today)).toBe('90d');
  });

  it('falls back to the full history when the gap is more than 85 days', () => {
    expect(chooseEcbSyncMode('2026-07-30', today)).toBe('hist'); // 86 days
    expect(chooseEcbSyncMode('2026-07-31', today)).toBe('90d'); // 85 days
  });

  it('accepts a full ISO timestamp', () => {
    expect(chooseEcbSyncMode('2026-10-20T08:00:00.000Z', today)).toBe('90d');
  });

  it('treats an unparseable date like missing data', () => {
    expect(chooseEcbSyncMode('garbage', today)).toBe('hist');
  });
});

describe('parseEcbXml', () => {
  it('reads every day of a multi-day feed', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope><Cube>
<Cube time="2026-10-23"><Cube currency="USD" rate="1.0850"/><Cube currency="CHF" rate="0.9420"/></Cube>
<Cube time="2026-10-22"><Cube currency="USD" rate="1.0800"/></Cube>
</Cube></gesmes:Envelope>`;

    expect(parseEcbXml(xml)).toEqual([
      { date: '2026-10-23', rates: { EUR: 1, USD: 1.085, CHF: 0.942 } },
      { date: '2026-10-22', rates: { EUR: 1, USD: 1.08 } }
    ]);
  });
});

describe('parseEcbXml with single quotes (daily feed)', () => {
  it('reads the daily feed, which quotes with apostrophes', () => {
    const xml = `<Cube><Cube time='2026-11-20'><Cube currency='USD' rate='1.0990'/><Cube currency='JPY' rate='174.35'/></Cube></Cube>`;
    expect(parseEcbXml(xml)).toEqual([{ date: '2026-11-20', rates: { EUR: 1, USD: 1.099, JPY: 174.35 } }]);
  });
});

describe('CurrencyService.syncRates', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const answer = (data: unknown[]) => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, count: data.length, data }) } as Response)) as unknown as typeof fetch;
  };

  it('does not change the stored histories in place', async () => {
    const usd = { '2026-11-19': 1.09 };
    const current = { baseCurrency: 'EUR' as const, rates: { USD: usd }, lastUpdated: '2026-11-19' };
    answer([{ date: '2026-11-20', rates: { EUR: 1, USD: 1.1 } }]);
    const next = await CurrencyService.syncRates(current);
    expect(next.rates.USD).toEqual({ '2026-11-19': 1.09, '2026-11-20': 1.1 });
    expect(usd).toEqual({ '2026-11-19': 1.09 });
    expect(next.lastUpdated).toBe('2026-11-20');
  });

  it('keeps lastUpdated when the feed is empty', async () => {
    const current = { baseCurrency: 'EUR' as const, rates: {}, lastUpdated: '' };
    answer([]);
    expect(await CurrencyService.syncRates(current)).toBe(current);
  });
});
