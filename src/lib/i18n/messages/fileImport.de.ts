// Broker file import: dialog texts and the export guide of every importer (keyed by
// importer id, see lib/importers/fileImporters.ts). Part of messages/de.ts.

export interface ImportGuide {
    scope: string; // broker entity / account type the guide applies to
    steps: string[]; // menu path to the export, one step per entry
    settings: string[]; // language, period, filters and other required options
    accounts: string; // several accounts, currencies or export limits
    supported: string[];
    unsupported: string[];
    limits: string[];
}

export const fileImportDe = {
    broker: 'Broker und Format',
    chooseBroker: 'Broker wählen …',
    guideTitle: (broker: string) => `So erstellst du den ${broker}-Export`,
    guideSections: {
        scope: 'Gilt für',
        steps: 'Export erstellen',
        settings: 'Wichtige Einstellungen',
        accounts: 'Mehrere Konten und Zeiträume',
        supported: 'Wird übernommen',
        unsupported: 'Wird nicht übernommen',
        limits: 'Bekannte Einschränkungen'
    },
    sources: 'Quellen',
    verified: (date: string) => `Anleitung und Format zuletzt geprüft am ${date}. Getestet mit synthetischen Beispieldateien.`,
    dropFiles: (multiple: boolean): string => (multiple ? 'Dateien hier ablegen' : 'Datei hier ablegen'),
    orClick: (accept: string) => `oder klicken zum Auswählen (${accept})`,
    reading: 'Datei wird gelesen …',
    preview: {
        title: 'Vorschau',
        format: 'Erkanntes Format',
        files: 'Dateien',
        period: 'Zeitraum',
        periodValue: (from: string, to: string) => `${from} – ${to}`,
        rows: 'Gelesene Zeilen',
        newTrades: 'Neue Käufe/Verkäufe',
        newMovements: 'Neue Kontobewegungen',
        balances: 'Kontostände',
        duplicates: 'Bereits vorhanden',
        ignored: 'Ohne Buchungswirkung übersprungen',
        unsupported: 'Nicht übernommen',
        unsupportedHint: 'Diese Zeilen haben eine finanzielle Wirkung, die Openfolio für dieses Format noch nicht übernimmt. Bitte bei Bedarf manuell erfassen.',
        ignoredHint: 'Verwaltungszeilen ohne Geld- oder Bestandswirkung.',
        note: (line: number, label: string, file?: string) => `${file ? `${file}, ` : ''}Zeile ${line}: ${label || '(ohne Typ)'}`,
        more: (count: number) => `… und ${count} weitere`,
        nothingNew: 'Alle Buchungen dieser Datei sind bereits im Depot.'
    },
    switched: (broker: string) => `Die Datei wurde als ${broker}-Export erkannt.`,
    errors: {
        title: 'Import nicht möglich',
        unknownFormat: 'Das Dateiformat wurde nicht erkannt. Bitte den Export gemäß Anleitung erstellen; bei mehreren Dateien müssen alle vom selben Broker stammen.',
        noRows: 'Die Datei enthält keine Buchungszeilen.',
        invalidNumber: (line?: number) => `Zahl in unerwartetem Format${line ? ` (Zeile ${line})` : ''}. Bitte Export und Spracheinstellung prüfen.`,
        invalidDate: (line?: number) => `Datum in unerwartetem Format${line ? ` (Zeile ${line})` : ''}. Bitte Export und Spracheinstellung prüfen.`,
        severalAccounts: 'Die Datei enthält Buchungen mehrerer Konten (z. B. Hauptkonto und Junior-Depot). Bitte je Konto einen eigenen Export erstellen und in ein eigenes Depot importieren.'
    },
    variants: {
        degiro: {
            transactions: 'Transactions.csv (Käufe/Verkäufe)',
            account: 'Account.csv (Kontoübersicht)'
        } as Record<string, string>,
        trading212: {
            standard: 'CSV-Verlaufsexport',
            utc: 'CSV-Verlaufsexport (Zeit in UTC)'
        },
        swissquote: {
            'en-13': 'CSV, Englisch (13 Spalten)',
            'en-15': 'CSV, Englisch (15 Spalten, mit Nettobetrag in Kontowährung)',
            'de-15': 'CSV, Deutsch (15 Spalten, mit Nettobetrag in Kontowährung)',
            'de-13': 'CSV, Deutsch (13 Spalten)'
        },
        traderepublic: {
            comma: 'Transaktionsexport CSV (Komma)',
            semicolon: 'Transaktionsexport CSV (Semikolon)'
        },
        saxo: {
            booked: 'Transaktionsexport (aus Excel als CSV gespeichert, Spalte „Booked Amount“)',
            amount: 'Transaktionsexport (aus Excel als CSV gespeichert, ältere Spalte „Amount“)'
        },
        schwab: {
            standard: 'CSV-Verlaufsexport',
            titled: 'CSV-Verlaufsexport (ältere Form mit Titelzeile)'
        },
        revolut: {
            comma: 'Kontoauszug Investmentkonto (CSV, Komma)',
            semicolon: 'Kontoauszug Investmentkonto (CSV, Semikolon)',
            tab: 'Kontoauszug Investmentkonto (TSV, Tabulator)'
        }
    } as Record<string, Record<string, string>>,
    guides: {
        degiro: {
            scope: 'flatexDEGIRO-Konten; Exporte mit deutscher Spaltenbeschriftung.',
            steps: [
                'Transaktionen (im Hauptmenü bzw. Posteingang): Zeitraum wählen → Export → CSV. Ergebnis: Transactions.csv mit Käufen und Verkäufen.',
                'Posteingang → Kontoübersicht: denselben Zeitraum wählen → Export → CSV. Ergebnis: Account.csv mit Dividenden, Steuern, Gebühren, Ein- und Auszahlungen.',
                'Beide Dateien gemeinsam hier ablegen.'
            ],
            settings: [
                'Sprache der DEGIRO-Oberfläche: Deutsch. Die Spalten werden auf Deutsch erwartet.',
                'Zeitraum möglichst ab Kontoeröffnung, damit Bestände und Cash vollständig sind.'
            ],
            accounts: 'Je DEGIRO-Konto ein eigenes Depot verwenden. Fremdwährungs-Unterkonten stehen in derselben Account.csv. Wiederholte oder überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe mit Transaktions- und AutoFX-Gebühren',
                'Dividenden, Kapitalrückzahlungen und Steuern',
                'Zinsen, Gebühren, Ein- und Auszahlungen',
                'Währungswechsel zwischen Unterkonten und Kontostände je Währung'
            ],
            unsupported: [
                'Kapitalmaßnahmen werden nicht als eigene Bestandsbuchung erkannt.'
            ],
            limits: [
                'Unbekannte Buchungstexte der Account.csv werden als Korrektur gebucht.',
                'Englischsprachige DEGIRO-Exporte werden noch nicht erkannt.'
            ]
        },
        trading212: {
            scope: 'Trading 212 Invest- und ISA-Konten (Verlaufsexport als CSV). Nicht für CFD-Konten.',
            steps: [
                'Menü (drei Striche) → Chronik öffnen; im Web genauso.',
                'Oben rechts auf das Datei-Symbol tippen (Export Verlauf).',
                'Zeitraum ab Kontoeröffnung wählen und Aufträge, Dividenden, Transaktionen und Zins anhaken.',
                'Export CSV wählen und die Datei über Herunterladen speichern, sobald sie bereit ist.'
            ],
            settings: [
                'Alle vier Datenarten auswählen, sonst fehlen Buchungen.',
                'Datei nicht in Excel öffnen und neu speichern.'
            ],
            accounts: 'Je Trading-212-Konto (Invest, ISA) ein eigenes Depot und ein eigener Export. Nicht zusätzlich zur Trading-212-API-Verbindung im selben Depot verwenden: CSV und API haben unterschiedliche Kennungen, Buchungen würden doppelt erscheinen. Überlappende CSV-Exporte werden nicht doppelt gebucht.',
            supported: [
                'Market-, Limit- und Stop-Käufe/-Verkäufe in Instrumentwährung; Stempelsteuer, Umrechnungsgebühr und andere Kostenspalten als Gebühr',
                'Dividenden (netto, wie gutgeschrieben; Quellensteuer steht im Buchungstext)',
                'Zinsen auf Guthaben und aus Wertpapierleihe',
                'Ein- und Auszahlungen',
                'Währungsumtausch (Currency conversion), sofern die Umtauschspalten im Export stehen'
            ],
            unsupported: [
                'Aktiensplits, Stock distributions, Depotüberträge (Transfer in/out) und andere Kapitalmaßnahmen: erscheinen als nicht übernommen.',
                'Kartenzahlungen, Cashback und sonstige Kontotypen.'
            ],
            limits: [
                'Käufe und Verkäufe werden wie beim API-Import in der Instrumentwährung gebucht; das Kontoguthaben in Kontowährung wird über das Cash-Modell ausgeglichen.',
                'Das Datum stammt aus der Exportzeit (UTC); Buchungen kurz nach Mitternacht können einen Tag abweichen.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        swissquote: {
            scope: 'Swissquote-Handelskonten (eTrading). Nicht für Yuh, Swissquote-Krypto oder PDF-Abrechnungen.',
            steps: [
                'Im eTrading unter Portfolio → Transaktionen öffnen.',
                'Unter Periode den Zeitraum wählen (möglichst ab Kontoeröffnung) und Anwenden klicken.',
                'Oben rechts auf Download klicken und CSV-Bericht wählen.',
                'Die Datei unverändert hier ablegen.'
            ],
            settings: [
                'Anzeigesprache möglichst Englisch (Mein Konto → Einstellungen → Displaysprache). Deutsche Exporte werden gelesen, aber nur die belegten Buchungstypen (Kauf, Verkauf, Dividende, Depotgebühren, Zinsen, Zahlung) erkannt.',
                'Alle Transaktionstypen im Filter eingeschlossen lassen.',
                'Datei nicht in Excel öffnen und neu speichern: Trennzeichen und Zahlenformat würden sich ändern.'
            ],
            accounts: 'Pro Swissquote-Konto ein eigenes Depot verwenden; der Export enthält keine Kontonummer. Fremdwährungen desselben Kontos stehen in derselben Datei. Überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe; Kosten werden als Gebühr übernommen',
                'Dividenden (Nettobetrag laut Export)',
                'Depotgebühren, Zinsen (auch negative) und Kosten des Steuerauszugs',
                'Einzahlungen (Payment, Credit) und Auszahlungen (Debit), Überweisungskosten als Gebühr',
                'Devisengeschäfte (Forex credit/debit) als interne Umbuchung zwischen Währungen',
                'Buchungen in einer anderen Währung als der Kontowährung mit Umrechnung (15-Spalten-Export)'
            ],
            unsupported: [
                'Depotüberträge (Transfer in/out), Bezugsrechte, Splits und andere Kapitalmaßnahmen: erscheinen in der Vorschau als nicht übernommen.',
                'Quellensteuer: Swissquote weist sie im Export nicht separat aus; sie wird nicht geschätzt.'
            ],
            limits: [
                'Dividenden werden mit dem Nettobetrag gebucht, da der Export keinen Bruttobetrag mit Steuer enthält.',
                'Das Format ist nur mit synthetischen Dateien nach öffentlichen Beispielen getestet, nicht mit aktuellen Original-Exporten.'
            ]
        },
        traderepublic: {
            scope: 'Trade-Republic-Konten (Depot und Verrechnungskonto); der native Transaktionsexport, den es seit April 2026 gibt. Nicht für CSV-Dateien des Tools pytr oder für PDF-Abrechnungen.',
            steps: [
                'In der Trade-Republic-App auf das Profilbild tippen (je nach App-Version „Profil“ oder „Service“).',
                'Kontoauszüge → Transaktionsexport öffnen.',
                'Den Zeitraum wählen, möglichst ab Kontoeröffnung, und Erstellen bzw. Teilen tippen.',
                'Die CSV-Datei unverändert hier ablegen.'
            ],
            settings: [
                'Möglichst den vollständigen Zeitraum exportieren: Bestände und Kassenstand ergeben sich nur aus der vollständigen Historie.',
                'Datei nicht in Excel öffnen und neu speichern: Trennzeichen und Zahlenformat könnten sich ändern.'
            ],
            accounts: 'Hauptkonto und Junior-Depot getrennt exportieren und in getrennte Depots importieren; eine Datei mit mehreren Konten wird abgelehnt. Wiederholte oder überlappende Exporte werden anhand der Transaktions-ID nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe (auch Sparpläne und Bruchstücke) mit Gebühr; Steuern auf Verkäufe als eigene Steuerbuchung',
                'Dividenden und Ausschüttungen brutto mit einbehaltener Steuer; Stornos und Neuabrechnungen von Dividenden',
                'Zinsen auf das Guthaben mit Steuer, Anleihekupons, Rückzahlung fälliger Anleihen und Optionsscheine',
                'Vorabpauschale, Steueroptimierung und Steuererstattungen',
                'Ein- und Auszahlungen, Überweisungen, Kartenzahlungen und -erstattungen, Geschenke, Saveback und Prämien; Gebühren für Karten-Aufladungen als eigene Gebühr'
            ],
            unsupported: [
                'Kryptowährungen: Der Export enthält dafür keine ISIN; die Zeilen erscheinen als nicht übernommen.',
                'Private-Markets-Vorauszahlungen, Splits, Fusionen, Umtausch und andere Kapitalmaßnahmen sowie unbekannte Buchungstypen: erscheinen in der Vorschau als nicht übernommen.'
            ],
            limits: [
                'Saveback und Prämien werden als Einzahlung gebucht, nicht als Ertrag.',
                'Die Steuer auf Dividenden ist im Export eine Summe aus Quellen- und Abgeltungsteuer und wird nicht aufgeteilt.',
                'Der Export enthält keine Kontostände; der Kassenstand wird aus den Buchungen berechnet.',
                'Das Format ist nur mit synthetischen Dateien nach öffentlichen Beispielen getestet, nicht mit aktuellen Original-Exporten.'
            ]
        },
        saxo: {
            scope: 'Saxo-Handelskonten (Saxo Bank und andere Saxo-Gesellschaften): Export der Transaktionsübersicht. Kein Portfolio- oder Positionsbericht.',
            steps: [
                'Bei Saxo (SaxoTrader oder SaxoInvestor) anmelden und im Kontobereich Transaktionen (Transactions) öffnen; alternativ oben rechts über das Profil → Transaction overview.',
                'Den Zeitraum möglichst ab Kontoeröffnung einstellen und die Filter Trades, Corporate actions und Cash transfers eingeschaltet lassen.',
                'Auf Export klicken und Excel wählen. Saxo liefert eine XLSX-Datei.',
                'Die XLSX-Datei in Excel oder LibreOffice öffnen und mit Datei → Speichern unter als CSV speichern (Trennzeichen Komma oder Semikolon).',
                'Die CSV-Datei hier ablegen.'
            ],
            settings: [
                'XLSX-Dateien werden nicht direkt gelesen. Beim Speichern als CSV keine Spalten löschen und keine Zahlen- oder Datumsformate ändern.',
                'Datum wie im Export (z. B. 02-Apr-2025) oder als 2025-04-02 bzw. 02.04.2025. Datumsangaben mit Schrägstrich sind mehrdeutig und werden abgelehnt.',
                'Beträge mit Dezimalkomma oder Dezimalpunkt, aber innerhalb der Datei einheitlich.',
                'Englische Oberfläche empfohlen. Niederländische Exporte werden für Käufe (Koop) gelesen.'
            ],
            accounts: 'Je Saxo-Konto ein eigenes Depot verwenden. Die Kontowährung ergibt sich aus den Kontobewegungen der Datei; stehen dort mehrere Währungen, erscheinen umgerechnete Buchungen als nicht übernommen. Überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe (Buy/Sell, Koop/Verkoop) mit Stückzahl und Kurs aus dem Buchungstext; die Differenz zum gebuchten Betrag als Gebühr',
                'Käufe und Verkäufe in Fremdwährung; die Umrechnung wird als interne Umbuchung zwischen Konto- und Instrumentwährung gebucht',
                'Dividenden (Nettobetrag wie gebucht) und Quellensteuer, wenn sie als eigene Zeile im Export steht',
                'Ein- und Auszahlungen, Depot- und andere Gebühren, Zinsen'
            ],
            unsupported: [
                'Kapitalmaßnahmen außer Dividenden (Splits, Spin-offs, Fusionen), Depotüberträge und unbekannte Buchungstexte: erscheinen als nicht übernommen.',
                'Optionen, Futures und CFDs (Spalte „From Derivative“ = Yes) erscheinen als nicht übernommen.',
                'Zeilen ohne ISIN werden nicht über das Symbol einem Wertpapier zugeordnet.'
            ],
            limits: [
                'Bei Käufen in Fremdwährung stecken Gebühren und Umrechnungskosten im umgerechneten Betrag und werden nicht getrennt ausgewiesen.',
                'Quellensteuer wird nicht geschätzt. Niederländische Texte für Kontobewegungen, Zinsen und Steuern sind nicht durch öffentliche Beispiele belegt.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        schwab: {
            scope: 'Charles-Schwab-Brokerage-Konten in den USA (Kontoverlauf als CSV). Kein Positionsexport (Positions).',
            steps: [
                'Bei schwab.com anmelden und Accounts → History öffnen.',
                'Oben das Konto auswählen.',
                'Unter Date Range den Zeitraum wählen (möglichst weit zurück).',
                'Auf Export klicken und CSV wählen; die Datei speichern und unverändert hier ablegen.'
            ],
            settings: [
                'Alle Transaktionstypen im Export lassen.',
                'Datei nicht in Excel öffnen und neu speichern: Datums- und Zahlenformat würden sich ändern.'
            ],
            accounts: 'Je Schwab-Konto ein eigenes Depot und ein eigener Export. Die Datei enthält keine Kontonummer. Laut einem Nutzerbericht reicht der Verlauf etwa vier Jahre zurück; ältere Buchungen gibt es nur in den PDF-Kontoauszügen. Überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'Käufe, Verkäufe und Wiederanlage (Reinvest Shares) mit Gebühren und Kommissionen (Fees & Comm)',
                'Dividenden und Ausschüttungen (Cash Dividend, Qualified/Non-Qualified Div, Reinvest Dividend, Pr Yr …, Cap Gain …)',
                'Foreign Tax Paid als Quellensteuer, ADR- und Beratergebühren, Zinsen (auch Margin Interest)',
                'Ein- und Auszahlungen (Wire, MoneyLink, Journal, Internal Transfer) mit dem Vorzeichen des Exports'
            ],
            unsupported: [
                'Splits, Reverse Splits, Stock Div Dist, Spin-offs, Fusionen, Namensänderungen, Conversions und Cash In Lieu: erscheinen als nicht übernommen.',
                'Depotüberträge von Wertpapieren (Journaled Shares, Security Transfer) sowie Optionen (Buy to Open, Sell to Close, …).',
                'Zeilen ohne Symbol werden keinem Wertpapier zugeordnet.'
            ],
            limits: [
                'Der Export enthält Ticker oder CUSIP, keine ISIN. Das Wertpapier wird beim nächsten Kursabruf über den Ticker gesucht; CUSIPs lassen sich meist nicht automatisch zuordnen.',
                'Alle Beträge in USD. Bei „as of“-Datum wird das Buchungsdatum verwendet, das „as of“-Datum bleibt in den Rohdaten.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        revolut: {
            scope: 'Revolut-Investmentkonto (Aktien/ETFs): Kontoauszug als Tabelle. Nicht für Krypto, Rohstoffe oder den Gewinn- und Verlustbericht.',
            steps: [
                'In der Revolut-App unten Invest öffnen.',
                'Mehr (…) antippen und Dokumente wählen.',
                'Aktien (Stocks) bzw. das Brokerage-Konto wählen und Kontoauszug (Account statement) antippen.',
                'Den Zeitraum ab Kontoeröffnung wählen und das Tabellenformat (CSV oder Excel) wählen, nicht PDF.',
                'Eine Excel-Datei in Excel oder LibreOffice öffnen und als CSV speichern. CSV- oder TSV-Dateien unverändert hier ablegen.'
            ],
            settings: [
                'Nicht den Profit-&-Loss-Bericht und nicht den Cost-&-Charges-Bericht verwenden: sie enthalten keine Einzelbuchungen.',
                'Krypto ist ein eigener Export mit anderen Spalten und wird hier nicht gelesen.',
                'Beim Speichern als CSV keine Spalten löschen und keine Datums- oder Zahlenformate ändern. Datumsangaben mit Schrägstrich werden abgelehnt.'
            ],
            accounts: 'Je Revolut-Investmentkonto ein eigenes Depot. Mehrere Währungen desselben Kontos stehen in einer Datei. Überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe (Market, Limit, Stop) mit dem Gesamtbetrag als Geldbetrag',
                'Dividenden (netto, wie gutgeschrieben) und als eigene Zeile ausgewiesene Steuerkorrekturen',
                'Depotgebühren (Custody fee), Einzahlungen (Cash top-up) und Auszahlungen (Cash withdrawal)'
            ],
            unsupported: [
                'Aktiensplits (Stock split): erscheinen als nicht übernommen und werden nicht als Kauf gebucht.',
                'Überträge zwischen Revolut-Gesellschaften (Transfer from … to …) mit Stückzahl oder Betrag: erscheinen als nicht übernommen. Sie ändern den Bestand meist nicht, bitte prüfen.',
                'Zeilen ohne Ticker werden keinem Wertpapier zugeordnet.'
            ],
            limits: [
                'Revolut weist Handelsgebühren nicht getrennt aus; sie stecken im Gesamtbetrag.',
                'Der Export enthält Ticker, keine ISIN. Das Wertpapier wird beim nächsten Kursabruf über den Ticker gesucht.',
                'Das Datum stammt aus der Exportzeit (UTC); Buchungen kurz nach Mitternacht können einen Tag abweichen. Quellensteuer wird nicht geschätzt.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        }
    } as Record<string, ImportGuide>
};
