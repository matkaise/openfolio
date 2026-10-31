// Synthetic DKB documents, laid out like the originals: an address block with the depot
// data in a second column, then amounts as "Provision 7,50- EUR". Names, numbers, ids and
// addresses are made up.

type Line = string | [number, string][];

const cols = (left: string, right: string): Line => [[50, left], [330, right]];

const HEADER = (date: string, number = 'Rechnungsnummer W00000-0000000001/25'): Line[] => [
    cols('10919 Berlin', 'Seite 1 von 1'),
    [[330, 'Depotnummer 500000000']],
    [[330, 'Kundennummer 50000000']],
    'Max Beispiel',
    [[330, 'Auftragsnummer 495752/48.00']],
    cols('Herrn', `Datum ${date}`),
    cols('Max Beispiel', number),
    cols('Beispielweg 1', 'Umsatzsteuer-ID DE000000000'),
    '12345 Musterstadt'
];

const FOOTER: Line[] = ['Dieses Dokument wurde maschinell erstellt und wird nicht unterschrieben.', '0883.02011611.0000093OR07'];

const BOOKED = (word: 'Gegenwert' | 'Betrag', date: string, direction = 'zu Lasten'): Line => (
    `Den ${word} buchen wir mit ${word === 'Betrag' ? 'Wertstellung' : 'Valuta'} ${date} ${direction} des Kontos 12345678 (IBAN DE00 0000 0000 0000 0000 00),`
);

const trade = (title: string, paper: string[], lines: Line[]): Line[][] => [[
    ...HEADER('01.02.2025', `Rechnungsnummer W00000-${paper[0].slice(-7, -1)}/25`),
    `Wertpapier Abrechnung ${title}`,
    'Auftrag vom 31.01.2025 16:00:17 Uhr',
    'Nominale Wertpapierbezeichnung ISIN (WKN)',
    ...paper,
    ...lines,
    ...FOOTER
]];

export const dkbBuy = (): Line[][] => trade('Ausgabe Investmentfonds', ['Stück 29,2893 BEISPIEL WORLD U.ETF LU00DTEST012 (DKBTS1)', 'INHABER-ANTEILE I O.N.'], [
    'Börse Außerbörslich (gemäß Weisung)',
    cols('Schlusstag 06.03.2025', 'Auftraggeber Max Beispiel'),
    cols('Ausführungskurs 47,799 EUR', 'Auftragserteilung sonstige'),
    'Kurswert 1.400,00- EUR',
    'Provision 10,00- EUR',
    'Ausmachender Betrag 1.410,00- EUR',
    BOOKED('Gegenwert', '08.03.2025')
]);

export const dkbForeignBuy = (): Line[][] => trade('Kauf', ['Stück 2.300 MUSTER WULF INC. US00DTEST024 (DKBTS2)', 'REGISTERED SHARES DL -,10'], [
    'Handels-/Ausführungsplatz NY Nasdaq (gemäß Weisung)',
    cols('Schlusstag/-Zeit 31.01.2025 19:46:30', 'Auftraggeber Max Beispiel'),
    'Ausführungskurs 1,80 USD',
    'Devisenkurs (EUR/USD) 1,0758 vom 01.02.2025',
    'Kurswert 3.848,30- EUR',
    'Provision 10,00- EUR',
    'Fremde Auslagen 6,51- EUR',
    'Eigene Spesen 20,00- EUR',
    'Ausmachender Betrag 3.884,81- EUR',
    BOOKED('Gegenwert', '02.02.2025')
]);

export const dkbTransactionTaxBuy = (): Line[][] => trade('Kauf', ['Stück 3 BEISPIEL LUXE SE FR00DTEST036 (DKBTS3)', 'ACTIONS PORT. (C.R.) EO 0,3'], [
    'Schlusstag/-Zeit 01.09.2025 08:00:04',
    'Kurswert 1.902,60- EUR',
    'Provision 10,00- EUR',
    'Finanztransaktionssteuer 5,71- EUR',
    'Ausmachender Betrag 1.918,31- EUR',
    BOOKED('Gegenwert', '03.09.2025')
]);

/** Taxes appear in the settlement and again in the summary of the tax pots below it. */
export const dkbSell = (): Line[][] => trade('Verkauf', ['Stück 100 MUSTER SOFTWARE AG DE000DTEST48 (DKBTS4)', 'INHABER-AKTIEN O.N.'], [
    cols('Schlusstag/-Zeit 06.05.2025 14:32:46', 'Auftraggeber Max Beispiel'),
    'Kurswert 4.245,50 EUR',
    'Provision 7,00- EUR',
    'Ermittlung steuerrelevante Erträge',
    'Veräußerungsgewinn 1.227,64 EUR',
    'Berechnungsgrundlage für die Kapitalertragsteuer 437,47 EUR',
    'Steuerberechnung',
    'Kapitalertragsteuer 25,00% auf 437,47 EUR 109,37- EUR',
    'Solidaritätszuschlag 5,50% auf 109,37 EUR 6,01- EUR',
    'Ausmachender Betrag 4.123,12 EUR',
    BOOKED('Gegenwert', '08.05.2025', 'zu Gunsten'),
    'Verrechnungstöpfe 2025',
    'Vorher 0,00 1.865,61 625,00 0,00 0,00'
]);

