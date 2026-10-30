// Synthetic ING Deutschland documents, laid out like the originals: an address block with
// the depot data in a second column, then one "Label EUR amount" per line and a second
// page with tax details. Names, numbers, ids and addresses are made up.

type Line = string | [number, string][];

const cols = (left: string, right: string): Line => [[50, left], [350, right]];

const HEADER = (date: string, pages = 1): Line[] => [
    'ING-DiBa AG · 60628 Frankfurt am Main',
    [[350, 'Depotinhaber: Max Beispiel']],
    cols('Herrn', 'Direkt-Depot Nr.: 1000000000'),
    cols('Max Beispiel', `Datum: ${date}`),
    cols('Beispielweg 1', `Seite: 1 von ${pages}`),
    '12345 Musterstadt'
];

const FOOTER: Line[] = [
    'Bei Fragen besuchen Sie uns einfach unter www.ing.de/wertpapierwissen.',
    'ING-DiBa AG · Theodor-Heuss-Allee 2 · 60486 Frankfurt am Main · Vorsitzende des Aufsichtsrates: Erika Beispiel'
];

const PAPER = {
    etf: ['ISIN (WKN) DE000ITEST12 (A1TEST)', 'Wertpapierbezeichnung BEISPIEL STOXX 600 U.ETF DE', 'Inhaber-Anteile'],
    stock: ['ISIN (WKN) US00TEST0011 (A2TEST)', 'Wertpapierbezeichnung Muster Motors Inc.', 'Reg.Shares Cl.A DL -,0001'],
    fund: ['ISIN (WKN) LU00ITEST029 (A3TEST)', 'Wertpapierbezeichnung Beispiel Technologie Fonds', 'Namens-Anteile A (acc.) o.N.']
};

const buyLines = (date: string, time: string, quantity = '14,00', order = '12345678.001'): Line[] => [
    `Ordernummer ${order}`,
    ...PAPER.etf,
    `Nominale Stück ${quantity}`,
    'Kurs EUR 38,10',
    'Handelsplatz Xetra',
    `Ausführungstag / -zeit ${date} um ${time} Uhr`,
    'Kurswert EUR 533,40',
    'Handelsplatzgebühr EUR 1,90',
    'Provision EUR 4,90',
    'Endbetrag zu Ihren Lasten EUR 540,20',
    'Abrechnungs-IBAN DE00 0000 0000 0000 0000 00',
    `Valuta ${date.replace('17.', '19.')}`,
    'Wertpapiere zugunsten Girosammelverwahrung.'
];

export const ingBuy = (time = '16:17:32'): Line[][] => [[
    ...HEADER('17.11.2025', 2), 'Wertpapierabrechnung Kauf', ...buyLines('17.11.2025', time), ...FOOTER
], [
    [[350, 'Depotinhaber: Max Beispiel']],
    [[350, 'Seite: 2 von 2']],
    'Ordernummer 12345678.001',
    'Bereinigte akkumulierte ausschüttungsgleiche Erträge 0,73 EUR'
]];

export const ingForeignBuy = (): Line[][] => [[
    ...HEADER('10.11.2025'),
    'Wertpapierabrechnung Kauf',
    'Ordernummer 81547111.001',
    ...PAPER.stock,
    'Nominale Stück 15,00',
    'Kurs USD 100,25',
    'Handelsplatz USA',
    'Ausführungstag / -zeit 10.11.2025 um 20:25:34 Uhr',
    'Kurswert USD 1.503,75',
    'Zwischensumme USD 1.503,75',
    'umger. zum Devisenkurs EUR 1.311,99 (USD = 1,146163)',
    'Handelsplatzgebühr EUR 14,90',
    'Provision EUR 8,18',
    'Endbetrag zu Ihren Lasten EUR 1.335,07',
    'Valuta 12.11.2025',
    ...FOOTER
]];

export const ingSavingsPlan = (): Line[][] => [[
    ...HEADER('15.09.2025'),
    'Wertpapierabrechnung Kauf aus Sparplan',
    'Ordernummer 20000001.001',
    ...PAPER.fund,
    'Nominale Stück 2,41234',
    'Kurs EUR 32,70',
    'Handelsplatz Fondsgesellsch.',
    'Ausführungstag 15.09.2025',
    'Kurswert EUR 78,88',
    'Rabatt EUR - 3,88',
    'Zwischensumme EUR 75,00',
    'Endbetrag zu Ihren Lasten EUR 75,00',
    'Valuta 17.09.2025',
    'Der reguläre Ausgabeaufschlag von 5,250% ist im Kurs enthalten.',
    ...FOOTER
]];

