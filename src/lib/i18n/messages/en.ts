import type { Messages } from './de';

export const en: Messages = {
    common: {
        cancel: 'Cancel',
        ok: 'OK',
        open: 'Open',
        create: 'Create',
        close: 'Close',
        save: 'Save',
        unknown: 'Unknown',
        all: 'All'
    },

    language: {
        label: 'Language',
        hint: 'Automatic follows your browser language.',
        system: 'Automatic'
    },

    theme: {
        label: 'Theme',
        hint: 'Dark, light or as set in your operating system.',
        dark: 'Dark',
        light: 'Light',
        system: 'System'
    },

    numberLocales: {
        'de-DE': '1.234,56 (Germany)',
        'de-CH': '1’234.56 (Switzerland)',
        'de-AT': '1 234,56 (Austria)',
        'en-US': '1,234.56 (English)'
    },

    labels: {
        security: 'Security',
        quoteTypes: { Stock: 'Stock', ETF: 'ETF', Fund: 'Fund', Crypto: 'Crypto', Bond: 'Bond' },
        transactionTypes: {
            Buy: 'Buy',
            Sparplan_Buy: 'Savings plan',
            Sell: 'Sell',
            Dividend: 'Dividend',
            Tax: 'Tax',
            Fee: 'Fee',
            Interest: 'Interest',
            Deposit: 'Deposit',
            Withdrawal: 'Withdrawal',
            Split: 'Split'
        },
        movementTypes: {
            Deposit: 'Deposit',
            Withdrawal: 'Withdrawal',
            Dividend: 'Dividend',
            Tax: 'Tax',
            Fee: 'Fee',
            Interest: 'Interest',
            Transfer: 'Transfer',
            Adjustment: 'Adjustment'
        }
    },

    shell: {
        mainNavigation: 'Main navigation',
        navigation: 'Navigation',
        nav: {
            Dashboard: 'Dashboard',
            Portfolio: 'Securities',
            Analyse: 'Analysis',
            Dividenden: 'Dividends',
            Transaktionen: 'Transactions',
            Datenquellen: 'Data sources',
            Broker: 'Brokers',
            Einstellungen: 'Settings',
            Import: 'Import'
        },
        headings: {
            Portfolio: { title: 'Securities', sub: 'Open and closed positions' },
            Analyse: { title: 'Analysis', sub: 'Risk, return and allocation' },
            Dividenden: { title: 'Dividends', sub: 'Received and expected distributions' },
            Transaktionen: { title: 'Transactions', sub: 'All bookings of your portfolios' },
            Datenquellen: { title: 'Data sources', sub: 'Prices, exchange rates and portfolios' },
            Broker: { title: 'Brokers', sub: 'Automatic import of your bookings' },
            Einstellungen: { title: 'Settings', sub: 'Appearance, language and calculation' },
            Import: { title: 'Import', sub: 'Choose a portfolio and add bookings' }
        },
        mobile: {
            Dashboard: 'Overview',
            Portfolio: 'Positions',
            Dividenden: 'Dividends',
            Transaktionen: 'Activity',
            more: 'More'
        },
        greeting: { morning: 'Good morning', day: 'Good afternoon', evening: 'Good evening' },
        syncActiveTitle: 'Auto sync on',
        syncActiveText: (count: number) => `${count} ${count === 1 ? 'broker' : 'brokers'} connected. Synced when the project opens.`,
        connectTitle: 'Connect a broker',
        connectText: 'Pick up new bookings automatically: DEGIRO folder, IBKR, Trading 212, comdirect.',
        displayCurrency: 'Display currency',
        appearance: 'Appearance',
        importButton: 'Import',
        addTransaction: '+ Transaction',
        inDevelopment: 'In development …',
        newPortfolio: 'New portfolio',
        closeProject: 'Close project',
        searchPlaceholder: 'Search securities',
        file: {
            untitled: 'Untitled.openfolio',
            unsaved: 'Unsaved changes',
            encrypted: 'Encrypted',
            unencrypted: 'Not encrypted',
            savedAt: (time: string) => `saved ${time}`,
            notSaved: 'not saved yet',
            saveNow: 'Save now',
            saved: 'Saved',
            saveUnsaved: 'Save (unsaved changes)'
        },
        refreshMarket: 'Update prices and exchange rates',
        missingFx: (currencies: string, count: number) => (
            `Missing rate: there is no exchange rate for ${currencies}. Amounts in ${count === 1 ? 'this currency are' : 'these currencies are'} not included in the totals.`
        ),
        startupSync: {
            title: 'Updating prices',
            subtitle: 'On opening the project · keeps running in the background if you close this',
            background: 'Continue in background',
            progress: (current: number, total: number) => `${current} of ${total} securities`,
            preparing: 'Preparing …'
        }
    },

    portfolioFilter: {
        label: 'Portfolio',
        selected: (count: number) => `${count} selected`
    },

    launcher: {
        tagline: 'Your portfolio. Your data. Local.',
        createTitle: 'Create a new portfolio',
        createText: 'Empty project, optionally encrypted with a password',
        openTitle: 'Open portfolio',
        openText: '.openfolio file from your device',
        demo: 'View demo (sample data, no account)',
        privacy: 'All data stays on your device. Openfolio sends nothing to cloud servers.',
        newPortfolio: 'New portfolio',
        projectName: 'Project name',
        defaultName: 'My portfolio',
        encryptionTitle: 'Encryption (optional)',
        encryptionText: 'AES-256. Without the password the file cannot be recovered.',
        password: 'Password',
        confirmPassword: 'Confirm password',
        enterPassword: 'Enter password',
        wrongPassword: 'Wrong password. Please try again.',
        encrypted: 'This project is encrypted.',
        passwordMissing: 'Please enter a password.',
        passwordMismatch: 'The passwords do not match.'
    },

    settings: {
        appearance: 'Appearance',
        numberFormat: 'Number format',
        numberFormatHint: 'Thousands and decimal separators for all amounts.',
        numberFormatAuto: 'Same as language',
        performance: 'Performance',
        method: 'Return calculation',
        methodHint: 'MWR takes deposits and withdrawals into account, TWR shows the pure investment strategy without cash flow effects.',
        methods: { MWR: 'Money-weighted (MWR)', TWR: 'Time-weighted (TWR)' },
        smoothing: 'Smoothing',
        smoothingHint: 'Only smooths how performance charts are drawn. Key figures stay unchanged.',
        smoothings: { '1d': '1 day', '7d': '7 days', '1m': '1 month' }
    },

    ranges: {
        short: { '1W': '1W', '1M': '1M', '6M': '6M', YTD: 'YTD', '1J': '1Y', '3J': '3Y', '5J': '5Y', MAX: 'MAX' },
        long: {
            '1W': '1 week', '1M': '1 month', '6M': '6 months', YTD: 'year to date', '1J': '1 year', '3J': '3 years', '5J': '5 years', MAX: 'since start'
        },
        label: 'Period'
    },

    assetClasses: {
        stocks: 'Stocks',
        etfs: 'ETFs',
        crypto: 'Crypto',
        funds: 'Funds',
        derivatives: 'Derivatives',
        indices: 'Indices',
        currencies: 'Currencies',
        cash: 'Cash',
        other: 'Other'
    },

    brokerMethods: { 'degiro-folder': 'Folder sync', 'ibkr-flex': 'Flex API', trading212: 'API', comdirect: 'API with TAN' },

    units: {
        shares: (quantity: string) => `${quantity} sh.`,
        billions: (value: string) => `${value} bn`
    },

    dashboard: {
        netWorth: 'Net worth',
        dayChangeTitle: 'Change since the last trading day',
        today: (percent: string) => `${percent} today`,
        twr: 'Time-weighted return',
        mwr: 'Money-weighted return',
        portfolio: 'Portfolio',
        legendValue: 'Portfolio',
        legendReturn: 'Return',
        legendInvested: 'Paid in',
        includeDividends: 'Include dividends',
        chartMode: 'View',
        modeValue: 'Value',
        modeReturn: 'Return %',
        invested: 'Invested',
        investedSub: 'Cost basis of positions',
        gain: 'Gain',
        gainSub: (total: string, range: string) => `${total} total · period ${range}`,
        annualReturn: 'Return p.a.',
        historyTooShort: 'History too short',
        mwrShort: 'Money-weighted (MWR)',
        cash: 'Cash',
        cashAccounts: (count: number, currencies: string) => `${count} ${count === 1 ? 'account' : 'accounts'} · ${currencies}`,
        cashDerived: 'From deposits, income and sales',
        goal: 'Wealth goal',
        saveGoal: 'Save goal',
        cancelEdit: 'Cancel editing',
        editGoal: 'Edit goal',
        goalProgress: (percent: string, remaining: string) => `${percent} reached · ${remaining} to go`,
        topPositions: 'Top positions',
        showAll: (count: number) => `All ${count} →`,
        noPositions: 'No positions yet. Add the first ones via “Import” or “+ Transaction”.',
        ofPortfolio: (percent: string) => `${percent} of portfolio`,
        dividends: 'Dividends',
        ytd: (amount: string) => `${amount} YTD`,
        dividendsChart: 'Dividends of the last 12 months',
        nextPayment: (date: string, forecast: boolean) => `Next payment · ${date}${forecast ? ' · forecast' : ''}`,
        noPayouts: 'No planned payouts known.',
        allocation: 'Allocation',
        assetClasses: 'Asset classes',
        nothingToAllocate: 'Nothing to allocate yet.',
        positions: (count: number) => (count === 1 ? 'position' : 'positions'),
        connectedBrokers: 'Connected brokers',
        syncOnOpen: 'Sync on open',
        noBroker: 'No broker connected yet.',
        connectBroker: '+ Connect broker',
        synced: {
            never: 'not synced yet',
            now: 'just synced',
            minutes: (count: number) => `synced ${count} min ago`,
            hours: (count: number) => `synced ${count} h ago`,
            days: (count: number) => `synced ${count} days ago`
        }
    },

    charts: {
        noData: 'No data available',
        noPrices: 'No price data for this period yet.',
        invested: (amount: string) => `Paid in ${amount}`,
        price: 'Price',
        performance: 'Performance',
        returnSubtitle: 'Performance in the period',
        emptyTitle: 'No data',
        emptyText: 'There are no values for this period.'
    },

    positions: {
        value: 'Portfolio value',
        openCount: (count: number) => `${count} open ${count === 1 ? 'position' : 'positions'}`,
        gain: 'Gain',
        onCost: (percent: string) => `${percent} on cost`,
        realized: 'Realized',
        closedCount: (count: number) => `${count} closed ${count === 1 ? 'position' : 'positions'}`,
        open: 'Open positions',
        sort: 'Sort order',
        sortValue: 'Value',
        sortReturn: 'Return',
        sortName: 'Name',
        emptyTitle: 'No positions yet',
        emptyText: 'Import your trades or add a transaction.',
        missingTicker: 'Ticker missing',
        noPrices: 'No prices',
        closed: 'Closed positions',
        closedEmptyTitle: 'No closed positions',
        closedEmptyText: 'Once you sell a position completely, it appears here with its result.',
        lastTrade: (date: string) => `last trade ${date}`
    },

    security: {
        tradesIn: (currency: string) => `Trades in ${currency}`,
        buy: 'Buy',
        sell: 'Sell',
        profile: 'Profile',
        country: 'Country',
        sector: 'Sector',
        industry: 'Industry',
        marketCap: 'Market cap',
        keyFigures: 'Key figures',
        pe: 'P/E',
        forwardPe: 'Forward P/E',
        eps: 'Earnings per share',
        revenue: 'Revenue',
        dividends: 'Dividends',
        dividendYield: 'Dividend yield',
        annualForecast: 'Annual (forecast)',
        nextExDate: 'Next ex-date'
    },

    errors: {
        title: 'Something went wrong',
        unknown: 'An unknown error occurred. Your project file was not changed.',
        retry: 'Try again',
        criticalTitle: 'Critical error',
        criticalText: 'Openfolio could not be loaded. Your project file was not changed.',
        reload: 'Reload'
    }
};
