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
        invalidDate: (line?: number) => `Date in an unexpected format${line ? ` (line ${line})` : ''}. Please check the export and its language setting.`,
        severalAccounts: 'The file contains bookings of several accounts (e.g. main account and junior depot). Please create one export per account and import each into its own portfolio.',
        missingCurrency: 'The account currency cannot be determined. XTB only puts it in the file name (e.g. EUR_account_….csv); please keep the file name when saving as CSV.'
    },
    variants: {
        degiro: {
            transactions: 'Transactions.csv (buys/sells)',
            account: 'Account.csv (account statement)'
        },
        swissquote: {
            'en-13': 'CSV, English (13 columns)',
            'en-15': 'CSV, English (15 columns, with net amount in account currency)',
            'de-15': 'CSV, German (15 columns, with net amount in account currency)',
            'de-13': 'CSV, German (13 columns)'
        },
        traderepublic: {
            comma: 'Transaction export CSV (comma)',
            semicolon: 'Transaction export CSV (semicolon)'
        },
        xtb: {
            'cash-8': 'Cash Operations as CSV (8 columns, semicolon)',
            'cash-8-comma': 'Cash Operations as CSV (8 columns, comma)',
            'cash-10': 'Cash Operations as CSV (10 columns, semicolon)',
            'cash-10-comma': 'Cash Operations as CSV (10 columns, comma)',
            legacy: 'Former CSV export (6 columns)'
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
        },
        traderepublic: {
            scope: 'Trade Republic accounts (securities and cash account); the native transaction export available since April 2026. Not for CSV files of the pytr tool or for PDF statements.',
            steps: [
                'In the Trade Republic app tap your profile picture ("Profile" or "Service", depending on the app version).',
                'Open Statements (Kontoauszüge) → Transaction export (Transaktionsexport).',
                'Choose the period, ideally from account opening, and tap Create or Share.',
                'Drop the CSV file here unchanged.'
            ],
            settings: [
                'Export the full period if possible: holdings and cash only add up from the complete history.',
                'Do not open and re-save the file in Excel: separators and number format could change.'
            ],
            accounts: 'Export the main account and a junior depot separately and import them into separate portfolios; a file with several accounts is refused. Repeated or overlapping exports are not booked twice, thanks to the transaction ID.',
            supported: [
                'Buys and sells (including savings plans and fractional shares) with fee; tax on sales as a tax booking of its own',
                'Dividends and distributions gross with the tax withheld; reversals and re-bookings of dividends',
                'Interest on cash with tax, bond coupons, repayment of matured bonds and warrants',
                'Advance lump-sum tax (Vorabpauschale), tax optimisation and tax refunds',
                'Deposits and withdrawals, transfers, card payments and refunds, gifts, Saveback and bonuses; card top-up fees as a fee of their own'
            ],
            unsupported: [
                'Crypto: the export has no ISIN for it; the rows are shown as not imported.',
                'Private markets pre-payments, splits, mergers, exchanges and other corporate actions as well as unknown booking types: shown as not imported in the preview.'
            ],
            limits: [
                'Saveback and bonuses are booked as deposits, not as income.',
                'The tax on dividends is one sum of withholding and German capital gains tax in the export and is not split.',
                'The export has no balances; cash is calculated from the bookings.',
                'The format is only tested with synthetic files based on public samples, not with current original exports.'
            ]
        },
        xtb: {
            scope: 'XTB trading accounts (xStation), stocks and ETFs. One export per account or account currency. CFD positions are not imported.',
            steps: [
                'In xStation click "Account history" at the top, then "Cash operations".',
                'Choose Export, set the period (ideally from account opening) and the report "Cash Operations", and export it. XTB delivers an Excel file (XLSX), e.g. EUR_account_2025-01-01_2025-06-30.xlsx.',
                'Open the file in Excel or LibreOffice, select the sheet "Cash Operations" and use "Save as → CSV UTF-8 (comma delimited)". Keep the file name with the currency at the start.',
                'Drop the CSV file here. The XLSX file itself is not read, nor is an XLSX file that was only renamed.'
            ],
            settings: [
                'The account currency is only in the file name (EUR_, USD_, PLN_ …). Without it the file is refused.',
                'Separator and decimal mark depend on the spreadsheet program: semicolon with decimal comma (e.g. German settings) and comma with decimal point (English settings) are both read.',
                'Older direct CSV exports (columns ID;Type;Time;Symbol;Comment;Amount) are read as well.'
            ],
            accounts: 'Export each XTB account (e.g. EUR and USD account) separately; the account number in the file keeps the bookings apart. Transfers between sub-accounts in the same file (My Trades, Investment Plans) cancel out. Repeated or overlapping exports are not booked twice, thanks to the operation ID.',
            supported: [
                'Buys and sells of stocks and ETFs; quantity and price from the comment (OPEN BUY … @ …), partial fills kept apart',
                'Dividends and withholding tax (as tax of the position, not as a fee)',
                'Financial transaction tax (Tax IFTT), commissions and SEC fees',
                'Interest on free funds and its tax, including corrections',
                'Deposits and withdrawals'
            ],
            unsupported: [
                'CFD bookings: results of closed positions (Close trade, Profit/Loss), swap/rollover and dividend adjustments on CFDs.',
                'Spin-offs and transfers to other XTB accounts.',
                'Unknown or non-English booking types (e.g. Czech texts) are shown as not imported in the preview.'
            ],
            limits: [
                'The export has no ISIN. Securities are created under the XTB ticker (e.g. SPYL.DE, FB.US) and resolved by the quote update; please correct tickers that cannot be resolved in the security details. The same security held with ISIN in another portfolio is not merged.',
                'CFD and stock are told apart by booking type and ticker (stocks and ETFs have an exchange suffix such as .DE or .US). A CFD with an exchange suffix is only recognised by its type.',
                'The export has no balances; cash is calculated from the bookings.',
                'The format is only tested with synthetic files based on public samples, not with current original exports.'
            ]
        }
    } satisfies Record<string, ImportGuide>
};
