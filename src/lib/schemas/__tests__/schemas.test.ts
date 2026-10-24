import { describe, expect, it } from 'vitest';
import { parseProjectData, ProjectFormatError } from '../project';
import { parseEcbResponse, parseYahooQuoteResponse } from '../api';
import { createEmptyProject } from '@/types/domain';

describe('parseProjectData', () => {
  it('accepts a new project and keeps unknown fields', () => {
    const project = { ...createEmptyProject('Test'), futureField: 1 };
    const parsed = parseProjectData(project);
    expect(parsed.name).toBe('Test');
    expect((parsed as unknown as { futureField: number }).futureField).toBe(1);
  });

  it('fills defaults that old files may lack', () => {
    const { portfolios: _p, cashAccounts: _c, ...old } = createEmptyProject();
    void _p; void _c;
    const parsed = parseProjectData({ ...old, settings: {} });
    expect(parsed.portfolios).toEqual([]);
    expect(parsed.settings.baseCurrency).toBe('EUR');
  });

  it('rejects broken transactions with a readable message', () => {
    const project = createEmptyProject();
    const broken = {
      ...project,
      transactions: [
        { id: '1', date: '2024-01-01', type: 'Buy', isin: 'X', shares: 1, amount: -10, currency: 'EUR', broker: 'T' },
        { id: '2', date: '2024-01-02', type: 'Kauf', amount: 'zehn', currency: 'EUR', broker: 'T' }
      ]
    };
    expect(() => parseProjectData(broken)).toThrow(ProjectFormatError);
    try {
      parseProjectData(broken);
    } catch (error) {
      expect((error as Error).message).toContain('transactions.1');
    }
  });

  it('rejects something that is not a project at all', () => {
    expect(() => parseProjectData({ hello: 'world' })).toThrow(ProjectFormatError);
    expect(() => parseProjectData(null)).toThrow(ProjectFormatError);
  });
});

describe('API response schemas', () => {
  it('accepts an ECB proxy answer and rejects garbage', () => {
    expect(parseEcbResponse({ success: true, count: 1, data: [{ date: '2024-01-02', rates: { EUR: 1, USD: 1.1 } }] }).data).toHaveLength(1);
    expect(() => parseEcbResponse({ success: true, data: 'oops' })).toThrow();
  });

  it('accepts a Yahoo answer, drops invalid points and rejects a missing history', () => {
    const parsed = parseYahooQuoteResponse({
      history: { '2024-01-02': 10, '2024-01-03': null },
      splits: {},
      currency: 'USD',
      dividendHistory: [{ date: '2024-01-02', amount: 0.5 }, { date: 'x', amount: 'y' }]
    });
    expect(parsed.history).toEqual({ '2024-01-02': 10 });
    expect(parsed.dividendHistory).toEqual([{ date: '2024-01-02', amount: 0.5 }]);
    expect(() => parseYahooQuoteResponse({ error: 'nope' })).toThrow();
  });
});
