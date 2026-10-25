import { createEmptyProject, type ProjectData, type Security, type Transaction } from '@/types/domain';

// Demo portfolio with well-known public securities, to try the app without own data.
// Trades and amounts are made up; prices come from the normal market data sync.

const PORTFOLIO_ID = 'demo-depot';

const SECURITIES: Security[] = [
    { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World UCITS ETF', symbol: 'EUNL.DE', currency: 'EUR', quoteType: 'ETF' },
    { isin: 'US0378331005', name: 'Apple Inc.', symbol: 'AAPL', currency: 'USD', quoteType: 'Stock' },
    { isin: 'US5949181045', name: 'Microsoft Corp.', symbol: 'MSFT', currency: 'USD', quoteType: 'Stock' },
    { isin: 'DE0007164600', name: 'SAP SE', symbol: 'SAP.DE', currency: 'EUR', quoteType: 'Stock' }
].map((sec) => ({ ...sec, symbolStatus: 'resolved', symbolSource: 'manual' } as Security));

const pad = (n: number) => String(n).padStart(2, '0');
const roundCents = (value: number) => Math.round(value * 100) / 100;

export const createDemoProject = (now: Date = new Date()): ProjectData => {
    const project = createEmptyProject('Demo-Portfolio');
    project.portfolios = [{ id: PORTFOLIO_ID, name: 'Demo-Depot' }];
    project.securities = Object.fromEntries(SECURITIES.map((sec) => [sec.isin, sec]));

    const txs: Transaction[] = [];
    let seq = 0;
    const add = (tx: Omit<Transaction, 'id' | 'broker' | 'portfolioId'>) => {
        seq += 1;
        txs.push({ id: `demo-${seq}`, broker: 'Demo', portfolioId: PORTFOLIO_ID, ...tx });
    };
    const trade = (date: string, type: Transaction['type'], isin: string, shares: number, price: number, currency: string) => {
        const value = roundCents(shares * price);
        add({ date, type, isin, shares: type === 'Sell' ? -shares : shares, amount: type === 'Sell' ? value : -value, currency, fee: -1 });
    };

    add({ date: '2022-01-03', type: 'Deposit', amount: 10000, currency: 'EUR' });
    trade('2022-01-10', 'Buy', 'US0378331005', 10, 172, 'USD');
    trade('2022-03-15', 'Buy', 'US5949181045', 8, 285, 'USD');
    trade('2022-06-20', 'Buy', 'DE0007164600', 15, 92, 'EUR');
    trade('2023-05-08', 'Buy', 'US0378331005', 5, 172, 'USD');
    trade('2024-07-15', 'Sell', 'US0378331005', 4, 232, 'USD');

    // Monthly savings plan of 250 EUR into the MSCI World ETF, up to the current month
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let d = new Date(2022, 0, 1), month = 0; d <= end; d.setMonth(d.getMonth() + 1), month += 1) {
        const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-02`;
        add({ date, type: 'Deposit', amount: 250, currency: 'EUR' });
        const price = 72 * Math.pow(1.007, month);
        const shares = Math.floor((250 / price) * 1000) / 1000;
        add({ date, type: 'Sparplan_Buy', isin: 'IE00B4L5Y983', shares, amount: -roundCents(shares * price), currency: 'EUR' });
    }

    // Yearly dividends up to today
    for (let year = 2022; year <= now.getFullYear(); year += 1) {
        if (new Date(year, 4, 20) <= now) add({ date: `${year}-05-20`, type: 'Dividend', isin: 'DE0007164600', name: 'SAP SE', amount: 15 * 2.05, currency: 'EUR' });
        if (new Date(year, 5, 12) <= now) add({ date: `${year}-06-12`, type: 'Dividend', isin: 'US5949181045', name: 'Microsoft Corp.', amount: 8 * 0.68, currency: 'USD' });
    }

    project.transactions = txs.sort((a, b) => a.date.localeCompare(b.date));
    return project;
};
