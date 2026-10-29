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
        documents: 'Gelesene Dokumente',
        newTrades: 'Neue Käufe/Verkäufe',
        newMovements: 'Neue Kontobewegungen',
        balances: 'Kontostände',
        duplicates: 'Bereits vorhanden',
        ignored: 'Ohne Buchungswirkung übersprungen',
        unsupported: 'Nicht übernommen',
        unsupportedHint: 'Diese Zeilen haben eine finanzielle Wirkung, die Openfolio für dieses Format noch nicht übernimmt. Bitte bei Bedarf manuell erfassen.',
        ignoredHint: 'Verwaltungszeilen ohne Geld- oder Bestandswirkung.',
        unsupportedHintPdf: 'Diese Dokumente oder Buchungen haben eine finanzielle Wirkung, die Openfolio noch nicht übernimmt. Bitte bei Bedarf manuell erfassen.',
        ignoredHintPdf: 'Dokumente ohne Geld- oder Bestandswirkung, z. B. Kosteninformationen oder Auftragsbestätigungen.',
        note: (line: number, label: string, file?: string, page?: number) => `${file ? `${file}, ` : ''}${page ? `Seite ${page}` : `Zeile ${line}`}: ${label || '(ohne Typ)'}`,
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
        severalAccounts: 'Die Datei enthält Buchungen mehrerer Konten (z. B. Hauptkonto und Junior-Depot). Bitte je Konto einen eigenen Export erstellen und in ein eigenes Depot importieren.',
        missingCurrency: 'Die Kontowährung ist nicht erkennbar. XTB nennt sie nur im Dateinamen (z. B. EUR_account_….csv); bitte den Dateinamen beim Speichern als CSV beibehalten.',
        unknownFile: (file: string) => `${file}: Format nicht erkannt. Bitte nur Dokumente bzw. Exporte desselben Brokers gemeinsam importieren.`,
        mixedFiles: 'Die Dateien stammen von verschiedenen Brokern oder sind verschiedene Formate. Bitte je Broker getrennt importieren.',
        noTextLayer: (file?: string) => `${file ? `${file}: ` : ''}Das PDF enthält keinen auslesbaren Text, vermutlich ein Scan oder ein Foto. Bitte das Original-PDF beim Broker herunterladen; Texterkennung (OCR) bietet Openfolio nicht an.`,
        pdfEncrypted: (file?: string) => `${file ? `${file}: ` : ''}Das PDF ist mit einem Passwort geschützt. Bitte eine Fassung ohne Kennwort speichern und erneut importieren.`,
        pdfUnreadable: (file?: string) => `${file ? `${file}: ` : ''}Das PDF ist beschädigt oder kann nicht gelesen werden.`
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
        xtb: {
            'cash-8': 'Cash Operations als CSV (8 Spalten, Semikolon)',
            'cash-8-comma': 'Cash Operations als CSV (8 Spalten, Komma)',
            'cash-10': 'Cash Operations als CSV (10 Spalten, Semikolon)',
            'cash-10-comma': 'Cash Operations als CSV (10 Spalten, Komma)',
            legacy: 'Früherer CSV-Export (6 Spalten)'
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
        },
        etoro: {
            contracts: 'Kontoauszug, Blatt Account Activity (CSV, Spalte „Units / Contracts“)',
            units: 'Kontoauszug, Blatt Account Activity (CSV, ältere Spalte „Units“)'
        },
        freetrade: {
            activity: 'Aktivitäten-Export (CSV)'
        },
        investengine: {
            'trading-statement': 'Trading statement (CSV)'
        },
        avanza: {
            sv: 'Transaktionsexport (CSV, schwedisch)'
        },
        directa: {
            movimenti: 'Movimenti (CSV, italienisch)'
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
        xtb: {
            scope: 'XTB-Handelskonten (xStation), Aktien und ETFs. Ein Export je Konto bzw. Kontowährung. CFD-Positionen werden nicht übernommen.',
            steps: [
                'In xStation oben auf „Account history“ (Kontohistorie) und dann „Cash operations“ klicken.',
                'Export wählen, den Zeitraum (möglichst ab Kontoeröffnung) und den Bericht „Cash Operations“ einstellen und den Bericht exportieren. XTB liefert eine Excel-Datei (XLSX), z. B. EUR_account_2025-01-01_2025-06-30.xlsx.',
                'Die Datei in Excel oder LibreOffice öffnen, das Blatt „Cash Operations“ auswählen und mit „Speichern unter → CSV UTF-8 (durch Trennzeichen getrennt)“ speichern. Den Dateinamen mit der Währung am Anfang beibehalten.',
                'Die CSV-Datei hier ablegen. Die XLSX-Datei selbst wird nicht gelesen; eine nur umbenannte XLSX-Datei auch nicht.'
            ],
            settings: [
                'Die Kontowährung steht nur im Dateinamen (EUR_, USD_, PLN_ …). Ohne sie wird die Datei abgelehnt.',
                'Trennzeichen und Dezimalzeichen bestimmt das Tabellenprogramm: Semikolon mit Dezimalkomma (deutsche Einstellung) und Komma mit Dezimalpunkt (englische Einstellung) werden gelesen.',
                'Ältere direkte CSV-Exporte (Spalten ID;Type;Time;Symbol;Comment;Amount) werden ebenfalls gelesen.'
            ],
            accounts: 'Jedes XTB-Konto (z. B. EUR- und USD-Konto) separat exportieren; die Kontonummer der Datei trennt die Buchungen. Umbuchungen zwischen Unterkonten derselben Datei (My Trades, Investment Plans) heben sich auf. Wiederholte oder überlappende Exporte werden anhand der Operations-ID nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe von Aktien und ETFs; Stückzahl und Kurs aus dem Kommentar (OPEN BUY … @ …), Teilausführungen getrennt',
                'Dividenden und Quellensteuer (als Steuer der Position, nicht als Gebühr)',
                'Finanztransaktionssteuer (Tax IFTT), Kommissionen und SEC-Gebühren',
                'Zinsen auf freies Guthaben und die Steuer darauf, auch Korrekturen',
                'Ein- und Auszahlungen'
            ],
            unsupported: [
                'CFD-Buchungen: Gewinne/Verluste geschlossener Positionen (Close trade, Profit/Loss), Swap/Rollover und Dividendenausgleich auf CFDs.',
                'Spin-offs und Überträge zu anderen XTB-Konten.',
                'Unbekannte oder nicht englische Buchungstypen (z. B. tschechische Texte) erscheinen in der Vorschau als nicht übernommen.'
            ],
            limits: [
                'Der Export enthält keine ISIN. Wertpapiere werden unter dem XTB-Kürzel (z. B. SPYL.DE, FB.US) angelegt und bei der Kursaktualisierung aufgelöst; nicht auflösbare Kürzel bitte in den Wertpapierdetails korrigieren. Dasselbe Wertpapier aus einem anderen Depot mit ISIN wird nicht zusammengeführt.',
                'CFD und Aktie werden am Buchungstyp und am Kürzel unterschieden (Aktien und ETFs haben ein Börsenkürzel wie .DE oder .US). Ein CFD mit Börsenkürzel wird nur über den Typ erkannt.',
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
        },
        etoro: {
            scope: 'eToro-Investmentkonto (Aktien und ETFs, USD-Konto): Kontoauszug (Account statement) als Excel, Blatt „Account Activity“. CFDs, Krypto und Copy-Trading-Überträge werden nicht als Wertpapierbuchungen übernommen.',
            steps: [
                'Im Browser auf etoro.com anmelden und Portfolio öffnen.',
                'Oben History wählen, dann ganz rechts das Symbol anklicken und Account statement wählen. Alternativ: Einstellungen → Konto → Dokumente → Account Statement → Ansehen.',
                'Den Zeitraum ab Kontoeröffnung wählen und Create anklicken.',
                'Oben rechts das Excel-Symbol anklicken und die Datei herunterladen.',
                'Die Datei in Excel oder LibreOffice öffnen, das Blatt „Account Activity“ wählen und dieses Blatt als CSV speichern (Trennzeichen Komma oder Semikolon). Die CSV-Datei hier ablegen.'
            ],
            settings: [
                'Sprache der eToro-Website: Englisch. Die Spalten und Buchungstypen werden englisch erwartet.',
                'Nur das Blatt „Account Activity“ speichern, nicht „Closed Positions“, „Dividends“ oder „Account Summary“.',
                'Beim Speichern keine Spalten löschen und keine Datums- oder Zahlenformate ändern. Das Datum muss im eToro-Format TT/MM/JJJJ bleiben.'
            ],
            accounts: 'Ein eToro-Konto je Depot. Alle Beträge des Blatts sind USD, auch bei Einzahlungen aus einem EUR- oder GBP-Konto (eToro rechnet beim Eingang um). Überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'Eröffnete und geschlossene Positionen in Aktien und ETFs als Kauf und Verkauf (investierter bzw. ausgezahlter USD-Betrag, Stückzahl aus „Units“)',
                'Dividenden (netto, wie gutgeschrieben), Zinsen (Interest Payment)',
                'Einzahlungen, Auszahlungen (Withdraw Request), Auszahlungsgebühr und britische Stempelsteuer (SDRT) als Gebühr'
            ],
            unsupported: [
                'CFD-Positionen, Übernachtgebühren und -erstattungen sowie CFD-Dividenden: erscheinen als nicht übernommen.',
                'Krypto und andere Anlagearten außer Aktien und ETFs: erscheinen als nicht übernommen.',
                'Copy-Trading: Die Positionen des kopierten Traders werden wie eigene gebucht; „Start Copy“ ohne Betrag wird übersprungen, „Stop Copy“ und andere Typen mit Betrag erscheinen als nicht übernommen.',
                'Zeilen ohne Symbol und negative Aktiendividenden werden keinem Wertpapier zugeordnet und erscheinen als nicht übernommen.'
            ],
            limits: [
                'Der Export enthält eToro-Symbole (z. B. „BRIT.L“), keine ISIN. Das Wertpapier wird beim nächsten Kursabruf über das Symbol gesucht.',
                'Käufe und Verkäufe werden in USD gebucht, auch bei Wertpapieren in EUR oder GBX; den Kurs in Handelswährung enthält das Blatt nicht. Umrechnungsgebühren (Conversion Fee) sind im umgerechneten Betrag enthalten und werden nur angezeigt.',
                'Quellensteuer steht nur im Blatt „Dividends“ und wird nicht geschätzt. Der Kontostand (Balance) wird nicht übernommen: bei CFDs, Krypto und Copy-Trading weicht er vom gebuchten Geld ab.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        freetrade: {
            scope: 'Freetrade-Depots (GIA, ISA, SIPP): Export des Aktivitäten-Feeds als CSV.',
            steps: [
                'In der Freetrade-App oben links das Depot (Portfolio) wählen.',
                'Unten den Reiter Aktivität (Activity) öffnen.',
                'Oben rechts das Pfeilsymbol (Export) antippen und mit „All Activity“ bestätigen.',
                'Die CSV-Datei speichern oder teilen und hier unverändert ablegen.'
            ],
            settings: [
                'Immer „All Activity“ exportieren, damit Einzahlungen, Dividenden und Zinsen enthalten sind.',
                'Die Datei nicht in Excel öffnen und neu speichern: Zahlen und Zeitstempel werden im Originalformat erwartet.'
            ],
            accounts: 'Je Freetrade-Depot (GIA, ISA, SIPP) ein eigener Export und ein eigenes Openfolio-Depot. Überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe (ORDER) in Kontowährung, Stempelsteuer und FX-Gebühr als Gebühr',
                'Gratisaktien (FREESHARE_ORDER) als Kauf, bezahlt durch eine Bonus-Einzahlung in Höhe ihres Werts',
                'Dividenden und Property-Income-Ausschüttungen: brutto mit der im Export ausgewiesenen Quellensteuer, sonst netto',
                'Zinsen, Einzahlungen (TOP_UP) und Auszahlungen (WITHDRAWAL)'
            ],
            unsupported: [
                'Unbekannte Typen mit Betrag oder Wertpapier (z. B. Kapitalmaßnahmen): erscheinen als nicht übernommen.',
                'Aufträge ohne ISIN oder ohne Kauf/Verkauf-Angabe werden keinem Wertpapier zugeordnet.',
                'Depotüberträge zu und von anderen Anbietern sind laut Freetrade nicht im Export enthalten.'
            ],
            limits: [
                'Käufe von Wertpapieren in Fremdwährung werden zum Betrag in Kontowährung gebucht; der Kurs in Handelswährung bleibt in den Rohdaten.',
                'Monatsauszüge und Steuerbescheinigungen (MONTHLY_STATEMENT) haben keinen Betrag und werden übersprungen.',
                'Das Datum stammt aus dem Zeitstempel in UTC; Buchungen kurz nach Mitternacht britischer Sommerzeit können einen Tag abweichen.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        investengine: {
            scope: 'InvestEngine-Depots (GIA, ISA, SIPP, Business): Bericht „Trading statement“ als CSV, nur Käufe und Verkäufe.',
            steps: [
                'Im Browser bei InvestEngine anmelden und oben rechts Reports wählen.',
                'Create report anklicken und als Berichtstyp „Trading statement“ wählen.',
                'Den Zeitraum ab Depoteröffnung und das Depot (Portfolio) wählen, CSV als Format wählen und Generate report anklicken.',
                'Sobald die Benachrichtigung bzw. E-Mail kommt, den Bericht oben auf der Reports-Seite herunterladen (Dateiname z. B. GIA_Trading_statement_….csv) und hier ablegen.'
            ],
            settings: [
                'Berichtstyp „Trading statement“, nicht Cash Statement, Valuation Statement oder CGT Report.',
                'Die Datei unverändert ablegen; Beträge werden mit „£“ und Datumsangaben als TT/MM/JJ erwartet.'
            ],
            accounts: 'Je InvestEngine-Depot ein eigener Bericht und ein eigenes Openfolio-Depot. Überlappende Berichte werden nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe (Buy, Sell) mit Stückzahl und Handelswert in GBP; Wertpapier über die ISIN'
            ],
            unsupported: [
                'Dividenden, Plattform- und Fondsgebühren, Ein- und Auszahlungen: stehen nicht im Trading statement, sondern im Cash Statement, das noch nicht gelesen wird. Bitte bei Bedarf manuell erfassen.',
                'Andere Transaktionstypen (z. B. Überträge) und Zeilen ohne ISIN: erscheinen als nicht übernommen.'
            ],
            limits: [
                'Ohne Einzahlungen im Bericht behandelt Openfolio das für Käufe nötige Geld als neu investiert.',
                'Der Handelswert ist der gebuchte Betrag; InvestEngine erhebt keine Handelsgebühr je Auftrag.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        avanza: {
            scope: 'Avanza (Schweden): Transaktionsexport aller Konten des Logins (ISK, KF, Depå, Sparkonto) als CSV.',
            steps: [
                'Im Browser bei Avanza anmelden und „Min ekonomi“ öffnen.',
                'Den Reiter „Transaktioner“ wählen.',
                'Den Zeitraum ab Kontoeröffnung wählen.',
                '„Exportera transaktioner“ anklicken und die CSV-Datei unverändert hier ablegen.'
            ],
            settings: [
                'Die Datei ist schwedisch, mit Semikolon und Dezimalkomma; nicht in Excel öffnen und neu speichern.',
                'Nicht den Export der Bestände (Innehav) verwenden: er enthält keine Buchungen.'
            ],
            accounts: 'Der Export enthält alle Konten; Openfolio bucht sie gemeinsam in ein Depot und behält das Konto (Spalte „Konto“) in den Rohdaten. Überträge zwischen eigenen Konten erscheinen als Aus- und Einzahlung und heben sich auf. Für getrennte Depots die Zeilen der anderen Konten vor dem Import entfernen. Überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'Köp und Sälj mit Courtage als Gebühr (bei SEK-Beträgen)',
                'Utdelning (wie gutgeschrieben) und Utländsk källskatt als Quellensteuer',
                'Ränta, Insättning und Uttag',
                'Övrigt: Avkastningsskatt als Steuer, „Återbetalning … avgift“ als Gebührenerstattung'
            ],
            unsupported: [
                'Andere „Övrigt“-Zeilen mit Stückzahl oder Betrag (z. B. Fondsumtausch, Kapitalmaßnahmen): erscheinen als nicht übernommen.',
                'Unbekannte Transaktionstypen mit Betrag (z. B. Preliminärskatt): erscheinen als nicht übernommen.',
                'Käufe und Verkäufe ohne ISIN werden keinem Wertpapier zugeordnet.'
            ],
            limits: [
                'Beträge in der Transaktionswährung (meist SEK). Bei Fremdwährungskonten bleibt das Courtage (in SEK) im Betrag enthalten und steht nur in den Rohdaten.',
                'Den Exportweg beschreibt nur ein Avanza-Kunde (Export-To-Ghostfolio, Issue #165); eine offizielle Avanza-Anleitung wurde nicht gefunden.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        directa: {
            scope: 'Directa SIM (Italien): Kontobewegungen „Movimenti“ eines Kontos als CSV.',
            steps: [
                'Directa im Modus „Libera“ öffnen und im Bereich Conto „Movimenti“ wählen.',
                'Den Reiter „Tutti i movimenti“ und die Sortierung „Data operazione“ wählen.',
                'Oben rechts den Zeitraum einstellen (Kalendersymbol).',
                'Das Excel-Symbol anklicken, „File separato da virgole (csv)“ wählen und „Estrai“ anklicken.',
                'Die CSV-Datei unverändert hier ablegen; die Kopfzeilen (Conto, Data estrazione, Zeitraum) dürfen bleiben.'
            ],
            settings: [
                'Format „File separato da virgole (csv)“, nicht xlsx oder ods.',
                'Directa liefert höchstens 3.000 Zeilen je Export. Bei mehr Bewegungen den Zeitraum teilen (z. B. ein Export je Jahr); überlappende Exporte werden nicht doppelt gebucht.'
            ],
            accounts: 'Ein Export je Directa-Konto; das Konto aus der Zeile „Conto : …“ ist Teil des Schlüssels, damit Buchungen verschiedener Konten nicht zusammenfallen.',
            supported: [
                'Acquisto und Vendita mit „Importo euro“ als Geldbetrag',
                'Proventi und Dividenden, Anleihekupons (Cedola) und Zertifikatskupons als Zins, Stückzinsen (Ratei)',
                'Einbehaltene Steuern (Rit.…) als Quellensteuer der Position; Ritenuta su plusvalenza, Tobin tax und Bollo als Steuer',
                'Commissioni als Gebühr, Einzahlungen (Conferimento, Bonifico) und Auszahlungen (Prelievo)'
            ],
            unsupported: [
                'Finanzierungen (Finanziamento) und unbekannte Bewegungsarten mit Betrag: erscheinen als nicht übernommen.',
                'Käufe und Verkäufe ohne ISIN oder mit unplausiblem Vorzeichen.'
            ],
            limits: [
                'Gebuchte Währung ist immer EUR („Importo euro“); Fremdwährungsbetrag und Divisa bleiben in den Rohdaten.',
                'Kosten sind in der Kauf-/Verkaufszeile nicht getrennt ausgewiesen und werden nicht geschätzt.',
                'Anleihen werden mit der Stückzahl der Datei (Nennwert) gebucht.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        }
    } as Record<string, ImportGuide>
};
