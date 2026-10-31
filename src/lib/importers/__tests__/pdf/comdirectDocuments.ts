// Synthetic comdirect documents, laid out like the originals: Wertpapierabrechnungen in
// plain text, Steuermitteilungen with single letters at their own x position, so the
// extraction sees letter-spaced text as the real documents produce it. Names, numbers,
// ids and addresses are made up.

type Line = string | [number, string][];

/** Label in single letters with wide gaps, followed by a value in the second column. */
const letters = (text: string, value = ''): Line => {
    const cells = Array.from(text).flatMap((char, index) => (char === ' ' ? [] : [[50 + index * 6, char] as [number, string]]));
    return value ? [...cells, [420, value]] : cells;
};

const cols = (left: string, right: string): Line => [[50, left], [330, right]];

const HEADER = (date: string): Line[] => [
    'Ihren Auftrag haben wir gemäß unseren Geschäftsbedingungen wie nachstehend ausgeführt.',
    '25449 Quickborn',
    'Depotnr.: 1000000 00',
    'Max Beispiel',
    'Beispielweg 1',
    '12345 Musterstadt',
    `GESCHÄFTSABRECHNUNG VOM ${date}`
];

const FOOTER: Line[] = ['Ihre comdirect', 'Diese Abrechnung wird von der Bank nicht unterschrieben'];

const NOTICE_HEADER = (date: string, reference: string): Line[] => [
    'Kundennr. /BLZ Bezeichnung',
    '1000000 Max Beispiel',
    letters('comdirect bank AG'),
    letters('25451 Quickborn'),
    [[50, 'Herrn'], ...(letters(`Datum: ${date}`) as [number, string][]).map(([x, text]) => [x + 280, text] as [number, string])],
    'Max Beispiel',
    letters(`Referenz-Nummer: ${reference}`)
];

const paper = (name: string, more: string, wkn: string, isin: string): Line[] => [
    cols('Wertpapier-Bezeichnung', 'WPKNR/ISIN'),
    cols(name, wkn),
    cols(more, isin)
];

const settled = (heading: string, row: string): Line[] => [cols('IBAN', `Valuta   ${heading}`), row];

export const comdirectBuy = (): Line[][] => [[
    ...HEADER('03.01.2025'),
    'Wertpapierkauf',
    'Geschäftsnummer   : 19 041342',
    'Ordernummer       : 000532542608    Rechnungsnummer   : 878649826981DB85',
    cols('Geschäftstag      : 02.01.2025', 'Ausführungsplatz  : XETRA'),
    ...paper('BEISPIEL Weltfonds - ESG', 'Inhaber-Anteile LC o.N.', 'CDTST1', 'LU00CTEST012'),
    cols('Nennwert', 'Zum Kurs von'),
    cols('St. 8,544', 'EUR 117,03'),
    [[150, 'Kurswert                    : EUR              999,90']],
    'Eigene Entgelte',
    [[150, 'Provision                   : EUR                4,90']],
    [[150, 'Börsenplatzabhäng. Entgelt  : EUR                1,50']],
    [[150, 'Summe Entgelte              : EUR                6,40']],
    ...settled('Zu Ihren Lasten vor Steuern', 'DE00 0000 0000 0000 0000 00 EUR 06.01.2025 EUR 1.006,30'),
    'Verwahrungs-Art: GIROSAMMELDEPOT',
    'Informationen zur steuerlichen Behandlung finden Sie auf der separaten Steuermitteilung.',
    ...FOOTER
]];

const taxNotice = (options: {
    title: string; date: string; reference: string; security: string; before: string; lines?: Line[];
    taxes: string; label?: string; after: string; valuta?: string; beforeLabel?: string; afterLabel?: string;
}): Line[] => [
    ...NOTICE_HEADER(options.date, options.reference),
    `Steuerliche Behandlung: ${options.title}`,
    options.security,
    letters(`Zu Ihren ${options.beforeLabel || 'Gunsten'} vor Steuern:`, options.before),
    letters('Steuerbemessungsgrundlage', 'E U R  0 , 0 0'),
    ...(options.lines || []),
    letters(options.label || 'abgeführte Steuern', options.taxes),
    letters(`Zu Ihren ${options.afterLabel || 'Gunsten'} nach Steuern:`, options.after),
    ...(options.valuta ? [`Die Gutschrift erfolgt mit Valuta ${options.valuta} auf Konto EUR mit der IBAN DE00 0000 0000 0000 0000 00`] : []),
    'KEINE STEUERBESCHEINIGUNG ...',
    '(4) Die ausgewiesenen EUR-Beträge spiegeln den Stand zum Abrechnungszeitpunkt wider.'
];

