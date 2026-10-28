# Openfolio: Arbeitsauftrag für einen KI-Agenten – Broker-Dateiimporte

Recherchestand: 26.10.2026. Dieses Dokument beschreibt eine geplante Erweiterung, keine bereits implementierte Unterstützung.

## 1. Auftrag und Umfang

Erweitere Openfolio um zuverlässige Broker-Dateiimporte. Verwende bestehende Parser aus **Export-To-Ghostfolio** und **Portfolio Performance** als Referenz und, soweit lizenzkonform, als Grundlage einer Anpassung an Openfolio.

Zu jedem Importer gehören eine verständliche Exportanleitung, eindeutige Formaterkennung, eine Importvorschau und aussagekräftige Tests. Die Anleitung muss erklären, **wie der Nutzer die richtige PDF-, CSV-, XML- oder XLSX-Datei beim Broker erzeugt**.

Arbeite in kleinen, überprüfbaren Schritten. Implementiere zuerst die erste Ausbaustufe. Die weiteren Ausbaustufen sind ein priorisierter Backlog. Ein fehlendes Exportformat oder eine unklare Buchungsart darf die Arbeit an unabhängig umsetzbaren Brokern nicht blockieren.

Nicht Bestandteil dieses Auftrags sind neue Broker-Loginverfahren, unbeaufsichtigte Handelsaktionen, Cloud-Synchronisation, ein allgemeiner KI/OCR-Import oder Änderungen an historischen Git-Commits. Ein Dateiimport ist kein Broker-Autosync: Der Nutzer exportiert die Datei, Openfolio übernimmt ihre Auswertung.

## 2. Zuerst den aktuellen Repository-Stand prüfen

Lies die geltenden Repository-Anweisungen und prüfe den aktuellen Code. Das vorhandene `OPENFOLIO_AGENT_BRIEF.md` stammt aus einer früheren Analyse; seine Fehlerbeschreibungen und offenen Aufgaben sind keine Aussage über den heutigen Stand. Bereits behobene Probleme nicht erneut implementieren. Dieses Dokument konkretisiert den Bereich Broker-Dateiimporte.

Bei der Recherche waren folgende Bausteine vorhanden:

| Baustein | Einstiegspunkt | Einordnung |
|---|---|---|
| DEGIRO-Trades und Konto-CSV | `src/lib/csvParser.ts` | Vorhandene Logik weiterverwenden und Regressionen vermeiden |
| flatex-Cash-Balance-CSV | `src/lib/csvParser.ts` | Kein Nachweis eines vollständigen flatex-Wertpapierimports |
| Generischer CSV-Importer | `src/lib/importers/genericCsv.ts` | Als Fallback erhalten |
| IBKR Flex XML | `src/lib/importers/ibkrFlex.ts` | Vorhanden; nicht durch einen CSV-Zwang ersetzen |
| Trading 212 API | `src/lib/importers/trading212.ts` | Ein API-Parser ersetzt keinen Broker-CSV-Importer |
| comdirect API | `src/lib/importers/comdirect.ts` | PDF wäre ein zusätzlicher Importweg |
| Gemeinsame Buchungserzeugung | `src/lib/importers/entries.ts` | Zielmodell für neue Parser |
| Import-Batches | `src/lib/importers/importBatch.ts` | Gemeinsame Verarbeitung prüfen und nutzen |
| DEGIRO-Ordnerimport | `src/lib/brokers/degiroFolder.ts` | Vorhandene Dateierkennung und Abläufe beachten |
| Broker-Oberfläche und Vorschau | `src/components/brokers/` | Bestehende Bedienung und Vorschau integrieren |

Berechnungen gehören in `src/lib/domain/`, nicht in UI-Komponenten. Lies die tatsächlichen Typen und Vorzeichenkonventionen, bevor du Buchungen erzeugst. Benutze bestehende Hilfsfunktionen, statt ein zweites Ledger oder eine parallele Importarchitektur anzulegen.

## 3. Broker-Matrix und Prioritäten

