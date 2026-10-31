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
            'transactions-en': 'Transactions.csv, Englisch (Käufe/Verkäufe)',
            account: 'Account.csv (Kontoübersicht)',
            'account-en': 'Account.csv, Englisch (Kontoübersicht)'
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
        },
        disnat: {
            'fr-comma': 'Kontoverlauf, aus Excel als CSV (französisch, Komma)',
            'fr-semicolon': 'Kontoverlauf, aus Excel als CSV (französisch, Semikolon)'
        },
        finpension: {
            '3a': 'Transaktionsbericht Säule 3a (CSV)',
            bvg: 'Transaktionsbericht Freizügigkeit/BVG (CSV)',
            report: 'Transaktionsbericht (CSV, ohne Käufe, Verkäufe oder Einzahlungen)'
        },
        scalable: {
            de: 'PDF-Abrechnung Scalable Capital (deutsch)',
            en: 'PDF-Abrechnung Scalable Capital (englisch)',
            baader: 'PDF-Abrechnung der Baader Bank (bis 2024)'
        },
        flatex: {
            flatex: 'PDF-Abrechnung flatex / flatexDEGIRO Bank',
            fintech: 'PDF-Abrechnung FinTech Group Bank (bis 2020)'
        },
        ing: {
            ing: 'PDF-Abrechnung ING Deutschland'
        },
        comdirect: {
            comdirect: 'PDF-Dokumente comdirect'
        },
        yuh: {
            de: 'PDF-Transaktionsbeleg, Deutsch',
            en: 'PDF-Transaktionsbeleg, Englisch'
        },
        commsec: {
            colon: 'PDF-Bestätigung (COMPANY: …)',
            plain: 'PDF-Bestätigung (COMPANY … / SECURITY … KÜRZEL)'
        },
        dkb: {
            dkb: 'PDF-Abrechnung DKB'
        },
        consorsbank: {
            consorsbank: 'PDF-Abrechnung Consorsbank / Cortal Consors'
        },
        wealthsimple: {
            'performance-report': 'PDF-Performance-Report',
            other: 'Anderes Wealthsimple-Dokument'
        },
        hargreaveslansdown: {
            'contract-note': 'PDF-Contract-Note'
        },
        questrade: {
            statement: 'PDF-Monatsauszug',
            'trade-confirmation': 'PDF-Trade-Confirmation-Report',
            other: 'Anderes Questrade-Dokument'
        },
        robinhood: {
            statement: 'PDF-Monatsauszug',
            other: 'Anderes Robinhood-Dokument'
        }
    } as Record<string, Record<string, string>>,
    guides: {
        degiro: {
            scope: 'flatexDEGIRO-Konten; Exporte mit deutscher oder englischer Spaltenbeschriftung.',
            steps: [
                'Transaktionen (im Hauptmenü bzw. Posteingang): Zeitraum wählen → Export → CSV. Ergebnis: Transactions.csv mit Käufen und Verkäufen.',
                'Posteingang → Kontoübersicht: denselben Zeitraum wählen → Export → CSV. Ergebnis: Account.csv mit Dividenden, Steuern, Gebühren, Ein- und Auszahlungen.',
                'Beide Dateien gemeinsam hier ablegen.'
            ],
            settings: [
                'Sprache der DEGIRO-Oberfläche: Deutsch oder Englisch. Andere Sprachen werden nicht erkannt.',
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
                'Kapitalmaßnahmen erkennt Openfolio nicht als eigene Bestandsbuchung: Ihre Teile aus der Transactions.csv werden als Verkauf und Kauf gebucht. Bestand und Geld stimmen, der Kostenansatz beginnt aber neu und die Differenz erscheint als realisierter Gewinn oder Verlust.'
            ],
            limits: [
                'Unbekannte Buchungstexte der Account.csv werden als Korrektur gebucht.',
                'Käufe und Verkäufe kommen aus der Transactions.csv. Steht ein Trade nur in der Account.csv (Datei fehlt, kürzerer Zeitraum, vom Export ausgelassen), erscheint er unter „Nicht übernommen“.',
                'Exporte mit der älteren Spaltenfolge (ohne Spalte AutoFX-Gebühr) werden nicht erkannt.',
                'Englische Exporte sind nur mit synthetischen Dateien getestet. Die Sprache nicht zwischen zwei Exporten wechseln: Kontozeilen derselben Buchung werden sonst doppelt erkannt.'
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
        },
        disnat: {
            scope: 'Disnat (Desjardins, Kanada): Kontoverlauf eines Kontos (z. B. CELI/TFSA, REER/RRSP, REEE/RESP, Barkonto), als XLSX exportiert und als CSV gespeichert.',
            steps: [
                'Bei Disnat anmelden und das Konto wählen, das exportiert werden soll.',
                'Historique (History) und dann Compte (Account) wählen.',
                'Den Zeitraum wählen (z. B. benutzerdefiniert ab Kontoeröffnung) und auf Exportieren klicken. Disnat erzeugt eine XLSX-Datei.',
                'Die Datei in Excel oder LibreOffice öffnen und als CSV speichern (Trennzeichen Komma oder Semikolon). Die CSV-Datei hier ablegen.'
            ],
            settings: [
                'Erkannt werden die französischen Spaltennamen des öffentlichen Beispiels (Date de transaction, Type de transaction, Montant de l\'opération, …). Ein englischer Export ist nicht belegt und wird nicht erkannt.',
                'Beim Speichern keine Spalten löschen und keine Zahlen- oder Datumsformate ändern; Datum im Format JJJJ-MM-TT.'
            ],
            accounts: 'Je Disnat-Konto ein eigener Export und ein eigenes Openfolio-Depot. Überlappende Exporte werden nicht doppelt gebucht.',
            supported: [
                'ACHAT und VENTE von Aktien/ETFs (Classe d\'actif „Actions“) mit dem Betrag der Operation; Kommission als Gebühr, wenn Stückzahl × Kurs + Kommission den Betrag ergibt',
                'Dividenden (wie gutgeschrieben), Retenue als Quellensteuer, Zinsen',
                'Gebühren samt TPS/TVQ auf Gebühren, Einzahlungen (Cotisation, Barüberträge, REEE-Zuschüsse) und Auszahlungen (Résiliation, Retrait)'
            ],
            unsupported: [
                'Überträge mit Wertpapier oder Stückzahl, Optionen und andere Anlageklassen, unbekannte Typen mit Betrag: erscheinen als nicht übernommen.',
                'Zeilen ohne Symbol werden keinem Wertpapier zugeordnet.'
            ],
            limits: [
                'Der Export enthält Disnat-Symbole, keine ISIN. Das Suffix „-C“ (kanadische Notierung) wird entfernt, damit Handel und Dividenden zum selben Wertpapier gehören; die Auflösung übernimmt der nächste Kursabruf.',
                'Bei Wertpapieren in US-Dollar auf einem CAD-Konto enthält der Betrag Umrechnung und Kommission; die Kommission bleibt dann in den Rohdaten.',
                'Exportweg nur von einem Disnat-Kunden beschrieben (Export-To-Ghostfolio, Issue #260); eine offizielle Anleitung wurde nicht gefunden.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        finpension: {
            scope: 'Finpension (Schweiz): Säule-3a-Portfolios und Freizügigkeitskonten (BVG), Transaktionsbericht als CSV je Portfolio.',
            steps: [
                'Bei Finpension anmelden und auf der Startseite das Portfolio wählen.',
                'Rechts „Transaktionen“ (Transactions) öffnen.',
                'Beim Eintrag „Transaktionsbericht (CSV-Datei)“ (transaction report) den Download wählen (alternativ per E-Mail senden lassen).',
                'Die CSV-Datei unverändert hier ablegen.'
            ],
            settings: [
                'Den Bericht nicht in Excel öffnen und neu speichern: Semikolon, Dezimalpunkt und Datum JJJJ-MM-TT werden im Original erwartet.'
            ],
            accounts: 'Je Finpension-Portfolio (jedes 3a-Portfolio, jedes Freizügigkeitskonto) ein eigener Bericht und ein eigenes Openfolio-Depot. Überlappende Berichte werden nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe (3a: Buy/Sell; BVG: Portfolio Transaction, Richtung aus dem Cash Flow) in CHF',
                'Ausschüttungen (Dividend, Dividend and Interest Distributions), Zinsen (Interests), Pauschalgebühr (Flat-rate administrative/administration fee)',
                'Einzahlungen (Deposit), Freizügigkeitsüberträge (Transfer vested benefits) als Ein- oder Auszahlung, Auszahlungen (Withdraw…)',
                'Tagesendsaldo der Spalte Balance als Kontostand'
            ],
            unsupported: [
                'Unbekannte Kategorien mit Betrag oder Anteilen: erscheinen als nicht übernommen.',
                'Käufe/Verkäufe ohne ISIN oder mit widersprüchlichem Vorzeichen von Anteilen und Cash Flow.'
            ],
            limits: [
                'Beträge in CHF („Asset Price in CHF“, „Cash Flow“); Fondswährung und Kurs bleiben in den Rohdaten.',
                'Die Variante (3a oder BVG) wird an den Kategorien erkannt; ein Bericht nur mit Zinsen und Gebühren heisst „Transaktionsbericht“.',
                'Exportweg nur aus Export-To-Ghostfolio belegt; eine offizielle Finpension-Anleitung wurde nicht gefunden.',
                'Nur mit synthetischen Dateien nach öffentlichen Beispielen getestet.'
            ]
        },
        scalable: {
            scope: 'Scalable Capital Broker (Depot bei der Scalable Capital Bank) mit Abrechnungen auf Deutsch oder Englisch sowie ältere Abrechnungen der Baader Bank für Scalable-Kunden (Broker und Vermögensverwaltung bis 2024). Nicht für den CSV-Export (Prime) und nicht für Kontoauszüge.',
            steps: [
                'Bei Scalable Capital einloggen und den Broker wählen.',
                'Im Reiter „Transaktionen“ eine Transaktion öffnen und die Abrechnung (PDF) herunterladen; für jede Transaktion gibt es ein eigenes PDF.',
                'Ältere Abrechnungen aus der Baader-Bank-Zeit: im Login der Baader Bank unter „Download“ → „Wertpapierumsätze“ speichern.',
                'Alle PDFs gemeinsam hier ablegen; jedes PDF ist ein Dokument.'
            ],
            settings: [
                'Original-PDFs verwenden, nicht ausdrucken, scannen oder fotografieren: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Abrechnungen ab Depoteröffnung importieren, auch Sparplanausführungen.'
            ],
            accounts: 'Je Depot importieren. Bereits importierte Abrechnungen werden anhand von Order- und Geschäftsnummer (Baader: Vorgangsnummer) erkannt und nicht doppelt gebucht; mehrere Teilausführungen einer Order bleiben getrennt.',
            supported: [
                'Wertpapierabrechnung / Contract note: Kauf, Verkauf und Sparplanausführung mit Ordergebühren; Steuern und Finanztransaktionssteuer als eigene Buchung.',
                'Dividende / Dividend: Bruttobetrag mit ausländischer Quellensteuer und deutschen Steuern, in der Kontowährung.',
                'Vorabpauschale (Steuerabbuchung) und Steuerneuberechnung (Erstattung oder Belastung).',
                'Baader Bank: Wertpapierabrechnung Kauf/Verkauf mit Provision und Steuern, Fondsausschüttung, Ausschüttung, Dividende und Dividendenabrechnung.'
            ],
            unsupported: [
                'Verrechnungskonto/Kontoauszug (Ein- und Auszahlungen, Zinsen, Prime-Gebühren) und Rechnungsabschluss: bitte manuell erfassen.',
                'Reklassifizierung einer Ausschüttung, Kapitalrückzahlung, Zinszahlung, Laufzeitende/Knock-out, Stornos und Kapitalmaßnahmen.',
                'Baader Bank: Ertragsthesaurierung, Vorabpauschale, Steuerausgleichsrechnung, Kontoauszüge, Vergütung der Vermögensverwaltung, englische Abrechnungen.',
                'Kosteninformationen und Auftragsbestätigungen werden ohne Buchung übersprungen; erst die Wertpapierabrechnung belegt eine Ausführung.'
            ],
            limits: [
                'Eine Abrechnung wird nur gebucht, wenn Betrag, Gebühren und Steuern genau den abgerechneten Betrag ergeben; sonst erscheint sie als nicht übernommen.',
                'Abrechnungen in anderen Sprachen (Niederländisch, Italienisch, Französisch) werden noch nicht gelesen.',
                'Nur mit synthetischen PDFs nach öffentlich dokumentierten Formaten getestet, nicht mit aktuellen Original-Abrechnungen.'
            ]
        },
        flatex: {
            scope: 'flatex-Depots in Deutschland und Österreich (flatex Bank AG, flatexDEGIRO Bank AG/SE, bis 2020 FinTech Group Bank AG). Nicht für DEGIRO-Konten: dafür den DEGIRO-CSV-Import verwenden.',
            steps: [
                'Im flatex-Depot den Bereich „Post“ öffnen und „Dokumentenarchiv“ wählen.',
                'Bei Bedarf einen Zeitraum wählen, um ältere Abrechnungen anzuzeigen.',
                'Die Wertpapierabrechnungen, Sammelabrechnungen, Dividendengutschriften und Ertragsmitteilungen als PDF herunterladen.',
                'Alle PDFs gemeinsam hier ablegen; jedes PDF ist ein Dokument, eine Sammelabrechnung kann mehrere Ausführungen enthalten.'
            ],
            settings: [
                'Original-PDFs aus dem Dokumentenarchiv verwenden, nicht ausdrucken, scannen oder fotografieren: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Abrechnungen ab Depoteröffnung importieren.'
            ],
            accounts: 'Je Depot importieren. Bereits importierte Abrechnungen werden anhand von Auftrags- und Transaktionsnummer erkannt und nicht doppelt gebucht; Teilausführungen (…/1, …/2) bleiben getrennt.',
            supported: [
                'Wertpapierabrechnung Kauf/Verkauf (auch Fonds/Zertifikate) und Sammelabrechnung (Wertpapierkauf/-verkauf): Kurswert, Provision und Spesen als Gebühr, einbehaltene Steuer (KESt) als eigene Buchung, Erstattungen als positive Steuer.',
                'Dividendengutschrift und Ertragsmitteilung ausschüttender Fonds: Bruttobetrag in Kontowährung mit Quellensteuer, einbehaltener Steuer und Gebühren, umgerechnet zum angegebenen Devisenkurs.',
                'Ertragsmitteilung thesaurierender Fonds: nur die einbehaltene Steuer.',
                'Wertpapierabrechnung Vorabpauschale (einbehaltene Steuer) und Depotservicegebühr ausländischer Lagerstellen.'
            ],
            unsupported: [
                'Anleihen (Abrechnung in Prozent mit Stückzinsen), Kryptowerte, Devisengeschäfte, Stornos und Korrekturen.',
                'Kontoauszüge (Ein- und Auszahlungen, Zinsen), Depotein- und -ausgänge, Kapitalmaßnahmen, Stockdividenden, Gutschrifts-/Belastungsanzeigen.',
                'Auftrags-, Änderungs- und Streichungsbestätigungen sowie Kosteninformationen werden ohne Buchung übersprungen; erst die Wertpapierabrechnung belegt eine Ausführung.'
            ],
            limits: [
                'Eine Abrechnung wird nur gebucht, wenn Kurswert, Gebühren und Steuern genau den Endbetrag ergeben; sonst erscheint sie als nicht übernommen.',
                'Sparplanausführungen werden als Kauf gebucht, aber nicht als Sparplan markiert.',
                'Die Finanztransaktionssteuer steckt bei flatex in den fremden Spesen und wird daher als Gebühr gebucht.',
                'Nur mit synthetischen PDFs nach öffentlich dokumentierten Formaten getestet, nicht mit aktuellen Original-Abrechnungen.'
            ]
        },
        ing: {
            scope: 'Direkt-Depots der ING Deutschland (ING-DiBa AG). Nicht für andere ING-Landesgesellschaften: Abrechnungen etwa der ING in Spanien haben ein anderes Format und werden nicht erkannt.',
            steps: [
                'Im Internetbanking der ING den Post-Box-Bereich (Posteingang) öffnen.',
                'Über die erweiterte Suche das Depot wählen und bei Bedarf Zeitraum oder Dokumentart eingrenzen.',
                'Bei jeder Abrechnung Kauf, Abrechnung Verkauf und Ertragsabrechnung den Pfeil in der Tabelle öffnen und das PDF herunterladen.',
                'Alle PDFs gemeinsam hier ablegen; jedes PDF ist ein Dokument.'
            ],
            settings: [
                'Original-PDFs aus dem Posteingang verwenden, nicht ausdrucken, scannen oder fotografieren: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Abrechnungen ab Depoteröffnung importieren.'
            ],
            accounts: 'Je Depot importieren. Bereits importierte Abrechnungen werden erkannt und nicht doppelt gebucht; Teilausführungen einer Order bleiben getrennt.',
            supported: [
                'Wertpapierabrechnung Kauf (auch Sparplan, Einmalanlage, Wiederanlage), Bezug und Verkauf: Kurswert in Kontowährung, Provision und Entgelte als Gebühr, Steuern als eigene Buchung; Rabatte mindern den Kaufbetrag.',
                'Rückzahlung und Einlösung von Zertifikaten in Stück als Verkauf.',
                'Dividendengutschrift und Ertragsgutschrift: Bruttobetrag in Kontowährung, Quellensteuer und Steuern als eigene Buchungen.',
                'Zinsgutschrift als Zinsen; Ertragsgutschrift ohne Auszahlung und Vorabpauschale: nur die Steuer.',
                'Nachträgliche Verlustverrechnung: Erstattung oder Belastung als Steuerbuchung.'
            ],
            unsupported: [
                'Anleihen (Nominale statt Stück, Stückzinsen): Abrechnungen werden als nicht übernommen gemeldet, Zinsgutschriften dagegen gebucht.',
                'Stornos („*** Storno ***“, „Sie erhalten eine neue Abrechnung“): Eine bereits importierte Abrechnung muss von Hand korrigiert werden.',
                'Kontoauszüge (Ein- und Auszahlungen, Zinsen), Umtausch, Depotüberträge und andere Kapitalmaßnahmen.',
                'Auftrags-, Änderungs- und Streichungsbestätigungen sowie Kosteninformationen werden ohne Buchung übersprungen; erst die Wertpapierabrechnung belegt eine Ausführung.'
            ],
            limits: [
                'Eine Abrechnung wird nur gebucht, wenn Kurswert, Gebühren und Steuern genau den Endbetrag ergeben; sonst erscheint sie als nicht übernommen.',
                'Die französische Finanztransaktionssteuer wird als Steuer gebucht, nicht als Gebühr.',
                'Nur mit synthetischen PDFs nach öffentlich dokumentierten Formaten getestet, nicht mit aktuellen Original-Abrechnungen.'
            ]
        },
        comdirect: {
            scope: 'PDF-Dokumente aus der comdirect-PostBox, zusätzlich zur Schnittstelle unter „Broker“. Beide Wege dürfen dasselbe Depot füllen, sie sind aber nicht gleichwertig: Nur die PDFs enthalten Gebühren und Steuern von Wertpapiergeschäften.',
            steps: [
                'In der PostBox die Wertpapierabrechnungen und die Steuermitteilungen (Betreff „Steuermitteilung“ mit WKN) auswählen.',
                'Unten in der PostBox den Sammeldownload nutzen und „herunterladen“ wählen; comdirect liefert ein ZIP-Archiv.',
                'Das ZIP entpacken: Openfolio liest nur die PDFs selbst, kein ZIP.',
                'Alle PDFs gemeinsam hier ablegen, Abrechnung und Steuermitteilung gehören zusammen.'
            ],
            settings: [
                'Original-PDFs aus der PostBox verwenden, nicht ausdrucken, scannen oder fotografieren: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für Dividenden die Steuermitteilung importieren. Eine Dividenden- oder Ertragsgutschrift allein bucht nichts.'
            ],
            accounts: 'Je Depot importieren. Bereits importierte Dokumente werden erkannt und nicht doppelt gebucht, auch wenn beide Dokumente in einem PDF stehen. Liegen schon Buchungen aus der comdirect-Schnittstelle im Depot, werden Käufe und Verkäufe (gleicher Tag, Wertpapier, Stückzahl) sowie Dividenden (gleicher Nettobetrag innerhalb von 5 Tagen) nicht noch einmal gebucht.',
            supported: [
                'Wertpapierabrechnung Kauf und Verkauf, auch mit Teilausführungen, Fremdwährung und Festpreis: Kurswert in Kontowährung, Provision und Entgelte als Gebühr, Rabatte auf den Kaufaufschlag mindern den Kaufbetrag.',
                'Steuermitteilung zu Kauf und Verkauf: abgeführte oder erstattete Steuern als eigene Buchung.',
                'Steuermitteilung zu in- und ausländischen Dividenden und Investment-Ausschüttungen: die Dividende mit angerechneter Quellensteuer und Steuern.',
                'Steuermitteilung zur Vorabpauschale: nur die Steuer.',
                'Dividendengutschriften von vor 2009, für die es keine Steuermitteilung gibt, in Kontowährung.'
            ],
            unsupported: [
                'Dividenden- und Ertragsgutschriften mit „vor Steuern“ werden bewusst nicht gebucht: Die Steuermitteilung derselben Dividende nennt den Betrag, der aufs Konto ging.',
                'Anleihen, Wertpapierumtausch, Einlösungen, Sachausschüttungen, ältere Fremdwährungsgutschriften und Verkäufe mit negativem Erlös.',
                'Finanzreport (Ein- und Auszahlungen, Zinsen) und Abrechnung Verwahrentgelt.',
                'Ausführungsbestätigungen und Kosteninformationen werden ohne Buchung übersprungen; erst die Wertpapierabrechnung belegt eine Ausführung.'
            ],
            limits: [
                'Der Bruttobetrag einer Dividende ist der Betrag vor Steuern plus angerechnete Quellensteuer. Nicht anrechenbare Quellensteuer steht nur in der Gutschrift und mindert hier den Bruttobetrag; das Cash stimmt trotzdem.',
                'Ohne Steuermitteilung fehlt bei Verkäufen die Steuer, ohne Abrechnung der Verkauf selbst: Für einen richtigen Kontostand beide Dokumente importieren.',
                'Bei Überschneidung mit der Schnittstelle bleibt die zuerst vorhandene Buchung bestehen. Für Abgleiche fehlt eine gemeinsame Kennung: Vorabpauschalen und Steuern aus der Schnittstelle werden nicht abgeglichen.',
                'Eine Abrechnung wird nur gebucht, wenn Kurswert und Gebühren genau den Betrag vor Steuern ergeben; sonst erscheint sie als nicht übernommen.',
                'Nur mit synthetischen PDFs nach öffentlich dokumentierten Formaten getestet, nicht mit aktuellen Original-Abrechnungen.'
            ]
        },
        yuh: {
            scope: 'Yuh-Konten bei der Swissquote Bank (Schweiz): Transaktionsbelege als PDF, je Aktivität ein Dokument. Nicht für normale Swissquote-Konten: dafür den Swissquote-CSV-Import verwenden.',
            steps: [
                'In der Yuh-App auf „Investieren“ tippen und eine Anlage öffnen, zum Beispiel eine Aktie.',
                'Zum Abschnitt „Transaktionen“ scrollen.',
                'Einen Kauf, Verkauf oder eine Dividende antippen und das Dokument „Transaktionsbenachrichtigung“ als PDF speichern.',
                'Für jede Aktivität wiederholen und alle PDFs gemeinsam hier ablegen.'
            ],
            settings: [
                'Original-PDFs verwenden, keine Screenshots oder Scans: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Belege ab Kontoeröffnung importieren.'
            ],
            accounts: 'Je Yuh-Konto ein eigenes Depot verwenden. Ein Beleg wird anhand seiner Referenznummer erkannt und nicht doppelt gebucht; zwei gleich hohe Käufe mit eigener Referenz bleiben getrennt.',
            supported: [
                'Kauf und Verkauf (Deutsch und Englisch, auch Bruchteile): Kommission als Gebühr, abzüglich eingesetztem Trading Credit; Stempelsteuer als eigene Steuerbuchung.',
                'Dividende und Kapitalgewinn (Deutsch): Bruttobetrag mit Quellen- und Verrechnungssteuer als eigenen Buchungen, in der gutgeschriebenen Währung.',
                'Zahlungsverkehr Gutschrift und Belastung (Deutsch) als Ein- und Auszahlung.',
                'Zinsabrechnung (Deutsch): Zinsen je Währung mit Verrechnungssteuer.'
            ],
            unsupported: [
                'Titelumbuchungen, Kapitalmaßnahmen, Krypto und Kontoauszüge werden gemeldet, nicht gebucht.',
                'Dividenden und Zahlungsbelege auf Englisch sowie Belege auf Französisch oder Italienisch: Für sie gibt es keine öffentliche Vorlage, sie werden gemeldet.',
                'Währungswechsel innerhalb von Yuh: Dafür ist kein Beleg bekannt, der Cash je Währung bleibt dadurch unvollständig.'
            ],
            limits: [
                'Ein Beleg wird nur gebucht, wenn Betrag, Gebühren und Steuern genau den belasteten oder gutgeschriebenen Betrag ergeben; sonst erscheint er als nicht übernommen.',
                'Der Weg in der App ist nur für Kauf, Verkauf und Dividende belegt. Wo Zahlungsbelege und Zinsabrechnungen abgelegt sind, ließ sich nicht öffentlich prüfen; vorhandene PDFs werden gelesen.',
                'Nur mit synthetischen PDFs nach öffentlich dokumentierten Formaten getestet, nicht mit aktuellen Original-Belegen.'
            ]
        },
        commsec: {
            scope: 'CommSec-Konten in Australien: Trade Confirmations (Contract Notes) für Käufe und Verkäufe am australischen Markt. Nicht für CommSec International und nicht für Bestandslisten.',
            steps: [
                'Bei CommSec anmelden.',
                'Trade → Manage Orders → Confirmations öffnen. Bei Minor-Trust-Konten kann der Menüpunkt Trading → Confirmations heißen.',
                'Die gewünschten Bestätigungen als PDF herunterladen.',
                'Alle PDFs gemeinsam hier ablegen.'
            ],
            settings: [
                'Original-PDFs verwenden, keine Scans: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Bestätigungen ab Depoteröffnung importieren.'
            ],
            accounts: 'Je CommSec-Konto ein eigenes Depot verwenden. Eine Bestätigung wird anhand ihrer Confirmation No erkannt und nicht doppelt gebucht; mehrere Bestätigungen in einer PDF werden einzeln gebucht.',
            supported: [
                'Käufe und Verkäufe in beiden bekannten Layouts: Consideration als Handelswert, Brokerage & Costs als Gebühr. Die GST ist in der Gebühr enthalten und wird nicht zusätzlich gebucht.'
            ],
            unsupported: [
                'Dividenden, Kapitalmaßnahmen, Einzahlungen und Zinsen stehen nicht auf den Bestätigungen und fehlen daher.',
                'Bestätigungen mit Application Money und andere CommSec-Dokumente werden gemeldet, nicht gebucht.',
                'CommSec International (eigener Excel-Export) wird nicht gelesen.'
            ],
            limits: [
                'Eine Bestätigung wird nur gebucht, wenn Consideration und Brokerage genau Total Cost beziehungsweise Net Proceeds ergeben.',
                'Die Bestätigungen nennen nur den ASX-Code, keine ISIN. Das Wertpapier wird beim nächsten Kursabruf über Code und Währung gesucht und kann dort nachgetragen werden.',
                'Die Abrechnung läuft über das verknüpfte Bankkonto: Cash-Bewegungen im Depot sind daher nicht vollständig.',
                'Die öffentlich bekannten Muster stammen aus dem Jahr 2020; nur mit synthetischen PDFs getestet, nicht mit aktuellen Original-Bestätigungen.'
            ]
        },
        dkb: {
            scope: 'Depots bei der DKB (Deutsche Kreditbank AG).',
            steps: [
                'Im DKB-Postfach den Ordner „Wertpapierdokumente“ öffnen.',
                'Je Vorgang das PDF wählen: Kauf- und Verkaufsabrechnungen tragen Titel wie „Kauf - WKN … - Wertpapierabrechnung vom …“, Dividenden heißen „Ertragsabrechnung“.',
                'Mit „Speichern“ herunterladen; mehrere Dokumente lassen sich gemeinsam auswählen.',
                'Alle PDFs gemeinsam hier ablegen; jedes PDF ist ein Dokument.'
            ],
            settings: [
                'Original-PDFs aus dem Postfach verwenden, nicht ausdrucken, scannen oder fotografieren: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Abrechnungen ab Depoteröffnung importieren, auch die Halbjahresabrechnungen von Sparplänen.'
            ],
            accounts: 'Je Depot importieren. Bereits importierte Abrechnungen werden anhand ihrer Rechnungs-, Abrechnungs- oder Ordernummer erkannt und nicht doppelt gebucht.',
            supported: [
                'Wertpapier Abrechnung Kauf, Ausgabe Investmentfonds, Verkauf und Rücknahme Investmentfonds (auch Direkthandel): Kurswert, Provision und Entgelte als Gebühr, Steuern als eigene Buchung.',
                'Steuerliche Ausgleichrechnung eines Verlustverkaufs: die Erstattung als eigene Steuerbuchung mit eigenem Datum.',
                'Halbjahresabrechnung Sparplan: jeder Kauf einzeln.',
                'Dividendengutschrift, Ausschüttung, Gutschrift von Investmenterträgen: Bruttobetrag in Kontowährung mit Quellensteuer und Steuern; Zinsgutschrift als Zinsen.',
                'Vorabpauschale mit einbehaltener Steuer.'
            ],
            unsupported: [
                'Anleihen (Nominale statt Stück, Stückzinsen) einschließlich Rückzahlungen; Zinsgutschriften werden dagegen gebucht.',
                'Stornos, Kapitalrückzahlungen, Depotüberträge und Depotauszüge mit Verwahrentgelt.',
                'Konto- und Kreditkartenauszüge (Ein- und Auszahlungen, Zinsen).',
                'Kosteninformationen und Hinweise zum Basisinformationsblatt werden ohne Buchung übersprungen, ebenso Vorabpauschalen ohne einbehaltene Steuer.'
            ],
            limits: [
                'Eine Abrechnung wird nur gebucht, wenn Kurswert, Gebühren und Steuern genau den ausmachenden Betrag ergeben; sonst erscheint sie als nicht übernommen.',
                'Die Finanztransaktionssteuer wird als Steuer gebucht, nicht als Gebühr.',
                'Nur mit synthetischen PDFs nach öffentlich dokumentierten Formaten getestet, nicht mit aktuellen Original-Abrechnungen.'
            ]
        },
        consorsbank: {
            scope: 'Depots bei der Consorsbank (BNP Paribas), auch Abrechnungen aus der Zeit von Cortal Consors.',
            steps: [
                'Im Browser auf der Website der Consorsbank anmelden, nicht in der App.',
                'Unter „Mein Konto & Depot“ das „OnlineArchiv“ öffnen.',
                'Als Dokumententyp „Orderabrechnungen“ wählen und „Suchen“ klicken; für Dividenden und Erträge die passenden Dokumente ebenso suchen.',
                'Alle Dateien auswählen, speichern und die PDFs gemeinsam hier ablegen; jedes PDF ist ein Dokument.'
            ],
            settings: [
                'PDFs aus dem Orderarchiv der App sind laut Parqet nicht lesbar: dieselben Dokumente im Browser herunterladen.',
                'Original-PDFs verwenden, nicht ausdrucken, scannen oder fotografieren: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Abrechnungen ab Depoteröffnung importieren.'
            ],
            accounts: 'Je Depot importieren. Bereits importierte Abrechnungen werden an der Ordernummer erkannt, Teilausführungen (…001, …002) bleiben getrennt.',
            supported: [
                'Orderabrechnung und Wertpapierabrechnung Kauf, Verkauf, Bezug, Verkauf von Bezugsrechten und Sparplan: Betrag in Kontowährung, Provision und Entgelte als Gebühr, Steuern als eigene Buchung.',
                'Einlösung in Stück als Verkauf.',
                'Dividenden- und Ertragsgutschrift brutto in Kontowährung mit Quellensteuer und Steuern, Zinsgutschrift als Zinsen.',
                'Vorabpauschale und Ertragsthesaurierung: nur die Steuer. Nachträgliche Verlustverrechnung als Steuerbuchung.'
            ],
            unsupported: [
                'Abrechnungen ohne ISIN (ältere Dokumente nennen nur die WKN): Käufe und Verkäufe werden gemeldet, weil Openfolio keine ISIN erfindet. Erträge werden mit Name und Betrag gebucht, aber keinem Wertpapier zugeordnet.',
                'Anleihen (Nominale, Stückzinsen); Zinsgutschriften werden dagegen gebucht.',
                'Stornos und Neuabrechnungen: Eine bereits importierte Gutschrift muss von Hand korrigiert werden, sonst stünde sie doppelt im Depot.',
                'Gutschriften auf Fremdwährungskonten, Überträge, Umtausch, Anschaffungsdaten, Kontoauszüge und Kontoabschlüsse.',
                'Order- und Änderungsbestätigungen sowie Kosteninformationen werden ohne Buchung übersprungen; erst die Abrechnung belegt eine Ausführung.'
            ],
            limits: [
                'Eine Abrechnung wird nur gebucht, wenn Kurswert, Gebühren und Steuern genau den Endbetrag ergeben; sonst erscheint sie als nicht übernommen.',
                'Die Finanztransaktionssteuer wird als Steuer gebucht, nicht als Gebühr.',
                'Nur mit synthetischen PDFs nach öffentlich dokumentierten Formaten getestet, nicht mit aktuellen Original-Abrechnungen.'
            ]
        },
        wealthsimple: {
            scope: 'Verwaltete Wealthsimple-Konten in Kanada (Wealthsimple Inc.): monatliche und jährliche Performance Reports als PDF. Nicht belegt für Self-directed-Konten (Wealthsimple Trade), Krypto und Chequing.',
            steps: [
                'Im Web bei Wealthsimple anmelden; Auszüge verwalteter Konten gibt es nur im Web.',
                'Unten links das Profilmenü öffnen und „Documents“ wählen.',
                'Im Ordner „Statements“ den Auszug als PDF öffnen und speichern. Für viele Monate: „Generate document“ → „Bulk download monthly statements“, Format PDF, Zeitraum und Konto wählen.',
                'Alle PDFs gemeinsam hier ablegen; die ZIP-Datei vorher entpacken.'
            ],
            settings: [
                'PDF wählen, nicht CSV: Der CSV-Auszug wird hier nicht gelesen.',
                'Original-PDFs verwenden, keine Scans: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Auszüge ab Kontoeröffnung importieren.'
            ],
            accounts: 'Je Konto (zum Beispiel TFSA und RRSP) ein eigenes Depot verwenden; ein Report mit mehreren Konten wird abgelehnt. Monats- und Jahresreport desselben Zeitraums buchen nichts doppelt.',
            supported: [
                'Electronic Funds Transfer In und Out als Ein- und Auszahlung.',
                'Käufe und Verkäufe unter dem Symbol, in Bruchteilen, ohne Gebühr je Trade.',
                'Dividenden in CAD unter dem Symbol, Non-resident tax als Quellensteuer.',
                'Management Fee, Rabatte und Sales Tax als einzelne Gebührenbuchungen.'
            ],
            unsupported: [
                'Dividenden, die nur einen Fondsnamen und kein Symbol nennen, werden gemeldet; ihre Zuordnung wäre geraten, das Cash fehlt dann.',
                'Abschnitte oder Zeilen, die nicht zu den bekannten gehören, etwa Zinsen oder Überträge, werden gemeldet.',
                'Andere Wealthsimple-Dokumente, zum Beispiel Handelsbestätigungen von Self-directed-Konten, werden gemeldet.'
            ],
            limits: [
                'Ein Abschnitt wird nur gebucht, wenn seine Zeilen die Zeile „Total - …“ ergeben. Handelszeilen müssen im Betrag mit der Spalte Total übereinstimmen.',
                'Die Reports nennen nur Symbole, keine ISIN. Das Wertpapier wird beim nächsten Kursabruf über Symbol und Währung gesucht und kann dort nachgetragen werden.',
                'Die öffentlichen Muster stammen aus dem Jahr 2020. Ob aktuelle Auszüge noch so aufgebaut sind, ist nicht belegt; ein abweichendes PDF wird gemeldet, nicht gebucht.',
                'Nur mit synthetischen PDFs getestet, nicht mit aktuellen Originalen.'
            ]
        },
        hargreaveslansdown: {
            scope: 'Hargreaves-Lansdown-Konten im Vereinigten Königreich (Fund & Share Account, ISA, SIPP): Contract Notes als PDF, je Abschluss ein Dokument.',
            steps: [
                'Online im HL-Konto anmelden. HL stellt Contract Notes dort bereit und nennt sie in seinen Service-Bedingungen ausdrücklich als Online-Dokumente.',
                'Die Contract Note des jeweiligen Abschlusses öffnen und als PDF speichern.',
                'Alle PDFs gemeinsam hier ablegen.'
            ],
            settings: [
                'Den genauen Menüpunkt für Contract Notes nennt HL nicht öffentlich, deshalb steht er hier nicht. Falls er nicht auffindbar ist, hilft das HL-Helpdesk.',
                'Das von HL erzeugte PDF verwenden, keinen Webseitenausdruck und keinen Scan: Openfolio liest nur die Textschicht, ohne Texterkennung.'
            ],
            accounts: 'Je HL-Konto (zum Beispiel ISA und SIPP) ein eigenes Depot verwenden. Eine Contract Note wird anhand ihrer Nummer erkannt und nicht doppelt gebucht.',
            supported: [
                'Käufe und Verkäufe von Fonds, ETFs und Aktien: Consideration in GBP, Commission als Gebühr. Der Kurs in Pence wird nicht verwendet, die Stückzahl steht auf der Note.',
                'Stamp Duty und PTM Levy als eigene Steuerbuchung, wenn sie auf der Note stehen und die Summe aufgeht.'
            ],
            unsupported: [
                'Dividenden, Ein- und Auszahlungen, Zinsen und Gebühren stehen nicht auf Contract Notes. Laut Nutzerberichten gibt HL für Dividenden kein PDF aus.',
                'Investment Reports und andere HL-Dokumente werden gemeldet, nicht gebucht.',
                'Notes mit unbekannten Kostenzeilen, etwa Fremdwährungsgebühren, werden gemeldet.'
            ],
            limits: [
                'Eine Note wird nur gebucht, wenn Consideration und Kosten genau den Abrechnungsbetrag ergeben.',
                'Stamp Duty und PTM Levy kommen in den öffentlichen Mustern nicht vor; ihre Bezeichnungen sind nicht an Originalen belegt.',
                'Nur mit synthetischen PDFs nach öffentlich dokumentierten Formaten getestet, nicht mit aktuellen Original-Notes.'
            ]
        },
        questrade: {
            scope: 'Questrade-Konten in Kanada (Self-directed, Questwealth): Monatsauszüge („Account statement“) und Trade Confirmation Reports als PDF. Der Excel-Export der Transaktionshistorie wird hier nicht gelesen.',
            steps: [
                'Bei Questrade anmelden.',
                'Monatsauszüge: Seite „Documents“ öffnen und unter „Recent statements“ die Auszüge als PDF speichern.',
                'Oder Handelsbestätigungen: Seite „Reports“ öffnen, „Trade confirmation“ wählen, nach Symbol oder Datum suchen und den Bericht als PDF speichern.',
                'Alle PDFs gemeinsam hier ablegen.'
            ],
            settings: [
                'Monatsauszüge bevorzugen: Nur sie enthalten neben Käufen auch Ausschüttungen und Einzahlungen.',
                'Original-PDFs verwenden, keine Scans: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Auszüge ab Kontoeröffnung importieren.'
            ],
            accounts: 'Je Questrade-Konto ein eigenes Depot verwenden. Dieselbe Buchung in Auszug und Report erhält dieselbe Kennung, wenn Datum, Stückzahl und Betrag gleich sind. Der Auszug kann Teilausführungen aber zusammenfassen: Für denselben Zeitraum daher nur eine der beiden Dokumentarten importieren.',
            supported: [
                'Monatsauszug: Käufe und Verkäufe in CAD und USD mit Kommission, Ausschüttungen (UNIT DIST) und Contributions.',
                'Trade Confirmation Report: Käufe und Verkäufe mit Kommission und SEC-Gebühren als Gebühr.'
            ],
            unsupported: [
                'Im Auszug werden Auszahlungen, Einzahlungen ohne „Contribution“, Quellensteuer, Zinsen, Devisen, Überträge, Kapitalmaßnahmen und Gebühren gemeldet, nicht gebucht: Für diese Zeilen ist kein Muster öffentlich.',
                'Optionen und Anleihen (Stückzinsen) werden gemeldet.',
                'Trades mit Abwicklung nach Monatsende werden übersprungen und gemeldet; sie stehen im Auszug des Folgemonats.'
            ],
            limits: [
                'Der Auszug wird je Tabelle nur gebucht, wenn Anfangssaldo und Zeilen genau den Schlusssaldo ergeben; sonst wird die Tabelle als nicht übernommen gemeldet.',
                'Beim Report müssen die Zeilen die Zeile „Totals“ ergeben.',
                'Auszüge und Reports nennen nur Symbole, keine ISIN. Das Wertpapier wird beim nächsten Kursabruf über Symbol und Währung gesucht und kann dort nachgetragen werden.',
                'Questrade beschreibt den Ablageort, aber nicht die Download-Schaltfläche; die Anleitung ist von 2022.',
                'Verkäufe im Auszug und USD-Zeilen im Auszug kommen in den öffentlichen Mustern nicht vor; nur mit synthetischen PDFs getestet.'
            ]
        },
        robinhood: {
            scope: 'Robinhood-Brokerage-Konten in den USA: Monatsauszüge (Monthly statements) als PDF. Der CSV-Bericht „Account activity report“ wird hier nicht gelesen.',
            steps: [
                'In der App oder im Web „Account“ öffnen; in der App zuerst das Menü (drei Striche).',
                '„Reports and statements“ wählen, dann „Monthly statements“.',
                'Den Kontotyp wählen und das PDF des gewünschten Monats herunterladen.',
                'Alle Monate gemeinsam hier ablegen.'
            ],
            settings: [
                'Der Auszug eines Monats steht innerhalb der ersten zwei Wochen des Folgemonats bereit. Ohne Aktivität gibt es stattdessen einen Quartalsauszug.',
                'Original-PDFs verwenden, keine Scans: Openfolio liest nur die Textschicht, ohne Texterkennung.',
                'Für einen vollständigen Bestand alle Auszüge ab Kontoeröffnung importieren.'
            ],
            accounts: 'Je Robinhood-Konto (zum Beispiel Individual und IRA) ein eigenes Depot verwenden. Wiederholte Importe buchen nichts doppelt; gleich hohe Trades eines Auszugs bleiben getrennt.',
            supported: [
                'Käufe und Verkäufe (Cash-Konto) in USD.',
                'Dividenden (CDIV) brutto und ausländische Quellensteuer (DTAX) als eigene Buchung.',
                'ACH-Ein- und -Auszahlungen, interne Überträge (ITRF), Cashback der Kreditkarte (XENT_CC) als Einzahlung.',
                'Zinsen auf das Sweep-Guthaben (INT).'
            ],
            unsupported: [
                'Alle anderen Typcodes, etwa Splits, Optionen, Margin, Gebühren und Depotüberträge, werden mit ihrem Code gemeldet, nicht gebucht.',
                'Trades, die noch nicht abgewickelt sind, werden übersprungen und gemeldet; sie stehen im Auszug des Folgemonats.',
                'Die Sweep-Bewegungen (Deposit Sweep Activity) sind interne Umbuchungen und werden nicht gebucht.',
                'Krypto, Futures und Ausgaben stehen nicht im Wertpapierauszug.'
            ],
            limits: [
                'Ein Auszug wird nur gebucht, wenn die Zeilen die Zeile „Total Funds Paid and Received“ ergeben; nicht gebuchte Zeilen zählen dabei mit. Sonst erscheint die Tabelle als nicht übernommen.',
                'Die Auszüge trennen Soll und Haben im Text nicht; die Richtung folgt aus dem Typcode.',
                'Das Wertpapier läuft unter dem Ticker, weil Dividenden nur ihn nennen. Die CUSIP bleibt in den Rohdaten. Die ISIN wird nicht errechnet.',
                'Überträge sind nur für das Individual-Konto belegt.',
                'Nur mit synthetischen PDFs nach einem öffentlichen Muster von Januar 2026 getestet, nicht mit eigenen Original-Auszügen.'
            ]
        }
    } as Record<string, ImportGuide>
};