export const comdirectBuyNotice = (): Line[][] => [taxNotice({
    title: 'Wertpapierkauf Nr. 19041342 vom 02.01.2025', date: '03.01.2025', reference: '08IJEGX57KH002LC',
    security: 'Stk.  8,544 BEISPIEL WELTFDS-ESG LC , WKN / ISIN: CDTST1  / LU00CTEST012',
    before: 'EUR  -1.006,30', beforeLabel: 'Lasten', taxes: 'EUR 0,00', after: 'EUR  -1.006,30', afterLabel: 'Lasten'
})];

/** Both documents as one PDF, as the PostBox delivers them for some transactions. */
export const comdirectBuyCombined = (): Line[][] => [...comdirectBuy(), ...comdirectBuyNotice()];

export const comdirectForeignBuy = (): Line[][] => [[
    ...HEADER('17.04.2025'),
    'Wertpapierkauf',
    'Geschäftsnummer   : 92 017178',
    'Ordernummer       : 000000000002-001  Rechnungsnummer   : 000000000002DA11',
    cols('Geschäftstag      : 16.04.2025', 'Ausführungsplatz  : NEW YORK NASDAQ (GSM)'),
    ...paper('Muster.com Inc.', 'Registered Shares DL -,01', 'CDTST2', 'US00CTEST024'),
    cols('Nennwert', 'Zum Kurs von'),
    cols('St. 2', 'USD 2.384,00'),
    [[150, 'Kurswert                    : USD            4.768,00']],
    [[150, 'Ausmachender Betrag         : USD            4.781,90']],
    [[150, 'Umrechn. zum Dev. kurs 1,080600 vom 17.04.2025 : EUR  4.425,22']],
    'Eigene Entgelte',
    [[150, 'Provision                   : EUR               18,93']],
    'Fremde Kosten',
    [[150, 'Fremde Spesen               : USD               13,90']],
    ...settled('Zu Ihren Lasten vor Steuern', 'DE00 0000 0000 0000 0000 00 EUR 20.04.2025 EUR 4.444,15'),
    ...FOOTER
]];

/** Several partial executions with a summary line; a sale, so costs carry a trailing minus. */
export const comdirectPartialSell = (): Line[][] => [[
    ...HEADER('10.03.2025'),
    '* Wertpapierverkauf',
    'Geschäftsnummer   : 92 042963 bis 92 042964',
    'Ordernummer       : 000209283981    Rechnungsnummer   : 542587765895DFA5',
    cols('Geschäftstag      : 10.03.2025', 'Ausführungsplatz  : TRADEGATE'),
    ...paper('Muster Industrie AG', 'Inhaber-Aktien o.N.', 'CDTST3', 'DE000CTEST36'),
    'Ihre Order wurde wie folgt ausgeführt:',
    'Handelszeit  Nennwert   Zum Kurs von   Kurswert',
    '18:43 St. 150 EUR 20,00 EUR 3.000,00',
    '18:43 St. 250 EUR 20,00 EUR 5.000,00',
    '---------------------------------------------------------',
    'Summe St. 400 EUR 20,00 EUR 8.000,00',
    '(ggf. gerundet)',
    'Eigene Entgelte',
    [[150, 'Gesamtprovision             : EUR               36,74-']],
    'Fremde Kosten',
    [[150, 'Maklercourtage              : EUR                3,90-']],
    ...settled('Zu Ihren Gunsten vor Steuern', 'DE00 0000 0000 0000 0000 00 EUR 12.03.2025 EUR 7.959,36'),
    ...FOOTER
]];

export const comdirectSellNotice = (): Line[][] => [taxNotice({
    title: 'Wertpapierverkauf Nr. 92042963 vom 10.03.2025', date: '12.03.2025', reference: '2II9JQM4AEI0004E',
    security: 'Stk.  -400 MUSTER INDUSTRIE AG , WKN / ISIN: CDTST3  / DE000CTEST36',
    before: 'EUR  7.959,36',
    lines: [letters('Kapitalertragsteuer', 'E U R  -  1 2 5 , 0 0'), letters('Solidaritätszuschlag', 'E U R  -  6 , 8 7')],
    taxes: 'EUR  -131,87', after: 'EUR  7.827,49', valuta: '12.03.2025'
})];

export const comdirectRefundNotice = (): Line[][] => [taxNotice({
    title: 'Verkauf Investmentfonds Nr. 92014209 vom 31.03.2025', date: '02.04.2025', reference: '3AAA3BBB4CCC0005F',
    security: 'Stk.  -0,156 BEISPIEL FONDS AADL , WKN / ISIN: CDTST4  / LU00CTEST046',
    before: 'EUR  6,95', label: 'erstattete Steuern', taxes: 'EUR 0,02', after: 'EUR  6,97', valuta: '03.04.2025'
})];