**Legende:** „—“ bedeutet, dass in den geprüften Verzeichnissen kein dedizierter Parser gefunden wurde. Es ist kein Beweis, dass außerhalb dieser Projekte keine Lösung existiert. Ein vorhandener Parser belegt nur bestimmte Dateiformate und Buchungsarten, keine vollständige Brokerunterstützung.

| Priorität | Broker / Zielmarkt | Export-To-Ghostfolio | Portfolio Performance | Vorgehen für Openfolio |
|---|---|---|---|---|
| 1 | Interactive Brokers – international | Flex-CSV | Flex-XML | Bestehende XML-Anbindung prüfen und gezielt vervollständigen |
| 1 | DEGIRO – Europa | CSV | PDF | Vorhandenes CSV erhalten; PDF nachrangig |
| 1 | Trading 212 – Europa/UK | CSV | PDF | CSV zusätzlich zur API |
| 1 | Swissquote – Schweiz/international | CSV | PDF | CSV zuerst |
| 1 | Saxo – international | CSV, teils aus Excel | PDF | CSV zuerst; XLSX separat bewerten |
| 1 | Charles Schwab – USA | CSV | PDF | CSV als ersten neuen US-Importer |
| 1 | Revolut – Europa/international | Investment- und Krypto-CSV | PDF | Investment-CSV zuerst; Krypto separat |
| 1 | Trade Republic – Europa | Experimentelles CSV aus pytr | Nativer CSV-Parser und PDF | PP als Hauptreferenz für natives CSV |
| 1 | Scalable Capital – Deutschland/Europa | — | PDF | PDF nach Aufbau der gemeinsamen PDF-Verarbeitung |
| 1 | flatex – Deutschland/Österreich | — | PDF | Wertpapierimport ergänzen |
| 2 | ING Deutschland | — | PDF | PP als Vorlage |
| 2 | comdirect – Deutschland | — | PDF | PDF zusätzlich zur API |
| 2 | DKB – Deutschland | — | PDF | PP als Vorlage |
| 2 | Consorsbank – Deutschland | — | PDF | PP als Vorlage |
| 2 | Yuh – Schweiz | — | PDF über Swissquote-Parser | Mit Swissquote-PDF bearbeiten |
| 2 | XTB – Europa/international | CSV | Dedizierter CSV-Parser | Beide Parser vergleichen |
| 2 | eToro – international | CSV aus Excel | — | Aktien/ETF und CFD-Ereignisse unterscheiden |
| 2 | Freetrade – UK | CSV | — | Ghostfolio-Konverter als Vorlage |
| 2 | InvestEngine – UK | CSV | — | Ghostfolio-Konverter als Vorlage |
| 2 | Questrade – Kanada | — | PDF | PDF-Vorlage nutzen; Excel/CSV braucht eigene Prüfung |
| 2 | Robinhood – USA | — | PDF | PDF-Vorlage nutzen; CSV separat entwickeln |
| 3 | Avanza – Schweden | CSV | — | Ghostfolio-Konverter als Vorlage |
| 3 | Directa – Italien | CSV | PDF | CSV zuerst |
| 3 | Disnat – Kanada | CSV aus Excel | — | Ghostfolio-Konverter als Vorlage |
| 3 | Finpension – Schweiz | CSV | — | Ghostfolio-Konverter als Vorlage |
| 3 | Wealthsimple – Kanada | — | PDF | PP als Vorlage |
| 3 | CommSec – Australien | — | PDF | Kontotyp und regionale Dokumente abgleichen |
| 3 | Hargreaves Lansdown – UK | — | PDF | PP als Vorlage |
| 3 | Fidelity – USA/Stock Plans | — | Teilweise PDF | Unterstützte Dokumente zuerst abgrenzen |
| 3 | Zerodha – Indien | — | — | Eigenen CSV-Importer entwickeln |

Diese Priorisierung ist eine Produkt- und Entwicklungsentscheidung anhand regionaler Ergänzung und vorhandener Parser. Sie ist keine Rangliste nach Marktanteil und keine Brokerempfehlung für Anlagen.

### Tatsächliche Reihenfolge der Arbeitspakete

