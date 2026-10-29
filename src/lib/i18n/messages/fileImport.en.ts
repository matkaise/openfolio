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
        documents: 'Documents read',
        newTrades: 'New buys/sells',
        newMovements: 'New account bookings',
        balances: 'Balances',
        duplicates: 'Already imported',
        ignored: 'Skipped, no booking effect',
        unsupported: 'Not imported',
        unsupportedHint: 'These rows have a financial effect that Openfolio does not import for this format yet. Add them manually if needed.',
        ignoredHint: 'Administrative rows without cash or position effect.',
        note: (line: number, label: string, file?: string, page?: number) => `${file ? `${file}, ` : ''}${page ? `page ${page}` : `line ${line}`}: ${label || '(no type)'}`,
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
        missingCurrency: 'The account currency cannot be determined. XTB only puts it in the file name (e.g. EUR_account_….csv); please keep the file name when saving as CSV.',
        unknownFile: (file: string) => `${file}: format not recognised. Please import only documents or exports of the same broker together.`,
        mixedFiles: 'The files come from different brokers or are in different formats. Please import each broker separately.',
        noTextLayer: (file?: string) => `${file ? `${file}: ` : ''}The PDF contains no readable text, probably a scan or a photo. Please download the original PDF from the broker; Openfolio does not offer text recognition (OCR).`,
        pdfEncrypted: (file?: string) => `${file ? `${file}: ` : ''}The PDF is password protected. Please save a copy without password and import it again.`,
        pdfUnreadable: (file?: string) => `${file ? `${file}: ` : ''}The PDF is damaged or cannot be read.`
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
        },
        saxo: {
            booked: 'Transactions export (saved from Excel as CSV, column "Booked Amount")',
            amount: 'Transactions export (saved from Excel as CSV, older column "Amount")'
        },
        schwab: {
            standard: 'CSV history export',
            titled: 'CSV history export (older form with title row)'
        },
        revolut: {
            comma: 'Investment account statement (CSV, comma)',
            semicolon: 'Investment account statement (CSV, semicolon)',
            tab: 'Investment account statement (TSV, tab)'
        },
        scalable: {
            de: 'Scalable Capital PDF settlement (German)',
            en: 'Scalable Capital PDF settlement (English)',
            baader: 'Baader Bank PDF settlement (until 2024)'
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
        },
        saxo: {
            scope: 'Saxo trading accounts (Saxo Bank and other Saxo entities): export of the transaction overview. Not a portfolio or positions report.',
            steps: [
                'Log in to Saxo (SaxoTrader or SaxoInvestor) and open Transactions in the account section; alternatively via your profile at the top right → Transaction overview.',
                'Set the period, ideally from account opening, and keep the filters trades, corporate actions and cash transfers switched on.',
                'Click Export and choose Excel. Saxo delivers an XLSX file.',
                'Open the XLSX file in Excel or LibreOffice and save it as CSV via File → Save as (comma or semicolon as separator).',
                'Drop the CSV file here.'
            ],
            settings: [
                'XLSX files are not read directly. When saving as CSV, do not delete columns or change number or date formats.',
                'Dates as in the export (e.g. 02-Apr-2025) or as 2025-04-02 or 02.04.2025. Dates with slashes are ambiguous and rejected.',
                'Amounts with decimal comma or decimal point, but the same throughout the file.',
                'English interface recommended. Dutch exports are read for buys (Koop).'
            ],
            accounts: 'Use one portfolio per Saxo account. The account currency is taken from the cash movements in the file; if they are in several currencies, converted bookings are shown as not imported. Overlapping exports are not booked twice.',
            supported: [
                'Buys and sells (Buy/Sell, Koop/Verkoop) with quantity and price from the booking text; the difference to the booked amount as fee',
                'Buys and sells in a foreign currency; the conversion is booked as an internal transfer between account and instrument currency',
                'Dividends (net amount as booked) and withholding tax if the export has it as a row of its own',
                'Deposits and withdrawals, custody and other fees, interest'
            ],
            unsupported: [
                'Corporate actions other than dividends (splits, spin-offs, mergers), security transfers and unknown booking texts: shown as not imported.',
                'Options, futures and CFDs (column "From Derivative" = Yes) are shown as not imported.',
                'Rows without ISIN are not matched to a security by their symbol.'
            ],
            limits: [
                'For buys in a foreign currency, fees and conversion costs are part of the converted amount and not shown separately.',
                'Withholding tax is not estimated. Dutch texts for cash movements, interest and taxes are not backed by public samples.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        schwab: {
            scope: 'Charles Schwab brokerage accounts in the US (account history as CSV). Not the positions export.',
            steps: [
                'Log in at schwab.com and open Accounts → History.',
                'Select the account at the top.',
                'Choose the period under Date Range (as far back as possible).',
                'Click Export and choose CSV; save the file and drop it here unchanged.'
            ],
            settings: [
                'Keep all transaction types in the export.',
                'Do not open and re-save the file in Excel: date and number formats would change.'
            ],
            accounts: 'Use one portfolio and one export per Schwab account. The file has no account number. According to a user report the history goes back about four years; older bookings are only in the PDF statements. Overlapping exports are not booked twice.',
            supported: [
                'Buys, sells and reinvestments (Reinvest Shares) with fees and commissions (Fees & Comm)',
                'Dividends and distributions (Cash Dividend, Qualified/Non-Qualified Div, Reinvest Dividend, Pr Yr …, Cap Gain …)',
                'Foreign Tax Paid as withholding tax, ADR and advisor fees, interest (including margin interest)',
                'Deposits and withdrawals (Wire, MoneyLink, Journal, Internal Transfer) with the sign of the export'
            ],
            unsupported: [
                'Splits, reverse splits, Stock Div Dist, spin-offs, mergers, name changes, conversions and Cash In Lieu: shown as not imported.',
                'Security transfers (Journaled Shares, Security Transfer) and options (Buy to Open, Sell to Close, …).',
                'Rows without symbol are not matched to a security.'
            ],
            limits: [
                'The export has tickers or CUSIPs, no ISIN. The security is looked up by ticker at the next price update; CUSIPs can usually not be matched automatically.',
                'All amounts in USD. For "as of" dates the booking date is used; the "as of" date stays in the raw data.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        revolut: {
            scope: 'Revolut investment account (stocks/ETFs): account statement as a spreadsheet. Not for crypto, commodities or the profit & loss statement.',
            steps: [
                'Open Invest at the bottom of the Revolut app.',
                'Tap More (…) and choose Documents.',
                'Choose Stocks or the brokerage account and tap Account statement.',
                'Choose the period from account opening and the spreadsheet format (CSV or Excel), not PDF.',
                'Open an Excel file in Excel or LibreOffice and save it as CSV. Drop CSV or TSV files here unchanged.'
            ],
            settings: [
                'Do not use the Profit & Loss statement or the Cost & Charges report: they have no individual bookings.',
                'Crypto is a separate export with other columns and is not read here.',
                'When saving as CSV, do not delete columns or change date or number formats. Dates with slashes are rejected.'
            ],
            accounts: 'Use one portfolio per Revolut investment account. Several currencies of the same account are in one file. Overlapping exports are not booked twice.',
            supported: [
                'Buys and sells (market, limit, stop) with the total amount as cash amount',
                'Dividends (net, as credited) and tax corrections shown as a row of their own',
                'Custody fees, deposits (cash top-up) and withdrawals (cash withdrawal)'
            ],
            unsupported: [
                'Stock splits: shown as not imported and never booked as a buy.',
                'Transfers between Revolut entities (Transfer from … to …) with quantity or amount: shown as not imported. They usually do not change holdings, please check.',
                'Rows without ticker are not matched to a security.'
            ],
            limits: [
                'Revolut does not show trading fees separately; they are part of the total amount.',
                'The export has tickers, no ISIN. The security is looked up by ticker at the next price update.',
                'The date comes from the export time (UTC); bookings shortly after midnight can be one day off. Withholding tax is not estimated.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        scalable: {
            scope: 'Scalable Capital Broker (custody at Scalable Capital Bank) with settlements in German or English, and earlier Baader Bank settlements for Scalable clients (broker and wealth management until 2024). Not for the CSV export (Prime) and not for account statements.',
            steps: [
                'Log in to Scalable Capital and choose the Broker.',
                'In the "Transactions" tab, open a transaction and download its settlement (PDF); every transaction has its own PDF.',
                'Earlier settlements from the Baader Bank period: in the Baader Bank login, save them under "Download" → "Wertpapierumsätze".',
                'Drop all PDFs here together; each PDF is one document.'
            ],
            settings: [
                'Use the original PDFs, not printed, scanned or photographed copies: Openfolio only reads the text layer, without text recognition.',
                'For complete holdings, import every settlement since the account was opened, including savings plan executions.'
            ],
            accounts: 'Import per securities account. Settlements already imported are recognised by order and trade number (Baader: transaction number) and not booked twice; partial executions of one order stay separate.',
            supported: [
                'Wertpapierabrechnung / Contract note: buys, sells and savings plan executions with order fees; taxes and financial transaction tax as bookings of their own.',
                'Dividende / Dividend: gross amount with foreign withholding tax and German taxes, in the account currency.',
                'Vorabpauschale (advance lump sum tax) and Steuerneuberechnung (tax refund or charge).',
                'Baader Bank: buy/sell settlements with commission and taxes, fund distributions, distributions and dividends.'
            ],
            unsupported: [
                'Cash account statement (deposits, withdrawals, interest, Prime fees) and interest statement: please add them manually.',
                'Reclassification of a distribution, capital repayment, coupon payment, maturity/knock-out, cancellations and corporate actions.',
                'Baader Bank: accumulation notices, advance lump sum, tax adjustments, account statements, wealth management fees, English settlements.',
                'Cost information and order confirmations are skipped without booking; only the settlement proves an execution.'
            ],
            limits: [
                'A settlement is only booked when amount, fees and taxes add up exactly to the settled amount; otherwise it is listed as not imported.',
                'Settlements in other languages (Dutch, Italian, French) are not read yet.',
                'Tested only with synthetic PDFs following publicly documented formats, not with current original settlements.'
            ]
        }
    } satisfies Record<string, ImportGuide>
};