/** Fund with a discount on the sales charge. */
export const comdirectFundDiscount = (): Line[][] => [[
    ...HEADER('08.01.2025'),
    'Wertpapierkauf',
    'Geschäftsnummer   : 46 424883',
    'Ordernummer       : 004786949040    Rechnungsnummer   : 442604441030D195',
    cols('Geschäftstag      : 08.01.2025', 'Ausführung  comdirect'),
    ...paper('BSF - BEISPIEL MIPG', 'Actions Nom.A4 EUR o.N.', 'CDTST5', 'LU00CTEST053'),
    cols('Nennwert', 'Zum comdirect Preis von'),
    cols('St. 0,205', 'EUR 124,7715'),
    [[150, 'Kurswert                    : EUR               25,58']],
    [[150, '2,38095% Reduktion Kaufaufschlag  : EUR          0,61-']],
    ...settled('Zu Ihren Lasten vor Steuern', 'DE00 0000 0000 0000 0000 00 EUR 11.01.2025 EUR 24,97'),
    ...FOOTER
]];

/** Recent fixed-price fund sale: no market value line, only unit price and rate. */
export const comdirectFixedPriceSell = (): Line[][] => [[
    ...HEADER('01.04.2025'),
    'Wertpapierverkauf',
    'Geschäftsnummer   : 95 831936',
    'Ordernummer       : 703388829593-001  Rechnungsnummer   : 459495152574C254',
    cols('Geschäftstag      : 31.03.2025', 'Ausführung  comdirect'),
    ...paper('Beispiel SICAV I-Emerg.Mkts', 'Actions Nom. A Acc USD o.N.', 'CDTST4', 'LU00CTEST046'),
    cols('Nennwert', 'Festpreis pro Stück'),
    cols('St. 0,156', 'USD 48,244583'),
    [[150, 'Umrechn. zum Dev. kurs 1,082900 vom 01.04.2025']],
    ...settled('Zu Ihren Gunsten vor Steuern', 'DE00 0000 0000 0000 0000 00 EUR 03.04.2025 EUR 6,95'),
    ...FOOTER
]];

export const comdirectBondBuy = (): Line[][] => [[
    ...HEADER('14.11.2025'),
    'Wertpapierkauf',
    'Geschäftsnummer   : 92 017179',
    'Ordernummer       : 000000000003    Rechnungsnummer   : 000000000003DB85',
    cols('Geschäftstag      : 13.11.2025', 'Abwicklung  : FRANKFURT'),
    ...paper('14,00000% Beispiel Issuer S.A.', 'EO-MTN 23(24) Muster', 'CDTST6', 'DE000CTEST69'),
    cols('Nennwert', 'Zum Preis von'),
    cols('EUR 1.000', '100%'),
    [[150, 'Kurswert                    : EUR            1.000,00']],
    ...settled('Zu Ihren Lasten vor Steuern', 'DE00 0000 0000 0000 0000 00 EUR 20.11.2025 EUR 1.000,00'),
    ...FOOTER
]];

export const comdirectDividendCredit = (): Line[][] => [[
    '25449 Quickborn',
    'comdirect bank Aktiengesellschaft',
    'Max Beispiel',
    '15.02.2025',
    letters('Gutschrift fälliger Wertpapier-Erträge'),
    'Dividendengutschrift',
    cols('Depotbestand   Wertpapier-Bezeichnung', 'WKN/ISIN'),
    'zahlbar ab 15.02.2025     Quartalsdividende',
    'Abrechnung Dividendengutschrift',
    'Bruttobetrag:              USD        19,31',
    '15,000 % Quellensteuer     USD         2,90 -',
    'Ausmachender Betrag        USD        16,41',
    'zum Devisenkurs: EUR/USD  1,213500    EUR  13,52',
    cols('Verrechnung über Konto (IBAN)', 'Valuta   Zu Ihren Gunsten vor Steuern'),
    'DE00 0000 0000 0000 0000 00 EUR 18.02.2025 EUR 13,52',
    'Information zur steuerlichen Behandlung finden Sie auf der separaten Steuermitteilung (Referenz-Nr. 0SID3MHIVFT000ZN).'
]];