1. Bestehende Importpipeline prüfen; gemeinsam benötigte Erweiterungen identifizieren.
2. Swissquote-CSV als ersten neuen Importer vollständig umsetzen, einschließlich Anleitung und Tests.
3. Trading-212-CSV, Saxo-CSV, Schwab-CSV und Revolut-Investment-CSV ergänzen.
4. Natives Trade-Republic-CSV anhand von PP ergänzen. XTB-CSV kann als anschließendes kleines Paket vorgezogen werden.
5. Gemeinsame lokale PDF-Textextraktion und Dokumenterkennung aufbauen; Scalable und flatex zuerst anschließen.
6. Weitere PDF-Importer aus Priorität 2 ergänzen.
7. Regionale Erweiterungen aus Priorität 3 nach Bedarf bearbeiten.

IBKR und DEGIRO werden parallel zu diesen Schritten nur dort angepasst, wo die Prüfung konkrete Lücken oder Regressionen zeigt. Keine vollständige Neuimplementierung allein aufgrund dieser Liste.

## 4. Quellen und konkrete Parser

### Export-To-Ghostfolio

- Repository: https://github.com/dickwolff/Export-To-Ghostfolio
- Konverter und Tests: https://github.com/dickwolff/Export-To-Ghostfolio/tree/main/src/converters
- Datenmodelle: https://github.com/dickwolff/Export-To-Ghostfolio/tree/main/src/models
- Exportanleitungen: https://github.com/dickwolff/Export-To-Ghostfolio#download-transaction-export
- Lizenz: https://github.com/dickwolff/Export-To-Ghostfolio/blob/main/LICENSE — bei der Recherche Apache-2.0.

Relevante Dateien heißen beispielsweise `swissquoteConverter.ts`, `saxoConverter.ts`, `schwabConverter.ts`, `revolutConverter.ts`, `trading212Converter.ts`, `xtbConverter.ts`, `etoroConverter.ts`, `ibkrConverter.ts` und `finpensionConverter.ts`. Die jeweiligen Tests und Beispieldateien sind mitzuprüfen.

Die TypeScript-Sprache passt zu Openfolio. Dennoch sind Node-Dateizugriffe, CLI-Fortschrittsanzeigen, Umgebungsvariablen, Yahoo-Suche und Ghostfolio-API-Ausgabe nicht unverändert in den Browser zu übernehmen. Extrahiere die Parserlogik und gib Openfolio-Buchungen aus.

### Portfolio Performance

- Repository: https://github.com/portfolio-performance/portfolio
- PDF-Extractor-Verzeichnis: https://github.com/portfolio-performance/portfolio/tree/master/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf
- IBKR: https://github.com/portfolio-performance/portfolio/tree/master/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/ibflex
- Trade-Republic-CSV: https://github.com/portfolio-performance/portfolio/tree/master/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/traderepublic
- XTB-CSV: https://github.com/portfolio-performance/portfolio/tree/master/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/xtb
- Repository-Lizenz: bei der Recherche EPL-1.0; vor Codeübernahme den aktuellen Lizenztext und relevante Dateihinweise prüfen.

Besonders relevante Klassen:

| Broker | Klasse |
|---|---|
| Swissquote und Yuh | `SwissquotePDFExtractor.java` |
| Saxo | `SaxoBankPDFExtractor.java` |
| Schwab | `SchwabPDFExtractor.java` |
| Revolut | `RevolutLtdPDFExtractor.java` |
| Trading 212 | `Trading212PDFExtractor.java` |
| Trade Republic | `TradeRepublicPDFExtractor.java`, `TradeRepublicCSVExtractor.java` |
| Scalable | `ScalableCapitalPDFExtractor.java`; historische Baader-Formate gesondert prüfen |
| flatex | `FinTechGroupBankPDFExtractor.java` |
| DEGIRO | `DegiroPDFExtractor.java` |
| ING Deutschland | `INGDiBaPDFExtractor.java` |
| comdirect | `ComdirectPDFExtractor.java` |
| DKB | `DkbPDFExtractor.java` |
| Consorsbank | `ConsorsbankPDFExtractor.java` |
| XTB | `XTBCSVExtractor.java` |
| IBKR | `IBFlexStatementExtractor.java` |
| Questrade | `QuestradeGroupPDFExtractor.java` |
| Robinhood | `RobinhoodPDFExtractor.java` |
| Directa | `DirectaSimPDFExtractor.java` |
| Wealthsimple | `WealthsimpleInvestmentsIncPDFExtractor.java` |
| CommSec | `CommSecPDFExtractor.java` |
| Hargreaves Lansdown | `HargreavesLansdownPlcExtractor.java` |
| Fidelity | `FidelityInternationalPDFExtractor.java` |

