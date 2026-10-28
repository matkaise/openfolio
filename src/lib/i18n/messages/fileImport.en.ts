import type { ImportGuide, fileImportDe } from './fileImport.de';

export const fileImportEn: typeof fileImportDe = {
    broker: 'Broker and format',
    chooseBroker: 'Choose a broker …',
    guideTitle: (broker: string) => `How to create the ${broker} export`,
    guideSections: {
        scope: 'Applies to',
        steps: 'Create the export',
        settings: 'Required settings',
        accounts: 'Several accounts and periods',
        supported: 'Imported',
        unsupported: 'Not imported',
        limits: 'Known limitations'
    },
    sources: 'Sources',
    verified: (date: string) => `Guide and format last checked on ${date}. Tested with synthetic sample files.`,
    dropFiles: (multiple: boolean) => (multiple ? 'Drop files here' : 'Drop file here'),
    orClick: (accept: string) => `or click to choose (${accept})`,
    reading: 'Reading file …',
    preview: {
        title: 'Preview',
        format: 'Detected format',
        files: 'Files',
        period: 'Period',
        periodValue: (from: string, to: string) => `${from} – ${to}`,
        rows: 'Rows read',
        newTrades: 'New buys/sells',
        newMovements: 'New account bookings',
        balances: 'Balances',
        duplicates: 'Already imported',
        ignored: 'Skipped, no booking effect',
        unsupported: 'Not imported',
        unsupportedHint: 'These rows have a financial effect that Openfolio does not import for this format yet. Add them manually if needed.',
        ignoredHint: 'Administrative rows without cash or position effect.',
        note: (line: number, label: string, file?: string) => `${file ? `${file}, ` : ''}line ${line}: ${label || '(no type)'}`,
        more: (count: number) => `… and ${count} more`,
        nothingNew: 'Every booking in this file is already in the portfolio.'
    },
    switched: (broker: string) => `The file was recognised as a ${broker} export.`,
    errors: {
        title: 'Import not possible',
        unknownFormat: 'The file format was not recognised. Please create the export as described in the guide; several files must all come from the same broker.',
        noRows: 'The file contains no booking rows.',
        invalidNumber: (line?: number) => `Number in an unexpected format${line ? ` (line ${line})` : ''}. Please check the export and its language setting.`,
        invalidDate: (line?: number) => `Date in an unexpected format${line ? ` (line ${line})` : ''}. Please check the export and its language setting.`
    },
    variants: {
        degiro: {
            transactions: 'Transactions.csv (buys/sells)',
            account: 'Account.csv (account statement)'
        },
        trading212: {
            standard: 'CSV history export',
            utc: 'CSV history export (time in UTC)'
        },
        swissquote: {
            'en-13': 'CSV, English (13 columns)',
            'en-15': 'CSV, English (15 columns, with net amount in account currency)',
            'de-15': 'CSV, German (15 columns, with net amount in account currency)',
            'de-13': 'CSV, German (13 columns)'
        }
    },
    guides: {
        degiro: {
            scope: 'flatexDEGIRO accounts; exports with German column names.',
            steps: [
                'Transactions (main menu or Inbox): choose the period → Export → CSV. Result: Transactions.csv with buys and sells.',
                'Inbox → Account statement: choose the same period → Export → CSV. Result: Account.csv with dividends, taxes, fees, deposits and withdrawals.',
                'Drop both files here together.'
            ],
            settings: [
                'DEGIRO interface language: German. The columns are expected in German.',
                'Period ideally from account opening, so holdings and cash are complete.'
            ],
            accounts: 'Use one portfolio per DEGIRO account. Foreign currency sub-accounts are in the same Account.csv. Repeated or overlapping exports are not booked twice.',
            supported: [
                'Buys and sells with transaction and AutoFX fees',
                'Dividends, capital repayments and taxes',
                'Interest, fees, deposits and withdrawals',
                'Currency exchanges between sub-accounts and balances per currency'
            ],
            unsupported: [
                'Corporate actions are not recognised as position bookings of their own.'
            ],
            limits: [
                'Unknown booking texts in Account.csv are booked as adjustments.',
                'DEGIRO exports in English are not recognised yet.'
            ]
        },
        trading212: {
            scope: 'Trading 212 Invest and ISA accounts (history export as CSV). Not for CFD accounts.',
            steps: [
                'Open the menu (three lines) → History; the web app works the same way.',
                'Tap the file icon at the top right (Export history).',
                'Choose the period from account opening and tick orders, dividends, transactions and interest.',
                'Choose Export CSV and save the file via Download once it is ready.'
            ],
            settings: [
                'Select all four data types, otherwise bookings are missing.',
                'Do not open and re-save the file in Excel.'
            ],
            accounts: 'Use one portfolio and one export per Trading 212 account (Invest, ISA). Do not use it in addition to the Trading 212 API connection in the same portfolio: CSV and API use different ids, bookings would appear twice. Overlapping CSV exports are not booked twice.',
            supported: [
                'Market, limit and stop buys/sells in the instrument currency; stamp duty, conversion fee and other cost columns as fees',
                'Dividends (net, as credited; withholding tax is in the booking text)',
                'Interest on cash and from share lending',
                'Deposits and withdrawals',
                'Currency conversions, if the conversion columns are in the export'
            ],
            unsupported: [
                'Stock splits, stock distributions, security transfers (Transfer in/out) and other corporate actions: shown as not imported.',
                'Card payments, cashback and other account types.'
            ],
            limits: [
                'Buys and sells are booked in the instrument currency, as with the API import; the account currency balance is settled by the cash model.',
                'The date comes from the export time (UTC); bookings shortly after midnight can be one day off.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        swissquote: {
            scope: 'Swissquote trading accounts (eTrading). Not for Yuh, Swissquote crypto or PDF statements.',
            steps: [
                'In eTrading open Portfolio → Transactions.',
                'Under Period choose the date range (ideally from account opening) and click Apply.',
                'Click Download at the top right and choose CSV report.',
                'Drop the file here unchanged.'
            ],
            settings: [
                'Display language preferably English (My Account → Settings → Display language). German exports are read, but only the confirmed booking types (Kauf, Verkauf, Dividende, Depotgebühren, Zinsen, Zahlung) are recognised.',
                'Keep all transaction types included in the filter.',
                'Do not open and re-save the file in Excel: separators and number format would change.'
            ],
            accounts: 'Use one portfolio per Swissquote account; the export has no account number. Foreign currencies of the same account are in the same file. Overlapping exports are not booked twice.',
            supported: [
                'Buys and sells; costs are imported as fees',
                'Dividends (net amount as exported)',
                'Custody fees, interest (also negative) and tax statement costs',
                'Deposits (Payment, Credit) and withdrawals (Debit), transfer costs as fees',
                'Currency exchanges (Forex credit/debit) as internal transfers between currencies',
                'Bookings in a currency other than the account currency, with conversion (15-column export)'
            ],
            unsupported: [
                'Security transfers (Transfer in/out), subscription rights, splits and other corporate actions: shown as not imported in the preview.',
                'Withholding tax: Swissquote does not show it separately in the export; it is not estimated.'
            ],
            limits: [
                'Dividends are booked with the net amount, because the export has no gross amount with tax.',
                'The format is only tested with synthetic files based on public samples, not with current original exports.'
            ]
        }
    } satisfies Record<string, ImportGuide>
};
