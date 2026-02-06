import { calculateHoldings, type Holding } from '@/lib/portfolioUtils';
import { type ProjectData, type Security, type Transaction } from '@/types/domain';

export const filterTransactionsByPortfolio = (
  project: ProjectData | null,
  selectedPortfolioIds: string[]
): Transaction[] => {
  if (!project) return [];
  if (selectedPortfolioIds.length === 0) {
    return project.transactions;
  }
  return project.transactions.filter(
    t => t.portfolioId && selectedPortfolioIds.includes(t.portfolioId)
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
