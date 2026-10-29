// Synthetic flatex documents, laid out like the originals: two columns of "Label : value"
// pairs placed by x position, so the extraction has to join them into one line. Names,
// numbers, ids and addresses are made up.

type Line = string | [number, string][];

/** Left and right column of one printed line. */
const cols = (left: string, right = ''): Line => [[50, left], [300, right]].filter(([, text]) => text) as [number, string][];

const HEADER = (issuer: string, date: string): Line[] => [
    issuer,
    `${issuer} - Musterstraße 4 - 60000 Frankfurt am Main`,
    `Frankfurt, ${date}`
];

const FOOTER: Line[] = [
    '______________________________________________________________________________',
    [[450, 'Seite 1/1']],
    'Vorsitzender des Aufsichtsrats: Erika Beispiel - Amtsgericht Frankfurt am Main (HRB 000000)'
];

const singleTrade = (options: { issuer?: string; kind: 'Kauf' | 'Verkauf'; order: string; date: string; title?: string; lines: Line[]; transaction: string }): Line[][] => [[
    ...HEADER(options.issuer || 'flatexDEGIRO Bank AG', options.date),
    cols('Herr', `Auftragsdatum      ${options.date}`),
    cols('Max Beispiel', `Handelstag         ${options.date}`),
    cols('Beispielweg 1', 'Ausführungszeit    17:34 Uhr'),
    cols('12345 Musterstadt', `Valuta             ${options.date}`),
    cols('', `Auftragsnummer     ${options.order}`),
    options.title || `Wertpapierabrechnung ${options.kind} Fonds/Zertifikate`,
    'Ihre Depotnummer: 1000000000',
    'Depotinhaber:     Beispiel, Max',
    ...options.lines,
    '    Evtl. Details dazu finden Sie im Steuerreport unter der Transaktion-Nr.:',
    `    ${options.transaction}.`,
    'Die Verrechnung der Endbeträge erfolgt über Ihr Konto Nr.: 1000000001',
    ...FOOTER
]];

export const flatexBuy = (): Line[][] => singleTrade({
    kind: 'Kauf', order: '230000001/1', date: '27.03.2023', transaction: '9000000001',
    lines: [
        'Nr.230000001/1     Kauf        BEISPIEL EM IMI UCITS ETF (IE00FTEST012/A1TEST)',
        cols('Ausgeführt    :              29 St.', 'Kurswert      :             751,68 EUR'),
        cols('Kurs          :       25,920000 EUR', 'Provision     :               5,90 EUR'),
        cols('Devisenkurs   :        1,000000', 'Eigene Spesen :               0,00 EUR'),
        cols('', '*Fremde Spesen :               2,51 EUR'),
        cols('Gewinn/Verlust:            0,00 EUR', '**Einbeh. Steuer:               0,00 EUR'),
        cols('', 'Endbetrag     :            -760,09 EUR'),
        cols('*   Enthalten sind folgende Gebühren', 'Regulierung   :               2,44 EUR'),
        cols('', 'Schlussnoten  :               0,07 EUR')
    ]
});

export const flatexSell = (): Line[][] => singleTrade({
    kind: 'Verkauf', order: '230000002/1', date: '24.05.2023', transaction: '9000000002',
    lines: [
        'Nr.230000002/1     Verkauf     MUSTER INDUSTRIE AG (DE000FTEST18/A2TEST)',
        cols('Ausgeführt    :              40 St.', 'Kurswert      :           2.400,00 EUR'),
        cols('Kurs          :       60,000000 EUR', 'Provision     :               5,90 EUR'),
        cols('Devisenkurs   :        1,000000', 'Eigene Spesen :               0,00 EUR'),
        cols('', '*Fremde Spesen :               0,00 EUR'),
        cols('Gewinn/Verlust:          420,00 EUR', '**Einbeh. Steuer:             105,50 EUR'),
        cols('', 'Endbetrag     :           2.288,60 EUR'),
        cols('**  Enthalten sind folgende Steuern', 'Kapitalertragsteuer  :     100,00 EUR'),
        cols('', 'Solidaritätszuschlag :       5,50 EUR')
    ]
});

export const flatexForeignSellWithRefund = (): Line[][] => singleTrade({
    kind: 'Verkauf', order: '315000003/1', date: '14.08.2026', transaction: '9000000003',
    lines: [
        'Nr.315000003/1    Verkauf                  BEISPIEL QUANTUM CORP. (US00TEST0077/A40TES)',
        cols('Ausgeführt    :              60 St.', 'Kurswert      :           1.274,85 EUR'),
        cols('Kurs          : 24,6800 USD', 'Provision     :               5,90 EUR'),
        cols('Devisenkurs   : 1,161544', 'Eigene Spesen :'),
        cols('', '*Fremde Spesen :               0,03 EUR'),
        cols('Gewinn/Verlust: -214,05 EUR', '**Einbeh. Steuer:             -58,02 EUR'),
        cols('', 'Endbetrag     :           1.326,94 EUR')
    ]
});

