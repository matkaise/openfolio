// Synthetic Consorsbank documents in the three generations of the originals. Names,
// numbers, ids and addresses are made up.

type Line = string | [number, string][];

const cols = (left: string, right: string): Line => [[50, left], [330, right]];

const HEADER: Line[] = [
    'Consorsbank • 90318 Nürnberg',
    [[330, 'Depotnummer 0815081508']],
    [[330, '1111111111/00']],
    'Max Beispiel',
    cols('Beispielweg 1', 'Vermerk der Bank 1000'),
    '12345 Musterstadt'
];

const FOOTER: Line[] = [
    'Einwendungen wegen Unrichtigkeit dieser Mitteilung müssen unverzüglich erhoben werden.',
    'Consorsbank ist eine eingetragene Marke der BNP Paribas S.A. Niederlassung Deutschland.'
];

export const consorsBuy = (): Line[][] => [[
    ...HEADER,
    'ORDERABRECHNUNG',
    'KAUF AM 06.09.2025  UM 13:43:10 HAMBURG NR. 148553598.001',
    'Bezeichnung WKN ISIN',
    'MUSTER AG O.N. CBTST1 DE000CTSB012',
    'Einheit Umsatz',
    'ST 300,00000',
    'Kurs 11,300000 EUR P.ST.',
    'Kurswert EUR 3.390,00',
    'Börsenplatzgebühr EUR 2,50',
    'Courtage EUR 2,71',
    'Provision EUR 8,48',
    'Grundgebühr EUR 4,95',
    'Wert 10.09.2025 EUR 3.408,64',
    'zulasten Konto-Nr. 9876543210',
    'Bestand zugunsten Girosammelverwahrung',
    ...FOOTER
]];

export const consorsSavingsPlan = (): Line[][] => [[
    ...HEADER,
    'ORDERABRECHNUNG',
    'KAUF AM 03.02.2025  UM 08:02:51 SPARPLAN NR. 300000001.001',
    'Bezeichnung WKN ISIN',
    'BEISPIEL S.A. INH. EO 2,29 CBTST2 FR00CTSB0024',
    'Einheit Umsatz',
    'ST 1,01514',
    'Kurs 24,190000 EUR P.ST.',
    'Kurswert EUR 24,56',
    'Franzoesische Finanztransaktionssteuer 0,30% EUR 0,07',
    'Provision EUR 0,37',
    'Wert 05.02.2025 EUR 25,00',
    'zulasten Konto-Nr. 9876543210',
    ...FOOTER
]];

/** Current generation: amount behind the unit, "abzgl.", a sale with tax. */
export const consorsSell = (): Line[][] => [[
    ...HEADER,
    'ORDERABRECHNUNG',
    'VERKAUF AM 25.01.2025 UM 19:24:18 FRANKFURT NR. 111111111.001',
    'Bezeichnung WKN ISIN',
    'BEISPIEL NEUSON SE NA O.N. CBTST3 DE000CTSB036',
    'Einheit Umsatz',
    'ST 240,00000',
    'Preis pro Anteil 21,600000 EUR',
    'Kurswert 5.184,00 EUR',
    'abzgl. Börsenplatzgebühr 2,50 EUR',
    'abzgl. Handelsentgelt 2,61 EUR',
    'abzgl. Provision 12,96 EUR',
    'abzgl. Grundgebühr 4,95 EUR',
    'abzgl. Kapitalertragsteuer 25,00 % von 437,47 EUR 109,37 EUR',
    'abzgl. Solidaritätszuschlag 5,50 % von 109,37 EUR 6,01 EUR',
    'zugunsten Konto-Nr. 7777777777 5.045,60 EUR',
    'Valuta 27.01.2025',
    'Veräusserungsgewinn nach Differenzmethode 437,47 EUR',
    ...FOOTER
], [
    'Details zur Abrechnung',
    'abzgl. Kapitalertragsteuer 25,00 % von 437,47 EUR 109,37 EUR'
]];

export const consorsForeignBuy = (): Line[][] => [[
    ...HEADER,
    'ORDERABRECHNUNG',
    'KAUF AM 01.07.2025 UM 02:11:52 TOKIO NR. 238336487.001',
    'Bezeichnung WKN ISIN',
    'BEISPIEL + CO., C. CBTST4 JP00CTSB0048',
    'Einheit Umsatz',
    'ST 200,00000',
    'Preis pro Anteil 5.100,000000 JPY',
    'Kurswert 1.020.000,00 JPY',
    'Börsenplatzgebühr 7.760,00 JPY',
    'Devisenkurs 141,090000 EUR / JPY',
    'Zwischensumme 7.284,43 EUR',
    'Provision 18,07 EUR',
    'Grundgebühr 49,95 EUR',
    'zulasten Konto-Nr. 123456789 7.352,45 EUR',
    'Valuta 05.07.2025',
    ...FOOTER
]];

