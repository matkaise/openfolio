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
        severalAccounts: 'Die Datei enthält Buchungen mehrerer Konten (z. B. Hauptkonto und Junior-Depot). Bitte je Konto einen eigenen Export erstellen und in ein eigenes Depot importieren.',
        missingCurrency: 'Die Kontowährung ist nicht erkennbar. XTB nennt sie nur im Dateinamen (z. B. EUR_account_….csv); bitte den Dateinamen beim Speichern als CSV beibehalten.'
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
        }
    } as Record<string, ImportGuide>
};