/** A loss refunds taxes paid earlier, with a booking of its own and a date of its own. */
export const dkbLossSell = (): Line[][] => [[
    ...HEADER('23.02.2025', 'Rechnungsnummer W00000-0000000005/25'),
    'Wertpapier Abrechnung Verkauf',
    'Nominale Wertpapierbezeichnung ISIN (WKN)',
    'Stück 20 BEISPIEL ROBOTIK INC. US00DTEST052 (DKBTS5)',
    'REGISTERED SHARES',
    'Schlusstag/-Zeit 22.02.2025 10:00:00',
    'Kurswert 109,00 EUR',
    'Provision 10,00- EUR',
    'Ermittlung steuerrelevante Erträge',
    'Veräußerungsverlust 61,00- EUR',
    'Ausmachender Betrag 99,00 EUR',
    BOOKED('Gegenwert', '24.02.2025', 'zu Gunsten'),
    'Steuerliche Ausgleichrechnung',
    'Verrechnete Aktienverluste 61,00- EUR'
], [
    [[330, 'Seite 2 von 2']],
    'Kapitalertragsteuer 25,00% auf 61,00 EUR 15,25 EUR',
    'Solidaritätszuschlag 5,50% auf 15,25 EUR 0,83 EUR',
    'Ausmachender Betrag 16,08 EUR',
    BOOKED('Gegenwert', '23.02.2025', 'zu Gunsten')
]];

export const dkbBondBuy = (): Line[][] => trade('Kauf', ['EUR 2.000,00 8,75 % BEISPIEL GROUP B.V. DE000DTEST60 (DKBTS6)', 'EO-ANLEIHE 2023(28)'], [
    'Schlusstag/-Zeit 25.11.2025 11:02:54',
    'Ausführungskurs 97,50 %',
    'Kurswert 1.950,00- EUR',
    'Stückzinsen für 153 Tage per 26.11.2025 73,16- EUR',
    'Ausmachender Betrag 2.023,16- EUR',
    BOOKED('Gegenwert', '27.11.2025')
]);

export const dkbCancelled = (): Line[][] => [[
    ...HEADER('13.01.2025'),
    'Storno zur Wertpapier Abrechnung vom 05.01.2025',
    'Wertpapier Abrechnung Ausgabe Investmentfonds',
    'Nominale Wertpapierbezeichnung ISIN (WKN)',
    'Stück 16,3986 BEISPIEL WORLD U.ETF LU00DTEST012 (DKBTS1)',
    'Kurswert 1.050,00 EUR',
    'Ausmachender Betrag 1.050,00 EUR'
]];

const credit = (title: string, paper: string[], lines: Line[]): Line[][] => [[
    ...HEADER('27.06.2025', 'Abrechnungsnr. 111111111'),
    title,
    'Nominale Wertpapierbezeichnung ISIN (WKN)',
    ...paper,
    ...lines,
    'Lagerstelle Clearstream Banking Lux (000000 / 00000)',
    ...FOOTER
]];

export const dkbDividend = (): Line[][] => credit('Dividendengutschrift', ['Stück 715 BEISPIEL EPSON CORP. JP00DTEST075 (DKBTS7)', 'REGISTERED SHARES O.N.'], [
    cols('Zahlbarkeitstag 27.06.2025', 'Dividende pro Stück 31,00 JPY'),
    'Devisenkurs EUR / JPY 123,0200',
    'Dividendengutschrift 22.165,00 JPY 180,17+ EUR',
    'Umrechnung in EUR 180,17 EUR',
    'Einbehaltene Quellensteuer 15,315 % auf 22.165,00 JPY 27,59- EUR',
    'Anrechenbare Quellensteuer 15 % auf 180,17 EUR 27,03 EUR',
    'Kapitalertragsteuerpflichtige Dividende 180,17 EUR',
    'Berechnungsgrundlage für die Kapitalertragsteuer 72,05 EUR',
    'Kapitalertragsteuer 25 % auf 72,05 EUR 18,01- EUR',
    'Solidaritätszuschlag 5,5 % auf 18,01 EUR 0,99- EUR',
    'Ausmachender Betrag 133,58+ EUR',
    '0,315 % rückforderbare Quellensteuer 69,82 JPY',
    BOOKED('Betrag', '01.07.2025', 'zu Gunsten')
]);