PP ist Java. Die PDF-Parser verwenden eigene Parser-Hilfsklassen. Eine Übertragung erfordert daher die Prüfung von Textextraktion, Reihenfolge, Dokumentkontext, Regex-Verhalten und Buchungssemantik; einzelne reguläre Ausdrücke allein genügen nicht.

Die Fidelity-Klasse erkennt unter anderem „FIDELITY BROKERAGE SERVICES LLC“ und „Fidelity Stock Plan Services“. Daraus keine vollständige Abdeckung aller Fidelity-Produkte oder Fidelity/FFB-Dokumente ableiten.

### Quellenstand festhalten

Vor Umsetzung eines Brokers den aktuellen Quellcode erneut lesen und den verwendeten Commit-SHA dokumentieren. Die obigen Branch-Links sind veränderlich. Lizenzhinweise, Herkunft und eigene Änderungen nachvollziehbar festhalten. Die Browser-Verfügbarkeit von Quellcode ersetzt keine Lizenzprüfung. Lizenzpflichten von Apache-2.0, EPL-1.0 und gegebenenfalls weiteren Abhängigkeiten unterscheiden sich.

## 5. Exportanleitungen: Ausgangsbasis

Die folgenden Wege wurden in der Recherche dokumentiert. Sie sind vor Freigabe gegen aktuelle Broker-Dokumentation und die unterstützten Dateivarianten zu prüfen. Ein Exportweg für Parqet ist keine automatische Kompatibilitätszusage für einen Ghostfolio- oder PP-Parser.

### CSV, XML und Excel

