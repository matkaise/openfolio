import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFlatexCashBalancesCsv, parseFlatexCsv } from '@/lib/csvParser';
import { applyImportBatch, parseDegiroFiles } from '@/lib/importers/importBatch';
import { entryFromTransaction, entryToTransaction, ledgerToTransactions } from '../ledger/ledger';
import { getLedger } from '../ledger/store';
import { calculatePortfolioHistory } from '@/lib/portfolioUtils';
import { createEmptyProject, type ProjectData, type Transaction } from '@/types/domain';

const fixtureDir = path.join(__dirname, '..', '..', '__tests__', 'fixtures');
const accountCsv = readFileSync(path.join(fixtureDir, 'degiro-account.csv'), 'utf-8');
const tradesCsv = readFileSync(path.join(fixtureDir, 'degiro-transactions.csv'), 'utf-8');

const PORTFOLIO = 'p1';
const target = { id: PORTFOLIO, name: 'DEGIRO', isNew: true };

const importFiles = (project: ProjectData, ...files: string[]) => applyImportBatch(project, parseDegiroFiles(files), target);

/** Project after importing both DEGIRO exports. */
const importedProject = (): ProjectData => importFiles(createEmptyProject(), tradesCsv, accountCsv).project;

const sumBy = (entries: { kind: string; amount: number; currency: string }[], kind: string, currency: string) =>
  entries.filter((e) => e.kind === kind && e.currency === currency).reduce((sum, e) => sum + e.amount, 0);

describe('ledger from a DEGIRO import', () => {
  it('no longer creates transactions from Account.csv rows (B1)', () => {
    expect(parseFlatexCsv(accountCsv)).toEqual([]);
  });

  it('classifies account rows with their sign (B1)', () => {
    const ledger = getLedger(importedProject());

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
    const dividend = getLedger(importedProject()).find((e) => e.kind === 'dividend' && e.currency === 'USD');
    expect(dividend).toMatchObject({ isin: 'US0000000001', name: 'ACME CORP', portfolioId: PORTFOLIO });
  });

  it('marks FX legs and broker-internal transfers as internal', () => {
    const internal = getLedger(importedProject()).filter((e) => e.internal);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every((e) => e.kind === 'fx' || e.kind === 'transfer')).toBe(true);
  });

  it('turns trades into signed buy/sell entries with fees', () => {
    const ledger = getLedger(importedProject());
    const buy = ledger.find((e) => e.kind === 'buy' && e.date === '2024-03-15');
    const sell = ledger.find((e) => e.kind === 'sell' && e.date === '2024-09-10');

    expect(buy).toMatchObject({ quantity: 10, amount: -1000, currency: 'USD', fee: -1, fxFee: -2.2, feeCurrency: 'CHF' });
    expect(sell).toMatchObject({ quantity: -4, amount: 500 });
  });

  it('gives the same, unique ids for the same import and keeps the ledger sorted', () => {
    const a = getLedger(importedProject());
    const b = getLedger(importedProject());
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
    expect(a.map((e) => e.date)).toEqual([...a.map((e) => e.date)].sort());
  });

  it('keeps trade fees on the trade and drops their statement rows, whichever file comes first', () => {
    const tradeFeeRows = (project: ProjectData) => getLedger(project).filter((e) => e.kind === 'fee' && /Transaktionsgeb/.test(e.description || ''));
    expect(tradeFeeRows(importedProject())).toHaveLength(0);

    const accountFirst = importFiles(createEmptyProject(), accountCsv).project;
    expect(tradeFeeRows(accountFirst)).toHaveLength(4);
    const thenTrades = importFiles(accountFirst, tradesCsv);
    expect(tradeFeeRows(thenTrades.project)).toHaveLength(0);
    expect(getLedger(thenTrades.project)).toHaveLength(getLedger(importedProject()).length);
  });

  it('keeps statement fee rows when the trades were not imported', () => {
    const ledger = getLedger(importFiles(createEmptyProject(), accountCsv).project);
    expect(sumBy(ledger, 'fee', 'CHF')).toBeCloseTo(-1 - 2.5 - 1 - 3.9 - 1 - 1, 6);
  });

  it('adds nothing when the same files are imported again', () => {
    const project = importedProject();
    const again = importFiles(project, tradesCsv, accountCsv);
    expect(again.project.ledger).toBe(project.ledger);
    expect(again.summary.addedTransactions + again.summary.addedMovements).toBe(0);
    expect(again.summary.duplicateTransactions).toBe(4);
  });
});

describe('transaction view', () => {
  const tx = (overrides: Partial<Transaction>): Transaction => ({
    id: 't1', date: '2024-03-15', type: 'Buy', isin: 'DE0000000002', shares: 10, amount: -500, currency: 'EUR', broker: 'Manual', portfolioId: PORTFOLIO, ...overrides
  });

  it('round-trips buys, savings plans, dividends and keeps a sell negative', () => {
    for (const original of [tx({}), tx({ type: 'Sparplan_Buy' }), tx({ type: 'Dividend', shares: undefined, amount: 12 }), tx({ type: 'Sell', shares: -4, amount: 230, fee: -1, feeCurrency: 'CHF' })]) {
      expect(entryToTransaction(entryFromTransaction(original))).toEqual({ ...original, name: original.name });
    }
  });

  it('stores the trade direction in the sign of the quantity, whatever sign the importer used', () => {
    expect(entryFromTransaction(tx({ type: 'Sell', shares: 4 })).quantity).toBe(-4);
    expect(entryFromTransaction(tx({ type: 'Sell', shares: -4 })).quantity).toBe(-4);
    expect(entryFromTransaction(tx({ type: 'Buy', shares: -4 })).quantity).toBe(4);
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

    const transactions = ledgerToTransactions(getLedger(project));
    const history = calculatePortfolioHistory(
      transactions, Object.values(project.securities), project.fxData.rates, project.cashAccounts, 'CHF', 'MAX', 'daily'
    );
    const last = history[history.length - 1];

    expect(last.invested).toBeCloseTo(4000, 6);
  });

  it('does not count withholding tax or interest as dividends', () => {
    const transactions = ledgerToTransactions(getLedger(importedProject()));
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
