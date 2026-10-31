// Synthetic Questrade statements and trade confirmation reports. Names, numbers, ids and addresses are made up.

type Line = string | [number, string][];

const FOOTER = (page: number): Line[] => [
    'Current month FX rate: $1.00 USD = $1.3797 CAD Previous month FX rate: $1.00 USD = $1.4389 CAD Account #: 10000001 Current month: April 30, 2025',
    `©Questrade, Inc. All rights reserved. Member of CIRO and the Canadian Investor Protection Fund. Page ${page} of 3`
];

const TABLE_HEAD: Line[] = [
    'Transactions',
    '¹Activity details',
    [[300, 'CAD'], [450, 'USD']],
    'Qty¹ Price Gross.¹ Com.¹ Net¹ Price Gross.¹ Com.¹ Net¹',
    'Trans Date.¹ Settle Date.¹ Activity type Symbol Description'
];

const COVER: Line[] = [
    'Get the most out of your statement ACCOUNT STATEMENT $11,483.13',
    'MAX BEISPIEL',
    'Account #: 10000001 Current month: April 30, 2025',
    '1 BEISPIEL ROAD TORONTO ON',
    'Type: Individual Tax-Free Savings Account (TFSA) Account opened: February 03, 2021',
    'Currency: CAD/USD Dealer: Questrade, Inc.',
    'A summary of all trades not settled by the end of 05 TRADES TO SETTLE AFTER MONTH END',
    ...FOOTER(1)
];

/** Rows as printed: wrapped description, then the line with the nine cells. */
export const questradeRows = {
    contribution: '04-09-2025 04-09-2025 Contribution CONT 1000000199 - - - - 10,000.00 - - - -',
    buy: [
        '04-10-2025 04-11-2025 Buy .BSPT BEISPIEL ALL-EQUITY ETF  PORTFOLIO',
        'ETF UNIT  WE ACTED AS AGENT 50.0000 40.930 (2,046.50) (0.10) (2,046.60) - - - -'
    ],
    buyOneLine: '01-17-2025 01-19-2025 Buy .XBSP UNITS|WE ACTED AS AGENT|AVG PRICE - ASK 19 25.320 (481.08) - (481.08) - - - -',
    sell: [
        '04-14-2025 04-15-2025 Sell .BSPT BEISPIEL ALL-EQUITY ETF  PORTFOLIO',
        'ETF UNIT  WE ACTED AS AGENT 10.0000 41.000 410.00 (0.10) 409.90 - - - -'
    ],
    usdBuy: [
        '04-16-2025 04-17-2025 Buy IVLB BEISPIEL INTL VALUE ETF',
        'ETF UNIT WE ACTED AS AGENT 10 - - - - 32.710 (327.10) - (327.10)'
    ],
    distribution: '04-07-2025 04-07-2025    .BSPT UNIT DIST      ON      29 SHS REC 03/30/25 PAY - - - - 20.69 - - - -',
    withholding: '04-20-2025 04-20-2025 .BSPT NON-RES TAX WITHHELD - - - - (3.10) - - - -'
};

export const balance = (label: 'Opening' | 'Closing', cad: string, usd = '-'): string => `${label} balance - - - - ${cad} - - - ${usd}`;

/** A statement with tables between opening and closing balances; table rows spread over pages. */
export const questradeStatement = (tables: (string | string[])[][], extra: Line[] = []): Line[][] => [
    COVER,
    [
        'ACCOUNT STATEMENT',
        '04. ACTIVITY DETAILS',
        'Cash changes',
        'Opening balance 66.27 66.27 45.58 45.58',
        'Closing balance 8,019.77 8,019.77 8,019.77 8,019.77',
        ...FOOTER(2)
    ],
    [
        'ACCOUNT STATEMENT',
        '04. ACTIVITY DETAILS',
        ...TABLE_HEAD,
        ...tables.flat(2),
        ...extra,
        ...FOOTER(3),
        'ACCOUNT STATEMENT',
        'Glossary'
    ]
];

export const questradeOther = (): Line[][] => [['Tax slip', 'Dealer: Questrade, Inc.']];

const REPORT_HEAD = (account: string): Line[] => [
    'TRADE CONFIRMATION REPORT',
    `Account #: ${account} Dealer: Questrade, Inc. Type: TFSA`,
    'Client: Max Beispiel',
    'Order execution only account'
];

const REPORT_FOOT = (page: number): Line => `Report generated on 04:36:07 PM 07.07.2026 TRADE CONFIRMATION REPORT ${page} of 2`;

export const questradeReport = (options: { rows?: string[]; currency?: string; totals?: string; account?: string } = {}): Line[][] => {
    const currency = options.currency || 'CAD';
    const rows = options.rows || [
        '15-04-25 16-04-25 30F9C7 Buy 50 .BSPT  A T 40.93 (2,046.50) (0.10) (0.00) 0.00 (2,046.60)',
        'Description BEISPIEL ALL-EQUITY ETF, CL A UNIT, AVG PRICE - ASK US FOR DETAILS '
    ];
    return [
        [...REPORT_HEAD(options.account || '10000001'), 'Summary', 'Stocks and Options Canadian securities U.S. securities', REPORT_FOOT(1)],
        [
            ...REPORT_HEAD(options.account || '10000001'),
            `Trade Date Settlement Trade # Action Quantity Symbol T B EX Price (${currency}) Gross amount`,
            `date (${currency}) Comm (${currency}) SEC fees (${currency}) Interest amount Net amount (${currency})`,
            ...rows,
            options.totals || 'Totals (2,046.50) (0.10) 0.00 0.00 (2,046.60)',
            REPORT_FOOT(2)
        ]
    ];
};