/** Joint account: tax lines for each holder, and a sale in USD. */
export const ingJointSell = (): Line[][] => [[
    ...HEADER('16.11.2025'),
    'Wertpapierabrechnung Verkauf',
    'Ordernummer 81547112.001',
    ...PAPER.stock,
    'Nominale Stück 5,00',
    'Kurs USD 166,00',
    'Handelsplatz USA',
    'Ausführungstag / -zeit 16.11.2025 um 15:41:12 Uhr',
    'Kurswert USD 830,00',
    'Zwischensumme USD 830,00',
    'umger. zum Devisenkurs EUR 729,54 (USD = 1,137702)',
    'KapSt anteilig 50,00 % 24,45% EUR 32,14',
    'Kirchensteuer 9,00 % EUR 2,89',
    'Solidaritätszuschlag 5,50 % EUR 1,76',
    'KapSt anteilig 50,00 % 24,45% EUR 32,14',
    'Kirchensteuer 9,00 % EUR 2,89',
    'Solidaritätszuschlag 5,50 % EUR 1,76',
    'Handelsplatzgebühr EUR 14,90',
    'Provision EUR 6,72',
    'Endbetrag zu Ihren Gunsten EUR 634,34',
    'Valuta 18.11.2025',
    ...FOOTER
]];

export const ingRedemption = (): Line[][] => [[
    ...HEADER('25.06.2025'),
    'Rückzahlung',
    'ISIN (WKN) DE000ITEST38 (A4TEST)',
    'Wertpapierbezeichnung Beispiel Effekten GmbH',
    'DISC.Z 25.06.25 Muster 310',
    'Nominale 5,00 Stück',
    'Fälligkeit 25.06.2025',
    'Einlösung zum Kurs von 283,48 EUR',
    'Kurswert EUR 1.417,40',
    'Kapitalertragsteuer 25,00 % EUR 12,38',
    'Solidaritätszuschlag 5,50 % EUR 0,68',
    'Endbetrag EUR 1.404,34',
    'Valuta 25.06.2025',
    ...FOOTER
]];

export const ingBondBuy = (): Line[][] => [[
    ...HEADER('17.06.2025'),
    'Wertpapierabrechnung Kauf',
    'Ordernummer 75000001.001',
    'ISIN (WKN) XS00ITEST04 (A5TEST)',
    'Wertpapierbezeichnung 3,00 % Beispiel Bank N.V.',
    'EO-Medium-Term Notes 2024(27)',
    'Nominale EUR 2.000,00',
    'Kurs 99,50 %',
    'Ausführungstag / -zeit 17.06.2025 um 13:52:25 Uhr',
    'Kurswert EUR 1.990,00',
    'Stückzinsen EUR 2,10 (Zinsvaluta 19.06.2025 13 Tage)',
    'Endbetrag zu Ihren Lasten EUR 1.992,10',
    'Valuta 19.06.2025',
    ...FOOTER
]];

export const ingDividend = (): Line[][] => [[
    ...HEADER('04.03.2025', 2),
    'Dividendengutschrift',
    ...PAPER.stock,
    'Nominale 11,97545 Stück',
    'Zins-/Dividendensatz 0,32 USD',
    'Ex-Tag 11.02.2025',
    'Zahltag 01.03.2025',
    'Brutto USD 3,83',
    'QuSt 15,00 % (EUR 0,47) USD 0,57',
    'Zwischensumme USD 3,26',
    'Umg. z. Dev.-Kurs (1,214229) EUR 2,68',
    'Gesamtbetrag zu Ihren Gunsten EUR 2,68',
    'Valuta 01.03.2025',
    'Quellensteuer laut Doppelbesteuerungsabkommen (DBA).',
    'Jahressteuerbescheinigung folgt.',
    ...FOOTER
], [
    [[350, 'Seite: 2 von 2']],
    'Anrechenbare ausländische Quellensteuer 0,47 EUR',
    'Sparer-Pauschbetrag vor Ertrag 1.100,65 EUR'
]];

export const ingFundDistribution = (): Line[][] => [[
    ...HEADER('15.12.2025'),
    'Ertragsgutschrift',
    ...PAPER.etf,
    'Nominale 694,00 Stück',
    'Ertragsausschüttung per Stück 0,437467 EUR',
    'Ex-Tag 15.12.2025',
    'Zahltag 15.12.2025',
    'Brutto EUR 303,60',
    'Kapitalertragsteuer 25,00% EUR 65,10',
    'Solidaritätszuschlag 5,50% EUR 3,58',
    'Gesamtbetrag zu Ihren Gunsten EUR 234,92',
    'Valuta 15.12.2025',
    ...FOOTER
]];

export const ingCoupon = (): Line[][] => [[
    ...HEADER('02.01.2025'),
    'Zinsgutschrift',
    'ISIN (WKN) DE000ITEST46 (A6TEST)',
    'Wertpapierbezeichnung 4,00000% Muster SE Inh.-Teilschuldv. v.21(22/26)',
    'Nominale 5.000,00 EUR',
    'Zins-/Dividendensatz 1,00 %',
    'Zahltag 01.01.2025',
    'Brutto EUR 50,00',
    'Gesamtbetrag zu Ihren Gunsten EUR 50,00',
    'Valuta 02.01.2025',
    ...FOOTER
]];