export const comdirectDividendNotice = (): Line[][] => [taxNotice({
    title: 'Ausländische Dividende vom 15.02.2025', date: '18.02.2025', reference: '0SID3MHIVFT000ZN',
    security: 'Stk.  70 MUSTER REALTY CORP.  DL 1 , WKN / ISIN: CDTST7  / US00CTEST071',
    before: 'EUR  13,52',
    lines: [
        letters('Kapitalertragsteuer', 'E U R  -  1 , 6 0'),
        '(angerechnete ausländische Quellensteuer:  EUR  2,38  )',
        letters('Solidaritätszuschlag', 'E U R  -  0 , 0 8')
    ],
    taxes: 'EUR  -1,68', after: 'EUR  11,84', valuta: '18.02.2025'
})];

export const comdirectDividendBoth = (): Line[][] => [...comdirectDividendCredit(), ...comdirectDividendNotice()];

/** Before 2009 the credit is final: no Steuermitteilung, no "vor Steuern". */
export const comdirectOldDividend = (): Line[][] => [[
    'comdirect bank Aktiengesellschaft',
    'Max Beispiel',
    '15.05.2008',
    'Gutschrift fälliger Wertpapier-Erträge - Halbeinkünfteverfahren',
    'Dividendengutschrift',
    cols('Depotbestand   Wertpapier-Bezeichnung', 'WKN/ISIN'),
    cols('ST K  8 0 , 0 0 0  Inhaber-Aktien o.N.', 'D E 0 0 0 C T E S T 7 7'),
    'Ermittlung der Steuerbasisbeträge',
    'Bruttobetrag:              EUR       160,00',
    'Kapitalertragsteuer 20,000 % EUR 32,00 0,00 32,00',
    'Abrechnung Dividendengutschrift',
    'Bruttobetrag:              EUR       160,00',
    '20,000 % Kapitalertragsteuer auf EUR 160,00  EUR  32,00 -',
    ' 5,500 % Solidaritätszuschl. auf EUR 32,00  EUR   1,76 -',
    cols('Gutschrift auf Konto', 'Valuta   Zu Ihren Gunsten'),
    '1000000 00 EUR 15.05.2008 EUR 126,24',
    'Die Erträge unterliegen der Besteuerung nach dem Halbeinkünfteverfahren.'
]];

export const comdirectAccumulation = (): Line[][] => [[
    'comdirect bank Aktiengesellschaft',
    '22.12.2024',
    'Ertragsthesaurierung',
    cols('Depotbestand   Wertpapier-Bezeichnung', 'WKN/ISIN'),
    'EUR 0,00 Thesaurierung pro Stück',
    letters('KEINE BARAUSSCHÜTTUNG')
]];

export const comdirectAdvanceTax = (taxed = true): Line[][] => [taxNotice({
    title: 'Vorabpauschale Ausland vom 02.01.2025', date: '14.01.2025', reference: '08IFLCBPY1000J7B',
    security: 'Stk.  11,486 BEISPIEL FRANCE ETF , WKN / ISIN: CDTST8  / IE00CTEST085',
    before: 'EUR  0,00',
    taxes: taxed ? 'EUR  -0,09' : 'EUR 0,00', after: taxed ? 'EUR  -0,09' : 'EUR  0,00', afterLabel: taxed ? 'Lasten' : 'Gunsten',
    valuta: taxed ? '14.01.2025' : undefined
})];

export const comdirectExecutionNotice = (): Line[][] => [[
    'comdirect bank AG',
    'Quickborn, den 08.Juni 2025',
    'Entsprechend Ihrem Auftrag haben wir für Sie folgendes Geschäft ausgeführt:',
    'Geschäftstag : 08.06.2025    Order-Nr. : 71871368321 / 001',
    'Verkauf     Börsenplatz : XETRA',
    'Die Abrechnung lassen wir mit Valuta 10.06.2025 folgen.'
]];

export const comdirectFinancialReport = (): Line[][] => [[
    'comdirect bank AG, 25449 Quickborn',
    'Finanzreport Nr. 9 per 01.10.2025',
    '01.09.2025 Übertrag auf Girokonto 100,00-'
]];

export const comdirectCustodyFee = (): Line[][] => [[
    'comdirect bank AG, 25449 Quickborn',
    'Abrechnung Verwahrentgelt Beispiel Gold, WKN CDTST9 06.01.2025',
    'Die Buchung von 0,01 Euro für den vorherigen Monat erfolgte über das Abrechnungskonto.'
]];

export const comdirectCostInformation = (): Line[][] => [[
    'comdirect bank AG, 25449 Quickborn',
    'Kosteninformation',
    'Kurswert EUR 999,90'
]];

export const comdirectUnknown = (): Line[][] => [[
    'comdirect bank AG, 25449 Quickborn',
    'Ihre neuen Geschäftsbedingungen',
    'Wir passen unsere Bedingungen an.'
]];
