import { calculateHoldings, type Holding } from '@/lib/portfolioUtils';
import { type CashAccount, type ProjectData, type Security, type Transaction } from '@/types/domain';

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
