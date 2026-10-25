import { calculatePortfolioHistory, type AnalysisMetrics } from '@/lib/portfolioUtils';
import { calculateAnalysisMetrics } from '@/lib/analysisService';
import { normalizeInvestedForExplicitCash } from '@/lib/performanceUtils';
import { pickFxRates } from '@/lib/domain/fx/rates';
import { type CashAccount, type FxData, type Security, type Transaction } from '@/types/domain';
import { type HistoryPoint } from '@/types/portfolioView';

// The heavy portfolio calculations, as pure functions of plain data. They run in the
// calculation worker (calculations.worker.ts) and, where no Worker exists, on the main thread.
// Inputs and results must survive structured cloning: no functions, no class instances.

export interface HistoryInput {
    transactions: Transaction[];
    securities: Security[];
    fxData: FxData;
    cashAccounts: CashAccount[];
    baseCurrency: string;
}

export interface AnalysisInput extends HistoryInput {
    riskFreeRate: number;
}

export interface AnalysisResult {
    historyData: HistoryPoint[];
    /** Both variants, so switching dividends on or off needs no new calculation. */
    metrics: { withDividends: AnalysisMetrics; withoutDividends: AnalysisMetrics };
}

/**
 * Input for the calculations with only the FX rates of the currencies involved. The full
 * ECB table has decades of rates for ~30 currencies; copying it to the worker would cost
 * the main thread about as much time as the calculation itself.
 */
export const createHistoryInput = (
    transactions: Transaction[],
    securities: Security[],
    fxData: FxData,
    cashAccounts: CashAccount[],
    baseCurrency: string
): HistoryInput => {
    const currencies = new Set<string | undefined>([baseCurrency]);
    transactions.forEach((tx) => { currencies.add(tx.currency); currencies.add(tx.feeCurrency); });
    securities.forEach((sec) => currencies.add(sec.currency));
    cashAccounts.forEach((account) => currencies.add(account.currency));
    return {
        transactions,
        securities,
        fxData: { ...fxData, rates: pickFxRates(fxData.rates, currencies) },
        cashAccounts,
        baseCurrency
    };
};

/** Daily portfolio history over the whole holding period. */
export const computeMaxHistory = (input: HistoryInput): ReturnType<typeof calculatePortfolioHistory> =>
    calculatePortfolioHistory(
        input.transactions,
        input.securities,
        input.fxData.rates,
        input.cashAccounts,
        input.baseCurrency,
        'MAX',
        'daily'
    );

/** Full daily history with invested capital normalized for explicit cash, plus the risk and return metrics. */
export const computeAnalysis = (input: AnalysisInput): AnalysisResult => {
    const historyData = normalizeInvestedForExplicitCash(
        computeMaxHistory(input),
        input.transactions,
        input.cashAccounts,
        input.fxData,
        input.baseCurrency
    );
    return {
        historyData,
        metrics: {
            withDividends: calculateAnalysisMetrics(historyData, input.riskFreeRate, { includeDividends: true }),
            withoutDividends: calculateAnalysisMetrics(historyData, input.riskFreeRate, { includeDividends: false })
        }
    };
};

export const calculations = { computeAnalysis, computeMaxHistory };

export type Calculations = typeof calculations;
export type CalculationName = keyof Calculations;
export type CalculationInput<K extends CalculationName> = Parameters<Calculations[K]>[0];
export type CalculationResult<K extends CalculationName> = ReturnType<Calculations[K]>;
