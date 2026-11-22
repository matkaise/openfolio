// Synthetic Wealthsimple performance reports. Names, numbers, ids and addresses are made up. Rows are
// shorter than in the originals (small print there), because pdf.js drops text past the page edge.

type Line = string | [number, string][];

const FOOTER = (page: number, title: string): Line[] => [
    'Wealthsimple Inc. 1 Beispiel Avenue, Toronto Ontario M5V 0A0 Canada Conversion rate $1.00 USD = $1.27300 CAD',
    `Wealthsimple Prepared for: Max Beispiel, 1 Beispiel Road, Toronto ON CA Page ${page} of 3${title}`
];

const HEAD = (account: string): Line[] => [`${account} - HQ1000001`, `${account} activity`, 'Description Qty Price persecurity Total'];

export const defaultDeposits: Line[] = [
    'Contributions and Deposits',
    'Jul 02 Electronic Funds Transfer Out: 1,000.00 CAD – – -$1,000.00',
    'Apr 02 Electronic Funds Transfer In: $5,000.00 CAD – – $5,000.00',
    'May 02 settled May 04 Electronic Funds Transfer In: $5,000.00 CAD – – $5,000.00',
    'Total - Contributions and Deposits $9,000.00'
];

export const defaultTrades: Line[] = [
    'Trades',
    'Sep 25 settled Sep 29 Sold 14.0853 of BSPA - Beispiel Corp for 1521.49 CAD -14.0853 $108.02 -$1,521.49',
    'Dec 29 settled Dec 31 Bought 1.7582 of BSPB - Beispiel Long Bond ETF for 35.04 CAD 1.7582 $19.93 $35.04'
];

export const defaultDividends: Line[] = [
    'Canadian and Foreign Dividends',
    'Dec 22 BSPC-Beispiel Min Vol Global ETF: 15-DEC-20 (record date) 8.3610 shares, gross 6.61 USD, – – $8.55',
    'convert to CAD @ 1.2927',
    'Oct 02 BSPD - Beispiel ETF: 28-SEP-20 (record date) 4.7706 shares, gross 3.22 USD, – – $4.29',
    'Dec 03 BSPB-Beispiel Long Bond ETF: 30-NOV-20 (record date) 148.3070 shares – – $6.38',
    'Total - Canadian and Foreign Dividends $19.22'
];

export const defaultTaxes: Line[] = [
    'Tax',
    'Dec 22 BSPC-Beispiel ETF: Non-resident tax withheld at source (0.99 USD) – $1.00 -$1.28',
    'Total - Tax -$1.28'
];

export const defaultFees: Line[] = [
    'Management Fees 7',
    'Dec 31 Gross management fee to Wealthsimple – – -$4.42',
    'Dec 31 Promotions and discounts applied to Wealthsimple fee – – $0.26',
    'Dec 31 Sales tax on management fee to Wealthsimple – – -$0.21',
    'Total - Management Fees 7 -$4.37'
];

export const wealthsimpleReport = (options: { title?: string; account?: string; second?: string; pageOne?: Line[]; pageTwo?: Line[] } = {}): Line[][] => {
    const title = options.title || '2020 Performance Report';
    const account = options.account || 'TFSA';
    return [
        [
            `Wealthsimple Prepared for: Max Beispiel, 1 Beispiel Road, Toronto ON CA Page 1 of 3`,
            `${title} Notes This report details how the investments in your account have performed`,
            'Wealthsimple Inc. 1 Beispiel Avenue, Toronto Ontario M5V 0A0 Canada Conversion rate $1.00 USD = $1.27300 CAD'
        ],
        [...HEAD(account), ...(options.pageOne || [...defaultDeposits, ...defaultTrades]), ...FOOTER(2, title)],
        [...HEAD(options.second || account), ...(options.pageTwo || [...defaultDividends, ...defaultTaxes, ...defaultFees]), 'Glossary', 'Management Fees7 Time-weighted returns', ...FOOTER(3, title)]
    ];
};

export const wealthsimpleConfirmation = (): Line[][] => [['Trade confirmation', 'Wealthsimple Investments Inc.', 'Bought 1 of BSPA']];
