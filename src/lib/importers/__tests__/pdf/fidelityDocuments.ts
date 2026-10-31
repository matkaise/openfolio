// Synthetic Fidelity confirmations. Names, numbers, ids and addresses are made up.

type Line = string | [number, string][];

const COLUMNS = 'REFERENCE NO. TYPE REG.REP. TRADE DATE SETTLEMENT DATE CUSIP NO. ORDER NO.';

const CONFIRMATION_HEAD = (page: number): Line[] => [
    [[50, 'PO Box 28019'], [300, `Transaction Confirmation     Page ${page} of 2`]],
    'Confirm Date: December 14, 2023',
    'Brokerage Account Number',
    '*****1234 INDIVIDUAL - TOD',
    'MAX BEISPIEL'
];

const FOOT: Line[] = [
    'ALL ORDERS ARE UNSOLICITED UNLESS SPECIFIED ABOVE 9900012345',
    'FIDELITY BROKERAGE SERVICES LLC, MEMBER NYSE, SIPC'
];

const LEFT_RIGHT = (left: string, right: string): Line => [[60, left], [370, right]];

export const usBuy = (reference = '12345-AAA45A', settlement = '3,990.00'): Line[] => [
    COLUMNS,
    `${reference} 1* WO# 12-14-23 12-18-23 123450AA7 12345-BB72C`,
    'DESCRIPTION and DISCLOSURES',
    LEFT_RIGHT('You Bought BEISPIEL INC CAP STK CL C', 'Principal Amount       3,990.00'),
    LEFT_RIGHT('       30 WE HAVE ACTED AS AGENT.', `Settlement Amount       ${settlement}`),
    '       at    133.0000',
    'Symbol:',
    'BSPC'
];

export const foreignSale = (): Line[] => [
    COLUMNS,
    '12345-CCC78D 1* WO# 12-14-23 12-18-23 113000AB5 67890-I5XYZ',
    'DESCRIPTION and DISCLOSURES',
    LEFT_RIGHT('You Sold BEISPIEL MANAGEMENT LTD CLASS', 'Principal Amount       7,935.27'),
    LEFT_RIGHT('      203 A LTD VOTING SHS ISIN #CA00FTEST012', 'Activity Assessmen t  F e e     0.07'),
    LEFT_RIGHT('       at    39.0900 SEDOL #BPTEST2', 'Settlement Amount       7,935.20'),
    'Symbol: WE HAVE ACTED AS AGENT.',
    'BSPM LOTS WITHOUT SPECIFIC SHARES',
    'PARTIAL EXECUTION'
];

export const fractionalSale = (): Line[] => [
    COLUMNS,
    '12234-EEE9F 1* WO# 12-14-23 12-18-23 113000AB5 12345-I8ZZZ',
    'DESCRIPTION and DISCLOSURES',
    LEFT_RIGHT('You Sold BEISPIEL MANAGEMENT LTD CLASS', 'Principal Amount           1.25'),
    LEFT_RIGHT('      .032 A LTD VOTING SHS ISIN #CA00FTEST012', 'Settlement Amount           1.25'),
    '       at    39.0900 SEDOL #BPTEST2',
    'Symbol: WE HAVE ACTED AS AGENT.',
    'BSPM LOTS WITHOUT SPECIFIC SHARES'
];

export const isinInTitleBuy = (): Line[] => [
    COLUMNS,
    '12234-GGG0H 1* WO# 12-14-23 12-18-23 67077A108 12345-I9ZZZ',
    'DESCRIPTION and DISCLOSURES',
    LEFT_RIGHT('You Bought BEISPIEL LTD COM NPV ISIN #CA00FTEST020', 'Principal Amount       4,427.59'),
    LEFT_RIGHT('       80 SEDOL #BDTEST0', 'Settlement Amount       4,427.59'),
    '       at    55.3449',
    'Symbol:',
    'BSPN'
];

export const fidelityConfirmation = (...blocks: Line[][]): Line[][] => {
    const all = blocks.length ? blocks : [usBuy(), foreignSale(), fractionalSale(), isinInTitleBuy()];
    return [
        [...CONFIRMATION_HEAD(1), ...all[0], ...(all[1] || []), ...FOOT],
        [...CONFIRMATION_HEAD(2), ...all.slice(2).flat(), ...FOOT]
    ];
};

const PLAN_HEAD = (reference: string): Line[] => [
    'PARTICIPANT NO.',
    'I00000001',
    'MAX BEISPIEL',
    [[60, '1 BEISPIEL ROAD'], [300, 'FIDELITY STOCK PLAN SERVICES, LLC']],
    'CINCINNATI, OH  45277-0003',
    `REF # ${reference}`,
    'CUSTOMER NO.   PARTICIPANT ID. TYPE REG.REP. TRADE DATE SETTLEMENT DATE TRANS NO. CUSIP NO. ORIG.'
];

export const planSale = (net = '2,423.41'): Line[][] => [[
    ...PLAN_HEAD('23346-K9T1Q9'),
    'I00000001 1 WI# 12-12-23 12-14-23 K9T1Q9 111111AA1',
    'YOU SOLD 14 AT 173.1100',
    [[60, 'EXPLANATION OF PROCEEDS']],
    LEFT_RIGHT('SECURITY DESCRIPTION SYMBOL: BSPL', 'Sale Proceeds     $2,423.54'),
    'BEISPIEL INC',
    'DETAILS: Total Fees          $0.13',
    'Sale Date: DEC/12/2023',
    'Plan Type: COMPANY STOCK PLAN',
    `Net Cash Proceeds¹     -$${net}`,
    'PLEASE RETAIN THIS STATEMENT FOR YOUR RECORDS'
]];

export const planPurchase = (contributions = '442.83'): Line[][] => [[
    ...PLAN_HEAD('23342-0D6SVL'),
    'I00000001 1 000 12-08-23 12-12-23 0D6SVL 222222BB2',
    'Confirmation of purchase made through your',
    LEFT_RIGHT('BSPE ESPP on DEC/08/2023.', 'PURCHASE INFORMATION'),
    LEFT_RIGHT('Offering period: JAN/01/2023 - DEC/31/2023', 'Market Value at Purchase¹        $442.83'),
    LEFT_RIGHT('', `Accumulated Contributions*        $${contributions}`),
    LEFT_RIGHT('YOU PURCHASED 7.5146 AT $58.9290', 'PURCHASE PRICE Gain²          $0.00'),
    LEFT_RIGHT('SECURITY DESCRIPTION SYMBOL: BSPE', 'EXPLANATION OF PROCEEDS'),
    'BEISPIEL NATL',
    'PLEASE RETAIN THIS STATEMENT FOR YOUR RECORDS'
]];

export const fidelityStatement = (): Line[][] => [['Investment Report', 'FIDELITY BROKERAGE SERVICES LLC, MEMBER NYSE, SIPC', 'Account summary']];

export const otherFidelity = (): Line[][] => [['Fidelity International', 'Your account statement', 'Valuation']];
