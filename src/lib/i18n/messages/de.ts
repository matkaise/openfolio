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

    ranges: {
        short: { '1W': '1W', '1M': '1M', '6M': '6M', YTD: 'YTD', '1J': '1J', '3J': '3J', '5J': '5J', MAX: 'MAX' } as Record<string, string>,
        long: {
            '1W': '1 Woche', '1M': '1 Monat', '6M': '6 Monate', YTD: 'seit Jahresbeginn', '1J': '1 Jahr', '3J': '3 Jahre', '5J': '5 Jahre', MAX: 'seit Start'
        } as Record<string, string>,
        label: 'Zeitraum'
    },

    assetClasses: {
        stocks: 'Einzelaktien',
        etfs: 'ETFs',
        crypto: 'Krypto',
        funds: 'Fonds',
        derivatives: 'Derivate',
        indices: 'Indizes',
        currencies: 'Währungen',
        cash: 'Cash',
        other: 'Sonstige'
    },

    brokerMethods: { 'degiro-folder': 'Ordner-Sync', 'ibkr-flex': 'Flex API', trading212: 'API', comdirect: 'API mit TAN' },

    units: {
        shares: (quantity: string) => `${quantity} Stk.`,
        billions: (value: string) => `${value} Mrd.`
    },

    dashboard: {
        netWorth: 'Gesamtvermögen',
        dayChangeTitle: 'Veränderung seit dem letzten Handelstag',
        today: (percent: string) => `${percent} heute`,
        twr: 'Zeitgewichtete Rendite',
        mwr: 'Geldgewichtete Rendite',
        portfolio: 'Depot',
        legendValue: 'Depot',
        legendReturn: 'Rendite',
        legendInvested: 'Eingezahlt',
        includeDividends: 'Dividenden einrechnen',
        chartMode: 'Darstellung',
        modeValue: 'Wert',
        modeReturn: 'Rendite %',
        invested: 'Investiert',
        investedSub: 'Einstand der Positionen',
        gain: 'Gewinn',
        gainSub: (total: string, range: string) => `${total} gesamt · Zeitraum ${range}`,
        annualReturn: 'Rendite p. a.',
        historyTooShort: 'Historie zu kurz',
        mwrShort: 'Geldgewichtet (MWR)',
        cash: 'Cash',
        cashAccounts: (count: number, currencies: string) => `${count} ${count === 1 ? 'Konto' : 'Konten'} · ${currencies}`,
        cashDerived: 'Aus Einzahlungen, Erträgen und Verkäufen',
        goal: 'Zielvermögen',
        saveGoal: 'Ziel speichern',
        cancelEdit: 'Bearbeiten abbrechen',
        editGoal: 'Ziel bearbeiten',
        goalProgress: (percent: string, remaining: string) => `${percent} erreicht · noch ${remaining}`,
        topPositions: 'Top-Positionen',
        showAll: (count: number) => `Alle ${count} →`,
        noPositions: 'Noch keine Positionen. Über „Import“ oder „+ Transaktion“ kommen die ersten dazu.',
        ofPortfolio: (percent: string) => `${percent} vom Depot`,
        dividends: 'Dividenden',
        ytd: (amount: string) => `${amount} YTD`,
        dividendsChart: 'Dividenden der letzten 12 Monate',
        nextPayment: (date: string, forecast: boolean) => `Nächste Zahlung · ${date}${forecast ? ' · Prognose' : ''}`,
        noPayouts: 'Keine geplanten Auszahlungen bekannt.',
        allocation: 'Aufteilung',
        assetClasses: 'Anlageklassen',
        nothingToAllocate: 'Noch nichts aufzuteilen.',
        positions: (count: number): string => (count === 1 ? 'Position' : 'Positionen'),
        connectedBrokers: 'Verbundene Broker',
        syncOnOpen: 'Sync beim Öffnen',
        noBroker: 'Noch kein Broker verbunden.',
        connectBroker: '+ Broker verbinden',
        synced: {
            never: 'noch nicht synchronisiert',
            now: 'gerade synchronisiert',
            minutes: (count: number) => `vor ${count} Min. synchronisiert`,
            hours: (count: number) => `vor ${count} Std. synchronisiert`,
            days: (count: number) => `vor ${count} Tagen synchronisiert`
        }
    },

    charts: {
        noData: 'Keine Daten verfügbar',
        noPrices: 'Noch keine Kursdaten für diesen Zeitraum.',
        invested: (amount: string) => `Eingezahlt ${amount}`,
        price: 'Kurs',
        performance: 'Performance',
        returnSubtitle: 'Wertentwicklung im Zeitraum',
        emptyTitle: 'Keine Daten',
        emptyText: 'Für diesen Zeitraum liegen keine Werte vor.'
    },

    positions: {
        value: 'Depotwert',
        openCount: (count: number) => `${count} offene ${count === 1 ? 'Position' : 'Positionen'}`,
        gain: 'Gewinn',
        onCost: (percent: string) => `${percent} auf den Einstand`,
        realized: 'Realisiert',
        closedCount: (count: number) => `${count} geschlossene ${count === 1 ? 'Position' : 'Positionen'}`,
        open: 'Offene Positionen',
        sort: 'Sortierung',
        sortValue: 'Wert',
        sortReturn: 'Rendite',
        sortName: 'Name',
        emptyTitle: 'Noch keine Positionen',
        emptyText: 'Importiere deine Trades oder erfasse eine Transaktion.',
        missingTicker: 'Ticker fehlt',
        noPrices: 'Ohne Kurse',
        closed: 'Geschlossene Positionen',
        closedEmptyTitle: 'Keine geschlossenen Positionen',
        closedEmptyText: 'Sobald du eine Position vollständig verkaufst, erscheint sie hier mit ihrem Ergebnis.',
        lastTrade: (date: string) => `letzter Trade ${date}`
    },

    security: {
        tradesIn: (currency: string) => `Trades in ${currency}`,
        buy: 'Kauf',
        sell: 'Verkauf',
        profile: 'Profil',
        country: 'Land',
        sector: 'Sektor',
        industry: 'Branche',
        marketCap: 'Marktkapitalisierung',
        keyFigures: 'Kennzahlen',
        pe: 'KGV',
        forwardPe: 'KGV erwartet',
        eps: 'Gewinn je Aktie',
        revenue: 'Umsatz',
        dividends: 'Dividenden',
        dividendYield: 'Dividendenrendite',
        annualForecast: 'Jährlich (Prognose)',
        nextExDate: 'Nächster Ex-Tag'
    },

    months: {
        short: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
    },

    analysis: {
        drawdownTitle: 'Drawdown-Verlauf',
        drawdownSubtitle: 'Rückgang vom jeweils letzten Höchststand des Depots',
        drawdownTooltip: 'Abstand zum Hoch',
        groupSubtitle: (count: number, share: string) => `${count} ${count === 1 ? 'Position' : 'Positionen'} · ${share} vom Depot`,
        ofGroup: (percent: string) => `${percent} der Gruppe`,
        rolling12m: 'Rollierend über 12 Monate',
        noValuesYet: 'Für diesen Zeitraum liegen noch keine Werte vor.',
        benchmarkFailed: 'Benchmark konnte nicht geladen werden.',
        volatilityLevels: { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' },
        sharpeLevels: { veryGood: 'Sehr gut', good: 'Gut', ok: 'OK', weak: 'Schwach' },
        riskTypes: { sector: 'Sektor', region: 'Region', industry: 'Branche' },
        calculatingTitle: 'Analyse wird berechnet',
        calculatingText: 'Die Kennzahlen werden aus der gesamten Historie berechnet.',
        volatilityTitle: 'Volatilität (1 Jahr)',
        volatilityTooltip: 'Volatilität (annualisiert)',
        volatilityKpi: 'Volatilität (1 J.)',
        sharpeTitle: 'Sharpe Ratio (1 Jahr)',
        sharpeTooltip: 'Sharpe Ratio',
        sharpeKpi: 'Sharpe Ratio (1 J.)',
        maxDrawdown: 'Max. Drawdown',
        noDecline: 'Kein Rückgang',
        totalTwr: 'Rendite gesamt (TWR)',
        twrSub: (annualized: string | null, since: string) => `${annualized ? `${annualized} p. a. · ` : ''}seit ${since}`,
        noHistory: 'Noch keine Historie',
        comparison: 'Performancevergleich',
        dividends: 'Dividenden',
        benchmarkPlaceholder: 'Benchmark hinzufügen, z. B. SPY oder ^GDAXI',
        benchmarkSymbol: 'Benchmark-Symbol',
        add: 'Hinzufügen',
        benchmarkFx: 'Wechselkurse der Benchmarks werden geladen …',
        portfolio: 'Depot',
        removeBenchmark: (symbol: string) => `Benchmark ${symbol} entfernen`,
        value: 'Wert',
        noPerformance: 'Für den gewählten Zeitraum gibt es keine Performance-Daten.',
        returnPerYear: 'Rendite je Jahr',
        returnIn: (year: number) => `Rendite ${year}`,
        grid: { monthly: 'Monat', quarterly: 'Quartal', yearly: 'Jahr' },
        gridLabel: 'Zeitraster',
        prevYear: 'Vorheriges Jahr',
        nextYear: 'Nächstes Jahr',
        yearTitle: (year: number) => `Jahr ${year}`,
        regions: 'Regionen',
        industries: 'Branchen',
        sectors: 'Sektoren',
        groupTitle: (type: string, name: string) => `${type}: ${name}`,
        concentration: 'Klumpenrisiken',
        concentrationText: 'Mehr Streuung in diesen Bereichen könnte die Schwankungen senken.',
        diversified: 'Gut gestreut',
        diversifiedText: 'Kein Sektor, keine Region und keine Branche macht mehr als 30 % des Depots aus.'
    },

    dividends: {
        entries: (count: number) => `${count} ${count === 1 ? 'Eintrag' : 'Einträge'}`,
        types: { payout: 'Ausschüttung', theoretical: 'Theoretisch', forecast: 'Prognose' },
        received: (year: number) => `Erhalten ${year}`,
        vsLastYear: (percent: string) => `${percent} gegenüber Vorjahr`,
        noLastYear: 'Kein Vorjahreswert',
        expected: 'Erwartet (Restjahr)',
        expectedSub: 'Prognose aus den aktuellen Positionen',
        yield: 'Dividendenrendite',
        yieldOnCost: (percent: string) => `Auf den Einstand: ${percent}`,
        development: 'Dividendenentwicklung',
        yearly: 'Jährlich',
        monthly: 'Monatlich',
        view: 'Ansicht',
        fiveYears: '5 Jahre',
        all: 'Alle',
        chartLabel: 'Dividenden je Zeitraum',
        sum: 'Summe',
        cumulative: 'Kumulierte Dividenden',
        cumulativeTooltip: 'Kumuliert',
        upcoming: 'Nächste Auszahlungen',
        showAll: (count: number) => `Alle ${count} →`,
        noUpcomingTitle: 'Keine bestätigten Termine',
        noUpcomingText: 'Die Prognose basiert auf deinen aktuellen Positionen und den Zahlungen des Vorjahres.',
        history: 'Zahlungshistorie',
        noHistoryTitle: 'Noch keine Auszahlungen',
        noHistoryText: 'Dividenden aus Importen oder manuellen Buchungen erscheinen hier.'
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
