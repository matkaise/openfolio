import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFlatexCashBalancesCsv, parseFlatexCashMovementsCsv, parseFlatexCsv } from '@/lib/csvParser';
import { buildLedger, ledgerToTransactions } from '../ledger/buildLedger';
import { calculatePortfolioHistory } from '@/lib/portfolioUtils';
import { createEmptyProject, type CashMovement, type ProjectData, type Transaction } from '@/types/domain';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const accountCsv = readFileSync(path.join(fixtureDir, 'degiro-account.csv'), 'utf-8');
const tradesCsv = readFileSync(path.join(fixtureDir, 'degiro-transactions.csv'), 'utf-8');

const PORTFOLIO = 'p1';

/** Project as the import produces it: trades as transactions, account rows as cash movements. */
const importedProject = (): ProjectData => {
  const project = createEmptyProject();
  project.portfolios = [{ id: PORTFOLIO, name: 'DEGIRO' }];
  project.transactions = parseFlatexCsv(tradesCsv).map((tx) => ({ ...tx, portfolioId: PORTFOLIO }));
  project.cashMovements = parseFlatexCashMovementsCsv(accountCsv).map((m, i): CashMovement => ({
    ...m,
    id: `cm-${i}`,
    broker: 'Flatex',
    portfolioId: PORTFOLIO
  }));
  return project;
};

/** Dividend-like rows the old parser created from Account.csv (raw row kept in originalData). */
const legacyAccountTransactions = (): Transaction[] => {
  const lines = accountCsv.trim().split('\n').slice(1).map((line) => line.split(','));
  return lines
    .filter((row) => row.length === 12 && /Dividende|Zinsen|Interest/.test(row[5]))
    .map((row, i) => ({
      id: `legacy-${i}`,
      date: `${row[0].slice(6, 10)}-${row[0].slice(3, 5)}-${row[0].slice(0, 2)}`,
      type: 'Dividend' as const,
      isin: row[4],
      name: row[3],
      amount: Number(row[8]),
      currency: row[7],
      broker: 'Flatex',
      portfolioId: PORTFOLIO,
      originalData: row
    }));
};

const sumBy = (entries: { kind: string; amount: number; currency: string }[], kind: string, currency: string) =>
  entries.filter((e) => e.kind === kind && e.currency === currency).reduce((sum, e) => sum + e.amount, 0);

