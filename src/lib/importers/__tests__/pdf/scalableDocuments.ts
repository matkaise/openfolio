// Synthetic Scalable Capital documents, laid out like the originals (header, table rows as
// cells at x positions, footer). Names, numbers, ids and addresses are made up.

type Line = string | [number, string][];

const NEW_HEADER = (date: string, language: 'de' | 'en'): Line[] => [
    'Scalable Capital GmbH • Musterstraße 1 • 80000 München • Deutschland',
    'Erika Beispiel',
    language === 'de' ? [[50, 'Beispielweg 5'], [400, `Datum ${date}`]] : [[50, 'Beispielweg 5'], [400, `Date ${date}`]],
    language === 'de' ? [[50, 'Deutschland'], [400, 'Seite 1 / 1']] : [[50, 'Germany'], [400, 'Page 1 / 1']]
];
const NEW_FOOTER: Line[] = ['Scalable Capital GmbH HRB 000000 Geschäftsführer: Aufsichtsrat: Seite', 'Musterstraße 1 Amtsgericht München 1 / 1'];

const row = (...cells: string[]): Line => cells.map((cell, index) => [50 + index * 90, cell] as [number, string]);

export const scalableBuyDe = (options: { savingsPlan?: boolean; order?: string; deal?: string } = {}): Line[][] => [[
    ...NEW_HEADER('03.02.2025', 'de'),
    'Wertpapierabrechnung',
    options.savingsPlan ? 'für Sparplanausführung' : 'für Kundenauftrag',
    `Typ LIMIT Order ${options.order || 'SCALtest00000001'}`,
    `Ausführung 03.02.2025 10:15:30 Geschäft ${options.deal || '1000001'}`,
    'Ausführungsplatz EIX Lagerland Deutschland',
    'Depot 1234567890 Verwahrart Girosammelverwahrung',
    row('Typ', 'Wertpapier', 'Anzahl', 'Kurs', 'Betrag'),
    [[50, 'Kauf'], [90, 'Beispiel Welt ETF (Acc)'], [300, '12,50 Stk.'], [380, '1.040,00 EUR'], [470, '13.000,00 EUR']],
    'IE00BTEST016',
    'Ordergebühren +0,99 EUR',
    'Finanztransaktionssteuer +2,40 EUR',
    'Belastung 13.003,39 EUR',
    'Der Betrag wird mit dem Verrechnungskonto DE00000000000000000000 (Valuta: 05.02.2025) verrechnet.',
    ...NEW_FOOTER
]];

export const scalableSellDe = (): Line[][] => [[
    ...NEW_HEADER('20.06.2025', 'de'),
    'Wertpapierabrechnung',
    'für Kundenauftrag',
    'Typ MARKET Order SCALtest00000002',
    'Ausführung 18.06.2025 15:01:02 Geschäft 2000002',
    row('Typ', 'Wertpapier', 'Anzahl', 'Kurs', 'Betrag'),
    [[50, 'Verkauf'], [90, 'Muster Industrie AG'], [300, '20,00 Stk.'], [380, '60,05 EUR'], [470, '1.201,00 EUR']],
    'DE000TEST018',
    'Ordergebühren -0,99 EUR',
    'Steuern -50,51 EUR',
    'Gutschrift 1.149,50 EUR',
    ...NEW_FOOTER
], [
    'Wertpapierabrechnung',
    'Verkauf 20,00 Stk. Muster Industrie AG',
    'Ermittlung steuerrelevanter Erträge',
    'Gewinn oder Verlust 192,45 EUR',
    'Zu versteuern 191,47 EUR',
    'Kapitalertragsteuer 47,87 EUR',
    'Solidaritätszuschlag 2,64 EUR',
    'Gesamt 50,51 EUR'
]];

