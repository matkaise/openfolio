import { describe, expect, it } from 'vitest';
import { calculatePortfolioHistory } from '@/lib/portfolioUtils';
import { calculateAnalysisMetrics } from '@/lib/analysisService';
import { normalizeInvestedForExplicitCash } from '@/lib/performanceUtils';
import { type FxData } from '@/types/domain';
import { computeAnalysis, computeMaxHistory, createHistoryInput, type AnalysisInput } from '../portfolioCalculations';

const fxData: FxData = {
    baseCurrency: 'EUR',
    rates: {
        USD: { '2024-01-01': 1.1, '2024-01-05': 1.08 },
        GBP: { '2024-01-01': 0.86, '2024-01-04': 0.87 },
        CHF: { '2024-01-01': 0.93, '2024-01-06': 0.94 },
        JPY: { '2024-01-01': 157, '2024-01-03': 158 },
        SEK: { '2024-01-01': 11.1 }
    },
    lastUpdated: '2024-01-08'
};

const input: AnalysisInput = {
    transactions: [
        { id: 'd1', date: '2024-01-01', type: 'Deposit', amount: 2000, currency: 'EUR', broker: 'Test' },
        { id: 'b1', date: '2024-01-02', type: 'Buy', isin: 'TEST0000001', shares: 10, amount: -100, currency: 'EUR', broker: 'Test' },
        { id: 'b2', date: '2024-01-03', type: 'Buy', isin: 'TEST0000002', shares: 5, amount: -50, currency: 'USD', fee: -2, feeCurrency: 'CHF', broker: 'Test' },
        { id: 'b3', date: '2024-01-03', type: 'Buy', isin: 'TEST0000003', shares: 20, amount: -2000, currency: 'GBp', broker: 'Test' },
        { id: 'v1', date: '2024-01-05', type: 'Dividend', isin: 'TEST0000001', amount: 3, currency: 'EUR', broker: 'Test' }
    ],
    securities: [
        { isin: 'TEST0000001', name: 'Test A', currency: 'EUR', priceHistory: { '2024-01-02': 10, '2024-01-04': 11, '2024-01-08': 9 } },
        { isin: 'TEST0000002', name: 'Test B', currency: 'USD', priceHistory: { '2024-01-03': 10, '2024-01-05': 12 } },
        { isin: 'TEST0000003', name: 'Test C', currency: 'GBp', priceHistory: { '2024-01-03': 100, '2024-01-06': 104 } }
    ],
    fxData,
    cashAccounts: [{ id: 'c1', name: 'Test-Konto', currency: 'EUR', balanceHistory: { '2024-01-01': 2000, '2024-01-03': 1850 } }],
    baseCurrency: 'EUR',
    riskFreeRate: 0.02
};

describe('portfolio calculations for the worker', () => {
    it('matches the direct calculation the analysis page used before', () => {
        const history = calculatePortfolioHistory(input.transactions, input.securities, fxData.rates, input.cashAccounts, 'EUR', 'MAX', 'daily');
        const normalized = normalizeInvestedForExplicitCash(history, input.transactions, input.cashAccounts, fxData, 'EUR');

        expect(computeMaxHistory(input)).toEqual(history);
        expect(computeAnalysis(input)).toEqual({
            historyData: normalized,
            metrics: {
                withDividends: calculateAnalysisMetrics(normalized, 0.02, { includeDividends: true }),
                withoutDividends: calculateAnalysisMetrics(normalized, 0.02, { includeDividends: false })
            }
        });
    });

    it('sends only the FX rates of the currencies involved, with the same results', () => {
        const picked = createHistoryInput(input.transactions, input.securities, fxData, input.cashAccounts, 'EUR');

        // GBp resolves to GBP, the fee currency CHF is kept, JPY and SEK are not needed
        expect(Object.keys(picked.fxData.rates).sort()).toEqual(['CHF', 'GBP', 'USD']);
        expect(picked.fxData.rates.USD).toBe(fxData.rates.USD);
        expect(computeAnalysis({ ...picked, riskFreeRate: 0.02 })).toEqual(computeAnalysis(input));
    });

    it('keeps the rates of the base currency', () => {
        const picked = createHistoryInput(input.transactions.slice(0, 2), input.securities.slice(0, 1), fxData, [], 'CHF');

        expect(Object.keys(picked.fxData.rates)).toEqual(['CHF']);
    });

    it('returns data that survives structured cloning unchanged', () => {
        const result = computeAnalysis(input);
        expect(structuredClone(result)).toEqual(result);
        expect(structuredClone(input)).toEqual(input);
    });
});
