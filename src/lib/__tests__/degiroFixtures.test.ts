import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFlatexCashBalancesCsv } from '../csvParser';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');

describe('synthetic DEGIRO fixtures', () => {
  it('account fixture ends with the documented balances', () => {
    const points = parseFlatexCashBalancesCsv(fixture('degiro-account.csv'));
    const last = (currency: string) => points.filter((p) => p.currency === currency).at(-1);

    expect(last('CHF')).toEqual({ currency: 'CHF', date: '2024-12-02', balance: 2819.15 });
    expect(last('EUR')).toEqual({ currency: 'EUR', date: '2024-11-05', balance: 8.82 });
    expect(last('USD')).toEqual({ currency: 'USD', date: '2024-09-10', balance: -0.1 });
  });
});
