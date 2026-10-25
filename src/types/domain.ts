export type Currency = string; // 'EUR', 'USD', 'CHF', etc.
export type ISIN = string;

/** Transaction view of a ledger entry (calculations, edit form) and the shape importers produce. */
export interface Transaction {
    id: string;
    date: string; // ISO 8601
    type: 'Buy' | 'Sell' | 'Sparplan_Buy' | 'Dividend' | 'Tax' | 'Fee' | 'Interest' | 'Deposit' | 'Withdrawal' | 'Split';
    isin?: ISIN;
    name?: string; // Optional, might be filled from Security
    shares?: number;
    amount: number; // Positive for inflow/dividend, negative for buy/fee
    currency: Currency;
    exchangeRate?: number; // Transaction specific rate
    fee?: number; // Broker fees, negative = cost, in feeCurrency
    fxFee?: number; // Currency conversion fee (e.g. DEGIRO AutoFX), negative = cost, in feeCurrency; priced into the FX legs, so cost basis only, not cash
    feeCurrency?: Currency; // Defaults to the transaction currency
    externalId?: string; // Stable id from the import source (order id or row hash), used to skip duplicates
    broker: string;
    portfolioId?: string; // Link to specific portfolio
    originalData?: unknown; // To store raw CSV row for debugging
}

export interface Security {
    isin: ISIN;
    name: string;
    symbol?: string; // Ticker
    symbolStatus?: 'resolved' | 'unresolved' | 'ignored';
    symbolSource?: 'kursliste' | 'openfigi' | 'yahoo' | 'manual' | 'unknown';
    symbolLastTried?: string; // ISO Date of last resolve attempt
    ignoreMarketData?: boolean;
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

/** A source the app reads: DEGIRO export folder, IBKR Flex query, Trading 212 or comdirect API. */
export interface BrokerConnection {
    id: string;
    kind: 'degiro-folder' | 'ibkr-flex' | 'trading212' | 'comdirect';
    label: string; // e.g. the folder name
    portfolioId: string; // where imports go
    createdAt: string;
    lastCheckedAt?: string;
    lastImportAt?: string;
    lastFileModified?: number; // newest export already read (ms)
    lastResult?: { added: number; duplicates: number; files: string[] };
    queryId?: string; // IBKR Flex query id
    token?: string; // IBKR Flex token; only stored in encrypted project files
    environment?: 'live' | 'demo'; // Trading 212
    apiKey?: string; // Trading 212; only stored in encrypted project files
    apiSecret?: string; // Trading 212; only stored in encrypted project files
    clientId?: string; // comdirect API client; only stored in encrypted project files
    clientSecret?: string; // comdirect; only stored in encrypted project files
    username?: string; // comdirect Zugangsnummer; only stored in encrypted project files (the PIN never is)
}

export interface ProjectSettings {
    baseCurrency: Currency; // Portfolio display currency (e.g. EUR)
    performanceMethod?: 'MWR' | 'TWR';
    performanceSmoothing?: '1d' | '7d' | '1m';
    taxRate?: number;
    wealthGoal?: number; // Single stored target value
    wealthGoalCurrency?: Currency; // Currency in which wealthGoal was last saved
    theme?: 'dark' | 'light' | 'system';
    numberLocale?: 'de-DE' | 'de-CH' | 'de-AT' | 'en-US'; // separators for amounts
    brokerConnections?: BrokerConnection[]; // folder handles live in IndexedDB, keyed by connection id
}

export interface Portfolio {
    id: string;
    name: string;
}

export interface CashAccount {
    id: string;
    name: string;
    portfolioId?: string;
    currency: Currency;
    sourceKey?: string; // Optional import/source identifier to separate sub-ledgers per currency
    balanceHistory?: Record<string, number>; // YYYY-MM-DD -> end-of-day balance
}

/** Account-statement view of a ledger entry, and the shape statement importers produce. */
export interface CashMovement {
    id: string;
    date: string; // YYYY-MM-DD
    type: 'Deposit' | 'Withdrawal' | 'Dividend' | 'Tax' | 'Fee' | 'Interest' | 'Transfer' | 'Adjustment';
    amount: number; // Positive = inflow, negative = outflow (account perspective)
    currency: Currency;
    description?: string;
    isin?: ISIN; // Security the booking belongs to (dividends, withholding tax)
    name?: string;
    broker: string;
    portfolioId?: string;
    isInternal?: boolean;
    sourceKey?: string; // Import key for deduplication across repeated imports
    originalData?: unknown;
}

export type LedgerKind =
    | 'buy' | 'sell' | 'dividend' | 'withholding_tax' | 'tax' | 'fee' | 'interest'
    | 'deposit' | 'withdrawal' | 'fx' | 'transfer' | 'split' | 'adjustment';

/**
 * One booking, whatever it came from (manual entry, CSV, broker API). The ledger is the
 * only stored list of bookings; holdings, cash, dividends and performance derive from it.
 * Signs come from the source: amount > 0 = cash in, < 0 = cash out, in `currency`.
 */
export interface LedgerEntry {
    id: string;
    source: string; // broker or importer, e.g. 'Flatex', 'IBKR', 'Trading 212', 'comdirect', 'CSV', 'Manual'
    externalId?: string; // stable id from the source (order id, row hash); dedupes repeated imports
    orderId?: string; // broker order reference; links fee rows of a statement to their trade
    portfolioId?: string;
    date: string; // YYYY-MM-DD (value date where known)
    kind: LedgerKind;
    savingsPlan?: boolean; // buy from a savings plan
    isin?: ISIN;
    name?: string;
    quantity?: number; // signed: + bought, - sold
    amount: number;
    currency: Currency;
    fee?: number; // negative = cost, in feeCurrency
    fxFee?: number; // currency conversion fee, negative = cost, in feeCurrency; priced into the FX legs, so cost basis only, not cash
    feeCurrency?: Currency; // defaults to `currency`
    fxRate?: number;
    internal?: boolean; // moves money within the broker (FX legs, sweeps): neither income nor deposit
    description?: string;
    raw?: unknown; // source row, for debugging
}

export interface ProjectData {
    version: number;
    id: string; // UUID
    name: string;
    created: string;
    modified: string;

    settings: ProjectSettings;
    portfolios: Portfolio[]; // List of user portfolios
    ledger: LedgerEntry[]; // all bookings, sorted by date
    securities: Record<ISIN, Security>;
    cashAccounts?: CashAccount[]; // balances reported by the broker (for reconciliation and cash display)
    fxData: FxData;
}

/** v3: one ledger instead of transactions + cash movements. Older files are not read. */
export const CURRENT_PROJECT_VERSION = 3;

export const createEmptyProject = (name: string = 'Mein Portfolio'): ProjectData => ({
    version: CURRENT_PROJECT_VERSION,
    id: crypto.randomUUID(),
    name,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    settings: {
        baseCurrency: 'EUR',
        performanceMethod: 'MWR',
        performanceSmoothing: '1d',
        wealthGoal: 100000,
        wealthGoalCurrency: 'EUR',
        theme: 'system',
    },
    ledger: [],
    securities: {},
    cashAccounts: [],
    fxData: {
        baseCurrency: 'EUR',
        rates: {},
        lastUpdated: ''
    },
    portfolios: []
});
