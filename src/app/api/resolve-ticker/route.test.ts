import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const makeRequest = (body: unknown) => new NextRequest('http://localhost/api/resolve-ticker', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' }
});

const writeKursliste = async (entries: unknown[]) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kursliste-'));
  const filePath = path.join(dir, 'ictax_clean_list.json');
  await fs.writeFile(filePath, JSON.stringify(entries), 'utf-8');
  return filePath;
};

describe('resolve-ticker route', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.KURSLISTE_URL;
  });

  it('resolves ticker via kursliste ISIN', async () => {
    const kurslistePath = await writeKursliste([
      { isin: 'US0378331005', symbol: 'AAPL', name: 'Apple', currency: 'USD' }
    ]);
    process.env.KURSLISTE_PATH = kurslistePath;

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ input: 'US0378331005' }));
    const data = await res.json();

    expect(data.status).toBe('resolved');
    expect(data.symbol).toBe('AAPL');
    expect(data.source).toBe('kursliste');
  });

  it('resolves ticker via kursliste Valor', async () => {
    const kurslistePath = await writeKursliste([
      { isin: 'CH0038863350', valorNumber: '123456', symbol: 'NESN.SW', name: 'Nestle', currency: 'CHF' }
    ]);
    process.env.KURSLISTE_PATH = kurslistePath;

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ input: '123456' }));
    const data = await res.json();

    expect(data.status).toBe('resolved');
    expect(data.symbol).toBe('NESN.SW');
    expect(data.matchBy).toBe('valor');
  });
});