/** The booked amount follows the amount in fund currency. */
export const consorsForeignFund = (): Line[][] => [[
    ...HEADER,
    'ORDERABRECHNUNG',
    'KAUF AM 16.10.2025  UM 13:40:01 AUSL.INVESTM.GESCH. NR. 194783734.001',
    'Bezeichnung WKN ISIN',
    'BEISPIEL-GL EQ.A-DL CBTST5 LU00CTSB0053',
    'Einheit Umsatz',
    'ST 0,32990',
    'Preis pro Anteil 359,140000 USD',
    'Nettoinventarwert USD 118,48',
    'Wert 19.10.2025 USD 118,48',
    'umger. zum Devisenkurs USD 1,184800 EUR 100,00',
    'Consorsbank Ausgabegebühr 0,00%',
    'zulasten Konto-Nr. 123456789',
    ...FOOTER
]];

export const consorsBondBuy = (): Line[][] => [[
    ...HEADER,
    'ORDERABRECHNUNG',
    'KAUF AM 07.07.2025 UM 13:38:16 TRADEGATE EXCHANGE NR. 269730691.001',
    'Bezeichnung WKN ISIN',
    '0,375 % BEISPIEL LEASING 21/26 CBTST6 XS00CTSB0062',
    'Einheit Umsatz',
    'EUR 7.000,00000 Letzte Fälligkeit 20.07.2026',
    'Preis pro Anteil 88,789000 %',
    'Kurswert 6.215,23 EUR',
    'Stückzins Zinsvaluta 10.07.2025 356 Tage 25,60 EUR',
    'zulasten Konto-Nr. 123456789 6.240,83 EUR',
    ...FOOTER
]];

/** Cortal Consors era: only the WKN is printed. */
export const consorsOldSell = (): Line[][] => [[
    'Cortal Consors S.A. • Postfach 17 43 • 90006 Nürnberg',
    'WERTPAPIERABRECHNUNG',
    'Verkauf AM 16.05.2008 UM 16:04:03 IN INL.AUSSERBOERSLICH NR.29541397.001',
    'ST 334,00000 WKN: CBTST7',
    'BEISPIEL, KON. EO-,30',
    'Kurswert EUR 3.303,26',
    'PROVISION EUR 8,26',
    'GRUNDGEBUEHR EUR 4,95',
    'WERT 20.05.2008 EUR 3.290,05',
    'zugunsten Konto-Nr. 0546956980'
]];

export const consorsRedemption = (): Line[][] => [[
    ...HEADER,
    'Einlösung',
    'Wertpapierbezeichnung WKN ISIN',
    'Beispiel Finanz AG CBTST8 DE000CTSB085',
    'Einheit Nominale Fällig per',
    'Stück 1.000 20.05.2025',
    'Einlösung zu 0,001 EUR Schlusstag 20.05.2025',
    'Brutto 1,00 EUR',
    'Netto zugunsten IBAN DE00 0000 0000 0000 0000 00 1,00 EUR',
    'Valuta 20.05.2025 BIC CSDBDE71XXX',
    ...FOOTER
]];

/** Upper-case credit: WKN only, amounts in both currencies, a final date without amount. */
export const consorsOldDividend = (): Line[][] => [[
    ...HEADER,
    'NUERNBERG, 29.06.2015',
    'DIVIDENDENGUTSCHRIFT',
    'ST 650,00000 WKN: CBTST9',
    'BEISPIEL GROUP INC.',
    'Registered Shares DL -,333',
    'ZINS-/DIVIDENDENSATZ 0,565000 USD SCHLUSSTAG PER 21.12.2015',
    'BRUTTO USD 367,25',
    'QUST 15,00000 % EUR 50,40 USD 55,09',
    'USD 312,16',
    'UMGER.ZUM DEV.-KURS 1,093000 EUR 285,60',
    'WERT 11.01.2016',
    'ZU GUNSTEN KONTO-NR. 0800 773 850 / IBAN DE00000000000000000000',
    'BEMESSUNGSGRUNDLAGE FUER KAPST EUR 336,00',
    ...FOOTER
]];