export const flatexCancelledBuy = (): Line[][] => singleTrade({
    issuer: 'FinTech Group Bank AG', kind: 'Kauf', order: '106000004/1', date: '04.01.2018', transaction: '9000000004',
    title: 'Stornierung Wertpapierabrechnung Kauf Fonds',
    lines: [
        'Nr.106000004/1 Kauf            BEISPIEL WORLD ETF I (LU00FTEST029/ETF110)',
        cols('Ausgeführt     8,06733 St.', 'Kurswert       EUR               400,00'),
        cols('', 'Endbetrag      EUR               400,00')
    ]
});

/** The earlier FinTech Group layout: "Label EUR amount" without colons, empty fee fields. */
export const fintechBuy = (): Line[][] => singleTrade({
    issuer: 'FinTech Group Bank AG', kind: 'Kauf', order: '92200005/1', date: '15.12.2016', transaction: '9000000005',
    lines: [
        'Nr.92200005/1  Kauf            BEISPIEL S+P SMALL CAP ETF (IE00FTEST038/A0TEST)',
        cols('Ausgeführt     19,334524 St.', 'Kurswert       EUR             1.050,00'),
        cols('Kurs           54,307000 EUR', 'Provision'),
        cols('Devisenkurs', 'Eigene Spesen'),
        cols('Verwahrart     Wertpapierrechnung', '*Fremde Spesen'),
        cols('Gewinn/Verlust 0,00 EUR', '**Einbeh. Steuer EUR                 0,00'),
        cols('', 'Endbetrag      EUR            -1.050,00')
    ]
});

/** Several settlements of one day; the first name wraps, the third is a bond. Two pages. */
export const flatexCollective = (): Line[][] => [[
    ...HEADER('flatexDEGIRO Bank SE', '28.01.2026'),
    'Max Beispiel',
    'Sammelabrechnung (Wertpapierkauf/-verkauf)',
    'Ihre Depotnummer: 1000000000',
    'Nr.330000006/1 Kauf BEISPIEL GOLD MINES',
    'LTD. (CA00TEST0013/860000)',
    cols('Ordervolumen : 10,00 St.', 'Handelsplatz : Tradegate'),
    cols('davon ausgef. : 10,00 St.', 'Schlusstag : 27.01.2026, 15:36 Uhr'),
    cols('Kurs : 18,1050 EUR', 'Kurswert : 181,05 EUR'),
    cols('Devisenkurs :', 'Provision : 5,90 EUR'),
    cols('Bew-Faktor : 1,0000', 'Eigene Spesen :'),
    cols('Verwahrart : Wertpapierrechnung', '* Fremde Spesen : 2,40 EUR'),
    cols('Lagerland : Canada', '** Einbeh. Steuer : 0,00 EUR'),
    cols('Valuta : 29.01.2026', 'Endbetrag : -189,35 EUR'),
    '** Einbehaltene Kapitalertragsteuer. Details dazu finden Sie im Steuerreport unter der Transaktion-Nr.: 9000000006.',
    [[450, 'Seite 1 von 2']]
], [
    'Nr.330000007/1 Verkauf MUSTER TECH INC. (US00TEST0044/A1TEST)',
    cols('Ordervolumen : 5,00 St.', 'Handelsplatz : Tradegate'),
    cols('davon ausgef. : 5,00 St.', 'Schlusstag : 27.01.2026, 15:37 Uhr'),
    cols('Kurs : 281,2500 EUR', 'Kurswert : 1.406,25 EUR'),
    cols('Devisenkurs :', 'Provision : 5,90 EUR'),
    cols('Verwahrart : GS-Verwahrung', '* Fremde Spesen : 0,74 EUR'),
    cols('Lagerland : USA', '** Einbeh. Steuer : 0,41 EUR'),
    cols('Valuta : 29.01.2026', 'Endbetrag : 1.399,20 EUR'),
    '** Einbehaltene Kapitalertragsteuer. Details dazu finden Sie im Steuerreport unter der Transaktion-Nr.: 9000000007.',
    'Nr.330000008/1 Kauf BEISPIEL AG 20/27 (XS00TEST0052/A3TEST)',
    cols('davon ausgef. : 1.000,00 EUR', 'Schlusstag : 27.01.2026, 15:38 Uhr'),
    cols('Kurs : 92,2500 %', 'Kurswert : 922,50 EUR'),
    cols('Zinsbetrag : 6,25 EUR', 'Provision : 5,90 EUR'),
    cols('Valuta : 29.01.2026', 'Endbetrag : -934,65 EUR'),
    [[450, 'Seite 2 von 2']]
]];

