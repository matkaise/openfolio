import { describe, expect, it } from 'vitest';
import { createDemoProject } from '../demoProject';
import { parseProjectData } from '../schemas/project';
import { calculateHoldings } from '../portfolioUtils';

describe('createDemoProject', () => {
  it('is a valid project with open positions in all four securities', () => {
    const project = parseProjectData(createDemoProject(new Date(2026, 9, 25)));
    const { holdings } = calculateHoldings(project.transactions, Object.values(project.securities), undefined, {}, 'EUR');
    expect(holdings.map((h) => h.security.isin).sort()).toEqual(['DE0007164600', 'IE00B4L5Y983', 'US0378331005', 'US5949181045']);
    expect(holdings.find((h) => h.security.isin === 'US0378331005')?.quantity).toBe(11);
  });

  it('runs the savings plan up to the given month and keeps ids unique', () => {
    const project = createDemoProject(new Date(2023, 0, 15));
    const plan = project.transactions.filter((tx) => tx.type === 'Sparplan_Buy');
    expect(plan).toHaveLength(13);
    expect(plan.at(-1)?.date).toBe('2023-01-02');
    expect(new Set(project.transactions.map((tx) => tx.id)).size).toBe(project.transactions.length);
  });

  it('books dividends up to the given date, including the current year', () => {
    const dates = (now: Date) => createDemoProject(now).transactions.filter((tx) => tx.type === 'Dividend').map((tx) => tx.date);
    expect(dates(new Date(2026, 9, 25))).toContain('2026-06-12');
    expect(dates(new Date(2026, 4, 25))).toContain('2026-05-20');
    expect(dates(new Date(2026, 4, 25))).not.toContain('2026-06-12');
  });
});