/** Titled Ertragsgutschrift, but only the advance lump sum tax is charged. */
export const ingAccumulation = (): Line[][] => [[
    ...HEADER('02.01.2025'),
    'Ertragsgutschrift',
    ...PAPER.fund,
    'Nominale 304,00 Stück',
    'Vorabpauschale per Stück 0,35979288 EUR',
    'Ex-Tag 02.01.2025',
    'Zahltag 02.01.2025',
    'Kapitalertragsteuer 24,51% EUR 17,65',
    'Kirchensteuer 8,00 % EUR 1,41',
    'Solidaritätszuschlag 5,50% EUR 0,97',
    'Gesamtbetrag zu Ihren Lasten EUR - 20,03',
    'Valuta 02.01.2025',
    ...FOOTER
]];

export const ingAdvanceTax = (taxed = true): Line[][] => [[
    ...HEADER('05.01.2026'),
    'Vorabpauschale',
    ...PAPER.fund,
    'Nominale 378,00 Stück',
    'Vorabpauschale per Stück 0,00245279 EUR',
    'Zahltag 02.01.2026',
    ...(taxed
        ? ['Kapitalertragsteuer 25,00% EUR 0,15', 'Solidaritätszuschlag 5,50% EUR 0,01', 'Gesamtbetrag zu Ihren Lasten EUR - 0,16']
        : ['Gesamtbetrag zu Ihren Gunsten EUR 0,00']),
    'Valuta 04.01.2026',
    'Vorabpauschale gem. § 18 InvStG 0,93 EUR',
    ...FOOTER
]];

export const ingCancelledDividend = (): Line[][] => [[
    ...HEADER('24.04.2025'),
    '*** Storno ***',
    'Dividendengutschrift',
    ...PAPER.stock,
    'Nominale 100,00 Stück',
    'Brutto USD - 54,00',
    'QuSt 25,00 % (EUR 12,44) USD - 13,50',
    'Zwischensumme USD - 40,50',
    'Umg. z. Dev.-Kurs (1,084805) EUR - 37,33',
    'Gesamtbetrag zu Ihren Lasten EUR - 37,33',
    'Valuta 17.04.2025',
    'Sie erhalten eine neue Abrechnung.',
    ...FOOTER
]];

export const ingLossOffset = (value = '-0,29'): Line[][] => [[
    [[50, 'ING-DiBa AG · 60628 Frankfurt am Main'], [350, 'Datum 16.01.2026']],
    [[350, 'Seite Seite 1 von 1']],
    cols('Herrn', 'Verrechnungstopfnr. 9000000000'),
    cols('Max Beispiel', 'Verrechnungstopfjahr 2025'),
    'Beispielweg 1',
    '12345 Musterstadt',
    'Verlustverrechnung / nachträgliche Verlustverrechnung',
    'Verlustverrechnung vom: 16.01.2026 / 2',
    'Letzte Verlustverrechnung: 30.12.2025 / 1',
    'Gegenkonto DE00 0000 0000 0000 0000 00',
    'Erstattung/Belastung (-) von Steuern',
    'Anteil 100,000%',
    `KapSt Person 1 ${value}`,
    'SolZ Person 1 0,00',
    `Erstattung/Belastung(-) ${value}`,
    'Den Steuerausgleich buchen wir mit Valuta 16.01.2026 auf',
    'das Gegenkonto DE00 0000 0000 0000 0000 00.'
]];

export const ingStatement = (): Line[][] => [[
    ...HEADER('28.02.2025'),
    'Girokonto Nummer 1000000001',
    'Kontoauszug Februar 2025',
    'Buchung Buchung / Verwendungszweck Betrag (EUR)',
    '13.02.2025 Gutschrift/Dauerauftrag Max Beispiel 1,01'
]];

export const ingExchange = (): Line[][] => [[
    ...HEADER('20.05.2025'),
    'Umtausch Eingang',
    ...PAPER.etf,
    'Nominale Stück 10,00'
]];

export const ingCostInformation = (): Line[][] => [[
    ...HEADER('17.11.2025'),
    'Kosteninformation',
    'Kurswert EUR 533,40',
    'Kosten gesamt EUR 6,80'
]];

export const ingUnknown = (): Line[][] => [[
    ...HEADER('17.11.2025'),
    'Information zu Ihrem Depot',
    'Wir passen unsere Bedingungen an.'
]];

export const ingSpain = (): Line[][] => [[
    'ING BANK NV, Sucursal en España',
    'Operaciones Cuenta de Valores',
    '67 BEISPIEL ELECTRICA ES00TEST0024 M.CONTINUO Compra 15,01 EUR 1.005,67 EUR 4,01 EUR 0,33 EUR 2,01 EUR 1.012,02 EUR'
]];