describe('buildLedger', () => {
  it('no longer creates transactions from Account.csv rows (B1)', () => {
    expect(parseFlatexCsv(accountCsv)).toEqual([]);
  });

  it('classifies account rows with their sign (B1)', () => {
    const ledger = buildLedger(importedProject());

    expect(sumBy(ledger, 'dividend', 'USD')).toBeCloseTo(5, 6);
    expect(sumBy(ledger, 'dividend', 'EUR')).toBeCloseTo(12, 6);
    expect(sumBy(ledger, 'withholding_tax', 'USD')).toBeCloseTo(-0.75, 6);
    expect(sumBy(ledger, 'withholding_tax', 'EUR')).toBeCloseTo(-3.18, 6);
    // "Zinsen" (debit interest) and interest income are interest, not dividends
    expect(sumBy(ledger, 'interest', 'CHF')).toBeCloseTo(0.5 - 3.21, 6);
    expect(sumBy(ledger, 'deposit', 'CHF')).toBeCloseTo(5000, 6);
    expect(sumBy(ledger, 'withdrawal', 'CHF')).toBeCloseTo(-1000, 6);
    // SOFORT fee and the exchange connection fee; ADR fee in USD
    expect(sumBy(ledger, 'fee', 'CHF')).toBeCloseTo(-1 - 2.5, 6);
    expect(sumBy(ledger, 'fee', 'USD')).toBeCloseTo(-0.1, 6);
  });

  it('keeps the security on dividend and tax entries', () => {
    const ledger = buildLedger(importedProject());
    const dividend = ledger.find((e) => e.kind === 'dividend' && e.currency === 'USD');
    expect(dividend).toMatchObject({ isin: 'US0000000001', name: 'ACME CORP', portfolioId: PORTFOLIO });
  });

  it('marks FX legs and broker-internal transfers as internal', () => {
    const ledger = buildLedger(importedProject());
    const internal = ledger.filter((e) => e.internal);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every((e) => e.kind === 'fx' || e.kind === 'transfer')).toBe(true);
  });

  it('drops legacy dividend transactions that duplicate imported account rows', () => {
    const project = importedProject();
    project.transactions = [...project.transactions, ...legacyAccountTransactions()];

    const ledger = buildLedger(project);
    expect(sumBy(ledger, 'dividend', 'USD')).toBeCloseTo(5, 6);
    expect(ledger.filter((e) => e.kind === 'dividend')).toHaveLength(2);
  });

  it('reclassifies legacy dividend transactions when no account rows were imported', () => {
    const project = createEmptyProject();
    project.transactions = legacyAccountTransactions();

    const ledger = buildLedger(project);
    expect(sumBy(ledger, 'dividend', 'USD')).toBeCloseTo(5, 6);
    expect(sumBy(ledger, 'withholding_tax', 'USD')).toBeCloseTo(-0.75, 6);
    expect(sumBy(ledger, 'interest', 'CHF')).toBeCloseTo(0.5 - 3.21, 6);
  });

  it('turns trades into signed buy/sell entries with fees', () => {
    const ledger = buildLedger(importedProject());
    const buy = ledger.find((e) => e.kind === 'buy' && e.date === '2024-03-15');
    const sell = ledger.find((e) => e.kind === 'sell' && e.date === '2024-09-10');

    expect(buy).toMatchObject({ quantity: 10, amount: -1000, currency: 'USD', fee: -1, fxFee: -2.2, feeCurrency: 'CHF' });
    expect(sell).toMatchObject({ quantity: -4, amount: 500 });
  });

  it('has stable, unique ids for the same stored data', () => {
    const project = importedProject();
    const a = buildLedger(project).map((e) => e.id);
    const b = buildLedger(structuredClone(project)).map((e) => e.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('keeps trade fees on the trade and skips their account rows', () => {
    const ledger = buildLedger(importedProject());
    const tradeFeeRows = ledger.filter((e) => e.kind === 'fee' && /Transaktionsgeb/.test(e.description || ''));
    expect(tradeFeeRows).toHaveLength(0);
  });

  it('keeps account fee rows when the trades were not imported', () => {
    const project = importedProject();
    project.transactions = [];
    const ledger = buildLedger(project);
    expect(sumBy(ledger, 'fee', 'CHF')).toBeCloseTo(-1 - 2.5 - 1 - 3.9 - 1 - 1, 6);
  });
});

describe('ledgerToTransactions', () => {
  it('feeds deposits from imported account rows into "invested" (B2)', () => {
    const project = importedProject();
    const balances: Record<string, Record<string, number>> = {};
    parseFlatexCashBalancesCsv(accountCsv).forEach((p) => {
      balances[p.currency] = { ...(balances[p.currency] || {}), [p.date]: p.balance };
    });
    project.cashAccounts = Object.entries(balances).map(([currency, balanceHistory]) => ({
      id: `acc-${currency}`, name: currency, portfolioId: PORTFOLIO, currency, balanceHistory
    }));
    project.fxData.rates = {
      USD: { '2024-01-01': 1.1 },
      CHF: { '2024-01-01': 0.95 }
    };

    const transactions = ledgerToTransactions(buildLedger(project));
    const history = calculatePortfolioHistory(
      transactions, Object.values(project.securities), project.fxData.rates, project.cashAccounts, 'CHF', 'MAX', 'daily'
    );
    const last = history[history.length - 1];

    expect(last.invested).toBeCloseTo(4000, 6);
  });

  it('does not count withholding tax or interest as dividends', () => {
    const transactions = ledgerToTransactions(buildLedger(importedProject()));
    const dividends = transactions.filter((tx) => tx.type === 'Dividend');
    expect(dividends.map((tx) => tx.amount).sort((a, b) => a - b)).toEqual([5, 12]);
  });
});

describe('signed cash flows in the history (B1)', () => {
  const run = (transactions: Transaction[]) => calculatePortfolioHistory(
    transactions, [], {}, [], 'EUR', 'MAX', 'daily'
  );
  const base = { currency: 'EUR', broker: 'Test' };

  it('subtracts a dividend reversal instead of adding it', () => {
    const history = run([
      { ...base, id: '1', date: '2024-05-10', type: 'Dividend', isin: 'X', amount: 5 },
      { ...base, id: '2', date: '2024-05-12', type: 'Dividend', isin: 'X', amount: -5 }
    ]);
    expect(history[history.length - 1].dividend).toBeCloseTo(0, 6);
  });

  it('treats a tax refund as cash in and interest with its sign', () => {
    const history = run([
      { ...base, id: '1', date: '2024-05-10', type: 'Deposit', amount: 100 },
      { ...base, id: '2', date: '2024-05-11', type: 'Tax', amount: 2 },
      { ...base, id: '3', date: '2024-05-12', type: 'Interest', amount: -3 },
      { ...base, id: '4', date: '2024-05-13', type: 'Withdrawal', amount: -10 }
    ]);
    const last = history[history.length - 1];
    expect(last.value).toBeCloseTo(100 + 2 - 3 - 10, 6);
    expect(last.invested).toBeCloseTo(90, 6);
  });
});
