// Synthetic Yuh transaction notifications, laid out like the originals: a header block, the title
// with the reference, tables placed by x position and the Swissquote footer. Names, numbers, ids
// and addresses are made up.

type Line = string | [number, string][];

const HEADER = (notice: string, client: string, date: string): Line[] => [
    notice,
    `${client}: 1000001`,
    'IBAN: CH0000000000000000000',
    'Max Beispiel',
    'Beispielweg 1',
    '8000 Musterstadt',
    `Gland, ${date}`
];

const FOOTER_DE: Line[] = [
    'Dieser Transaktionsbeleg sowie die aufgeführte Transaktion unterliegen unseren Allgemeinen Geschäftsbedingungen für Yuh Accounts.',
    [[50, 'Die Bankdienstleistungen für Yuh werden von Swissquote Bank AG erbracht, einer Bank,'], [420, 'Formular ohne Unterschrift | SE&O.']],
    'die von der Eidgenössischen Finanzmarktaufsicht (FINMA) reguliert wird.',
    'Swissquote Bank AG, chemin de la Crétaux 33, CH-1196 Gland | Customer Care: +41 00 000 00 00'
];

const FOOTER_EN: Line[] = [
    'This notification as well as the transaction are governed by the General Terms and Conditions for Yuh Accounts.',
    [[50, 'Yuh banking services are provided by Swissquote Bank Ltd,'], [420, 'Advice without signature | E&OE.']],
    'a bank regulated by the Swiss Financial Market Supervisory Authority (FINMA).',
    'Swissquote Bank Ltd, Chemin de la Crétaux 33, CH-1196 | Gland Customer Care: +41 00 000 00 00'
];

const SECURITY = (isin = 'CH00YTEST018', name = 'BEISPIEL HOLDING N'): Line[] => [
    [[50, `${name} ISIN: ${isin}`], [330, 'SIX Swiss Exchange']],
    'NKN: 10000001'
];

const FILL = (quantity: string, price: string, amount: string): Line => [[50, quantity], [120, price], [190, amount]];

export const yuhBuy = (reference = '700000001', closing = 'Zu Ihren Lasten CHF 100.10'): Line[][] => [[
    ...HEADER('TRANSAKTIONSBELEG', 'Kunde', '31.10.2024'),
    `Kauf * Unsere Referenz: ${reference}`,
    'Gemäss Ihrem Kaufauftrag vom 31.10.2024 haben wir folgende Transaktionen vorgenommen:',
    'Titel Haupthandelsplatz **',
    ...SECURITY(),
    [[50, 'Anzahl'], [120, 'Preis'], [190, 'Betrag']],
    FILL('1.0269', '97.38', 'CHF 100.00'),
    'Total CHF 100.00',
    'Kommission CHF 1.00',
    'Abgabe (Eidg. Stempelsteuer) CHF 0.10',
    'Benutzter Trading Credit 1.00',
    closing,
    'Betrag belastet auf Kontonummer 100000100, Valutadatum 04.11.2024',
    ...FOOTER_DE
]];

export const yuhSell = (): Line[][] => [[
    ...HEADER('TRANSACTION NOTIFICATION', 'Client', '21.10.2025'),
    'Sell Our reference: 700000002',
    'In accordance with your sell order of 21.10.2025, we have carried out the following transactions:',
    'Security Exchange',
    ...SECURITY('CH00YTEST026', 'BEISPIEL SILVER ETF-A CHF'),
    [[50, 'Quantity'], [120, 'Price'], [190, 'Amount']],
    FILL("50.0721", '108.7', "CHF 5'442.84"),
    "Total CHF 5'442.84",
    'Commission CHF 27.20',
    'Tax (Federal stamp duty) CHF 4.10',
    "To your credit CHF 5'411.54",
    'Amount credited to your account number 100000100, on value date of 22.10.2025',
    ...FOOTER_EN
]];

/** A USD security settled in CHF; the rate line wraps like in the Swissquote originals. */
export const yuhForeignBuy = (): Line[][] => [[
    ...HEADER('TRANSAKTIONSBELEG', 'Kunde', '05.02.2025'),
    'Kauf * Unsere Referenz: 700000003',
    'Gemäss Ihrem Kaufauftrag vom 05.02.2025 haben wir folgende Transaktionen vorgenommen:',
    ...SECURITY('US00YTEST034', 'BEISPIEL ORD'),
    [[50, 'Anzahl'], [120, 'Preis'], [190, 'Betrag']],
    FILL('2', '150', 'USD 300.00'),
    'Total USD 300.00',
    'Wechselkurs 0.9',
    'CHF 270.00',
    'Kommission CHF 1.35',
    'Abgabe (Eidg. Stempelsteuer) CHF 0.40',
    'Zu Ihren Lasten CHF 271.75',
    ...FOOTER_DE
]];