export const scalableBuyEn = (): Line[][] => [[
    ...NEW_HEADER('12.08.2025', 'en'),
    'Contract note',
    'for client order',
    'Type LIMIT Order ID SCALtest00000003',
    'Execution 12.08.2025 09:16:57 Exchange ID 3000003',
    row('Type', 'Security', 'Quantity', 'Price', 'Amount'),
    [[50, 'Buy'], [90, 'Example Global Equity (Acc)'], [300, '21.00 pc.'], [380, '230.75 EUR'], [470, '4,845.75 EUR']],
    'IE00BTEST024',
    'Order fees +0.99 EUR',
    'Debit 4,846.74 EUR',
    ...NEW_FOOTER
]];

export const scalableDividendDe = (): Line[][] => [[
    ...NEW_HEADER('15.01.2025', 'de'),
    'Dividende',
    'Für 01.10.2024 - 30.09.2025',
    'Berechtigtes Wertpapier Beispiel Realty Corp.',
    'ISIN US00TEST0010',
    'Berechtigte Anzahl 10',
    'Ex Tag 31.12.2024',
    'Kontobewegung',
    row('Buchung', 'Wertstellung', 'Typ', 'Betrag / Stk.', 'Berechtigte Anzahl', 'Gesamt'),
    [[50, '15.01.2025'], [110, '16.01.2025'], [170, 'Gutschrift'], [240, '1,20 USD'], [320, '10'], [400, '11,69 EUR']],
    'USD / EUR 1,0269',
    'Ausländische Quellensteuer -1,75 EUR',
    'Steuern -2,46 EUR',
    'Gesamtbetrag 7,48 EUR',
    ...NEW_FOOTER
]];

export const scalableDividendEn = (): Line[][] => [[
    ...NEW_HEADER('27.04.2026', 'en'),
    'Dividend',
    'Entitled security Example Energy SE',
    'ISIN DE000TEST026',
    'Entitled quantity 17',
    [[50, '27.04.2026'], [110, '28.04.2026'], [170, 'Credit'], [240, '0.57 EUR'], [320, '17'], [400, '9.69 EUR']],
    'Taxes -2.55 EUR',
    'Total 7.14 EUR',
    ...NEW_FOOTER
]];

export const scalableReclassification = (): Line[][] => [[
    ...NEW_HEADER('08.04.2026', 'de'),
    'Dividende',
    'Berechtigtes Wertpapier Beispiel Realty Corp.',
    'ISIN US00TEST0010',
    [[50, '07.04.2026'], [110, '08.04.2026'], [170, 'Belastung'], [240, '0,2695 USD'], [320, '1,18'], [400, '0,27 EUR']],
    'Gesamtbetrag 0,34 EUR'
]];

export const scalableAdvanceTax = (tax = '0,01'): Line[][] => [[
    ...NEW_HEADER('24.01.2026', 'de'),
    'Vorabpauschale',
    'für Beispiel Welt ETF (Acc) (IE00BTEST016)',
    'Berechtigte Anzahl 12 Angefallen im',
    [[50, '24.01.2026'], [110, '02.01.2026'], [170, 'Steuerabbuchung'], [260, '0,09 EUR'], [340, `${tax} EUR`]],
    `Steuerbelastung ${tax} EUR`
]];

export const scalableTaxAdjustment = (): Line[][] => [[
    ...NEW_HEADER('10.01.2026', 'de'),
    'Steuerneuberechnung',
    'Steuererstattung',
    'Kapitalertragsteuer 3,20 EUR',
    'Solidaritätszuschlag 0,17 EUR',
    'Gutschrift 3,37 EUR',
    'Der Betrag wurde am 10.01.2026 auf Ihrem Verrechnungskonto gebucht.'
]];

export const scalableStatement = (): Line[][] => [[
    ...NEW_HEADER('31.03.2025', 'de'),
    'Verrechnungskonto',
    'Kontoauszug 01.03.2025 - 31.03.2025',
    [[50, '07.03.2025'], [110, '07.03.2025'], [170, 'Überweisung'], [400, '+500,00 EUR']]
]];

export const scalableCostInformation = (): Line[][] => [[
    ...NEW_HEADER('01.02.2025', 'de'),
    'Kosteninformation',
    'Kauf Beispiel Welt ETF (Acc) Ordergebühren 0,99 EUR'
]];

