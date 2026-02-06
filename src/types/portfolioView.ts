import { type AnalysisMetrics } from '@/lib/portfolioUtils';
import { type Transaction, type Security } from '@/types/domain';

export type HistoryPoint = { date: string; value: number; invested: number; dividend?: number };
export type AnalysisCache = { key: string; historyData: HistoryPoint[]; analysisMetrics: AnalysisMetrics };
export type PerformanceRow = { date: string; [key: string]: string | number | undefined };
export type TransactionLike = Omit<Transaction, 'type'> & {
  type: Transaction['type'] | 'Sparplan_Buy';
  quantity?: number;
  pricePerShare?: number;
  price?: number;
};
export type DeletedTxEntry = { tx: TransactionLike; deletedAt: string };
export type DividendHistoryEntry = NonNullable<Security['dividendHistory']>[number];
export type UpcomingDividendEntry = NonNullable<Security['upcomingDividends']>[number];
export type EventEntry = { time: number; type: 'Tx' | 'Split'; data?: TransactionLike; ratio?: number };
