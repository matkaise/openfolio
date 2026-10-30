// Synthetic CommSec confirmations in the two known layouts. Names, numbers, ids and addresses are made up.

type Line = string | [number, string][];

const HEADER = (side: 'BUY' | 'SELL'): Line[] => [
    side,
    'Address - Locked Bag 22 Australia Square NSW 1215',
    [[60, 'Telephone - 13 15 19'], [340, 'TAX INVOICE']],
    [[60, 'Email - shares@commsec.com.au'], [340, 'CONFIRMATION']],
    'Trading, Clearing and Settlement of this transaction is undertaken by',
    'Commonwealth Securities Limited.',
    'MR MAX BEISPIEL',
    '1 BEISPIEL ROAD'
];

const FOOTER: Line[] = [
    'SETTLEMENT DATE: 24/04/2024',
    '1. This Confirmation Contract Note is issued by Commonwealth Securities Limited and is issued subject to:',
    'If you request a Confirmation Contract Note to be sent to you by post, a $1.95 fee will be charged in addition to brokerage.'
];

const LABELS = (left: string, right: string): Line => [[50, left], [300, right]];

export const commsecBuy = (options: { confirmation?: string; total?: string; application?: string } = {}): Line[][] => [[
    ...HEADER('BUY'),
    'WE HAVE BOUGHT THE FOLLOWING SECURITIES FOR YOU',
    'COMPANY: BEISPIEL AIRWAYS LIMITED',
    'BSP',
    'SECURITY: ORDINARY FULLY PAID',
    LABELS('DATE: 22/04/2024', 'UNITS AT PRICE'),
    LABELS('AS AT DATE: 22/04/2024', '277 3.610000'),
    `CONFIRMATION NO: ${options.confirmation || '90000001'}`,
    'AVERAGE PRICE: 3.610000',
    'ORDER NO: N100000001',
    'ACCOUNT NO: 1000001 PID 1402 HIN 10000001',
    'ORDER COMPLETED',
    'TOTAL UNITS: 277',
    LABELS('CONSIDERATION (AUD): $999.97', 'CONTRACT COMMENTS:'),
    LABELS('BROKERAGE & COSTS INCL GST: $29.95', '55000001 0400000001'),
    '(may include printed confirmation postal fee) 158',
    `APPLICATION MONEY: $${options.application || '0.00'}`,
    `TOTAL COST: $${options.total || '1,029.92'}`,
    'TOTAL GST: $2.72',
    ...FOOTER
]];

export const commsecSell = (): Line[][] => [[
    ...HEADER('SELL'),
    'WE HAVE SOLD THE FOLLOWING SECURITIES FOR YOU Ex Dividend',
    'COMPANY BEISPIEL GLOBAL LIMITED',
    'SECURITY ORDINARY FULLY PAID BGL',
    'DATE: 22/04/2024',
    LABELS('AS AT DATE: 22/04/2024', 'UNITS AT PRICE'),
    LABELS('CONFIRMATION NO: 90000002', '1,000 28.060000'),
    'ORDER NO: N100000002',
    LABELS('ACCOUNT NO: 1000001', 'AVERAGE PRICE: 28.060000'),
    'TOTAL UNITS: 1,000',
    LABELS('CONSIDERATION (AUD): $28,060.00', 'PID 1402 HIN 10000001'),
    LABELS('BROKERAGE & COSTS INCL GST: $28.06', 'ORDER COMPLETED'),
    'APPLICATION MONEY: $0.00',
    'NET PROCEEDS: $28,031.94',
    'TOTAL GST: $2.55 105',
    ...FOOTER
]];

export const commsecBoth = (): Line[][] => [commsecBuy()[0], commsecSell()[0]];

export const commsecHoldings = (): Line[][] => [[
    'HOLDINGS SUMMARY',
    'Commonwealth Securities Limited',
    'BSP 277 3.70'
]];
