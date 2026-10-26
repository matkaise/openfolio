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

    errors: {
        title: 'Something went wrong',
        unknown: 'An unknown error occurred. Your project file was not changed.',
        retry: 'Try again',
        criticalTitle: 'Critical error',
        criticalText: 'Openfolio could not be loaded. Your project file was not changed.',
        reload: 'Reload'
    }
};
