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
        invalidDate: (line?: number) => `Datum in unerwartetem Format${line ? ` (Zeile ${line})` : ''}. Bitte Export und Spracheinstellung prüfen.`
    },
    variants: {
        degiro: {
            transactions: 'Transactions.csv (Käufe/Verkäufe)',
            account: 'Account.csv (Kontoübersicht)'
        } as Record<string, string>
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
        }
    } as Record<string, ImportGuide>
};
