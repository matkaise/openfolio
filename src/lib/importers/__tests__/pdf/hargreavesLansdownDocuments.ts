// Synthetic Hargreaves Lansdown contract notes. Names, numbers, ids and addresses are made up.

type Line = string | [number, string][];

const HEADER: Line[] = [
    'One College Square South, Anchor Road, Bristol, BS1 5HL',
    'Hargreaves Lansdown is a trading name of Hargreaves Lansdown Asset Management Limited.',
    'Authorised & Regulated by the Financial Conduct Authority, No. 000000 Company Registration No. 00000000.',
    'Contract Note',
    'Mr Max Beispiel',
    'Beispiel Road 1',
    'London',
    'A/C Designation :'
];

const FOOTER: Line[] = [
    'E and OE',
    'Note: Retain this document as a record of your investment.',
    'Details of any commission shared with third parties is available upon request.'
];

const TABLE: Line = [[50, 'Quantity'], [120, 'Security'], [400, 'Price'], [470, 'Consideration']];

const DEAL = (quantity: string, name: string, price: string, consideration: string): Line => [[50, quantity], [120, name], [400, price], [470, consideration]];

const DATED = (date: string, time: string, number: string): Line => [[50, `Date ${date}`], [200, `Time ${time}`], [300, `Contract Note No. ${number}`]];

const SETTLED = (account: string, date: string, amount: string): Line => [[50, account], [250, `Settlement Date: ${date}`], [470, amount]];

export const hlEtfBuy = (number = 'B100000001-01000000', total = '57,581.69'): Line[][] => [[
    ...HEADER,
    DATED('15/10/2024', '09:47', number),
    '(To be quoted in all correspondence)',
    'We have today on your instructions **BOUGHT** the security detailed below.',
    'IMPORTANT Please check all details are correct. You should advise us of any discrepancy immediately',
    TABLE,
    'IE00HTEST012 STOCK CODE: HBSP',
    'Beispiel ETFs Plc',
    DEAL('2,539.00', 'MSCI World ETF GBP', '2267.4179', '57,569.74'),
    'Market Order',
    'Venue of Execution: London Stock Exchange (XLON)',
    'Commission 11.95',
    'These shares / units have been dealt using the following account:',
    SETTLED('HL SIPP', '19/10/2024', total),
    ...FOOTER
]];

export const hlFundBuy = (): Line[][] => [[
    ...HEADER,
    DATED('03/04/2023', '08:00', 'B100000002-01000000'),
    'We have today on your instructions **BOUGHT** the security detailed below.',
    TABLE,
    'GB00HTEST020',
    'Beispiel UK Index',
    DEAL('1,043.478', 'Class C - Accumulation (GBP)', '287.500000', '3,000.00'),
    'Venue of Execution: The manager of the unit trust',
    'These shares / units have been dealt using the following account:',
    SETTLED('HL ISA', '07/04/2023', '3,000.00'),
    ...FOOTER
]];

/** Spaced-out letters as in later notes, a share with a trailing dot in its code. */
export const hlShareSale = (): Line[][] => [[
    ...HEADER,
    DATED('25 /01/202 4', '09:35', 'S100000003-01000000'),
    'We have today on your instructions ** SOL D** the security detailed below.',
    TABLE,
    'GB00HTEST038 STOCK CODE: BE.',
    'Beispiel plc',
    DEAL('132.00', 'Ordinary Shares 1p', '752.896', '993.82'),
    'Market Order',
    'Commission 11.95',
    'These shares / units have been dealt using the following account:',
    SETTLED('HL Fund & Shar e A c c o u n t', '29/01/2024', '981.87'),
    ...FOOTER
]];

export const hlShareBuyWithStampDuty = (extra: Line[] = []): Line[][] => [[
    ...HEADER,
    DATED('12/02/2024', '10:15', 'B100000004-01000000'),
    'We have today on your instructions **BOUGHT** the security detailed below.',
    TABLE,
    'GB00HTEST038 STOCK CODE: BE.',
    'Beispiel plc',
    DEAL('200.00', 'Ordinary Shares 1p', '500.000', '1,000.00'),
    'Commission 11.95',
    'Stamp Duty 5.00',
    'PTM Levy 1.00',
    ...extra,
    'These shares / units have been dealt using the following account:',
    SETTLED('HL ISA', '14/02/2024', '1,017.95'),
    ...FOOTER
]];

export const hlInvestmentReport = (): Line[][] => [[
    'Investment Report',
    'Hargreaves Lansdown is a trading name of Hargreaves Lansdown Asset Management Limited.',
    'Valuation of your account'
]];
