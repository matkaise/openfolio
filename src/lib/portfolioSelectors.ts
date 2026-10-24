import { calculateHoldings, type Holding } from '@/lib/portfolioUtils';
import { getProjectLedger, ledgerToTransactions } from '@/lib/domain/ledger/buildLedger';
import { type CashAccount, type ProjectData, type Security, type Transaction } from '@/types/domain';

const resolveActivePortfolioIds = (project: ProjectData, selectedPortfolioIds: string[]): string[] | null => {
  if (selectedPortfolioIds.length === 0) return null;
  const validPortfolioIds = new Set((project.portfolios || []).map((portfolio) => portfolio.id));
  const activeIds = selectedPortfolioIds.filter((id) => validPortfolioIds.has(id));
  return activeIds.length > 0 ? activeIds : null;
};

const calculationTransactionsCache = new WeakMap<ProjectData, Transaction[]>();

/**
 * Input for all figures (holdings, history, cash, dividends): the ledger as transactions.
 * Includes imported account rows (dividends, taxes, interest, deposits) with their sign.
 * Use filterTransactionsByPortfolio only to list or edit the stored transactions.
 */
export const selectCalculationTransactions = (
  project: ProjectData | null,
  selectedPortfolioIds: string[]
): Transaction[] => {
  if (!project) return [];
  let all = calculationTransactionsCache.get(project);
  if (!all) {
    all = ledgerToTransactions(getProjectLedger(project));
    calculationTransactionsCache.set(project, all);
  }
  const activeIds = resolveActivePortfolioIds(project, selectedPortfolioIds);
  if (!activeIds) return all;
  return all.filter((t) => t.portfolioId && activeIds.includes(t.portfolioId));
};

export const filterTransactionsByPortfolio = (
  project: ProjectData | null,
  selectedPortfolioIds: string[]
): Transaction[] => {
  if (!project) return [];
  if (selectedPortfolioIds.length === 0) {
    return project.transactions;
  }

  const validPortfolioIds = new Set((project.portfolios || []).map((portfolio) => portfolio.id));
  const activeIds = selectedPortfolioIds.filter((id) => validPortfolioIds.has(id));
  if (activeIds.length === 0) {
    return project.transactions;
  }

  return project.transactions.filter(
    t => t.portfolioId && activeIds.includes(t.portfolioId)
  );
};

export const getLatestQuotes = (securities?: Record<string, Security>): Record<string, number> => {
  const quotes: Record<string, number> = {};
  if (!securities) return quotes;

  Object.values(securities).forEach(sec => {
    if (!sec.priceHistory) return;
    const dates = Object.keys(sec.priceHistory).sort();
    if (dates.length === 0) return;
    const lastDate = dates[dates.length - 1];
    quotes[sec.isin] = sec.priceHistory[lastDate];
  });

  return quotes;
};

export const filterCashAccountsByPortfolio = (
  project: ProjectData | null,
  selectedPortfolioIds: string[]
): CashAccount[] => {
  if (!project?.cashAccounts) return [];
  if (selectedPortfolioIds.length === 0) {
    return project.cashAccounts;
  }

  const validPortfolioIds = new Set((project.portfolios || []).map((portfolio) => portfolio.id));
  const activeIds = selectedPortfolioIds.filter((id) => validPortfolioIds.has(id));
  if (activeIds.length === 0) {
    return project.cashAccounts;
  }

  return project.cashAccounts.filter(
    a => !!a.portfolioId && activeIds.includes(a.portfolioId)
  );
};

export const calculateProjectHoldings = (
  project: ProjectData | null,
  transactions: Transaction[]
): { holdings: Holding[]; realizedPnL: number } => {
  if (!project) return { holdings: [], realizedPnL: 0 };

  const quotes = getLatestQuotes(project.securities);

  return calculateHoldings(
    transactions,
    Object.values(project.securities || {}),
    quotes,
    project.fxData.rates,
    project.settings.baseCurrency
  );
};