| Broker | Exportweg und erforderliche Einstellungen | Wichtige Grenze |
|---|---|---|
| Swissquote | eTrading → Portfolio → Transaktionen → Periode → Anwenden → Download → CSV-Bericht | Ghostfolio-Parser erwartet Englisch und Semikolon; Sprache vor Export einstellen. Steuern sind laut Parqet nicht separat ausgewiesen. |
| Saxo | Transaktionsübersicht → Export → Excel; für Ghostfolio-Vorlage gegebenenfalls als kommagetrennte CSV speichern | Transaktionshistorie verwenden; nicht ungeprüft einen aggregierten Portfolio-Bericht akzeptieren. |
| Schwab | Accounts → History → Konto → Date Range → Export → CSV | Kopf-/Fußzeilen, US-Zahlenformate und Ereignistypen prüfen. |
| Revolut | Invest → More → Documents → Stocks/Brokerage account → Account statement → Zeitraum → verfügbares Tabellenformat | Nicht Profit & Loss oder Cost & Charges. Je nach Version CSV oder Excel; tatsächlichen Dateityp prüfen. Krypto ist ein eigener Export. |
| Trading 212 | Menü → Chronik → Datei-Symbol → Zeitraum → Aufträge, Dividenden, Transaktionen und Zins aktivieren → Export CSV | Gesamte Historie möglichst ab Kontoeröffnung; Spaltenvarianten wie `Time (UTC)` beachten. |
| Trade Republic | Profilbild → Kontoauszüge → Transaktionsreport → Teilen → Erstellen → möglichst vollständiger Zeitraum | Nativen CSV-Bericht unterstützen. Experimentelles pytr-CSV nicht als identisches Format behandeln. |
| IBKR | Performance und Berichte → Flex-Abfragen → Aktivitäts-Flex-Abfrage → XML; Trades, Cash Transactions, Open Positions nach bestehender Openfolio-Anbindung | Benötigte Felder exakt aus dem Parser ableiten und dokumentieren. CSV-Flex-Vorgaben für Parqet/Ghostfolio nicht mit XML vermischen. |
| DEGIRO | Inbox → Transaktionen sowie Konto → Zeitraum → Export → CSV | Trades und Kontobewegungen sind unterschiedliche Quellen. Parqet verwendet hierfür PDF; Openfolio verarbeitet bereits CSV. |
| XTB | Account history → Cash operations → Export → Reporttyp Cash Operations → CSV | Aktien/ETF und CFD-Buchungen sowie Gebühren/Steuern gesondert behandeln. |
| eToro | Portfolio → History → Account statement → Zeitraum → Excel; Blatt Account Activity als kommagetrennte CSV speichern | Nicht nur geschlossene Positionen exportieren; Inhalt und Instrumenttypen prüfen. |
| Freetrade | Portfolio → Activity → Teilen-/Exportsymbol → Aktivitäten exportieren | Alle benötigten Aktivitäten einschließen. |
| InvestEngine | Offizielle Anleitung für Reports/Statements verwenden und konkreten Bericht mit dem Converter abgleichen | Exakten Bericht und Pflichtspalten vor Freigabe dokumentieren; noch keine geprüfte Detailanleitung in diesem Brief. |
| Avanza | Min ekonomi → Transaktioner → Zeitraum → Exportera transaktioner | CSV; Sprache und Spalten gegen Parser prüfen. |
| Directa | Libera → Movimenti → Zeitraum → Excel-Symbol → File separato da virgole (csv) → Estrai | CSV aus der Transaktionsansicht. |
| Disnat | Konto → History → Account → Zeitraum → Export als XLSX; als kommagetrennte CSV speichern | Das richtige Tabellenblatt und die Kopfzeile prüfen. |
| Finpension | Portfolio → Transactions → transaction report (CSV-file) → herunterladen | 3a- und BVG-Varianten separat testen. |
| Fidelity US | Konto → Activity & Orders → Transaktionen herunterladen | Pro Konto exportieren; CSV-Unterstützung wäre zusätzlich zum PP-PDF-Parser zu entwickeln. |
| Robinhood | Account activity report → Generate new report → Kontotyp/Zeitraum → Generate report → CSV herunterladen | Erstellung bis zu 24 Stunden; Futures, Krypto und Spending sind laut Broker nicht enthalten. |
| Questrade | Reports → Go to transaction history → Zeitraum → Excel-Export | Separater Entwicklungsweg zum vorhandenen PP-PDF-Parser. |
| Zerodha | Console → Reports → Tradebook → Segment/Zeitraum → CSV oder XLSX | Maximal 365 Tage pro Export; externe Trades/Kapitalmaßnahmen haben eigene Tradebooks. |
| CommSec International | Portfolio → History → Excel-Export | Laut Handbuch zwei Jahre Historie. Nicht mit australischen Bestands-CSV oder beliebigen PP-PDF-Formaten gleichsetzen. |

### PDFs

Originale Broker-Abrechnungen verwenden. Screenshots, Scans oder per Browser-Druck erzeugte PDFs sind keine zugesicherte Eingabe. Fehlt eine auslesbare Textschicht, einen verständlichen Hinweis zeigen; OCR ist nicht Teil der ersten Ausbaustufe.