export const flatexDividend = (tax = '0,00', total = '7,37'): Line[][] => [[
    ...HEADER('flatexDEGIRO Bank AG', '21.06.2022'),
    'Herrn',
    'Max Beispiel',
    'Dividendengutschrift für ausländische Wertpapiere',
    'Ihre Depotnummer: 1000000000',
    'Nr.2800000009   BEISPIEL BIOTECH ADR (US00TEST0069/A2TEST)',
    cols('St.             :            5,00', 'Bruttodividende'),
    cols('', 'pro Stück       :          2,1322 USD'),
    cols('Extag           :      02.06.2022', 'Bruttodividende :           10,66 USD'),
    cols('Zahlungstag     :      17.06.2022', 'Bemessungs-'),
    cols('Valuta          :      17.06.2022', 'grundlage       :            0,00 EUR'),
    cols('', '*Einbeh. Steuer  :            ' + tax + ' EUR'),
    cols('Devisenkurs     :        1,051700'),
    cols('Quellenst.-satz :           26,38 %', 'Gez. Quellenst. :            2,81 USD'),
    cols('Fremdgeb./Stück :            0,02 USD', 'Gesamtgebühr    :            0,10 USD'),
    cols('', `Endbetrag       :            ${total} EUR`),
    '  finden Sie im Steuerreport unter der Transaktion-Nr. : 2800000009',
    'Die Verrechnung des Endbetrages erfolgt über Ihr Konto Nr.: 1000000001',
    ...FOOTER
]];

export const flatexAccumulation = (): Line[][] => [[
    ...HEADER('flatexDEGIRO Bank AG', '08.10.2021'),
    'Ertragsmitteilung - thesaurierender transparenter Fonds',
    'Nr.1234000010                  BEISPIEL MSCI WORLD ETF       (IE00FTEST046/A2TEST)',
    cols('St.             :         168,9', 'Bruttothesaurierung'),
    cols('Extag           :    07.10.2021', 'Bruttothesaurierung:        78,81 USD'),
    cols('Valuta          :    08.10.2021', '*Einbeh. Steuer     :        15,24 EUR'),
    cols('Zuflusstag      :    08.10.2021', 'Devisenkurs        :         1,156200'),
    cols('', 'Endbetrag          :       -15,24 EUR'),
    '  unter der Transaktion-Nr.: 9000000010'
]];

export const flatexAdvanceTax = (tax = '1,23'): Line[][] => [[
    ...HEADER('flatexDEGIRO Bank AG', '29.01.2024'),
    cols('Max Beispiel', 'Buchungsdatum        29.01.2024'),
    cols('', 'Zuflussdatum         02.01.2024'),
    'Wertpapierabrechnung Vorabpauschale gem. § 18 InvStG',
    'BEISPIEL S&P 500 UCITS ETF IE00FTEST053/A39999',
    cols('Gesamtbestand       265,851000 St.', 'zum 30.12.2023'),
    cols('', `** Einbeh. Steuer                    ${tax} EUR`),
    '   Evtl. Details dazu finden Sie im Steuerreport unter der Transaktion-Nr.:',
    '   9000000011.'
]];

export const flatexCustodyFee = (): Line[][] => [[
    ...HEADER('flatexDEGIRO Bank AG', '20.04.2023'),
    'Depotservicegebühr US00TEST0069',
    'WKN     ISIN          Wertpapierbezeichnung           Anzahl',
    'A2TEST  US00TEST0069  BEISPIEL BIOTECH ADR        10,000000',
    'die ausländische Lagerstelle hat eine Depotservicegebühr aus ISIN US00TEST0069',
    'in Höhe von 0.18 EUR erhoben.',
    'Wir belasten den Betrag Ihrem Konto 1000000001 per Valuta 23.03.2023.'
]];

export const flatexOrderConfirmation = (): Line[][] => [[
    ...HEADER('flatexDEGIRO Bank AG', '27.03.2023'),
    'Auftragsbestätigung',
    'Kauf 29 St. BEISPIEL EM IMI UCITS ETF (IE00FTEST012/A1TEST) Limit 26,00 EUR'
]];

export const flatexStatement = (): Line[][] => [[
    ...HEADER('flatexDEGIRO Bank AG', '31.03.2023'),
    'Kontoauszug Nr. 3/2023',
    '01.03. 01.03. Überweisung 1.000,00+'
]];
