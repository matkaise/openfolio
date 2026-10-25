import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFlatexCashBalancesCsv } from '@/lib/csvParser';
import { applyImportBatch, parseDegiroFiles } from '@/lib/importers/importBatch';
import { deriveCashBalances, entryFromTransaction } from '../ledger/ledger';
import { getLedger } from '../ledger/store';
import { createEmptyProject } from '@/types/domain';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const accountCsv = readFileSync(path.join(fixtureDir, 'degiro-account.csv'), 'utf-8');
const tradesCsv = readFileSync(path.join(fixtureDir, 'degiro-transactions.csv'), 'utf-8');

describe('ledger cash = broker balance ± 0.01 (brief §3)', () => {
  it('derives the DEGIRO end balances per currency from the imported ledger', () => {
    const { project } = applyImportBatch(createEmptyProject(), parseDegiroFiles([tradesCsv, accountCsv]), { id: 'p1', name: 'DEGIRO', isNew: true });

    const derived = deriveCashBalances(getLedger(project));
    const reported = parseFlatexCashBalancesCsv(accountCsv);
    const last = (currency: string) => reported.filter((p) => p.currency === currency).at(-1)!.balance;

    for (const currency of ['CHF', 'EUR', 'USD']) {
      expect(Math.abs(derived[currency] - last(currency))).toBeLessThanOrEqual(0.01);
    }
  });

  it('does not book the AutoFX fee twice: it is part of the conversion rate', () => {
    const entry = entryFromTransaction({
      id: 't1', date: '2024-03-15', type: 'Buy', isin: 'US0000000001', shares: 10, amount: -1000,
      currency: 'USD', fee: -1, fxFee: -2.2, feeCurrency: 'CHF', broker: 'Flatex'
    });
    expect(deriveCashBalances([entry])).toEqual({ USD: -1000, CHF: -1 });
  });
});