| Broker | Benötigte Dokumente / Downloadweg | Besonderheit |
|---|---|---|
| Scalable | Broker → Transaktionen → Einzeltransaktion → Abrechnungs-PDF | Historische Baader-Dokumente: Baader-Login → Download → Wertpapierumsätze; Formatgeneration unterscheiden. |
| flatex | Post → Dokumentenarchiv → Zeitraum → Wertpapier- und Ertragsabrechnungen | Auftragsbestätigung ist nicht die ausgeführte Wertpapierabrechnung. Sammel-/Sparplanabrechnungen prüfen. |
| ING | Posteingang → Depotfilter → Abrechnung Kauf, Abrechnung Verkauf, Ertragsabrechnung | Gilt für ING Deutschland, nicht automatisch andere ING-Landesgesellschaften. |
| comdirect | PostBox → Wertpapierabrechnungen; für Dividenden Steuermitteilung WKN | Parqet akzeptiert seit Januar 2026 keine Ertrags-/Dividendengutschrift als Ersatz. Dokumentwahl für Openfolio am PP-Parser prüfen; nicht doppelt buchen. ZIP-Sammeldownload entpacken. |
| DKB | Postfach → Wertpapierdokumente → Kauf-/Verkaufsabrechnung und Ertragsabrechnung | Kosteninformation und tatsächliche Buchung unterscheiden. |
| Consorsbank | Browser → Mein Konto & Depot → OnlineArchiv → Orderabrechnungen → Suchen → Speichern; zusätzlich passende Ertragsdokumente | Parqet meldet unlesbare Dateien aus dem mobilen Orderarchiv; Browser-Download empfehlen und aktuelle Lage prüfen. |
| Yuh | Investieren → Investment → Transaktionen → Aktivität → Transaktionsbenachrichtigung als PDF | Je Aktivität herunterladen; Swissquote-Parser als Referenz. |
| DEGIRO | Inbox → Transaktionen → Export → PDF; Konto → Export → PDF für Dividenden | Eine Portfolioübersicht ist ein Bestandssnapshot und ersetzt keine vollständige Historie. |

Für Swissquote-PDF, Saxo-PDF, Schwab-PDF, Revolut-PDF, Trading-212-PDF, Questrade-PDF, Robinhood-PDF, Wealthsimple-PDF, CommSec-PDF, Hargreaves-Lansdown-PDF und Fidelity-PDF ist der **genaue vom PP-Parser erwartete Dokumenttyp samt Downloadweg noch zu verifizieren**. Die Existenz einer Klasse darf nicht zu erfundenen Bedienanleitungen führen. Bei diesen Varianten sind Quellcode, Tests und Broker-Dokumentation Teil des Arbeitspakets.

## 6. Fachliche Regeln bei der Anpassung

### Zielmodell und Datenverlust

- Brokerdatei unmittelbar in Openfolios bestehendes Import-/Ledger-Modell überführen. Kein zwingender Umweg über Ghostfolio-JSON.
- Parsing und Wertpapierauflösung trennen. Fehlender Yahoo-Ticker darf eine ansonsten lesbare Buchung nicht verschwinden lassen.
- ISIN, Ticker, CUSIP, Handelsplatz und Währung nicht gleichsetzen. Keine ISIN erfinden, wenn nur ein Ticker vorhanden ist; den bestehenden Klärungsprozess verwenden oder gezielt erweitern.
- Originalwährung, Gebührenwährung und FX-Information erhalten. GBX/Pence und GBP unterscheiden.
- Käufe, Verkäufe, Dividenden, Steuern, Gebühren, Zinsen, Ein-/Auszahlungen, FX, Transfers, Wiederanlagen und Kapitalmaßnahmen getrennt beurteilen.
- Brutto/Netto nicht raten. Fehlende Steuern nicht aus angenommenen Steuersätzen rekonstruieren.
- Splits nicht pauschal als Kauf behandeln. Depotüberträge nicht als neue Einzahlung oder Verkauf ausweisen, sofern die Quelle dies nicht belegt.
- Keine Buchung still verwerfen: Unterstützte, ignorierte administrative und nicht unterstützte finanzielle Zeilen unterscheidbar berichten.

### Bekannte Fallstricke der Vorlagen

- Swissquote-Konverter von Export-To-Ghostfolio überspringt bestimmte Ein-/Auszahlungen.
- Revolut-Konverter überspringt mehrere Transferarten und ordnet `stock split` als Kauf ein.
- XTB-Konverter legt zugeordnete Dividendensteuer im Ghostfolio-Gebührenfeld ab.
- Trade-Republic-Konverter des Projekts beschreibt experimentelles pytr-CSV. PP enthält zusätzlich einen nativen CSV-Parser.
- Fidelity-PDF-Klasse hat einen breiteren/anderen Namensbezug als die tatsächlich erkannten Dokumente; keine vollständige Brokerabdeckung behaupten.

Diese Verhaltensweisen sind zu prüfende Unterschiede, keine Vorgaben für Openfolio.

