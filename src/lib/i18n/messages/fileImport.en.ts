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
        unsupportedHintPdf: 'These documents or bookings have a financial effect that Openfolio does not import yet. Add them manually if needed.',
        ignoredHintPdf: 'Documents without cash or position effect, e.g. cost information or order confirmations.',
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
            'transactions-en': 'Transactions.csv, English (buys/sells)',
            account: 'Account.csv (account statement)',
            'account-en': 'Account.csv, English (account statement)'
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
        etoro: {
            contracts: 'Account statement, Account Activity sheet (CSV, column "Units / Contracts")',
            units: 'Account statement, Account Activity sheet (CSV, older column "Units")'
        },
        freetrade: {
            activity: 'Activity feed export (CSV)'
        },
        investengine: {
            'trading-statement': 'Trading statement (CSV)'
        },
        avanza: {
            sv: 'Transaction export (CSV, Swedish)'
        },
        directa: {
            movimenti: 'Movimenti (CSV, Italian)'
        },
        disnat: {
            'fr-comma': 'Account history, saved from Excel as CSV (French, comma)',
            'fr-semicolon': 'Account history, saved from Excel as CSV (French, semicolon)'
        },
        finpension: {
            '3a': 'Transaction report pillar 3a (CSV)',
            bvg: 'Transaction report vested benefits/BVG (CSV)',
            report: 'Transaction report (CSV, without buys, sells or deposits)'
        },
        scalable: {
            de: 'Scalable Capital PDF settlement (German)',
            en: 'Scalable Capital PDF settlement (English)',
            baader: 'Baader Bank PDF settlement (until 2024)'
        },
        flatex: {
            flatex: 'flatex / flatexDEGIRO Bank PDF settlement',
            fintech: 'FinTech Group Bank PDF settlement (until 2020)'
        },
        ing: {
            ing: 'ING Germany PDF settlement'
        },
        comdirect: {
            comdirect: 'comdirect PDF documents'
        },
        yuh: {
            de: 'PDF transaction notice, German',
            en: 'PDF transaction notice, English'
        },
        commsec: {
            colon: 'PDF confirmation (COMPANY: …)',
            plain: 'PDF confirmation (COMPANY … / SECURITY … CODE)'
        },
        dkb: {
            dkb: 'DKB PDF settlement'
        },
        consorsbank: {
            consorsbank: 'Consorsbank / Cortal Consors PDF settlement'
        },
        wealthsimple: {
            'performance-report': 'PDF performance report',
            other: 'Other Wealthsimple document'
        }
    },
    guides: {
        degiro: {
            scope: 'flatexDEGIRO accounts; exports with German or English column names.',
            steps: [
                'Transactions (main menu or Inbox): choose the period → Export → CSV. Result: Transactions.csv with buys and sells.',
                'Inbox → Account statement: choose the same period → Export → CSV. Result: Account.csv with dividends, taxes, fees, deposits and withdrawals.',
                'Drop both files here together.'
            ],
            settings: [
                'DEGIRO interface language: German or English. Other languages are not recognised.',
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
                'Corporate actions are not recognised as position bookings of their own: their parts in Transactions.csv are booked as a sale and a purchase. Holdings and cash are right, but the cost basis starts anew and the difference shows as a realised gain or loss.'
            ],
            limits: [
                'Unknown booking texts in Account.csv are booked as adjustments.',
                'Buys and sells come from Transactions.csv. A trade listed only in Account.csv (file missing, shorter period, left out by the export) appears under “Not imported”.',
                'Exports with the older column layout (no AutoFX Fee column) are not recognised.',
                'English exports are tested with synthetic files only. Do not switch the language between two exports: account rows of one booking would then be seen twice.'
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
        etoro: {
            scope: 'eToro investment account (stocks and ETFs, USD account): account statement as Excel, sheet "Account Activity". CFDs, crypto and copy trading transfers are not imported as security bookings.',
            steps: [
                'Log in on etoro.com in a browser and open Portfolio.',
                'Choose History at the top, click the icon on the far right and choose Account statement. Alternatively: Settings → Account → Documents → Account Statement → View.',
                'Choose the period from account opening and click Create.',
                'Click the Excel icon at the top right and download the file.',
                'Open the file in Excel or LibreOffice, select the "Account Activity" sheet and save this sheet as CSV (comma or semicolon separated). Drop the CSV file here.'
            ],
            settings: [
                'eToro website language: English. Columns and booking types are expected in English.',
                'Save only the "Account Activity" sheet, not "Closed Positions", "Dividends" or "Account Summary".',
                'Do not delete columns or change date or number formats when saving. Dates must stay in the eToro format DD/MM/YYYY.'
            ],
            accounts: 'One eToro account per portfolio. All amounts of the sheet are USD, also for deposits from a EUR or GBP account (eToro converts them on arrival). Overlapping exports are not booked twice.',
            supported: [
                'Opened and closed stock and ETF positions as buys and sells (USD amount invested or paid out, quantity from "Units")',
                'Dividends (net, as credited), interest (Interest Payment)',
                'Deposits, withdrawals (Withdraw Request), the withdrawal fee and UK stamp duty (SDRT) as fees'
            ],
            unsupported: [
                'CFD positions, overnight fees and refunds and CFD dividends: shown as not imported.',
                'Crypto and asset types other than stocks and ETFs: shown as not imported.',
                'Copy trading: positions of the copied trader are booked like your own; "Start Copy" without amount is skipped, "Stop Copy" and other types with an amount are shown as not imported.',
                'Rows without symbol and negative stock dividends are not matched to a security and are shown as not imported.'
            ],
            limits: [
                'The export has eToro symbols (e.g. "BRIT.L"), no ISIN. The security is looked up by symbol at the next price update.',
                'Buys and sells are booked in USD, also for securities in EUR or GBX; the sheet has no price in the trading currency. Conversion fees are part of the converted amount and are only shown.',
                'Withholding tax is only in the "Dividends" sheet and is not estimated. The balance column is not imported: with CFDs, crypto or copy trading it differs from the booked cash.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        freetrade: {
            scope: 'Freetrade portfolios (GIA, ISA, SIPP): activity feed export as CSV.',
            steps: [
                'In the Freetrade app, choose the portfolio at the top left.',
                'Open the Activity tab at the bottom.',
                'Tap the arrow icon (export) at the top right and confirm with "All Activity".',
                'Save or share the CSV file and drop it here unchanged.'
            ],
            settings: [
                'Always export "All Activity" so deposits, dividends and interest are included.',
                'Do not open and re-save the file in Excel: numbers and timestamps are expected in their original format.'
            ],
            accounts: 'One export and one Openfolio portfolio per Freetrade portfolio (GIA, ISA, SIPP). Overlapping exports are not booked twice.',
            supported: [
                'Buys and sells (ORDER) in the account currency, stamp duty and FX fee as fee',
                'Free shares (FREESHARE_ORDER) as a buy paid by a bonus deposit of their value',
                'Dividends and property income distributions: gross with the withholding tax shown in the export, otherwise net',
                'Interest, deposits (TOP_UP) and withdrawals (WITHDRAWAL)'
            ],
            unsupported: [
                'Unknown types with an amount or security (e.g. corporate actions): shown as not imported.',
                'Orders without ISIN or without buy/sell are not matched to a security.',
                'Transfers to and from other providers are not part of the export according to Freetrade.'
            ],
            limits: [
                'Buys of foreign-currency securities are booked at the amount in the account currency; the price in the trading currency stays in the raw data.',
                'Monthly statements and tax certificates (MONTHLY_STATEMENT) have no amount and are skipped.',
                'The date comes from the UTC timestamp; bookings shortly after midnight British Summer Time can be one day off.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        investengine: {
            scope: 'InvestEngine portfolios (GIA, ISA, SIPP, Business): "Trading statement" report as CSV, buys and sells only.',
            steps: [
                'Log in to InvestEngine in a browser and choose Reports at the top right.',
                'Click Create report and choose the report type "Trading statement".',
                'Choose the period from portfolio opening and the portfolio, choose CSV as format and click Generate report.',
                'Once the notification or email arrives, download the report at the top of the Reports page (file name e.g. GIA_Trading_statement_….csv) and drop it here.'
            ],
            settings: [
                'Report type "Trading statement", not Cash Statement, Valuation Statement or CGT Report.',
                'Drop the file unchanged; amounts are expected with "£" and dates as DD/MM/YY.'
            ],
            accounts: 'One report and one Openfolio portfolio per InvestEngine portfolio. Overlapping reports are not booked twice.',
            supported: [
                'Buys and sells (Buy, Sell) with quantity and trade value in GBP; security by ISIN'
            ],
            unsupported: [
                'Dividends, platform and fund fees, deposits and withdrawals: they are not in the trading statement but in the Cash Statement, which is not read yet. Please add them manually if needed.',
                'Other transaction types (e.g. transfers) and rows without ISIN: shown as not imported.'
            ],
            limits: [
                'Without deposits in the report, Openfolio treats the money needed for buys as newly invested.',
                'The trade value is the booked amount; InvestEngine charges no dealing fee per order.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        avanza: {
            scope: 'Avanza (Sweden): transaction export of all accounts of the login (ISK, KF, Depå, savings account) as CSV.',
            steps: [
                'Log in to Avanza in a browser and open "Min ekonomi".',
                'Choose the "Transaktioner" tab.',
                'Choose the period from account opening.',
                'Click "Exportera transaktioner" and drop the CSV file here unchanged.'
            ],
            settings: [
                'The file is Swedish, with semicolons and decimal commas; do not open and re-save it in Excel.',
                'Do not use the holdings export (Innehav): it has no bookings.'
            ],
            accounts: 'The export contains all accounts; Openfolio books them together into one portfolio and keeps the account (column "Konto") in the raw data. Transfers between your own accounts appear as withdrawal and deposit and cancel out. For separate portfolios, remove the other accounts\' rows before importing. Overlapping exports are not booked twice.',
            supported: [
                'Köp and Sälj with courtage as fee (for SEK amounts)',
                'Utdelning (as credited) and Utländsk källskatt as withholding tax',
                'Ränta, Insättning and Uttag',
                'Övrigt: Avkastningsskatt as tax, "Återbetalning … avgift" as fee refund'
            ],
            unsupported: [
                'Other "Övrigt" rows with quantity or amount (e.g. fund switches, corporate actions): shown as not imported.',
                'Unknown transaction types with an amount (e.g. Preliminärskatt): shown as not imported.',
                'Buys and sells without ISIN are not matched to a security.'
            ],
            limits: [
                'Amounts are in the transaction currency (mostly SEK). On currency accounts the courtage (in SEK) stays in the amount and is only kept in the raw data.',
                'The export path is only described by an Avanza customer (Export-To-Ghostfolio, issue #165); no official Avanza guide was found.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        directa: {
            scope: 'Directa SIM (Italy): account movements "Movimenti" of one account as CSV.',
            steps: [
                'Open Directa in "Libera" mode and choose "Movimenti" in the Conto area.',
                'Choose the "Tutti i movimenti" tab and the "Data operazione" ordering.',
                'Set the period at the top right (calendar icon).',
                'Click the Excel icon, choose "File separato da virgole (csv)" and click "Estrai".',
                'Drop the CSV file here unchanged; the heading rows (Conto, Data estrazione, period) may stay.'
            ],
            settings: [
                'Format "File separato da virgole (csv)", not xlsx or ods.',
                'Directa exports at most 3,000 rows. With more movements, split the period (e.g. one export per year); overlapping exports are not booked twice.'
            ],
            accounts: 'One export per Directa account; the account from the "Conto : …" row is part of the key so bookings of different accounts never merge.',
            supported: [
                'Acquisto and Vendita with "Importo euro" as cash amount',
                'Distributions and dividends, bond coupons (Cedola) and certificate coupons as interest, accrued interest (Ratei)',
                'Withheld taxes (Rit.…) as withholding tax of the position; Ritenuta su plusvalenza, Tobin tax and Bollo as tax',
                'Commissioni as fee, deposits (Conferimento, Bonifico) and withdrawals (Prelievo)'
            ],
            unsupported: [
                'Financing (Finanziamento) and unknown movement types with an amount: shown as not imported.',
                'Buys and sells without ISIN or with an implausible sign.'
            ],
            limits: [
                'The booked currency is always EUR ("Importo euro"); the foreign amount and Divisa stay in the raw data.',
                'Costs are not shown apart on the buy/sell row and are not estimated.',
                'Bonds are booked with the quantity of the file (nominal value).',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        disnat: {
            scope: 'Disnat (Desjardins, Canada): account history of one account (e.g. TFSA, RRSP, RESP, cash account), exported as XLSX and saved as CSV.',
            steps: [
                'Log in to Disnat and choose the account to export.',
                'Choose History (Historique) and then Account (Compte).',
                'Choose the period (e.g. custom from account opening) and click Export. Disnat creates an XLSX file.',
                'Open the file in Excel or LibreOffice and save it as CSV (comma or semicolon separated). Drop the CSV file here.'
            ],
            settings: [
                'The French column names of the public sample are recognised (Date de transaction, Type de transaction, Montant de l\'opération, …). An English export is not documented and is not recognised.',
                'Do not delete columns or change number or date formats when saving; dates as YYYY-MM-DD.'
            ],
            accounts: 'One export and one Openfolio portfolio per Disnat account. Overlapping exports are not booked twice.',
            supported: [
                'ACHAT and VENTE of stocks/ETFs (asset class "Actions") with the transaction amount; the commission as fee where quantity × price plus commission gives the amount',
                'Dividends (as credited), Retenue as withholding tax, interest',
                'Fees including GST/QST on fees, deposits (Cotisation, cash transfers, RESP grants) and withdrawals (Résiliation, Retrait)'
            ],
            unsupported: [
                'Transfers with a security or quantity, options and other asset classes, unknown types with an amount: shown as not imported.',
                'Rows without symbol are not matched to a security.'
            ],
            limits: [
                'The export has Disnat symbols, no ISIN. The "-C" suffix (Canadian listing) is removed so trades and dividends belong to the same security; the next price update resolves it.',
                'For US-dollar securities on a CAD account the amount includes conversion and commission; the commission then stays in the raw data.',
                'The export path is only described by a Disnat customer (Export-To-Ghostfolio, issue #260); no official guide was found.',
                'Only tested with synthetic files based on public samples.'
            ]
        },
        finpension: {
            scope: 'Finpension (Switzerland): pillar 3a portfolios and vested benefits accounts (BVG), transaction report as CSV per portfolio.',
            steps: [
                'Log in to Finpension and choose the portfolio on the start page.',
                'Open "Transactions" on the right.',
                'At "transaction report (CSV-file)" choose download (or have it sent by email).',
                'Drop the CSV file here unchanged.'
            ],
            settings: [
                'Do not open and re-save the report in Excel: semicolons, decimal points and dates as YYYY-MM-DD are expected as delivered.'
            ],
            accounts: 'One report and one Openfolio portfolio per Finpension portfolio (each 3a portfolio, each vested benefits account). Overlapping reports are not booked twice.',
            supported: [
                'Buys and sells (3a: Buy/Sell; BVG: Portfolio Transaction, direction from the cash flow) in CHF',
                'Distributions (Dividend, Dividend and Interest Distributions), interest (Interests), flat-rate fee (Flat-rate administrative/administration fee)',
                'Deposits (Deposit), vested benefits transfers (Transfer vested benefits) as deposit or withdrawal, withdrawals (Withdraw…)',
                'End-of-day balance from the Balance column as cash balance'
            ],
            unsupported: [
                'Unknown categories with an amount or shares: shown as not imported.',
                'Buys/sells without ISIN or with contradicting signs of shares and cash flow.'
            ],
            limits: [
                'Amounts in CHF ("Asset Price in CHF", "Cash Flow"); fund currency and rate stay in the raw data.',
                'The variant (3a or BVG) is recognised from the categories; a report with only interest and fees is called "transaction report".',
                'The export path is only documented by Export-To-Ghostfolio; no official Finpension guide was found.',
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
        },
        flatex: {
            scope: 'flatex accounts in Germany and Austria (flatex Bank AG, flatexDEGIRO Bank AG/SE, until 2020 FinTech Group Bank AG). Not for DEGIRO accounts: use the DEGIRO CSV import for those.',
            steps: [
                'In the flatex account, open "Post" and choose "Dokumentenarchiv" (document archive).',
                'If needed, choose a period to show older settlements.',
                'Download the securities settlements, collective settlements, dividend credits and income notices as PDF.',
                'Drop all PDFs here together; each PDF is one document, a collective settlement can contain several executions.'
            ],
            settings: [
                'Use the original PDFs from the document archive, not printed, scanned or photographed copies: Openfolio only reads the text layer, without text recognition.',
                'For complete holdings, import every settlement since the account was opened.'
            ],
            accounts: 'Import per securities account. Settlements already imported are recognised by order and transaction number and not booked twice; partial executions (…/1, …/2) stay separate.',
            supported: [
                'Wertpapierabrechnung Kauf/Verkauf (also funds/certificates) and Sammelabrechnung (collective buy/sell settlement): price value, commission and expenses as fee, withheld tax (KESt) as a booking of its own, refunds as positive tax.',
                'Dividendengutschrift and Ertragsmitteilung of distributing funds: gross amount in the account currency with withholding tax, withheld tax and fees, converted at the stated exchange rate.',
                'Ertragsmitteilung of accumulating funds: only the withheld tax.',
                'Vorabpauschale settlement (withheld tax) and custody fees of foreign custodians.'
            ],
            unsupported: [
                'Bonds (settled in percent with accrued interest), crypto, currency exchange, cancellations and corrections.',
                'Account statements (deposits, withdrawals, interest), security transfers in and out, corporate actions, stock dividends, credit/debit notes.',
                'Order, change and cancellation confirmations and cost information are skipped without booking; only the settlement proves an execution.'
            ],
            limits: [
                'A settlement is only booked when price value, fees and taxes add up exactly to the final amount; otherwise it is listed as not imported.',
                'Savings plan executions are booked as buys but not marked as savings plan.',
                'At flatex, the financial transaction tax is part of the third-party expenses and is therefore booked as a fee.',
                'Tested only with synthetic PDFs following publicly documented formats, not with current original settlements.'
            ]
        },
        ing: {
            scope: 'Direkt-Depot accounts at ING Germany (ING-DiBa AG). Not for other ING countries: settlements from ING in Spain, for example, have a different format and are not recognised.',
            steps: [
                'In ING online banking, open the Post-Box area (inbox).',
                'Use the advanced search to choose the securities account and, if needed, narrow the period or document type.',
                'For each "Abrechnung Kauf", "Abrechnung Verkauf" and "Ertragsabrechnung", open the arrow in the table and download the PDF.',
                'Drop all PDFs here together; each PDF is one document.'
            ],
            settings: [
                'Use the original PDFs from the inbox; do not print, scan or photograph them: Openfolio only reads the text layer, without text recognition.',
                'For complete holdings, import all settlements since the account was opened.'
            ],
            accounts: 'Import per securities account. Settlements that were already imported are recognised and not booked twice; partial executions of an order stay separate.',
            supported: [
                'Wertpapierabrechnung Kauf (including savings plans, one-off investments and reinvestment), Bezug and Verkauf: market value in account currency, commission and charges as a fee, taxes as a separate booking; discounts reduce the purchase amount.',
                'Rückzahlung and Einlösung of certificates quoted in units, as a sale.',
                'Dividendengutschrift and Ertragsgutschrift: gross amount in account currency, withholding tax and taxes as separate bookings.',
                'Zinsgutschrift as interest; Ertragsgutschrift without a payout and Vorabpauschale: the tax only.',
                'Nachträgliche Verlustverrechnung (later loss offset): refund or charge as a tax booking.'
            ],
            unsupported: [
                'Bonds (nominal value instead of units, accrued interest): settlements are reported as not imported, while interest credits are booked.',
                'Cancellations ("*** Storno ***", "Sie erhalten eine neue Abrechnung"): a settlement that was already imported must be corrected by hand.',
                'Account statements (deposits, withdrawals, interest), exchanges, securities transfers and other corporate actions.',
                'Order, change and cancellation confirmations and cost information are skipped without a booking; only the settlement proves an execution.'
            ],
            limits: [
                'A settlement is only booked if market value, fees and taxes add up exactly to the final amount; otherwise it is listed as not imported.',
                'The French financial transaction tax is booked as a tax, not as a fee.',
                'Only tested with synthetic PDFs based on publicly documented formats, not with current original settlements.'
            ]
        },
        comdirect: {
            scope: 'PDF documents from the comdirect PostBox, in addition to the connection under "Brokers". Both may feed the same depot, but they are not equivalent: only the PDFs contain fees and taxes on securities transactions.',
            steps: [
                'In the PostBox, select the Wertpapierabrechnungen and the Steuermitteilungen (subject "Steuermitteilung" with the WKN).',
                'Use the bulk download at the bottom of the PostBox and choose "herunterladen"; comdirect delivers a ZIP archive.',
                'Unpack the ZIP: Openfolio reads the PDFs themselves, not a ZIP.',
                'Drop all PDFs here together; a settlement and its Steuermitteilung belong together.'
            ],
            settings: [
                'Use the original PDFs from the PostBox; do not print, scan or photograph them: Openfolio only reads the text layer, without text recognition.',
                'For dividends, import the Steuermitteilung. A Dividendengutschrift or Ertragsgutschrift alone books nothing.'
            ],
            accounts: 'Import per depot. Documents that were already imported are recognised and not booked twice, even if both documents are in one PDF. If the depot already holds bookings from the comdirect connection, buys and sells (same day, security and quantity) and dividends (same net amount within 5 days) are not booked again.',
            supported: [
                'Wertpapierabrechnung Kauf and Verkauf, including partial executions, foreign currency and fixed prices: market value in account currency, commission and charges as a fee; discounts on the sales charge reduce the purchase amount.',
                'Steuermitteilung for a buy or sell: taxes paid or refunded as a separate booking.',
                'Steuermitteilung for domestic and foreign dividends and fund distributions: the dividend with credited withholding tax and taxes.',
                'Steuermitteilung for the Vorabpauschale: the tax only.',
                'Dividendengutschriften from before 2009, for which there is no Steuermitteilung, in account currency.'
            ],
            unsupported: [
                'Dividendengutschriften and Ertragsgutschriften showing "vor Steuern" are deliberately not booked: the Steuermitteilung of the same dividend states the amount that reached the account.',
                'Bonds, exchanges (Wertpapierumtausch), redemptions, distributions in kind, older foreign-currency credits and sales with negative proceeds.',
                'Finanzreport (deposits, withdrawals, interest) and Abrechnung Verwahrentgelt.',
                'Execution notices and cost information are skipped without a booking; only the settlement proves an execution.'
            ],
            limits: [
                'The gross amount of a dividend is the amount before taxes plus credited withholding tax. Withholding tax that cannot be credited appears only in the Gutschrift and reduces the gross amount here; cash is still correct.',
                'Without the Steuermitteilung a sale lacks its tax, without the settlement the sale itself is missing: import both documents for a correct balance.',
                'When bookings overlap with the connection, the booking that was there first stays. There is no shared id: the Vorabpauschale and taxes from the connection are not matched.',
                'A settlement is only booked if market value and fees add up exactly to the amount before taxes; otherwise it is listed as not imported.',
                'Only tested with synthetic PDFs based on publicly documented formats, not with current original settlements.'
            ]
        },
        yuh: {
            scope: 'Yuh accounts at Swissquote Bank (Switzerland): transaction notices as PDF, one document per activity. Not for regular Swissquote accounts: use the Swissquote CSV import for those.',
            steps: [
                'In the Yuh app, tap "Invest" and open an investment, for example a stock.',
                'Scroll to the "Transactions" section.',
                'Tap a buy, sell or dividend and save the "transaction notification" document as PDF.',
                'Repeat for each activity and drop all PDFs here together.'
            ],
            settings: [
                'Use original PDFs, no screenshots or scans: Openfolio only reads the text layer and runs no text recognition.',
                'For a complete position history, import all notices since the account was opened.'
            ],
            accounts: 'Use one portfolio per Yuh account. A notice is recognised by its reference number and never booked twice; two equal buys with their own reference stay separate.',
            supported: [
                'Buy and sell (German and English, fractions too): commission as fee, less trading credit used; stamp duty as its own tax booking.',
                'Dividend and capital gain (German): gross amount with withholding taxes as separate bookings, in the credited currency.',
                'Payment credit and debit (German) as deposit and withdrawal.',
                'Interest statement (German): interest per currency with withholding tax.'
            ],
            unsupported: [
                'Title transfers, corporate actions, crypto and account statements are reported, not booked.',
                'English dividend and payment notices and notices in French or Italian: there is no public sample for them, so they are reported.',
                'Currency exchanges inside Yuh: no notice is known for them, so cash per currency stays incomplete.'
            ],
            limits: [
                'A notice is only booked if amount, fees and taxes add up exactly to the amount debited or credited; otherwise it is listed as not imported.',
                'The path in the app is only documented for buy, sell and dividend. Where payment notices and interest statements are stored could not be verified publicly; PDFs you have are read.',
                'Only tested with synthetic PDFs based on publicly documented formats, not with current original notices.'
            ]
        },
        commsec: {
            scope: 'CommSec accounts in Australia: trade confirmations (contract notes) for buys and sells on the Australian market. Not for CommSec International or holdings lists.',
            steps: [
                'Log in to CommSec.',
                'Open Trade > Manage Orders > Confirmations. On minor trust accounts the item may be called Trading > Confirmations.',
                'Download the confirmations you need as PDF.',
                'Drop all PDFs here together.'
            ],
            settings: [
                'Use original PDFs, no scans: Openfolio only reads the text layer and runs no text recognition.',
                'For a complete position history, import all confirmations since the account was opened.'
            ],
            accounts: 'Use one portfolio per CommSec account. A confirmation is recognised by its Confirmation No and never booked twice; several confirmations in one PDF are booked one by one.',
            supported: [
                'Buys and sells in both known layouts: consideration as trade value, brokerage & costs as fee. GST is part of the fee and not booked again.'
            ],
            unsupported: [
                'Dividends, corporate actions, deposits and interest are not on the confirmations and are therefore missing.',
                'Confirmations with application money and other CommSec documents are reported, not booked.',
                'CommSec International (its own Excel export) is not read.'
            ],
            limits: [
                'A confirmation is only booked when consideration and brokerage add up exactly to total cost or net proceeds.',
                'Confirmations name the ASX code, no ISIN. The security is looked up by code and currency at the next price update and can be completed there.',
                'Settlement runs through the linked bank account, so cash movements in the portfolio are incomplete.',
                'The publicly known samples date from 2020; only tested with synthetic PDFs, not with current original confirmations.'
            ]
        },
        dkb: {
            scope: 'Securities accounts at DKB (Deutsche Kreditbank AG).',
            steps: [
                'In the DKB mailbox, open the folder "Wertpapierdokumente".',
                'Pick the PDF of each transaction: buy and sell settlements have titles like "Kauf - WKN … - Wertpapierabrechnung vom …", dividends are called "Ertragsabrechnung".',
                'Download with "Speichern"; several documents can be selected together.',
                'Drop all PDFs here together; each PDF is one document.'
            ],
            settings: [
                'Use the original PDFs from the mailbox; do not print, scan or photograph them: Openfolio only reads the text layer, without text recognition.',
                'For complete holdings, import all settlements since the account was opened, including the half-yearly savings plan statements.'
            ],
            accounts: 'Import per securities account. Settlements that were already imported are recognised by their invoice, statement or order number and not booked twice.',
            supported: [
                'Wertpapier Abrechnung Kauf, Ausgabe Investmentfonds, Verkauf and Rücknahme Investmentfonds (also Direkthandel): market value, commission and charges as a fee, taxes as a separate booking.',
                'Steuerliche Ausgleichrechnung of a sale at a loss: the refund as a separate tax booking with its own date.',
                'Halbjahresabrechnung Sparplan: each purchase on its own.',
                'Dividendengutschrift, Ausschüttung, Gutschrift von Investmenterträgen: gross amount in account currency with withholding tax and taxes; Zinsgutschrift as interest.',
                'Vorabpauschale with tax withheld.'
            ],
            unsupported: [
                'Bonds (nominal value instead of units, accrued interest), including redemptions; interest credits are booked, though.',
                'Cancellations, capital repayments, securities transfers and depot statements with custody fees.',
                'Account and credit card statements (deposits, withdrawals, interest).',
                'Cost information and notices about the key information document are skipped without a booking, and so is a Vorabpauschale without tax withheld.'
            ],
            limits: [
                'A settlement is only booked if market value, fees and taxes add up exactly to the final amount; otherwise it is listed as not imported.',
                'The financial transaction tax is booked as a tax, not as a fee.',
                'Only tested with synthetic PDFs based on publicly documented formats, not with current original settlements.'
            ]
        },
        consorsbank: {
            scope: 'Securities accounts at Consorsbank (BNP Paribas), including settlements from the Cortal Consors era.',
            steps: [
                'Log in on the Consorsbank website in a browser, not in the app.',
                'Under "Mein Konto & Depot", open the "OnlineArchiv".',
                'Choose the document type "Orderabrechnungen" and click "Suchen"; search for the matching dividend and income documents the same way.',
                'Select all files, save them and drop the PDFs here together; each PDF is one document.'
            ],
            settings: [
                'According to Parqet, PDFs from the order archive in the app cannot be read: download the same documents in a browser.',
                'Use the original PDFs; do not print, scan or photograph them: Openfolio only reads the text layer, without text recognition.',
                'For complete holdings, import all settlements since the account was opened.'
            ],
            accounts: 'Import per securities account. Settlements that were already imported are recognised by their order number; partial executions (…001, …002) stay separate.',
            supported: [
                'Orderabrechnung and Wertpapierabrechnung for buys, sells, subscriptions, sales of subscription rights and savings plans: amount in account currency, commission and charges as a fee, taxes as a separate booking.',
                'Einlösung in units, as a sale.',
                'Dividendengutschrift and Ertragsgutschrift gross in account currency with withholding tax and taxes; Zinsgutschrift as interest.',
                'Vorabpauschale and Ertragsthesaurierung: the tax only. Nachträgliche Verlustverrechnung (later loss offset) as a tax booking.'
            ],
            unsupported: [
                'Settlements without an ISIN (older documents only state the WKN): buys and sells are reported, because Openfolio does not make up an ISIN. Income is booked with name and amount, but not assigned to a security.',
                'Bonds (nominal value, accrued interest); interest credits are booked, though.',
                'Cancellations and reissued credits (Neuabrechnung): a credit that was already imported must be corrected by hand, otherwise it would be booked twice.',
                'Credits to foreign currency accounts, transfers, exchanges, acquisition data, account statements and account closings.',
                'Order and change confirmations and cost information are skipped without a booking; only the settlement proves an execution.'
            ],
            limits: [
                'A settlement is only booked if market value, fees and taxes add up exactly to the final amount; otherwise it is listed as not imported.',
                'The financial transaction tax is booked as a tax, not as a fee.',
                'Only tested with synthetic PDFs based on publicly documented formats, not with current original settlements.'
            ]
        },
        wealthsimple: {
            scope: 'Managed Wealthsimple accounts in Canada (Wealthsimple Inc.): monthly and yearly performance reports as PDF. Not confirmed for self-directed accounts (Wealthsimple Trade), crypto or chequing.',
            steps: [
                'Log in to Wealthsimple on the web; statements of managed accounts are only available there.',
                'Open the Profile menu at the bottom left and choose "Documents".',
                'Open the statement in the "Statements" folder as PDF and save it. For many months: "Generate document" > "Bulk download monthly statements", format PDF, then choose the period and account.',
                'Drop all PDFs here together; unzip the ZIP file first.'
            ],
            settings: [
                'Choose PDF, not CSV: the CSV statement is not read here.',
                'Use original PDFs, no scans: Openfolio only reads the text layer and runs no text recognition.',
                'For a complete position history, import all statements since the account was opened.'
            ],
            accounts: 'Use one portfolio per account (for example TFSA and RRSP); a report with several accounts is refused. Monthly and yearly reports of the same period book nothing twice.',
            supported: [
                'Electronic funds transfers in and out as deposit and withdrawal.',
                'Buys and sells under the symbol, in fractions, with no fee per trade.',
                'Dividends in CAD under the symbol, non-resident tax as withholding tax.',
                'Management fee, discounts and sales tax as separate fee bookings.'
            ],
            unsupported: [
                'Dividends that only name a fund and no symbol are reported; assigning them would be a guess, so that cash is missing.',
                'Sections or rows that are not among the known ones, such as interest or transfers, are reported.',
                'Other Wealthsimple documents, such as trade confirmations of self-directed accounts, are reported.'
            ],
            limits: [
                'A section is only booked if its rows add up to the "Total - …" line. Trade rows must match the Total column.',
                'Reports name symbols, no ISIN. The security is looked up by symbol and currency at the next price update and can be completed there.',
                'The public samples date from 2020. Whether current statements still look like this is not confirmed; a different PDF is reported, not booked.',
                'Only tested with synthetic PDFs, not with current originals.'
            ]
        }
    } satisfies Record<string, ImportGuide>
};
