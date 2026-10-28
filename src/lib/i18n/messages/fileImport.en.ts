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
        }
    } satisfies Record<string, ImportGuide>
};