### Deduplizierung und Korrekturen

Verwende vorhandene Import-/Merge-Funktionen. Nutze belastbare Broker-Transaktions- oder Ausführungs-IDs, wenn vorhanden. Eine Order-ID allein kann mehrere Teilausführungen umfassen. Identische Trades am selben Tag dürfen nicht allein wegen gleicher Werte zusammenfallen. Ein Fallback-Fingerprint muss Konto, Quelle und ausreichend Buchungsmerkmale berücksichtigen; Mehrfachvorkommen erhalten.

Wiederholte und überlappende Exporte müssen ohne Verdopplung importierbar sein. Korrekturen und Stornos sind keine gewöhnlichen Duplikate. Überschneidungen zwischen API und Datei beziehungsweise PDF und CSV explizit prüfen; keine falsche Zusammenführung verschiedener Konten.

### Dateiverarbeitung

- CSV mit einer geeigneten Parserbibliothek lesen; nicht mit einfachem `split(',')`.
- BOM, CRLF/LF, Quotes, eingebettete Zeilenumbrüche, leere Felder, Metadaten vor der Kopfzeile und Fußzeilen berücksichtigen.
- Trennzeichen, Dezimal-/Tausendertrennzeichen, Sprache und Datum aus einer belegten Formatvariante bestimmen. Mehrdeutige Werte nicht still interpretieren.
- XLSX nicht durch Umbenennen zu CSV behandeln. Direkte Unterstützung nur mit bewusst gewählter Bibliothek; sonst genaue Konvertierung erklären.
- PDF-Textextraktion zentral halten. Textreihenfolge mit repräsentativen Dokumenten prüfen; Rohtext-Fixtures allein belegen noch keine funktionierende PDF-Dateiverarbeitung.
- PDFs und CSVs lokal verarbeiten. Keine Dokumente an externe KI-/OCR-Dienste senden.

## 7. Nutzerführung und Exporthilfe

Pro Broker und Format eine leicht erreichbare Hilfe im Importdialog bereitstellen. Sie enthält:

1. Broker, Landesgesellschaft/Kontotyp und unterstützte Formatversion(en).
2. Exakten Menüpfad und benötigten Bericht beziehungsweise Dokumenttitel.
3. Dateiformat, Sprache, Zeitraum, Filter und Pflichtoptionen.
4. Notwendige Spalten bei konfigurierbaren Berichten wie IBKR Flex.
5. Vorgehen bei mehreren Konten, Währungen oder jährlichen Exportgrenzen.
6. Unterstützte und nicht unterstützte Buchungsarten.
7. Bekannte Einschränkungen und verständliche Fehlerhilfe.
8. Link zur Quelle und Datum der letzten Überprüfung.

Die Importvorschau zeigt Zieldepot, erkannte Quelle/Formatvariante, Zeitraum, neue Einträge, Duplikate, Konflikte und nicht unterstützte Zeilen. Die bestehende Bestätigung für das Speichern der Buchungen verwenden. Dateinamen oder Parserbehauptungen allein sind keine ausreichende Formaterkennung.

## 8. Tests und Abnahmekriterien

Keine echten Finanzdaten in Repository, Fixtures oder Logs ablegen. Repository-Fixtures bleiben synthetisch. Upstream-Beispiele nur nach Prüfung von Datenschutz und Lizenz verwenden; vorzugsweise synthetische Fälle daraus ableiten.

Für jeden Importer sind mindestens folgende fachlich relevante Fälle zu prüfen, soweit im freigegebenen Umfang enthalten:

- Kauf/Verkauf mit Gebühren und korrektem Cash-Effekt.
- Dividende mit Quellensteuer, Gebühren und gegebenenfalls Fremdwährung.
- Ein-/Auszahlungen, Zinsen, Transfers und Wiederanlage oder sichtbare Meldung bei fehlender Unterstützung.
- Dezimalzahlen, Währungen, Datum, Zeitzone und relevante Sprach-/Spaltenvarianten.
- Zweiter Import derselben Datei: keine neuen Buchungen.
- Überlappende Dateien, getrennte Konten, Teilausführungen und echte identische Buchungen.
- Storno/Korrektur und Kapitalmaßnahme oder explizite Meldung.
- Fehlerhafte Datei, leere Datei, unbekannte Zeilentypen und nicht auflösbare Wertpapiere.
- PDF: zusätzlich ein synthetisches PDF durch die tatsächliche Extraktionspipeline.
- Abgleich von Stückzahlen und Cash, wenn die Eingabedaten dafür vollständig genug sind; fehlende Historie sichtbar kennzeichnen.

