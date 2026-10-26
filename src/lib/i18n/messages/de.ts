// German UI texts: the source for all languages. en.ts must provide the same keys
// (and the same parameters for functions).

export const de = {
    common: {
        cancel: 'Abbrechen',
        ok: 'OK',
        open: 'Öffnen',
        create: 'Erstellen',
        close: 'Schließen',
        save: 'Speichern',
        unknown: 'Unbekannt',
        all: 'Alle'
    },

    language: {
        label: 'Sprache',
        hint: 'Automatisch folgt der Sprache deines Browsers.',
        system: 'Automatisch'
    },

    theme: {
        label: 'Design',
        hint: 'Dunkel, hell oder wie im Betriebssystem eingestellt.',
        dark: 'Dunkel',
        light: 'Hell',
        system: 'System'
    },

    numberLocales: {
        'de-DE': '1.234,56 (Deutschland)',
        'de-CH': '1’234.56 (Schweiz)',
        'de-AT': '1 234,56 (Österreich)',
        'en-US': '1,234.56 (Englisch)'
    },

    labels: {
        security: 'Wertpapier',
        quoteTypes: { Stock: 'Aktie', ETF: 'ETF', Fund: 'Fonds', Crypto: 'Krypto', Bond: 'Anleihe' } as Record<string, string>,
        transactionTypes: {
            Buy: 'Kauf',
            Sparplan_Buy: 'Sparplan',
            Sell: 'Verkauf',
            Dividend: 'Dividende',
            Tax: 'Steuer',
            Fee: 'Gebühr',
            Interest: 'Zinsen',
            Deposit: 'Einzahlung',
            Withdrawal: 'Auszahlung',
            Split: 'Split'
        },
        movementTypes: {
            Deposit: 'Einzahlung',
            Withdrawal: 'Auszahlung',
            Dividend: 'Dividende',
            Tax: 'Steuer',
            Fee: 'Gebühr',
            Interest: 'Zinsen',
            Transfer: 'Umbuchung',
            Adjustment: 'Korrektur'
        } as Record<string, string>
    },

    shell: {
        mainNavigation: 'Hauptnavigation',
        navigation: 'Navigation',
        nav: {
            Dashboard: 'Dashboard',
            Portfolio: 'Wertpapiere',
            Analyse: 'Analyse',
            Dividenden: 'Dividenden',
            Transaktionen: 'Transaktionen',
            Datenquellen: 'Datenquellen',
            Broker: 'Broker',
            Einstellungen: 'Einstellungen',
            Import: 'Import'
        },
        headings: {
            Portfolio: { title: 'Wertpapiere', sub: 'Offene und geschlossene Positionen' },
            Analyse: { title: 'Analyse', sub: 'Risiko, Rendite und Aufteilung' },
            Dividenden: { title: 'Dividenden', sub: 'Erhaltene und erwartete Ausschüttungen' },
            Transaktionen: { title: 'Transaktionen', sub: 'Alle Buchungen deiner Depots' },
            Datenquellen: { title: 'Datenquellen', sub: 'Kurse, Wechselkurse und Depots' },
            Broker: { title: 'Broker', sub: 'Automatischer Import deiner Buchungen' },
            Einstellungen: { title: 'Einstellungen', sub: 'Darstellung, Sprache und Berechnung' },
            Import: { title: 'Import', sub: 'Depot wählen und Buchungen hinzufügen' }
        },
        mobile: {
            Dashboard: 'Übersicht',
            Portfolio: 'Positionen',
            Dividenden: 'Dividenden',
            Transaktionen: 'Umsätze',
            more: 'Mehr'
        },
        greeting: { morning: 'Guten Morgen', day: 'Guten Tag', evening: 'Guten Abend' },
        syncActiveTitle: 'Auto-Sync aktiv',
        syncActiveText: (count: number) => `${count} Broker verbunden. Abgleich beim Öffnen des Projekts.`,
        connectTitle: 'Broker verbinden',
        connectText: 'Neue Buchungen automatisch übernehmen: DEGIRO-Ordner, IBKR, Trading 212, comdirect.',
        displayCurrency: 'Anzeigewährung',
        appearance: 'Darstellung',
        importButton: 'Import',
        addTransaction: '+ Transaktion',
        inDevelopment: 'In Entwicklung …',
        newPortfolio: 'Neues Depot',
        closeProject: 'Projekt schließen',
        searchPlaceholder: 'Wertpapier suchen',
        file: {
            untitled: 'Unbenannt.openfolio',
            unsaved: 'Ungespeicherte Änderungen',
            encrypted: 'Verschlüsselt',
            unencrypted: 'Unverschlüsselt',
            savedAt: (time: string) => `${time} gespeichert`,
            notSaved: 'noch nicht gespeichert',
            saveNow: 'Jetzt speichern',
            saved: 'Gespeichert',
            saveUnsaved: 'Speichern (ungespeicherte Änderungen)'
        },
        refreshMarket: 'Kurse und Wechselkurse aktualisieren',
        missingFx: (currencies: string, count: number) => (
            `Kurs fehlt: Für ${currencies} gibt es keinen Wechselkurs. Beträge in ${count === 1 ? 'dieser Währung' : 'diesen Währungen'} sind in den Summen nicht enthalten.`
        ),
        startupSync: {
            title: 'Kurse werden aktualisiert',
            subtitle: 'Beim Öffnen des Projekts · läuft im Hintergrund weiter, wenn du schließt',
            background: 'Im Hintergrund fortsetzen',
            progress: (current: number, total: number) => `${current} von ${total} Wertpapieren`,
            preparing: 'Vorbereitung …'
        }
    },

    portfolioFilter: {
        label: 'Depot',
        selected: (count: number) => `${count} ausgewählt`
    },

    launcher: {
        tagline: 'Dein Portfolio. Deine Daten. Lokal.',
        createTitle: 'Neues Portfolio erstellen',
        createText: 'Leeres Projekt, optional mit Passwort verschlüsselt',
        openTitle: 'Portfolio öffnen',
        openText: '.openfolio-Datei von deinem Gerät',
        demo: 'Demo ansehen (Beispieldaten, ohne Konto)',
        privacy: 'Alle Daten bleiben auf deinem Gerät. Openfolio sendet nichts an Cloud-Server.',
        newPortfolio: 'Neues Portfolio',
        projectName: 'Projektname',
        defaultName: 'Mein Portfolio',
        encryptionTitle: 'Verschlüsselung (optional)',
        encryptionText: 'AES-256. Ohne Passwort lässt sich die Datei nicht wiederherstellen.',
        password: 'Passwort',
        confirmPassword: 'Passwort bestätigen',
        enterPassword: 'Passwort eingeben',
        wrongPassword: 'Falsches Passwort. Bitte erneut versuchen.',
        encrypted: 'Dieses Projekt ist verschlüsselt.',
        passwordMissing: 'Bitte ein Passwort eingeben.',
        passwordMismatch: 'Die Passwörter stimmen nicht überein.'
    },

    settings: {
        appearance: 'Darstellung',
        numberFormat: 'Zahlenformat',
        numberFormatHint: 'Tausender- und Dezimaltrennzeichen für alle Beträge.',
        numberFormatAuto: 'Wie die Sprache',
        performance: 'Performance',
        method: 'Renditeberechnung',
        methodHint: 'MWR berücksichtigt Ein- und Auszahlungen, TWR zeigt die reine Anlagestrategie ohne Cashflow-Effekte.',
        methods: { MWR: 'Geldgewichtet (MWR)', TWR: 'Zeitgewichtet (TWR)' },
        smoothing: 'Glättung',
        smoothingHint: 'Glättet nur die Darstellung der Performance-Charts. Kennzahlen bleiben unverändert.',
        smoothings: { '1d': '1 Tag', '7d': '7 Tage', '1m': '1 Monat' }
    },

    errors: {
        title: 'Etwas ist schiefgelaufen',
        unknown: 'Ein unbekannter Fehler ist aufgetreten. Deine Projektdatei wurde nicht verändert.',
        retry: 'Erneut versuchen',
        criticalTitle: 'Kritischer Fehler',
        criticalText: 'Openfolio konnte nicht geladen werden. Deine Projektdatei wurde nicht verändert.',
        reload: 'Neu laden'
    }
};

export type Messages = typeof de;