const BAADER_FOOTER: Line[] = [
    'Scalable Capital GmbH • Musterstraße 1 • 80000 München • www.scalable.capital',
    'Diese Auftragsbestätigung/Abrechnung wurde von der Baader Bank AG erstellt. Bitte prüfen Sie diese auf Richtigkeit.',
    'WPABRECHNUNG-000.000'
];

export const baaderBuy = (): Line[][] => [[
    'Scalable Capital GmbH',
    [[50, 'Seite 1/1'], [400, 'München']],
    [[50, 'Erika Beispiel'], [400, '14.04.2023']],
    [[50, 'Beispielweg 5'], [300, 'Stamm-Nr.: 0000001 Portfolio: 1']],
    'Depot-Nr.: 0000000001',
    'Vorgangs-Nr.: 70000001',
    'Referenz-Nr.: 80000001',
    'Wertpapierabrechnung: Kauf',
    'Auftragsdatum: 14.04.2023 Ausführungsplatz: GETTEX - MM Munich',
    [[50, 'Nominale ISIN: US00TEST0028 WKN: A0TEST'], [450, 'Kurs']],
    [[50, 'STK 10'], [90, 'Beispiel Foods Co.'], [400, 'EUR 35,76']],
    'Registered Shares DL -,01',
    'Kurswert EUR 357,60',
    'Provision EUR 0,99',
    'Zu Lasten Konto 0000000002 Valuta: 18.04.2023 EUR 358,59',
    'Die Wertpapiere buchen wir zu Gunsten Ihres Depots.',
    'Details zur Ausführung:',
    'Handelsdatum Handelsuhrzeit',
    '14.04.2023 14:04:19:00',
    ...BAADER_FOOTER
]];

export const baaderSell = (options: { storno?: boolean } = {}): Line[][] => [[
    'Scalable Capital Vermögensverw.GmbH',
    'Seite 1/2',
    'Vorgangs-Nr.: 70000002',
    `Wertpapierabrechnung: Verkauf KOPIE`,
    'Auftragsdatum: 19.07.2019 Ausführungsplatz: Div. Ausführungspl.',
    'Nominale ISIN: IE00BTEST040 WKN: 900000 Kurs',
    'STK 11 Beispiel Corp Bond UCITS ETF EUR 105,60',
    'Kurswert EUR 1.161,60',
    'Provision EUR 1,16 -',
    'Kapitalertragsteuer EUR 20,00 -',
    'Solidaritätszuschlag EUR 1,10 -',
    'Zu Gunsten Konto 0000000002 Valuta: 23.07.2019 EUR 1.139,34',
    'Handelsdatum Handelsuhrzeit',
    '19.07.2019 11:13:08:00',
    'Baader Bank Aktiengesellschaft Musterstraße 4 85000 Unterschleißheim'
], [
    `Wertpapierabrechnung: Verkauf${options.storno ? ' STORNO' : ''} KOPIE`,
    'Fortsetzung: Seite 2/2',
    'Kapitalertragsteuer auf allgemeine Gewinne EUR 84,52 EUR 0,00'
]];

export const baaderDistribution = (options: { storno?: boolean } = {}): Line[][] => [[
    'Scalable Capital GmbH',
    'Seite 1/1',
    'Vorgangs-Nr.: 70000003',
    `Fondsausschüttung${options.storno ? ' STORNO' : ''}`,
    'Ex-Tag: 30.09.2022',
    'Nominale ISIN: US00TEST0036 WKN: 899000 Ausschüttung',
    'STK 5,683 Beispiel Income Corp. USD 0,232934 p.STK',
    'Zahltag: 14.10.2022',
    'Umrechnungskurs: EUR/USD 0,9818',
    'Bruttobetrag USD 1,32',
    'Bruttobetrag EUR 1,34',
    'US-Quellensteuer EUR 0,20 -',
    'Zu Gunsten Konto 0000000002 Valuta: 14.10.2022 EUR 1,14',
    'Baader Bank Aktiengesellschaft Musterstraße 4 85000 Unterschleißheim'
]];