Ein Broker gilt nur für die konkret getesteten Formate/Buchungsarten als unterstützt. Bekannte Lücken müssen in der Hilfe und im Abschlussbericht erscheinen.

Vor Übergabe eines Implementierungspakets die im Repository vorgesehenen Checks ausführen:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Nicht ausgeführte oder fehlgeschlagene Checks mit Ursache nennen. Keine Kompatibilität mit echten aktuellen Exporten behaupten, wenn nur synthetische Tests vorliegen.

## 9. Erwartete Lieferung je Broker

- In die vorhandene Importoberfläche integrierter Parser mit eindeutiger Formaterkennung.
- Exporthilfe mit verifizierten Quellen und offen benannten Einschränkungen.
- Synthetische Fixtures und aussagekräftige Tests.
- Dokumentation des Upstream-Commit-SHA, der übernommenen Teile und nötiger Lizenzhinweise.
- Kurzer Abschlussbericht: implementierte Formate, Buchungsarten, Prüfungen, verbleibende Lücken und nächstes Arbeitspaket.

## 10. Weitere Quellen für Exportanleitungen

### Parqet: nur als Referenz für Dokumentbeschaffung und Produktvergleich

- Brokerübersicht: https://faq.parqet.com/de/articles/651187-welche-broker-tools-werden-im-datei-import-unterstutzt-pdf-csv
- Swissquote: https://faq.parqet.com/de/articles/714176-swissquote-csv-import
- Trading 212: https://faq.parqet.com/de/articles/765626-trading-212-csv-import
- Trade Republic: https://faq.parqet.com/de/articles/651186-trade-republic-csv-import
- IBKR/CapTrader/Lynx: https://faq.parqet.com/de/articles/651188-interactive-brokers-captrader-lynx-csv-import
- DEGIRO: https://faq.parqet.com/de/articles/871912-degiro-pdf-import
- Scalable: https://faq.parqet.com/de/articles/651200-scalable-capital-pdf-csv-import
- flatex: https://faq.parqet.com/de/articles/871917-flatex-pdf-import
- ING: https://faq.parqet.com/de/articles/651196-ing-pdf-import
- comdirect: https://faq.parqet.com/de/articles/651189-comdirect-pdf-import
- DKB: https://faq.parqet.com/de/articles/871913-dkb-pdf-import
- Consorsbank: https://faq.parqet.com/de/articles/871911-consorsbank-pdf-import
- Yuh: https://faq.parqet.com/de/articles/871931-yuh-pdf-import

### Broker-Dokumentation

- Saxo: https://www.help.saxo/hc/en-us/articles/360039762472-Monitoring-your-Portfolio
- Revolut: https://help.revolut.com/help/profile-and-plan/managing-my-account/trading-statements-and-reports/
- InvestEngine: https://help.investengine.com/hc/en-gb/articles/8927819031581-How-to-download-reports-and-statements
- Robinhood: https://robinhood.com/us/en/support/articles/finding-your-account-documents/
- Questrade: https://www.questrade.com/learning/using-questrade/checking-your-account-activity
- Zerodha: https://support.zerodha.com/category/console/reports/other-queries/articles/where-can-i-see-all-the-trades-i-ve-taken-for-a-particular-period
- CommSec International: https://www2.commsec.com.au/media/98994/internationaltradinguserguide.pdf

Öffentliche Dokumentation und Quellcode wurden recherchiert. Eine praktische Prüfung aller genannten Broker mit aktuellen Exportdateien ist noch nicht erfolgt. Verifikation und Abgrenzung der konkreten Formate sind Teil der Umsetzung.