export const yuhDividendCh = (title = 'Dividende', reference = '700000004'): Line[][] => [[
    ...HEADER('TRANSAKTIONSBELEG', 'Kunde', '20.03.2024'),
    `${title} Unsere Referenz: ${reference}`,
    'Im Hinblick auf folgenden Titel:',
    'Bezeichnung Anzahl',
    [[50, 'BEISPIEL GS ISIN: CH00YTEST042NKN: 1000002'], [330, '4.0542']],
    'haben wir Ihrem Konto den folgenden Betrag gutgeschrieben:',
    'Kontonummer 100000100',
    'Ausführungsdatum 16.03.2024',
    'Valutadatum 20.03.2024',
    'Anzahl 4.0542',
    'Dividende 9.5 CHF',
    'Betrag CHF 38.51',
    'Verrechnungssteuer 35% (CH) CHF 13.48',
    'Total CHF 25.03',
    ...FOOTER_DE
]];

export const yuhDividendUsd = (): Line[][] => [[
    ...HEADER('TRANSAKTIONSBELEG', 'Kunde', '30.03.2024'),
    'Dividende Unsere Referenz: 700000005',
    'Bezeichnung Anzahl',
    [[50, 'BEISPIEL ALLWORLD ETF DIST ISIN: IE00YTEST052NKN: 1000003'], [380, '3.553']],
    'Valutadatum 29.03.2024',
    'Anzahl 3.553',
    'Dividende 0.5 USD',
    'Betrag USD 1.78',
    'Quellensteuer 15.00% (US) USD 0.27',
    'Total USD 1.51',
    'Wechselkurs USD / CHF : 0.91707',
    ...FOOTER_DE
]];

export const yuhDividendInChf = (): Line[][] => [[
    ...HEADER('TRANSAKTIONSBELEG', 'Kunde', '15.05.2024'),
    'Dividende Unsere Referenz: 700000006',
    'Bezeichnung Anzahl',
    [[50, 'BEISPIEL ORD ISIN: US00YTEST034NKN: 1000004'], [330, '10']],
    'Valutadatum 15.05.2024',
    'Anzahl 10',
    'Dividende 2.81 USD',
    'Betrag USD 28.10 CHF 25.28',
    'Quellensteuer 15.00% (US) USD 4.22 CHF 3.80',
    'Total USD 23.88 CHF 21.48',
    'Wechselkurs USD / CHF : 0.89959',
    ...FOOTER_DE
]];

export const yuhPayment = (direction: 'Gutschrift' | 'Belastung', reference: string, amount: string): Line[][] => [[
    ...HEADER('TRANSAKTIONSBELEG', 'Kunde', '27.10.2024'),
    `Zahlungsverkehr - ${direction} Unsere Referenz: ${reference}`,
    'Kontonummer 100000102',
    'Valutadatum 27.10.2024',
    `${direction === 'Gutschrift' ? 'Eingehende Überweisung' : 'Auszahlung'} EUR ${amount}`,
    `Total EUR ${amount}`,
    'Im Auftrag von Max Beispiel',
    'Mitteilung Betreff der Überweisung',
    ...FOOTER_DE
]];

const INTEREST_PAGE = (currency: string, row: string, total: string): Line[] => [
    'Max Beispiel',
    'Beispielweg 1',
    `IBAN : CH0000000000000000000 - Währung : ${currency}`,
    'Zinsabrechnung vom 05.09.2024 bis zum 31.12.2024',
    `Datum Habenzins Sollzins Zu Ihren Verrechnungs- Total ${currency}`,
    'Gunsten/Lasten steuer',
    row,
    total,
    'Kontostand 1\'094.36',
    'Bitte für Ihre Steuererklärung aufbewahren',
    ...FOOTER_DE.slice(1)
];

export const yuhInterest = (): Line[][] => [
    INTEREST_PAGE('CHF', "30.12.2024 201.36 0.00 201.36 70.48 130.88", "Total 201.36 0.00 201.36 70.48 130.88"),
    INTEREST_PAGE('USD', '30.12.2024 0.08 0.00 0.08 0.00 0.08 0.92352 0.07', 'Total 0.08 0.00 0.08 0.00 0.08 0.07')
];

export const yuhTitleTransfer = (): Line[][] => [[
    ...HEADER('TRANSAKTIONSBELEG', 'Kunde', '17.03.2026'),
    'Titelumbuchung Unsere Referenz: 700000007',
    'Wir haben folgende Transaktion auf Ihrem Konto vorgenommen, Valutadatum 17.03.2026:',
    'BEISPIEL GS ISIN: CH00YTEST042 - -8.493',
    'BEISPIEL PS ISIN: CH00YTEST059 1 : 1 8.493',
    ...FOOTER_DE
]];

/** A Swissquote notice of a regular trading account: same bank, no Yuh footer. */
export const swissquoteBuy = (): Line[][] => [[
    'Börsentransaktion: Kauf Unsere Referenz: 700000008',
    ...SECURITY(),
    'Swissquote Bank AG, chemin de la Crétaux 33, CH-1196 Gland'
]];
