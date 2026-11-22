// Synthetic Robinhood monthly statements. Names, numbers, ids and addresses are made up.

type Line = string | [number, string][];

const HEADER: Line[] = [
    [[50, '500 Beispiel Parkway, Suite 100, Lake Mary, FL 32746'], [430, 'Page 1 of 3']],
    [[50, 'help@robinhood.com'], [430, '01/01/2026 to 01/31/2026']],
    'Max Beispiel',
    'Individual Account #:100000001',
    '1 Beispiel Road, Springfield',
    [[50, 'Account Summary'], [300, 'Opening Balance'], [400, 'Closing Balance']],
    [[50, 'Brokerage Cash Balance'], [300, '$36.25'], [400, '$0.00']],
    'Robinhood Securities, LLC (RHS) carries your account as the clearing broker by arrangement with your introducing broker-dealer, Robinhood Financial LLC.'
];

/** Columns of the table: description, symbol, account type, code, date, quantity, price, amount. */
const row = (description: string, symbol: string, code: string, date: string, ...values: string[]): Line => [
    [50, description],
    [270, symbol],
    [310, 'Cash'],
    [340, code],
    [365, date],
    ...values.map((value, index): [number, string] => [[425, 470, 530][3 - values.length + index], value])
];

export const defaultRows: Line[] = [
    'Cash Div: R/D 2025-12-18 P/D 2026-01-02 - 43 shares at 0.05 BSPA Cash CDIV 01/02/2026 $2.15',
    row('Beispiel All-World ETF', 'BSPW', 'Buy', '12/31/2025', '10', '$73.66500', '$736.65'),
    'CUSIP: 000000AA1',
    'ACH Deposit Cash ACH 01/02/2026 $7,500.00',
    row('BSPD', 'BSPD', 'Sell', '01/02/2026', '1', '$224.36000', '$224.36'),
    'CUSIP: 000000AB9',
    'Beispiel Corp Class A',
    row('', 'BSPC', 'Buy', '01/09/2026', '4', '$45.36000', '$181.44'),
    'CUSIP: 000000AC7',
    'Cash Div: R/D 2025-12-11 P/D 2026-01-08 - 115 shares at 0.79542 BSPT Cash CDIV 01/08/2026 $91.47',
    'Foreign Tax Witholding at $19.21 BSPT Cash DTAX 01/08/2026 $19.21',
    'Transfer from Brokerage to Traditional IRA Cash ITRF 01/12/2026 $500.00',
    'Transfer from Traditional IRA to Brokerage Cash ITRF 01/13/2026 $25.00',
    'Cash back from Robinhood Credit Card Cash XENT_CC 01/14/2026 $70.00',
    'Interest Payment Sweep INT 01/20/2026 $102.83',
    'ACH Withdrawal Cash ACH 01/21/2026 $1,000.00'
];

export const defaultTotals = 'Total Funds Paid and Received $2,437.30 $8,015.81';

const PENDING: Line[] = [
    'Executed Trades Pending Settlement',
    'These transactions may not be reflected in the other summaries',
    'Beispiel All-World ETF BSPW Cash Buy 01/30/2026 1 $75.00000 $75.00',
    'Total Executed Trades Pending Settlement $75.00 $0.00'
];

const SWEEP: Line[] = [
    'Deposit Sweep Activity',
    'These transactions reflect movements of uninvested cash to and from program banks.',
    'Opening Sweep Balance 01/01/2026 $69,171.91',
    'FDIC Sweep 01/02/2026 $700.40 $68,471.51',
    'Closing Sweep Balance 01/31/2026 $50,645.16'
];

const HEAD: Line[] = ['Account Activity', 'Description Symbol Acct Type Transaction Date Qty Price Debit Credit'];

export const robinhoodStatement = (rows: Line[] = defaultRows, totals: string = defaultTotals): Line[][] => {
    const half = Math.ceil(rows.length / 2);
    return [
        HEADER,
        [...HEAD, ...rows.slice(0, half), [[430, 'Page 2 of 3']]],
        [...HEAD, ...rows.slice(half), totals, ...PENDING, ...SWEEP, [[430, 'Page 3 of 3']]]
    ];
};

export const robinhoodStatementRow = row;

export const robinhoodTaxForm = (): Line[][] => [['Form 1099 Tax Information', 'Robinhood Securities, LLC', 'Summary']];