/** In current credits an amount can stand on the line above its label. */
export const consorsDividend = (): Line[][] => [[
    ...HEADER,
    'Dividendengutschrift',
    'Wertpapierbezeichnung WKN ISIN',
    'BEISPIEL & GAMBLE CO. Registered Shares o.N. CBTS10 US00CTSB0105',
    'Bestand',
    '100 Stück',
    'Dividende pro Stück 1,0568 USD Schlusstag 23.10.2025',
    'Brutto in USD 105,68 USD',
    'abzgl. Quellensteuer 15,00 % von 105,68 USD 15,85 USD',
    '89,83 USD',
    'Zwischensumme in USD',
    'Devisenkurs 1,161500 USD / EUR',
    '90,99 EUR',
    'Brutto in EUR',
    '13,65 EUR',
    'Quellensteuer in EUR',
    'Zwischensumme in EUR 77,34 EUR',
    'abzgl. Kapitalertragsteuer 25,00 % von 36,39 EUR 9,10 EUR',
    'abzgl. Solidaritätszuschlag 5,50 % von 9,10 EUR 0,50 EUR',
    '67,74 EUR',
    'Netto zugunsten IBAN DE00 0000 0000 0000 0000 00',
    'Valuta 17.11.2025 BIC DABBDEMMXXX',
    ...FOOTER
]];

/** Credited to a USD account: the document ends in another currency than its taxes. */
export const consorsForeignAccountDividend = (): Line[][] => [[
    ...HEADER,
    'Dividendengutschrift',
    'Wertpapierbezeichnung WKN ISIN',
    'BEISPIEL-COLA CO. Registered Shares DL -,25 CBTS11 US00CTSB0113',
    'Brutto in USD 13,25 USD',
    'abzgl. Quellensteuer 15,00 % von 13,25 USD 1,99 USD',
    'Netto in USD zugunsten IBAN DE00 0000 0000 0000 0000 00 11,26 USD',
    'Devisenkurs 1,14630 USD / EUR',
    'Brutto in EUR 11,56 EUR',
    'Valuta 01.07.2026 BIC DABBDEMMXXX',
    ...FOOTER
]];

export const consorsAdvanceTax = (taxed = true): Line[][] => [[
    ...HEADER,
    'Vorabpauschale',
    'Wertpapierbezeichnung WKN ISIN',
    'BEISPIEL Robotik UETF CBTS12 DE000CTSB129',
    'Bestand',
    '106 Stück',
    ...(taxed ? [
        'Vorabpauschale pro Anteil 0,04106074 EUR Schlusstag 01.01.2025',
        'Kapitalertrag 0,00 EUR',
        'abzgl. Kapitalertragsteuer 25,00 % von 2,79 EUR 0,70 EUR',
        'abzgl. Solidaritätszuschlag 5,50 % von 0,70 EUR 0,03 EUR',
        'Netto zulasten IBAN DE00 0000 0000 0000 0000 00 0,73 EUR',
        'Valuta 02.01.2025 BIC CSDBDE71XXX'
    ] : ['Vorabpauschale pro Anteil 0,00 EUR Schlusstag 01.01.2025', 'Kapitalertrag 0,00 EUR', 'Vorabpauschale gem. §18 InvStG 0,00 EUR']),
    ...FOOTER
]];

export const consorsCancelled = (): Line[][] => [[
    ...HEADER,
    'STORNO',
    'Ertragsgutschrift',
    'Wertpapierbezeichnung WKN ISIN',
    'BEISPIEL IMMOINVEST CBTS13 DE000CTSB137',
    'Brutto 10,00 EUR',
    'Netto zulasten IBAN DE00 0000 0000 0000 0000 00 10,00 EUR',
    'Valuta 13.05.2025 BIC CSDBDE71XXX'
]];

export const consorsReissued = (): Line[][] => [[
    ...HEADER,
    'Ertragsgutschrift / Neuabrechnung',
    'Wertpapierbezeichnung WKN ISIN',
    'BEISPIEL IMMOINVEST CBTS13 DE000CTSB137',
    'Brutto 12,00 EUR',
    'Netto zugunsten IBAN DE00 0000 0000 0000 0000 00 12,00 EUR',
    'Valuta 13.05.2025 BIC CSDBDE71XXX'
]];

export const consorsLossOffset = (amount = '90,61'): Line[][] => [[
    ...HEADER,
    'Nachträgliche Verlustverrechnung',
    'Erstattung/Belastung (-) von Steuern',
    'Den Steuerausgleich buchen wir mit Wertstellung 10.07.2025',
    'Anteil 100,00%',
    'KapSt Person 1 : 79,89',
    'SolZ Person 1 : 4,36',
    '======================================================================',
    amount
]];

export const consorsTransfer = (): Line[][] => [[...HEADER, 'UEBERTRAG EINGANG', 'ST 10,00000 WKN: CBTST1']];
export const consorsStatement = (): Line[][] => [[...HEADER, 'Kontotyp Verrechnungskonto', 'GUTSCHRIFT 01.01. 100,00+']];
export const consorsOrderConfirmation = (): Line[][] => [[...HEADER, 'Orderbestätigung', 'Kauf 10 Stück MUSTER AG Limit 11,30 EUR']];
export const consorsUnknown = (): Line[][] => [[...HEADER, 'Änderung Ihrer Bedingungen']];