/** The ISIN stands on a line of its own when the name wraps. */
export const dkbDistribution = (): Line[][] => credit('Gutschrift von Investmenterträgen', ['Stück 10,6841 BEISPIEL US DIVID.ARISTOCR.ETF', 'REGISTERED SHARES O.N.', 'IE00DTEST087 (DKBTS8)'], [
    'Zahlbarkeitstag 02.10.2025',
    'Devisenkurs EUR / USD 1,1780',
    'Ausschüttung 2,46 USD 2,09+ EUR',
    'Umrechnung in EUR 2,48 EUR',
    'Verrechneter Sparer-Pauschbetrag 2,48 - EUR',
    'Ausmachender Betrag 2,09+ EUR',
    BOOKED('Betrag', '04.10.2025', 'zu Gunsten')
]);

export const dkbInterest = (): Line[][] => credit('Zinsgutschrift', ['EUR 5.000,00 7,25 % BEISPIEL SE DE000DTEST90 (DKBTS9)', 'INH.-TEILSCHULDV. V.13(13/27)'], [
    'Zahlbarkeitstag 02.01.2025',
    'Zinsertrag 181,25+ EUR',
    'Ausmachender Betrag 181,25+ EUR',
    BOOKED('Betrag', '02.01.2025', 'zu Gunsten')
]);

export const dkbAdvanceTax = (taxed = true): Line[][] => credit('Vorabpauschale Investmentfonds', ['Stück 49,1102 BEISPIEL ALL-WORLD U.ETF IE00DTEST095 (DKBT10)', 'REG. SHS USD ACC. ON'], taxed ? [
    'Zahlbarkeitstag 02.01.2025',
    'Steuerpflichtige Vorabpauschale 0,44+ EUR',
    'Berechnungsgrundlage für die Kapitalertragsteuer 0,31+ EUR',
    'Kapitalertragsteuer 24,45 % auf 0,31 EUR 0,08- EUR',
    'Solidaritätszuschlag 5,5 % auf 0,08 EUR 0,00 EUR',
    'Ausmachender Betrag 0,08- EUR',
    BOOKED('Betrag', '06.01.2025')
] : [
    'Zahlbarkeitstag 02.01.2025',
    'Steuerpflichtige Vorabpauschale 11,84+ EUR',
    'Verrechneter Sparer-Pauschbetrag 4,74 - EUR',
    'Berechnungsgrundlage für die Kapitalertragsteuer 0,00+ EUR',
    'Keine Steuerbescheinigung.'
]);

export const dkbSavingsPlan = (): Line[][] => [[
    ...HEADER('31.12.2025', 'Sparplannummer 4'),
    'Halbjahresabrechnung Sparplan',
    'Wertpapierbezeichnung ISIN (WKN)',
    'BEISPIEL EM.MKTS U.ETF LU00DTEST105 (DKBT11)',
    'INHABER-ANTEILE I O.N.',
    'Im Rahmen Ihres bestehenden Sparplans haben wir nachstehende Käufe durchgeführt.',
    'Umsatzart Sparrate in Ordernummer Preis je Stück Devise Anteilsumsatz Schlusstag Valuta Zwischengewinn Steuerausgleich',
    'Kauf 90,00 531781/77.00 40,1900 1,0000 2,2394 05.07.2025 09.07.2025 0,00 0,00',
    'Kauf 90,00 548714/63.00 41,4900 1,0000 2,1692 05.08.2025 07.08.2025 0,00 0,00',
    'Im Abrechnungszeitraum angelegter Betrag EUR 180,00',
    'Im Abrechnungszeitraum erworbene Anteile Stück 4,4086'
]];

export const dkbTransfer = (): Line[][] => [[
    ...HEADER('30.11.2025'),
    'Depotbuchung - Belastung',
    'Nominale Wertpapierbezeichnung ISIN (WKN)',
    'Stück 25 BEISPIEL AG DE000DTEST48 (DKBTS4)'
]];

export const dkbStatement = (): Line[][] => [[
    'Kontoauszug Nummer 011 / 2025 vom 05.10.2025 bis 04.11.2025',
    'DKB AG, 10919 Berlin',
    'Kontostand am 04.10.2025 1.000,00'
]];

export const dkbCostInformation = (): Line[][] => [[
    ...HEADER('31.12.2025'),
    'Ex-ante Kosteninformation',
    'Kurswert 1.400,00 EUR'
]];

export const dkbUnknown = (): Line[][] => [[
    '10919 Berlin',
    'Ihre neuen Bedingungen',
    'Wir passen unsere Bedingungen an.'
]];
