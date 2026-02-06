export type Currency = string; // 'EUR', 'USD', 'CHF', etc.
export type ISIN = string;

export interface Transaction {
    id: string;
    date: string; // ISO 8601
    type: 'Buy' | 'Sell' | 'Dividend' | 'Tax' | 'Fee' | 'Deposit' | 'Withdrawal' | 'Split';
    isin?: ISIN;
    name?: string; // Optional, might be filled from Security
    shares?: number;
    amount: number; // Positive for inflow/dividend, negative for buy/fee
    currency: Currency;
    exchangeRate?: number; // Transaction specific rate
    broker: string;
    portfolioId?: string; // Link to specific portfolio
    originalData?: unknown; // To store raw CSV row for debugging
}

export interface Security {
    isin: ISIN;
    name: string;
    symbol?: string; // Ticker
    currency: Currency; // Trading currency
    sector?: string;
    region?: string;
    quoteType?: 'ETF' | 'Stock' | 'Crypto' | 'Fund' | 'Bond';
    priceHistory?: {
        [date: string]: number; // Close price (YYYY-MM-DD)
    };
    splits?: {
        [date: string]: number; // Ratio e.g. 20 for 20:1
    };
    // Enhanced Data
    marketCap?: number;
    trailingPE?: number; // KGV
    dividendYield?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    // Advanced Metrics
    totalRevenue?: number; // Umsatz
    forwardPE?: number;
    epsTrailingTwelveMonths?: number;
    epsForward?: number;
    earningsHistory?: {
        date: string; // Quarter
        eps: number;
    }[];
    // Profile
    country?: string;
    industry?: string;
    // Dividends
    annualDividendRate?: number; // Projected Annual Dividend
    dividendHistory?: {
        date: string; // YYYY-MM-DD
        amount: number;
    }[];
    upcomingDividends?: {
        exDate: string;
        paymentDate?: string;
        amount?: number;
    }[];
    dividendHistorySynced?: boolean;
    lastSync?: string; // ISO Date
}

// Stores daily rates for a currency against EUR (Base)
// f[date] = rate.  EUR/USD = 1.10 means 1 EUR = 1.10 USD.
export interface CurrencyHistory {
    [date: string]: number;
}

export interface FxData {
    baseCurrency: 'EUR'; // ECB data is EUR based
    rates: Record<Currency, CurrencyHistory>;
    lastUpdated: string; // ISO Date of last sync
}

export interface ProjectSettings {
    baseCurrency: Currency; // Portfolio display currency (e.g. EUR)
    taxRate?: number;
}

export interface Portfolio {
    id: string;
    name: string;
}

export interface ProjectData {
    version: number;
    id: string; // UUID
    name: string;
    created: string;
    modified: string;

    settings: ProjectSettings;
    portfolios: Portfolio[]; // List of user portfolios
    transactions: Transaction[];
    securities: Record<ISIN, Security>;
    fxData: FxData;
}

export const CURRENT_PROJECT_VERSION = 1;

export const createEmptyProject = (name: string = 'Mein Portfolio'): ProjectData => ({
    version: CURRENT_PROJECT_VERSION,
    id: crypto.randomUUID(),
    name,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    settings: {
        baseCurrency: 'EUR',
    },
    transactions: [],
    securities: {},
    fxData: {
        baseCurrency: 'EUR',
        rates: {},
        lastUpdated: ''
    },
    portfolios: []
});
