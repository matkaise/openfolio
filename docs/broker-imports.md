# Broker-Dateiimporte

Stand der Umsetzung von `OPENFOLIO_BROKER_IMPORT_AGENT_BRIEF.md`. Ein Broker gilt nur für die hier
genannten Formate und Buchungsarten als unterstützt. Alle Tests verwenden synthetische Dateien unter
`src/lib/__tests__/fixtures/`; eine Prüfung mit aktuellen Original-Exporten steht jeweils noch aus.

## Aufbau

- `src/lib/importers/fileImporters.ts` – Registry. Jeder Importer erkennt seine Dateien am Inhalt
  (`detect`), liest sie (`parse`) und liefert ein `ImportBatch` plus Importbericht.
- `src/lib/importers/fileImport.ts` – Typen, Bericht (Formatvariante, Zeitraum, ignorierte und nicht
  übernommene Zeilen), Fehlercodes.
- `src/lib/importers/csv.ts` – CSV-Lesen mit Papa Parse, Kopfzeilen- und Zahlenhilfen.
- `src/components/import/BrokerFileImport.tsx` – Auswahl, Exporthilfe und Vorschau im Importdialog.
- Exporthilfen: `src/lib/i18n/messages/fileImport.de.ts` (Quelle) und `fileImport.en.ts`.

Neue Importer: Datei unter `src/lib/importers/`, Eintrag in `FILE_IMPORTERS`, Anleitung und
Variantennamen in beiden Sprachdateien, synthetische Fixture mit README-Eintrag, Tests.

### PDF-Verarbeitung

- `src/lib/importers/readImportFile.ts` – liest eine abgelegte Datei: PDF (erkannt am `%PDF-`-Kopf, nicht am
  Dateinamen) als Textschicht, alles andere als Text.
- `src/lib/pdf/extractPdfText.ts` – einzige Stelle, an der PDFs gelesen werden. [pdf.js](https://github.com/mozilla/pdf.js)
  (`pdfjs-dist` 6.4.299, exakt gepinnt, Apache-2.0) parst lokal; es wird nichts hochgeladen und keine Texterkennung (OCR)
  ausgeführt. Im Browser lädt `src/lib/pdf/loadPdfjs.ts` die Bibliothek erst beim ersten PDF-Import und parst in einem
  eigenen Worker (`pdf.worker.ts`). Verwendet wird der Legacy-Build: der moderne Build braucht `Promise.try`
  (Safari ab 18.2, Chrome ab 128, Node ab 23). Eval ist abgeschaltet, Schriften werden nicht geladen.
- `src/lib/pdf/pdfText.ts` – setzt die positionierten Textstücke einer Seite zu Zeilen zusammen: gleiche Grundlinie
  (Toleranz knapp halbe Schrifthöhe) = eine Zeile, links nach rechts, Lücken als ein Leerzeichen, Zeilen von oben nach
  unten. Spaltenlayouts wie „Kurs : 92,25 EUR Kurswert : 1.690,00 EUR“ ergeben damit eine Zeile, wie bei PDFBox mit
  Sortierung nach Position, auf dem die Extraktoren von Portfolio Performance aufbauen. Gedrehter Text (Randvermerke)
  wird ausgelassen.
- PDF-Importer (`PdfFileImporter`, `input: 'pdf'`) bekommen das Ergebnis als `{ pages: string[][] }` (Zeilen je Seite).
  `detect` erkennt den ausstellenden Broker, `parse` bucht oder meldet das Dokument (z. B. Auftragsbestätigung,
  Kontoauszug) als nicht übernommen mit Seite und Dokumenttitel. Mehrere PDFs (je Abrechnung eine Datei) werden
  gemeinsam abgelegt, einzeln gelesen und zusammengeführt; ein doppelt abgelegtes Dokument wird über seine Kennung
  nur einmal gebucht.
- Fehler mit Dateinamen: ohne Textschicht (Scan/Foto) `noTextLayer`, Passwortschutz `pdfEncrypted`, beschädigt
  `pdfUnreadable`, PDF eines anderen Brokers `unknownFormat`, PDF und CSV verschiedener Importer `mixedFiles`.
- Tests erzeugen PDFs zur Laufzeit (`src/lib/pdf/__tests__/syntheticPdf.ts`: Helvetica, WinAnsi mit Umlauten und €,
  Spalten über x-Positionen, Bildseite ohne Text, Passwortschutz) und schicken sie durch die echte Extraktion mit
  demselben pdf.js-Build wie im Browser. Reine Text-Fixtures reichen dafür nicht.

## Importer

| Importer | Formate / Varianten | Buchungsarten | Nicht übernommen (wird gemeldet) |
|---|---|---|---|
| DEGIRO | CSV, deutsch oder englisch: `Transactions.csv`, `Account.csv` (Spalten mit AutoFX-Gebühr; ältere Spaltenfolge und andere Sprachen werden nicht erkannt) | Käufe/Verkäufe mit Gebühren, Dividenden, Steuern, Zinsen, Gebühren, Einzahlungen, Währungswechsel, interne Umbuchungen (Cash Sweep, Geldmarktfonds), Salden. Deutsche Dateien sind lokal mit Original-Exporten geprüft (nur aggregiert), englische nur synthetisch | Trades, die nur in der `Account.csv` stehen; Zeilen ohne lesbares Datum oder Währung. Kapitalmaßnahmen gehen als Verkauf und Kauf aus der `Transactions.csv` ein, nicht als eigene Bestandsbuchung |
| Trading 212 | CSV-Verlaufsexport (`standard`, `utc`), Spalten nach Namen | Käufe/Verkäufe (Market/Limit/Stop) in Instrumentwährung, Kostenspalten als Gebühr, Dividenden (netto), Zinsen, Ein-/Auszahlungen, Currency conversion | Splits, Stock distribution, Transfer in/out, Kartenzahlungen; Zeilen ohne ISIN |
| Swissquote | CSV `;`: `en-13`, `en-15`, `de-15`, `de-13` | Käufe/Verkäufe (Kosten als Gebühr), Dividenden (netto), Depotgebühren, Zinsen, Steuerauszugskosten, Payment/Credit/Debit, Forex credit/debit, Umrechnung bei abweichender Kontowährung, Tagessalden | Transfer in/out, Splits, Bezugsrechte und andere unbekannte Typen; Zeilen ohne ISIN |
| Trade Republic | CSV „Transaktionsexport“: `comma` (Komma, gequotet), `semicolon` | Käufe/Verkäufe mit Gebühr (Sparpläne markiert), Steuer auf Verkäufe, Dividenden/Ausschüttungen brutto mit Steuer, Dividendenstornos, Zinsen mit Steuer, Anleihekupons, Endfälligkeit/Tilgung als Verkauf, Vorabpauschale, Steueroptimierung, Ein-/Auszahlungen, Überweisungen, Kartenzahlungen, Geschenke, Saveback/Prämien, Gebühren | Krypto (keine ISIN), Private-Markets-Vorauszahlungen, Splits, Fusionen, Umtausch, CFD, unbekannte Typen; Dateien mit mehreren Konten (`account_type`) werden abgelehnt |
| XTB | CSV aus dem Blatt „Cash Operations“ des XLSX-Exports: `cash-8`, `cash-10` (`;`, Dezimalkomma), `cash-8-comma`, `cash-10-comma` (`,`, Dezimalpunkt); früherer CSV-Export `legacy` | Käufe/Verkäufe von Aktien/ETFs (Stückzahl aus dem Kommentar, Wertpapier unter XTB-Kürzel), Dividenden, Quellensteuer als Steuer, Finanztransaktionssteuer, Kommission/SEC-Gebühr, Zinsen und Zinssteuer, Ein-/Auszahlungen; Umbuchungen zwischen Unterkonten derselben Datei heben sich auf | CFD (Close trade, Profit/Loss, Swap/Rollover, CFD-Dividendenausgleich), Spin-offs, Überträge zu anderen Konten, unbekannte/nicht englische Typen; ohne Währung im Dateinamen wird die Datei abgelehnt |
| Saxo | Transaktionsexport, aus Excel als CSV gespeichert (`,` oder `;`): `booked` (Booked Amount, 15 Spalten), `amount` (Amount, 13 Spalten) | Käufe/Verkäufe aus dem Buchungstext (Buy/Sell, Koop/Verkoop), Differenz zum gebuchten Betrag als Gebühr, Fremdwährungskäufe mit Umrechnung als interne FX-Buchungen, Dividenden (netto), Quellensteuer als eigene Zeile, Ein-/Auszahlungen, Gebühren, Zinsen | Kapitalmaßnahmen außer Dividenden, Derivate (`From Derivative` = Yes), unbekannte Texte, Zeilen ohne ISIN, umgerechnete Zeilen ohne bestimmbare Kontowährung; XLSX nicht direkt |
| Charles Schwab | CSV-Kontoverlauf (`standard`, `titled` mit Titelzeile), US-Zahlenformat, Summenzeile wird übersprungen | Buy/Sell/Reinvest Shares mit Fees & Comm, Dividenden und Ausschüttungen, Foreign Tax Paid (Quellensteuer), Gebühren, Zinsen, Wire/MoneyLink/Journal/Internal Transfer als Ein-/Auszahlung | Splits, Stock Div Dist, Spin-off, Merger, Name Change, Conversion, Cash In Lieu, Journaled Shares, Security Transfer, Optionen; Zeilen ohne Symbol |
| Revolut | Kontoauszug Investmentkonto (`comma`, `semicolon`, `tab`); Krypto-Export wird nicht erkannt | Käufe/Verkäufe (Market/Limit/Stop) mit Gesamtbetrag, Dividenden (netto), Steuerkorrekturen, Custody fee, Cash top-up/withdrawal | Stock split, Transfers zwischen Revolut-Gesellschaften mit Stückzahl oder Betrag, unbekannte Typen; Zeilen ohne Ticker |
| eToro | Kontoauszug, Blatt „Account Activity“ als CSV (`,` oder `;`, Zahlenformat je Excel-Gebietsschema): `contracts` („Units / Contracts“), `units` (ältere Spalte „Units“) | Eröffnete/geschlossene Positionen in Aktien und ETFs als Kauf/Verkauf in USD (Wertpapier unter eToro-Symbol), Dividenden (netto), Zinsen, Ein-/Auszahlungen, Auszahlungsgebühr, SDRT als Gebühr; Umrechnungsgebühren ohne Kontowirkung werden übersprungen | CFD (Positionen, Overnight fee/refund, CFD-Dividenden), Krypto und andere Anlagearten, Stop Copy und unbekannte Typen mit Betrag, Zeilen ohne Symbol, negative Aktiendividenden; XLSX nicht direkt |
| Freetrade | Aktivitäten-Export als CSV (`activity`, 29 Spalten, Dezimalpunkt, ISO-Zeit in UTC) | Käufe/Verkäufe (ORDER) in Kontowährung mit Stempelsteuer und FX-Gebühr als Gebühr, Gratisaktien als Kauf plus Bonus-Einzahlung, Dividenden und PROPERTY-Ausschüttungen (brutto mit ausgewiesener Quellensteuer, sonst netto), Zinsen, TOP_UP/WITHDRAWAL; MONTHLY_STATEMENT übersprungen | Unbekannte Typen mit Betrag oder ISIN, Aufträge ohne ISIN oder Kauf/Verkauf; Depotüberträge fehlen im Export |
| InvestEngine | Bericht „Trading statement“ als CSV (`trading-statement`; Pflichtspalten `Security / ISIN`, `Transaction Type`, `Quantity`, `Share Price`, `Total Trade Value`, `Trade Date/Time`; optional `Settlement Date`, `Broker`) | Käufe/Verkäufe in GBP mit Handelswert als Cash-Effekt, ISIN aus „Name / ISIN …“ | Andere Typen, Zeilen ohne ISIN; Dividenden, Gebühren und Ein-/Auszahlungen (nur im Cash Statement, dessen Format keine öffentliche Quelle hat) |
| Avanza | Transaktionsexport (`sv`: `;`, Dezimalkomma, ISO-Datum, Spalte `Courtage (SEK)` oder `Courtage`), alle Konten in einer Datei | Köp/Sälj mit Courtage als Gebühr, Utdelning, Utländsk källskatt als Quellensteuer, Ränta, Insättning/Uttag (auch Überträge zwischen eigenen Konten), Övrigt: Avkastningsskatt (Steuer) und Gebührenerstattung | Andere Övrigt-Zeilen mit Stückzahl/Betrag (Fondsumtausch u. a.), unbekannte Typen mit Betrag, Zeilen ohne ISIN |
| Directa | „Movimenti“ als CSV (`movimenti`: `,`, Dezimalpunkt, `TT-MM-JJJJ`, optionale Kopfzeilen „Conto“, „Data estrazione“, Zeitraum) | Acquisto/Vendita mit Importo euro, Proventi/Dividendi, Cedola und Coupon als Zins, Ratei, Rit.* als Quellensteuer, Ritenuta su plusvalenza/Tobin tax/Bollo als Steuer, Commissioni, Conferimento/Bonifico/Prelievo | Finanziamento und unbekannte Typen mit Betrag, Handel ohne ISIN; höchstens 3.000 Zeilen je Export |
| Disnat | Kontoverlauf aus XLSX als CSV gespeichert, französische Spalten (`fr-comma`, `fr-semicolon`; Zahlenformat je Datei, `-` = leer, ISO-Datum) | ACHAT/VENTE (Actions) unter dem Symbol ohne „-C“, Kommission als Gebühr wenn sie den Betrag erklärt, Dividenden, Retenue als Quellensteuer, Zinsen, Frais mit TPS/TVQ, Cotisation/Subvention/Incitatif/Barübertrag als Einzahlung, Résiliation/Retrait als Auszahlung | Überträge mit Wertpapier, Optionen und andere Klassen, unbekannte Typen mit Betrag, Zeilen ohne Symbol; englischer Export nicht belegt |
| Finpension | Transaktionsbericht (`;`, Dezimalpunkt, ISO-Datum): `3a`, `bvg` (Freizügigkeit), `report` (nur Zinsen/Gebühren), an den Kategorien erkannt | Buy/Sell bzw. Portfolio Transaction (Richtung aus dem Cash Flow) in CHF, Dividend und Dividend and Interest Distributions, Interests, Pauschalgebühr, Deposit, Transfer vested benefits, Withdraw…, Tagessaldo aus Balance | Unbekannte Kategorien mit Betrag oder Anteilen, Handel ohne ISIN oder mit widersprüchlichen Vorzeichen |
| Scalable Capital | PDF, je Dokument eine Datei: `de`, `en` (Scalable Capital GmbH/Bank GmbH), `baader` (Baader Bank für Scalable-Kunden bis 2024) | Wertpapierabrechnung Kauf/Verkauf/Sparplan mit Ordergebühren, Steuern und Finanztransaktionssteuer als Steuerbuchung; Dividenden brutto mit Quellensteuer und deutschen Steuern; Vorabpauschale; Steuerneuberechnung; Baader: Kauf/Verkauf mit Provision und Steuern, Fondsausschüttung/Ausschüttung/Dividende(nabrechnung) | Verrechnungskonto/Kontoauszug, Rechnungsabschluss, Reklassifizierung (Belastung), Kapitalrückzahlung, Zinszahlung, Laufzeitende/Knock-out, Stornos; Baader: Thesaurierung, Vorabpauschale, Steuerausgleich, Kontoauszüge, englische Dokumente; Niederländisch/Italienisch/Französisch. Kosteninformation und Auftragsbestätigung werden ohne Buchung übersprungen |
| flatex | PDF, je Dokument eine Datei: `flatex` (flatex Bank AG, flatexDEGIRO Bank AG/SE, Deutschland und Österreich), `fintech` (FinTech Group Bank AG, älteres Layout „Kurswert EUR 1.050,00“) | Wertpapierabrechnung Kauf/Verkauf und Sammelabrechnung mit Provision und Spesen als Gebühr, einbehaltene Steuer/KESt als Steuerbuchung (Erstattung positiv); Dividendengutschrift und Ertragsmitteilung brutto in Kontowährung mit Quellensteuer, Steuer und Gebühren; Steuer thesaurierender Fonds; Vorabpauschale; Depotservicegebühr | Anleihen (Prozentkurs, Stückzinsen), Krypto, Devisen, Stornos, Kontoauszüge, Depotein-/-ausgänge, Kapitalmaßnahmen, Stockdividenden, Gutschrifts-/Belastungsanzeigen. Auftrags-, Änderungs- und Streichungsbestätigungen sowie Kosteninformationen werden ohne Buchung übersprungen |
| ING Deutschland | PDF, je Dokument eine Datei: `ing` (ING-DiBa AG; ING Spanien wird nicht erkannt) | Wertpapierabrechnung Kauf (auch Sparplan, Einmalanlage, Wiederanlage), Bezug, Verkauf; Rückzahlung/Einlösung in Stück als Verkauf; Provision und Entgelte als Gebühr, Steuern als eigene Buchung; Dividenden- und Ertragsgutschrift brutto in Kontowährung mit Quellensteuer und Steuern; Zinsgutschrift als Zinsen; Steuer aus Ertragsgutschrift ohne Auszahlung und Vorabpauschale; nachträgliche Verlustverrechnung | Anleihen (Nominale, Stückzinsen), Stornos, Kontoauszüge, Umtausch, Überträge, Kapitalmaßnahmen. Auftrags-, Änderungs- und Streichungsbestätigungen sowie Kosteninformationen werden ohne Buchung übersprungen |
| comdirect | PDF, je Dokument eine Datei oder Abrechnung und Steuermitteilung in einer Datei: `comdirect`; zusätzlich zur API (`src/lib/importers/comdirect.ts`) | Wertpapierabrechnung Kauf/Verkauf inkl. Teilausführungen, Fremdwährung, Festpreis; Provision und Entgelte als Gebühr; Steuermitteilung zu Kauf/Verkauf als Steuerbuchung (Erstattung positiv); Steuermitteilung zu Dividenden und Investment-Ausschüttungen; Vorabpauschale; Dividendengutschriften vor 2009 ohne Steuermitteilung | Dividenden-/Ertragsgutschriften mit „vor Steuern“ (bewusst, Hinweis im Bericht), Anleihen, Umtausch, Einlösung, Sachausschüttung, Fremdwährungsgutschriften vor 2009, Verkäufe mit negativem Erlös, Finanzreport, Verwahrentgelt. Ausführungsbestätigungen und Kosteninformationen werden ohne Buchung übersprungen |
| Yuh | PDF, je Aktivität eine Datei (Transaktionsbeleg der Swissquote Bank für Yuh Accounts): `de`, `en` | Kauf/Verkauf (de/en) mit Kommission abzüglich Trading Credit als Gebühr, Stempelsteuer als Steuerbuchung; Dividende und Kapitalgewinn (de) brutto mit Quellen-/Verrechnungssteuer; Zahlungsverkehr Gutschrift/Belastung (de); Zinsabrechnung (de) je Währung | Titelumbuchungen, Kapitalmaßnahmen, Krypto, Kontoauszüge, englische Dividenden und Zahlungsbelege, Französisch/Italienisch; normale Swissquote-PDFs werden nicht erkannt |
| CommSec | PDF-Bestätigung (Contract Note) Commonwealth Securities Limited: `colon`, `plain`; mehrere Bestätigungen je Datei möglich | Käufe/Verkäufe in AUD mit Brokerage als Gebühr, Wertpapier unter dem ASX-Code | Dividenden und Cash (nicht auf den Bestätigungen), Application Money, andere CommSec-Dokumente, CommSec International |
| Questrade | PDF: `statement` (Monatsauszug, Abschnitt „04. ACTIVITY DETAILS“), `trade-confirmation` (Trade Confirmation Report), `other` (nur Meldung) | Auszug: Buy/Sell in CAD/USD mit Kommission, UNIT DIST als Ausschüttung, Contribution als Einzahlung; Report: Buy/Sell mit Kommission und SEC-Gebühren. Wertpapier unter dem Symbol | Alle anderen Zeilen der Tabellen (Auszahlungen, Quellensteuer, Zinsen, Devisen, Überträge, Kapitalmaßnahmen, Gebühren), Optionen, Anleihen; Trades mit Abwicklung nach Monatsende werden übersprungen |

## Quellen und Lizenzen

Es wurde kein Quellcode übernommen. Aus den Projekten stammen nur Formatwissen (Spaltennamen,
Buchungstypen, Exportwege), das in eigenem Code umgesetzt ist.

| Importer | Quelle | Stand | Lizenz | Verwendet |
|---|---|---|---|---|
| Swissquote | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `src/converters/swissquoteConverter.ts`, `samples/swissquote-export.csv`, Issue #138 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 28.10.2026) | Apache-2.0 | Spaltennamen der englischen und deutschen Variante, Buchungstypen, Exportweg, Hinweis zur Anzeigesprache |
| Swissquote | [Parqet FAQ](https://faq.parqet.com/de/articles/714176-swissquote-csv-import) | 28.10.2026 | – (Dokumentation) | Exportweg, Hinweis auf fehlende Steuerausweisung, Typ „Transfer in“ |
| Trade Republic | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/traderepublic/TradeRepublicCSVExtractor.java`, `CashDividendCorrectionMatcher.java`, Testdateien `TransactionExport01–06.csv` | Commit `2a0ef52a93882c0845596b2c6b834e54f592b7ec` (geprüft 28.10.2026) | EPL-1.0 (Lizenztext im Repository geprüft) | Nur Formatwissen: Spaltennamen, Trennzeichen, Kategorien und Buchungstypen, Vorzeichen von `amount`/`fee`/`tax`, Bedeutung der Typen (z. B. Vorabpauschale, Endfälligkeit). Kein Code und keine Testzeilen übernommen; die Fixture ist neu erzeugt. |
| Trade Republic | [Parqet FAQ](https://faq.parqet.com/de/articles/651186-trade-republic-csv-import), [PP-Forum „Import Trade Republic CSV (Transaktionsexport)“](https://forum.portfolio-performance.info/t/import-trade-republic-csv-transaktionsexport/39126) | 28.10.2026 | – (Dokumentation) | Exportweg Profil/Service → Kontoauszüge → Transaktionsexport, verfügbar seit April 2026 |
| Trading 212 | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `trading212Converter.ts`, `samples/trading212-export.csv`, Issue #315 | Commit `9e35bd6` | Apache-2.0 | Spaltennamen, Aktionsnamen, dynamische Kostenspalten |
| Trading 212 | [Parqet FAQ](https://faq.parqet.com/de/articles/765626-trading-212-csv-import) | 28.10.2026 | – (Dokumentation) | Exportweg und Datenarten |
| XTB | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/xtb/XTBCSVExtractor.java`, Test `XTBCSVExtractorTest.java`, Beispiel `EUR_account_sample.csv`, PR #6085, Issue #4938 | Commit `2a0ef52a93882c0845596b2c6b834e54f592b7ec` (geprüft 28.10.2026) | EPL-1.0 (Lizenztext im Repository geprüft) | Nur Formatwissen: Metadatenzeilen, 8- und 10-Spalten-Kopf, Buchungstypen, Mengenangabe im Kommentar, Kontowährung im Dateinamen, XLSX-Export und Speichern als CSV. Kein Code übernommen. |
| XTB | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `src/converters/xtbConverter.ts`, `samples/xtb-export.csv`, README | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 28.10.2026) | Apache-2.0 | Früheres 6-Spalten-Format, ältere Typnamen (auch portugiesisch), Exportweg Account history → Cash operations → Export |
| Saxo | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `saxoConverter.ts`, `models/saxoRecord.ts`, `samples/saxo-export.csv`, Issues #155, #319 | Commit `9e35bd6` | Apache-2.0 | Spaltennamen beider Varianten, Ereignistexte, Datums- und Betragsformat des Beispiels, Exportweg |
| Saxo | [Saxo Help: Monitoring your Portfolio](https://www.help.saxo/hc/en-us/articles/360039762472-Monitoring-your-Portfolio) | 28.10.2026 | – (Dokumentation) | Bereich Transactions mit Filtern (Trades, Corporate actions, Cash transfers) und Export als PDF oder Excel |
| Charles Schwab | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `schwabConverter.ts`, `models/schwabRecord.ts`, `samples/schwab-export.csv`, Issues #8, #75, #121, #191, #287 | Commit `9e35bd6` | Apache-2.0 | Spalten, Aktionsnamen, Zahlen- und Datumsformat, Titel- und Summenzeile, Exportweg |
| Revolut | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `revolutConverter.ts`, `models/revolutRecord.ts`, `samples/revolut-invest-export.csv`, Issues #107, #163 | Commit `9e35bd6` | Apache-2.0 | Spalten, Typnamen, Betrags- und Mengenformat, Exportweg, TSV aus der App |
| Revolut | [Revolut Help: trading statements and reports](https://help.revolut.com/help/profile-and-plan/managing-my-account/trading-statements-and-reports/) | 28.10.2026 | – (Dokumentation) | Menüweg Invest → Mehr → Dokumente → Stocks → Account statement; Abgrenzung zu P&L und Cost & Charges |
| eToro | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `etoroConverter.ts`, `models/etoroRecord.ts`, `samples/etoro-export.csv`, README, Issues #29, #177, #188, #249 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 29.10.2026) | Apache-2.0 | Spaltennamen beider Varianten, Buchungstypen, Datums- und Zahlenformate, Exportweg (Blatt Account Activity als CSV), Semikolon-Problem aus Issue #188 |
| eToro | [eToro: Currency accounts](https://www.etoro.com/trading/currency-accounts/), [Snowball Analytics: Import eToro](https://help.snowball-analytics.com/import-etoro/) | 29.10.2026 | – (Dokumentation) | Handel läuft immer über das USD-Investmentkonto (lokale EUR/GBP-Konten dienen nur der Finanzierung); alternativer Menüweg Einstellungen → Konto → Dokumente → Account Statement |
| Freetrade | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `freetradeConverter.ts`, `models/freetradeRecord.ts`, `samples/freetrade-export.csv`, README, PRs #55, #220 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 29.10.2026) | Apache-2.0 | Spaltennamen, Typen (ORDER, FREESHARE_ORDER, DIVIDEND, PROPERTY, INTEREST_FROM_CASH, TOP_UP, WITHDRAWAL, MONTHLY_STATEMENT), Bedeutung von Total Amount, Stamp Duty, FX Fee und Dividendenspalten aus den Beispielzeilen |
| Freetrade | [Freetrade Help: CSV export of the activity feed](https://help.freetrade.io/en/articles/6627908-how-do-i-download-a-csv-export-of-my-activity-feed) | 29.10.2026 (Artikel vom 30.03.2026) | – (Dokumentation) | Exportweg Activity → Exportpfeil → All Activity; Überträge zu/von anderen Anbietern nicht enthalten |
| InvestEngine | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `investEngineConverter.ts`, `models/investEngineRecord.ts`, `samples/investengine-export.csv`, Issue #241, PR #248 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 29.10.2026) | Apache-2.0 | Spalten des Trading statement, Dateiname `GIA_Trading_statement_<von>_to_<bis>.csv` (Issue #241), Betrags- (`£`) und Datumsformat (`TT/MM/JJ HH:mm:ss`) |
| InvestEngine | [Help: Generate and download a custom report](https://help.investengine.com/hc/en-gb/articles/8927819031581-How-can-I-generate-and-download-a-custom-report), [Help: Choosing the right statement or report](https://help.investengine.com/hc/en-gb/articles/24811340395037-Guide-Choosing-the-Right-Statement-or-Report-for-Your-Needs) | 29.10.2026 (Seiten hinter Cloudflare, im Browser gelesen) | – (Dokumentation) | Menüweg Reports → Create report → Berichtstyp → Zeitraum → Portfolio → Generate report, PDF oder CSV; Cash Statement für Kontobewegungen |
| Avanza | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `avanzaConverter.ts`, `models/avanzaRecord.ts`, `samples/avanza-export.csv`, README, Issue #165, PR #170 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 29.10.2026) | Apache-2.0 | Spalten, Typen und ihre Bedeutung (Übersetzung durch einen Avanza-Kunden in Issue #165), Zahlen-/Datumsformat, Exportweg Min ekonomi → Transaktioner → Exportera transaktioner. Keine offizielle Avanza-Anleitung gefunden. |
| Directa | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `directaConverter.ts`, `models/directaRecord.ts`, `samples/directa-export.csv`, `assets/directa-transactions.png`, `assets/directa-export.png`, README, PRs #141, #292, Issues #278, #294 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 29.10.2026) | Apache-2.0 | Spalten, Kopfzeilen vor der Tabelle, Typnamen, Zahlen-/Datumsformat, Exportweg und 3.000-Zeilen-Grenze aus den Screenshots. Keine offizielle Directa-Anleitung gefunden. |
| Disnat | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `disnatConverter.ts`, `models/disnatRecord.ts`, `samples/disnat-export.csv`, README, Issue #260, PR #270 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 29.10.2026) | Apache-2.0 | Spalten, Typnamen, `-` als Leerwert, Währungskürzel CAN/US, Symbol mit und ohne „-C“, Exportweg (vom Disnat-Kunden in Issue #260 beschrieben). Keine offizielle Disnat-Anleitung gefunden; [Snowball Analytics](https://help.snowball-analytics.com/import-disnat/) bestätigt nur den Weg über History und Zeitraum. |
| Finpension | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `finpensionConverter.ts`, `models/finpensionRecord.ts`, `samples/finpension-3a-export.csv`, `samples/finpension-bvg-export.csv`, README, PRs #10, #267, #284 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 29.10.2026) | Apache-2.0 | Spalten, Kategorien beider Varianten, Vorzeichen von Cash Flow und Anteilen, Balance, Exportweg |
| Finpension | [PP-Forum: CSV-Import für Finpension 3a](https://forum.portfolio-performance.info/t/csv-import-fur-finpension-3a-schweiz/17051) | 29.10.2026 | – (Forum) | Bestätigt Spalten, Semikolon, UTF-8 und Datumsformat; keine offizielle Finpension-Anleitung gefunden |
| DEGIRO | [Export-To-Ghostfolio README](https://github.com/dickwolff/Export-To-Ghostfolio#degiro) | Commit `9e35bd6` | Apache-2.0 | Exportweg Kontoübersicht |
| DEGIRO (englisch) | [opensteuerauszug](https://github.com/vroonhof/opensteuerauszug), [Stonks](https://github.com/sleousis/Stonks), [degiro-bookkeeper](https://github.com/pviotti/degiro-bookkeeper) | Commits `6c34ad7`, `cdb660d`, `880f1bf` | nur Formatwissen | Spaltennamen und Zeilentexte; „Auszahlung von Ihrem Geldkonto“ als Cash Sweep; kein Code übernommen |
| Scalable Capital | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/ScalableCapitalPDFExtractor.java` und `BaaderBankPDFExtractor.java` mit den Testdokumenten unter `name.abuchen.portfolio.tests/…/pdf/scalablecapital/` und `…/pdf/baaderbank/` | Commit `85c2088f28dfb26e711edf20494dca3e64ae9858` (geprüft 29.10.2026) | EPL-1.0 (Lizenztext im Repository geprüft) | Nur Formatwissen: Bankkennungen, Dokumenttitel und -arten beider Generationen, Aufbau der Buchungszeile (Typ, Name, Stück, Kurs, Betrag; ISIN in der Folgezeile), Bezeichnungen und Vorzeichen der Gebühren- und Steuerzeilen, Summenzeilen, Ausführungs- und Ordernummern, Datumsangaben, Baader-Felder (Vorgangs-Nr., „Zu Lasten/Gunsten Konto … Valuta“). Kein Code und keine Testdokumente übernommen; die Test-PDFs sind neu erzeugt. |
| Scalable Capital | [Parqet FAQ](https://faq.parqet.com/de/articles/651200-scalable-capital-pdf-csv-import) | 29.10.2026 | – (Dokumentation) | Downloadweg im Broker (Transaktionen → Transaktion → PDF) und bei der Baader Bank (Download → Wertpapierumsätze), CSV-Export nur für Prime |
| flatex | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/FinTechGroupBankPDFExtractor.java` mit den Testdokumenten unter `name.abuchen.portfolio.tests/…/pdf/fintechgroupbank/` | Commit `85c2088f28dfb26e711edf20494dca3e64ae9858` (geprüft 29.10.2026) | EPL-1.0 (Lizenztext im Repository geprüft) | Nur Formatwissen: Bankkennungen, Dokumenttitel und -arten, zweispaltiges Feldlayout beider Generationen, Feldnamen (Kurswert, Provision, Eigene/Fremde Spesen, Einbeh. Steuer/KESt, Endbetrag, Devisenkurs, Gez. Quellenst., Gesamtgebühr), Blöcke der Sammelabrechnung, Auftrags- und Transaktionsnummern, Thesaurierung und Vorabpauschale. Kein Code und keine Testdokumente übernommen; die Test-PDFs sind neu erzeugt. |
| flatex | [Parqet FAQ](https://faq.parqet.com/de/articles/871917-flatex-pdf-import) | 29.10.2026 | – (Dokumentation) | Downloadweg Post → Dokumentenarchiv → Zeitraum, unterstützte und nicht importierte Dokumentarten |
| ING Deutschland | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/INGDiBaPDFExtractor.java` mit den Testdokumenten unter `name.abuchen.portfolio.tests/…/pdf/ingdiba/` | Commit `de1e4645b68b76f33b577a187295c4f4304d0204` (geprüft 30.10.2026) | EPL-1.0 | Nur Formatwissen: Bankkennung, Dokumenttitel, Feldnamen (Kurswert, Rabatt, Provision, Entgelte, Steuerzeilen, Endbetrag, Umrechnungszeilen, QuSt), Gemeinschaftsdepot-Zeilen, Storno-Kennzeichen, Vorabpauschale, Verlustverrechnung. Kein Code und keine Testdokumente übernommen; die Test-PDFs sind neu erzeugt. Die Testdokumente wurden nur lokal als Gegenprobe durch den Importer geführt. |
| ING Deutschland | [Parqet FAQ](https://faq.parqet.com/de/articles/651196-ing-pdf-import) | 30.10.2026 | – (Dokumentation) | Downloadweg Posteingang → erweiterte Suche → Depot, Dokumentarten Abrechnung Kauf/Verkauf und Ertragsabrechnung |
| comdirect | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/ComdirectPDFExtractor.java` mit den Testdokumenten unter `name.abuchen.portfolio.tests/…/pdf/comdirect/` | Commit `de1e4645b68b76f33b577a187295c4f4304d0204` (geprüft 30.10.2026) | EPL-1.0 | Nur Formatwissen: Bankkennung, Trennung von Abrechnung und Steuermitteilung, Feld- und Zeilenaufbau, Sperrschrift der Steuermitteilung, Umrechnungszeilen, Gutschriften vor 2009. Kein Code und keine Testdokumente übernommen; die Test-PDFs sind neu erzeugt. Die Testdokumente wurden nur lokal als Gegenprobe durch den Importer geführt. |
| comdirect | [Parqet FAQ](https://faq.parqet.com/de/articles/651189-comdirect-pdf-import) | 30.10.2026 | – (Dokumentation) | PostBox-Sammeldownload als ZIP, Dokumentwahl Wertpapierabrechnung und Steuermitteilung; Dividendengutschrift ist laut Parqet seit Januar 2026 kein Importdokument |
| Yuh | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/SwissquotePDFExtractor.java` mit den Testdokumenten unter `name.abuchen.portfolio.tests/…/pdf/swissquote/` (`Kauf05`, `Sell01`, `Dividende05/06`, `Zahlungsverkehr01–04`, `Zinsabrechnung01`, `Titelumbuchung01`) | Commit `de1e4645b68b76f33b577a187295c4f4304d0204` (geprüft 30.10.2026) | EPL-1.0 (Lizenztext im Repository geprüft) | Nur Formatwissen: Dokumenttitel, Referenzzeile, Tabellenaufbau, Feldnamen, Trading Credit, Spalten der Zinsabrechnung. Kein Code und keine Testdokumente übernommen; die Test-PDFs sind neu erzeugt. |
| Yuh | [Parqet FAQ](https://faq.parqet.com/de/articles/871931-yuh-pdf-import) | 30.10.2026 | – (Dokumentation) | Downloadweg in der App (Investieren → Anlage → Transaktionen → Aktivität → Transaktionsbenachrichtigung als PDF), unterstützte Dokumentarten |
| CommSec | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/CommSecPDFExtractor.java` mit den Testdokumenten unter `name.abuchen.portfolio.tests/…/pdf/commsec/` (`Kauf01/02`, `Verkauf01`, 2020) | Commit `de1e4645b68b76f33b577a187295c4f4304d0204` (geprüft 30.10.2026) | EPL-1.0 (Lizenztext im Repository geprüft) | Nur Formatwissen: beide Layouts, Feldnamen, Reihenfolge der Blöcke. Kein Code und keine Testdokumente übernommen; die Test-PDFs sind neu erzeugt. |
| CommSec | [CommSec Help: Trade confirmations](https://www.commsec.com.au/support/help-centre/managing-your-account/Trade_preferences.html), [Statements Minor Trust](https://www.commsec.com.au/support/help-centre/documents-and-statements/statements-and-reports-minor-trust.html) | 30.10.2026 | – (Dokumentation) | Downloadweg Trade → Manage Orders → Confirmations; Abweichung Trading → Confirmations bei Minor-Trust-Konten |
| Questrade | [Portfolio Performance](https://github.com/portfolio-performance/portfolio) `name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/QuestradeGroupPDFExtractor.java` mit den Testdokumenten unter `name.abuchen.portfolio.tests/…/pdf/questradegroup/` (`AccountStatement01`, `Buy01–08`, `Dividend01–03`, `Sell01`) | Commit `de1e4645b68b76f33b577a187295c4f4304d0204` (geprüft 30.10.2026) | EPL-1.0 (Lizenztext im Repository geprüft) | Nur Formatwissen: Abschnitte, Tabellenspalten CAD/USD, Zeilenaufbau, Datumsformate beider Dokumente, Spalten des Reports. Kein Code und keine Testdokumente übernommen; die Test-PDFs sind neu erzeugt. |
| Questrade | [Introduction to your account](https://www.questrade.com/learning/using-questrade/introduction-to-your-account) (Stand 17.10.2022, im Browser gelesen) | 30.10.2026 | – (Dokumentation) | Seite Documents → Recent statements (monatlich oder quartalsweise, Self-directed und Questwealth), Seite Reports → Trade confirmation (Suche nach Symbol oder Datum) |

### Abweichungen von der Vorlage (Swissquote)

- Ein- und Auszahlungen (`Payment`, `Credit`, `Debit`) und Devisengeschäfte werden gebucht statt übersprungen;
  Überweisungskosten werden als eigene Gebühr gebucht.
- Unbekannte Typen werden im Importbericht gemeldet statt verworfen; Zeilen ohne ISIN werden nicht über eine
  Tickersuche einem Wertpapier zugeordnet.
- Deutsche Exporte werden gelesen; erkannt werden nur die belegten Typen (Kauf, Verkauf, Dividende,
  Depotgebühren, Zinsen, Zahlung). Alles andere erscheint als „nicht übernommen“.
- Dividenden werden mit dem Nettobetrag gebucht; Quellensteuer wird nicht geschätzt.
- Annahme ohne Original-Beleg: Weicht die Währung des Nettobetrags von der Kontowährung ab (15-Spalten-Export),
  belastet Swissquote das Konto in Kontowährung ohne eigene Forex-Zeile. Openfolio bucht dafür zwei interne
  Umrechnungsbuchungen. Sollte ein Original-Export zusätzlich Forex-Zeilen enthalten, wäre die Umrechnung doppelt.

### Abweichungen von der Vorlage (Trade Republic)

- Das CSV des Tools pytr (Export-To-Ghostfolio `tradeRepublicConverter.ts`) ist ein anderes Format und wird nicht erkannt.
- Buchungsdatum ist die Spalte `date`; PP verwendet den UTC-Zeitstempel `datetime`, der bei abendlichen Buchungen auf
  den Folgetag fällt.
- Dividendenstornos (negativer Betrag) werden mit Vorzeichen gebucht; Original, Storno und Neuabrechnung ergeben
  zusammen den richtigen Betrag. PP muss sie dagegen dem Original zuordnen (`CashDividendCorrectionMatcher`).
- Steuern werden als eigene Buchung geführt: auf Verkäufe, Vorabpauschale und Steueroptimierung als Steuer, auf
  Dividenden und Kupons als einbehaltene Steuer der Position. Gebühren von Karten-Aufladungen als eigene Gebühr.
- PP bucht viele Typen pauschal nach Vorzeichen als Ein- oder Auszahlung. Openfolio tut das nur für Geldbewegungen
  (Überweisungen, Karte, Geschenke, Saveback und Prämien). Typen, die Bestände berühren können (`CRYPTO_TRADING`,
  `CFD_ORDER`, `MERGER`, `EXCHANGE`, `STOCKPERK`, `LIQUIDATION_PROCEEDS`, …), werden als nicht übernommen gemeldet.
- Private-Markets-Vorauszahlungen (`PRIVATE_MARKET_BUY`/`SELL`) bucht PP als Kauf/Verkauf; Openfolio meldet sie, weil
  die Vorauszahlung noch keine Ausführung belegt.
- Krypto-Käufe haben im Export ein Kürzel statt einer ISIN und werden nicht einem Wertpapier zugeordnet.
- Kontoauswahl: Enthält eine Datei mehrere `account_type` (z. B. `DEFAULT` und `JUNIOR`), wird sie abgelehnt.
- Eine wiederholte `transaction_id` innerhalb der Datei wird als dieselbe Buchung erkannt und übersprungen
  (im Bericht als ignoriert).
- Saveback und Prämien werden wie bei PP als Einzahlung gebucht, nicht als Ertrag.

### Abweichungen von der Vorlage (Trading 212)

- Ein- und Auszahlungen, Zinsen und Währungsumtausch werden gebucht statt übersprungen.
- Splits und Stock distributions werden nicht als Kauf/Verkauf gebucht, sondern gemeldet.
- Kosten aus allen Spalten mit eigener Währungsspalte (Stempelsteuer, Umrechnungsgebühr, …) werden als Gebühr
  übernommen; die Vorlage setzt die Gebühr auf 0.
- Buchungslogik wie der bestehende Trading-212-API-Import. CSV und API haben verschiedene Kennungen und werden
  nicht gegeneinander dedupliziert; die Exporthilfe rät davon ab, beide im selben Depot zu nutzen.
- Das Beispiel der Vorlage enthält Zeilen mit verschobenen Spalten (Stock distribution, Transfer out); die
  synthetische Fixture folgt der Spaltenreihenfolge aus Issue #315.

### Vergleich der Vorlagen und Abweichungen (XTB)

- Die beiden Vorlagen lesen verschiedene Formate: PP das Blatt „Cash Operations“ des heutigen XLSX-Exports als CSV
  (Metadatenzeilen, 8 oder 10 Spalten, Dezimalkomma, ISO-Zeit in UTC), Export-To-Ghostfolio den früheren direkten
  CSV-Export (6 Spalten, Dezimalpunkt, Zeit `TT.MM.JJJJ`). Openfolio liest beide; zusätzlich das CSV, das ein
  englisch eingestelltes Excel mit Komma und Dezimalpunkt speichert.
- Quellensteuer: Export-To-Ghostfolio legt sie im Gebührenfeld der Dividende ab; Openfolio bucht sie wie PP als
  Steuer der Position (`withholding_tax`). Zinssteuer und Finanztransaktionssteuer als Steuer, Kommission und
  SEC-Gebühr als Gebühr (Export-To-Ghostfolio führt alle als Gebühr).
- CFD: PP bucht `Close trade` und `Swap` als Zins bzw. Zinsbelastung, Export-To-Ghostfolio `Profit/Loss` und `Swap`
  als Zins oder Gebühr und negative CFD-Dividenden als Gebühr. Openfolio trennt Aktien/ETF von CFD und meldet alle
  CFD-Zeilen als nicht übernommen; Dividenden auf Kürzel ohne Börsensuffix oder mit negativem Betrag gelten als
  CFD-Dividendenausgleich.
- Spin-offs bucht PP als Dividende; Openfolio meldet sie als Kapitalmaßnahme.
- Überträge: Wie PP heben sich Umbuchungen zwischen Unterkonten derselben Datei auf (im Bericht als ignoriert);
  Überträge ohne Gegenbuchung werden gemeldet statt als Ein- oder Auszahlung gebucht.
- Wertpapiere: Die Exporte enthalten keine ISIN. Openfolio legt das Wertpapier unter dem XTB-Kürzel an (wie der
  generische CSV-Import ein Kürzel als Kennung nutzt) und überlässt die Auflösung der Kursaktualisierung; es wird
  keine ISIN erfunden und keine Kürzelumsetzung (`.UK` → `.L`) geraten. Export-To-Ghostfolio sucht stattdessen
  über Yahoo.
- Kontowährung aus dem Dateinamen wie bei PP; die Formaterkennung selbst bleibt inhaltsbasiert. Ohne Währung im
  Namen bricht der Import mit einer Erklärung ab statt EUR anzunehmen (Export-To-Ghostfolio: Umgebungsvariable,
  Standard EUR).
- Wiederholte Operations-IDs innerhalb einer Datei werden übersprungen; die Kontonummer aus der Kopfzeile ist Teil
  des Schlüssels, damit gleiche IDs verschiedener Konten nicht zusammenfallen.
- PP liest Windows-1250-kodierte Dateien; Openfolio liest UTF-8. Nicht englische Typen (z. B. tschechisch) werden
  ohnehin als nicht übernommen gemeldet.

### Abweichungen von der Vorlage (Saxo)

- Ein- und Auszahlungen werden gebucht statt übersprungen; Zinsen werden erkannt.
- Nicht jede Zeile vom Typ „Corporate action“ ist eine Dividende: nur der Text „Dividend“ wird als Dividende gebucht,
  Quellensteuer als Steuer, alle anderen Kapitalmaßnahmen werden gemeldet.
- Der gebuchte Betrag ist der Cash-Effekt in Kontowährung. Bei gleicher Währung wird die Differenz zu Stückzahl × Kurs
  als Gebühr gebucht (die Vorlage setzt 0). Bei umgerechneten Zeilen (Conversion Rate ≠ 1) wird der Handel in der
  Instrumentwährung gebucht und die Umrechnung über zwei interne FX-Buchungen; Gebühren lassen sich dann nicht trennen.
- Die Kontowährung steht nicht im Export. Sie wird aus den Kontobewegungen (Zeilen ohne ISIN) bestimmt, sonst aus
  Zeilen ohne Umrechnung. Ist sie nicht eindeutig, werden umgerechnete Zeilen gemeldet statt geraten.
- Beträge: Das Beispiel der Vorlage enthält Dezimalkommas („-405,55“), die `parseFloat` abschneidet. Openfolio bestimmt das
  Dezimaltrennzeichen je Datei und lehnt gemischte oder nur mehrdeutige Werte („1,500“) mit Zeilennummer ab. Stückzahl
  und Kurs im Buchungstext werden mit Dezimalpunkt gelesen (so auch in der niederländischen Beispielzeile).
- Datum: englische, niederländische und deutsche Monatskürzel („02-Apr-2025“, „16-jan-2025“, „02-Mär-2025“), ISO und
  `TT.MM.JJJJ`. Datumsangaben mit Schrägstrich werden abgelehnt (US/EU mehrdeutig). Issue #319 meldet Fehler bei
  niederländischen Datumsangaben; diese werden gelesen.
- GBX bleibt GBX (die Vorlage schreibt GBp); Zeilen ohne ISIN werden nicht per Symbolsuche zugeordnet.
- Derivate (`From Derivative` = Yes, Spalte seit 2026 laut Issue #319) werden gemeldet, nicht als Wertpapierkauf gebucht.

### Abweichungen von der Vorlage (Charles Schwab)

- Kapitalmaßnahmen werden nicht als Kauf/Verkauf zum Preis 0 gebucht (Vorlage: Stock Split, Stock Div Dist, Spin-off als
  Kauf; Reverse Split, Merger, Name Change, Conversion als Verkauf), sondern gemeldet. Cash In Lieu ist der Barausgleich
  eines Bruchteils und wird ebenfalls gemeldet statt als Dividende gebucht.
- Ein- und Auszahlungen (Wire, MoneyLink, Journal, Internal Transfer) werden gebucht statt übersprungen; Überträge von
  Wertpapieren (Journaled Shares, Security Transfer) werden gemeldet.
- Foreign Tax Paid wird als Quellensteuer gebucht, nicht als Gebühr. Margin Interest wird als (negativer) Zins gebucht.
- „Fees & Comm“ wird als Gebühr des Handels übernommen; der Handelsbetrag ergibt sich aus Amount plus Gebühr.
- Zahlen mit Klammern („($0.40)“) gelten als negativ; andere Formate führen zu einem Fehler mit Zeilennummer statt zu 0.
- Das Datum vor „as of“ ist das Buchungsdatum; das „as of“-Datum bleibt in den Rohdaten der Buchung.
- Die Summenzeile „Transactions Total“ wird überall erkannt, nicht nur als letzte Zeile; eine Titelzeile davor wird übersprungen.
- Ticker werden wie beim IBKR-Import als Wertpapierkennung verwendet und später über den Kursabruf zugeordnet; die
  Vorlage sucht CUSIPs über den Namen. Openfolio gleicht Ticker, CUSIP und ISIN nicht gleich.
- Abgleich: In der Fixture ergibt die Summe aller Buchungen den Betrag der Summenzeile; enthält ein Export gemeldete
  Zeilen mit Betrag (z. B. Cash In Lieu), weicht die Summe um diese Beträge ab.

### Abweichungen von der Vorlage (Revolut)

- `STOCK SPLIT` wird nicht als Kauf gebucht (Vorlage: Kauf), sondern gemeldet.
- `CASH TOP-UP` und `CASH WITHDRAWAL` werden als Ein-/Auszahlung gebucht statt übersprungen.
- `TRANSFER FROM … TO …` (Wechsel der Revolut-Gesellschaft) wird gemeldet, wenn die Zeile Stückzahl, Ticker oder Betrag hat,
  sonst als Verwaltungszeile übersprungen. Die Vorlage überspringt alle Transfers still.
- Käufe/Verkäufe werden mit dem Gesamtbetrag gebucht (Cash-Effekt), nicht mit Stückzahl × Kurs; Gebühren sind darin enthalten
  und werden nicht geschätzt.
- Mengen: Die Vorlage ersetzt das erste Komma durch einen Punkt. Openfolio liest „0,76672417“ ebenfalls als Dezimalzahl, prüft
  aber „1,500“ gegen Kurs × Menge = Gesamtbetrag und lehnt ohne Kurs ab, statt zu raten.
- Beträge: Währungszeichen (`$`, `€`, `£`) oder -codes werden entfernt; Tausenderkommas gelten wie im Beispiel („$105,058.55“).
- Datei mit Komma, Semikolon oder Tabulator (die App liefert laut Issue #107 TSV). Datum in UTC laut Export.
- GBX bleibt GBX (Vorlage: GBp). Ticker werden als Wertpapierkennung verwendet und beim Kursabruf zugeordnet.
- Der Krypto-Kontoauszug (`Symbol,Type,Quantity,Price,Value,Fees,Date`) ist nicht Teil dieses Pakets und wird nicht erkannt.

### Abweichungen von der Vorlage (eToro)

- CFD-Zeilen (Asset type `CFD`, Overnight fee/refund) werden gemeldet; die Vorlage bucht CFD-Positionen als Kauf/Verkauf
  und Übernachtgebühren als Gebühr bzw. Zins. Krypto und andere Anlagearten außer Aktien/ETF werden ebenfalls gemeldet.
- Ein- und Auszahlungen werden gebucht statt übersprungen. Umrechnungsgebühren (`Deposit/Withdrawal Conversion Fee`)
  ändern laut den Beispielen weder `Balance` noch `Realized Equity`; sie sind im umgerechneten Betrag enthalten und
  werden als ignoriert gemeldet statt (wie in der Vorlage) zusätzlich als Gebühr gebucht. Gebührenzeilen werden nur mit
  einer Wirkung auf `Realized Equity Change` gebucht.
- Währung: Die Vorlage bucht zum Kurs `Amount / Units` in der Instrumentwährung aus `Details` (z. B. GBX). `Amount` ist
  aber USD (Kontowährung; Beispiel aus Issue #249: 1,000.00 für 75.34 Rolls-Royce-Aktien). Openfolio bucht Käufe und
  Verkäufe in USD und behält die Instrumentwährung (GBX bleibt GBX) in den Rohdaten.
- Zahlen: Die Vorlage nimmt `parseFloat` nach Ersetzen des ersten Kommas. Openfolio bestimmt das Dezimaltrennzeichen je
  Datei über alle Geldspalten (US-Format „1,000.00“, europäisch „ 1 757,95 “, Klammern für negative Werte) und lehnt
  gemischte oder nur mehrdeutige Werte mit Zeilennummer ab. Units „-“ bedeutet keine Stückzahl (Vorlage: 1).
- Datum: TT/MM/JJJJ wie bei eToro; ein Monat über 12 oder einstellige Tage/Monate (US-Excel) führen zu einem Fehler
  statt zu einem vertauschten Datum. Zeitzone laut Export, nicht umgerechnet.
- Kennung: eToro-Symbol als Wertpapierkennung, keine Yahoo-Suche (Issue #177: „IBE“ wurde falsch zugeordnet). Die
  Position-ID steht nur in den Rohdaten und wird nicht als Order-ID gesetzt, damit SDRT-Gebühren beim Zusammenführen
  nicht als doppelte Handelsgebühr entfallen.
- Copy-Trading: Positionen eines kopierten Traders stehen als eigene Open/Close-Zeilen im Blatt und werden gebucht;
  „Start Copy“ ohne Betrag wird übersprungen. Nicht investiertes Geld einer Kopie zählt daher weiter als Barbestand.
- Quellensteuer steht nur im Blatt „Dividends“ und wird nicht geschätzt; die Spalte `Balance` wird nicht als Kontostand
  übernommen, weil sie CFD-Margin, Krypto und Kopien nicht enthält.

### Abweichungen von der Vorlage (Freetrade)

- Ein- und Auszahlungen (`TOP_UP`, `WITHDRAWAL`) werden gebucht statt übersprungen; `MONTHLY_STATEMENT` wird als
  ignoriert gemeldet, unbekannte Typen mit Betrag oder ISIN als nicht übernommen.
- Käufe/Verkäufe werden mit `Total Amount` in Kontowährung gebucht (Cash-Effekt); Stempelsteuer und FX-Gebühr sind darin
  enthalten und werden als Gebühr des Handels ausgewiesen. Die Vorlage bucht zum Kurs in Instrumentwährung über eine
  Yahoo-Suche und rechnet bei GBp-Kursen ×100; Openfolio braucht weder Suche noch Umrechnung (ISIN steht im Export).
- Gratisaktien: Die Vorlage bucht einen Kauf zum Kurs ohne Gegenbuchung. Openfolio bucht den Kauf zum Wert in
  `Total Amount` und eine gleich hohe Bonus-Einzahlung, damit der Barbestand unverändert bleibt.
- Dividenden: Die Vorlage legt die Quellensteuer (in Instrumentwährung) im Gebührenfeld ab. Openfolio bucht den
  Nettobetrag in Kontowährung (`Total Amount`) brutto mit Steuer, wenn Brutto- und Nettobetrag im Export stehen
  (Brutto = Total × Brutto/Netto, Steuer = Differenz); fehlen sie (z. B. PROPERTY-Beispiel), wird netto gebucht und
  keine Steuer geschätzt. Buchungsdatum ist der Zeitstempel (Vorlage: Dividend Pay Date).
- Zahlen strikt mit Dezimalpunkt, Datum nur ISO; andere Formate führen zu einem Fehler mit Zeilennummer.

### Bericht und Abweichungen von der Vorlage (InvestEngine)

- Bericht: „Trading statement“ (Reports → Create report). Die Hilfe nennt keinen Spaltenaufbau; die Spalten stammen aus dem
  Beispiel der Vorlage, das aus einer Nutzerdatei (Issue #241) abgeleitet ist. Pflichtspalten für die Erkennung:
  `Security / ISIN`, `Transaction Type`, `Quantity`, `Share Price`, `Total Trade Value`, `Trade Date/Time`.
- Das Trading statement enthält nur Käufe und Verkäufe. Dividenden, Gebühren und Kontobewegungen stehen laut Hilfe im
  „Cash Statement“; dafür gibt es weder in der Vorlage noch öffentlich einen Spaltenaufbau, daher wird es nicht gelesen.
- Gebucht wird `Total Trade Value` als Cash-Effekt (Vorlage: `Share Price` als Kurs, Gebühr 0). ISIN aus dem kombinierten
  Feld, keine Yahoo-Suche; Zeilen ohne ISIN werden gemeldet. Andere Transaktionstypen werden gemeldet statt (wie in der
  Vorlage) mit undefiniertem Typ ausgegeben.
- Beträge nur in GBP mit „£“ (Tausenderkomma erlaubt), Datum `TT/MM/JJ` (Jahr 20JJ); andere Formate führen zu einem Fehler.

### Abweichungen von der Vorlage (Avanza)

- Ein- und Auszahlungen (`Insättning`, `Uttag`) werden gebucht statt übersprungen; Überträge zwischen eigenen Konten
  derselben Datei heben sich dadurch auf.
- `Utländsk källskatt` wird als Quellensteuer der Position gebucht (Vorlage: wegen ISIN übersprungen). `Övrigt` nur nach
  Beschreibung: Avkastningsskatt als Steuer, Rückerstattung von Fondsgebühren als positive Gebühr; andere `Övrigt`-Zeilen
  mit Stückzahl oder Betrag (z. B. Fondsumtausch zwischen zwei ISIN) werden gemeldet statt still übersprungen.
- Handel: `Belopp` ist der Cash-Effekt inklusive Courtage; in SEK wird das Courtage als Gebühr abgetrennt. Die Vorlage
  bucht Kurs in Instrumentwährung plus Courtage in SEK als Gebühr der Instrumentwährung. Bei Fremdwährungskonten bleibt
  das Courtage im Betrag (Währung nicht gleich).
- Konten: Die Spalte `Konto` ist Teil des Schlüssels, damit gleiche Zeilen verschiedener Konten nicht zusammenfallen. Alle
  Konten landen in einem Depot (eine Kontoauswahl beim Export ist nicht belegt).
- Zahlen strikt mit Dezimalkomma ohne Tausendertrennzeichen; keine Standardwährung SEK für Zeilen ohne Währung
  (Vorlage), solche Zeilen mit Betrag werden gemeldet.

### Abweichungen von der Vorlage (Directa)

- Ein- und Auszahlungen (`Conferimento`, `Bonifico`, `Prelievo`) und `Bollo` werden gebucht statt übersprungen;
  `Finanziamento` wird gemeldet.
- Einbehaltene Steuern (`Rit.provento`, `Rit.cedola`, …) werden als Quellensteuer der Position gebucht, Ritenuta su
  plusvalenza und Tobin tax als Steuer (Vorlage: alle als Gebühr). Stückzinsen (`Ratei`) als Zins mit Vorzeichen.
- Handel mit `Importo euro` als Cash-Effekt (Vorlage: Betrag ohne Vorzeichen / Stückzahl als Kurs). Anleihen werden nicht
  über Namensbestandteile („btp“, „romania“) erkannt und umgerechnet, sondern mit der Stückzahl der Datei gebucht.
- Zeilen mit unbekanntem Typ werden gemeldet; die leere Schlusszeile wird als ignoriert gezählt. Buchungsdatum ist die
  Data operazione (Vorlage: Data valuta), die Data valuta bleibt in den Rohdaten.
- Kopfzeilen werden wie in PR #292 übersprungen; Zeilennummern im Bericht entsprechen der Datei, auch wenn Kopfzeilen nur
  aus Kommas bestehen (`readCsvLines`). Das Konto aus „Conto : …“ ist Teil des Schlüssels.
- Zahlen strikt mit Dezimalpunkt; ungültige Datumsangaben (z. B. `33-09-2024` in der Data operazione) führen zu einem Fehler.

### Abweichungen von der Vorlage (Disnat)

- Einzahlungen (Cotisation, REEE-Zuschüsse, IQEE, Barüberträge) und Auszahlungen (Résiliation, Retrait) werden gebucht
  statt übersprungen. Überträge mit Symbol oder Stückzahl (Wertpapierüberträge) werden gemeldet.
- `Retenue` wird als Quellensteuer der Position gebucht, Frais und die Umsatzsteuern TPS/TVQ auf Gebühren als Gebühr
  (Vorlage: alles als Gebühr).
- Handel mit `Montant de l'opération` als Cash-Effekt; die Kommission wird nur abgetrennt, wenn Stückzahl × Kurs ±
  Kommission den Betrag ergibt (gleiche Währung). Die Vorlage bucht Kurs und Kommission unabhängig vom Betrag.
- Wertpapier unter dem Disnat-Symbol ohne „-C“ (die Vorlage setzt „.TO“ für Yahoo); so gehören `CASH-C` (Handel) und
  `CASH` (Dividende) zusammen. Keine ISIN, kein Yahoo-Suffix wird erfunden.
- Buchungsdatum ist die Date de transaction, sonst die Date de règlement (Vorlage: immer Date de règlement; ohne Datum
  das heutige Datum). Zahlenformat je Datei (Dezimalkomma oder -punkt), gemischte Werte führen zu einem Fehler.

### Abweichungen von der Vorlage (Finpension)

- 3a und BVG werden getrennt erkannt (Variante im Bericht) und getrennt getestet; beide teilen sich die Spalten.
- Einzahlungen und Auszahlungen (Deposit, Withdraw…) werden gebucht statt übersprungen; „Transfer vested benefits“
  (in der Vorlage nicht behandelt und damit ohne Typ ausgegeben) als Ein- oder Auszahlung nach Vorzeichen.
- Handel mit dem Cash Flow als Betrag (Vorlage: Anteile × Kurs in CHF). Wie in der Vorlage bestimmt bei „Portfolio
  Transaction“ das Vorzeichen des Cash Flow die Richtung; bei Buy/Sell müssen Anteile und Cash Flow zusammenpassen.
- Die Spalte Balance wird als Tagesendsaldo übernommen (Export neueste Zeile zuerst); unbekannte Kategorien mit
  Betrag werden gemeldet, Kategorien ohne Wirkung übersprungen.
- Zahlen mit Dezimalpunkt (Tausenderkomma erlaubt, wie in der PP-Vorlage), Datum nur ISO; sonst Fehler mit Zeilennummer.

### Abweichungen von der Vorlage (Scalable Capital)

- Abstimmung statt Ableitung: PP setzt den Endbetrag als Buchungsbetrag und leitet Gebühren und Steuern einzeln ab.
  Openfolio bucht eine Abrechnung nur, wenn Kurswert ± Gebühren ± Steuern genau den Endbetrag ergeben, und meldet sie
  sonst (ebenso bei unbekannten Buchungszeilen) als nicht übernommen.
- Steuern auf Verkäufe und die Finanztransaktionssteuer werden als eigene Steuerbuchung der Position geführt, nicht im
  Handelsbetrag; Dividenden brutto mit Quellensteuer und deutschen Steuern als einbehaltene Steuern der Position.
- Handelsdatum ist der Ausführungstag (PP: Ausführungszeitpunkt), Dividenden zur Wertstellung wie bei PP.
- Kennung: Order- und Geschäftsnummer (Baader: Vorgangsnummer); Dividenden über ISIN, Buchungs- und Valutadatum und
  Bruttobetrag. Teilausführungen einer Order haben verschiedene Geschäftsnummern und bleiben getrennt.
- Kontoauszüge (Verrechnungskonto) bucht PP für Ein-/Auszahlungen, Zinsen und Prime-Gebühren. Openfolio meldet sie in
  diesem Schritt als nicht übernommen; Ein- und Auszahlungen müssen vorerst manuell erfasst werden.
- Reklassifizierungen mit Belastung lehnt PP ebenfalls ab; Openfolio meldet sie.
- Steuererstattungen beim Verkauf („Steuern +…“) werden als positive Steuerbuchung gebucht; PP verrechnet sie mit dem
  Verkaufserlös.
- Baader: Nur Wertpapierabrechnungen und Ausschüttungen/Dividenden auf Deutsch. Bei Fremdwährungsausschüttungen wird der
  Bruttobetrag in Kontowährung gebucht, der Betrag in Fondswährung bleibt in den Rohdaten. Stornos werden gemeldet.
- Überschneidung mit CSV: Openfolio hat keinen Scalable-CSV-Import; der CSV-Export für Prime-Kunden ist eine offene Lücke.
  Ein späterer CSV-Import müsste dieselben Kennungen verwenden, sonst darf er nicht ins selbe Depot.

### Abweichungen von der Vorlage (flatex)

- Abstimmung: Eine Abrechnung wird nur gebucht, wenn Kurswert ∓ Provision, eigene und fremde Spesen ∓ einbehaltene Steuer
  genau den Endbetrag ergeben. PP übernimmt die Felder einzeln; Openfolio meldet nicht abstimmbare Abrechnungen.
- Steuern auf Verkäufe sind eine eigene Steuerbuchung; negative Werte (Erstattung aus dem Verlusttopf) werden als positive
  Steuer gebucht statt mit dem Erlös verrechnet.
- Anleihen (Kurs in Prozent, Nominal statt Stück, Stückzinsen) bucht PP; Openfolio meldet sie, weil Stückzahl und
  Stückzinsen im Ledger noch kein Gegenstück haben.
- Dividenden in Fremdwährung: Quellensteuer und Gebühren werden zum angegebenen Devisenkurs in die Kontowährung umgerechnet;
  der Bruttobetrag ist der Rest bis zum Endbetrag und muss auf 2 Cent zum umgerechneten Bruttobetrag passen.
- Thesaurierende Fonds: nur die einbehaltene Steuer (wie PP und Parqet). Negative Ausschüttungen und Stornos werden gemeldet.
- Kennung: Auftragsnummer mit Teilausführung („…/1“) und Transaktionsnummer des Steuerreports. Gäbe es zu einer
  Ausführung Sammel- und Einzelabrechnung mit denselben Nummern, würde sie nur einmal gebucht (nicht mit Originalen geprüft).
- Quelle `flatex`: DEGIRO-CSV-Buchungen tragen die (historische) Quelle `Flatex`; beide werden nicht gegeneinander
  dedupliziert. DEGIRO-Dokumente derselben Bank (Dutch Branch, DEGIRO B.V.) werden nicht als flatex erkannt.
- Nicht übernommen wie bei PP: Krypto-Sammelabrechnungen, Devisen-Sammelabrechnungen, Depotein-/-ausgänge,
  Kapitalmaßnahmen, Stockdividenden und Kontoauszüge (PP bucht aus Kontoauszügen Ein- und Auszahlungen und Zinsen).
- Überschneidung mit CSV: flatex bietet keinen Wertpapier-CSV-Export, den Openfolio liest; der Saldo-Import aus dem
  DEGIRO-`Account.csv` betrifft nur Kontostände, keine Buchungen.

### Abweichungen von der Vorlage (ING Deutschland)

- Abstimmung: Eine Abrechnung wird nur gebucht, wenn Kurswert (bzw. umgerechneter Betrag) ∓ Entgelte ∓ Steuern genau den
  Endbetrag ergeben. PP übernimmt die Felder einzeln; Openfolio meldet nicht abstimmbare Abrechnungen.
- Nur ING Deutschland: `ING BANK NV` (Spanien, PP-Dokumente `Compra`/`Dividendos`/`Venta`) wird nicht erkannt und fällt als
  unbekanntes Format auf.
- Steuern auf Verkäufe sind eine eigene Steuerbuchung; die französische Finanztransaktionssteuer gilt wie bei PP als Steuer.
- Rabatte (Sparplan auf Fonds) mindern den Kaufbetrag, statt als positive Gebühr zu erscheinen.
- Anleihen (Nominale in Währung, Stückzinsen, Kurs in Prozent) bucht PP; Openfolio meldet sie wie bei flatex. Zinsgutschriften
  auf Anleihen werden als Zinsen gebucht, damit das Cash stimmt.
- Stornos (`*** Storno ***`, „Sie erhalten eine neue Abrechnung“) lehnt PP bei Erträgen ebenfalls ab; Openfolio meldet sie
  für alle Dokumentarten. Wurde die ursprüngliche Abrechnung schon importiert, muss sie von Hand korrigiert werden.
- Kennung: Ordernummer mit Ausführungstag, -zeit und Stückzahl, weil Teilausführungen dieselbe Ordernummer tragen können.
  Rückzahlungen ohne Ordernummer: ISIN und Fälligkeit. Erträge: ISIN, Valuta und Gesamtbetrag.
- Kontoauszüge bucht PP (Ein-/Auszahlungen, Zinsen, Steuern); Openfolio meldet sie, damit nichts doppelt zu den Abrechnungen
  gebucht wird. Ein- und Auszahlungen müssen vorerst manuell erfasst werden.
- Einen ING-CSV-Import gibt es nicht; Überschneidungen mit einem anderen Importweg bestehen nicht.

### Abweichungen von der Vorlage (comdirect)

- Zwei Dokumente je Vorgang: Die Abrechnung endet bei „vor Steuern“, die Steuermitteilung nennt Steuern und „nach Steuern“.
  PP führt beide zu einer Buchung zusammen. Openfolio liest jede Datei einzeln, deshalb liefert jedes Dokument seinen Teil:
  Handel und Gebühren aus der Abrechnung, die Steuer als eigene Buchung aus der Steuermitteilung. Gemeinsam ergeben sie den
  Endbetrag, unabhängig von der Reihenfolge und davon, ob sie in einer oder zwei Dateien liegen.
- Dividenden: Die Entscheidung fällt auf die **Steuermitteilung**. Sie enthält, was aufs Konto ging, und Parqet nimmt seit
  Januar 2026 nur noch sie an. Die Gutschrift mit „vor Steuern“ wird ignoriert, mit Hinweis im Bericht, sodass jede Dividende
  genau eine Quelle hat. Folge: Der Bruttobetrag ist „vor Steuern“ plus angerechnete Quellensteuer; nicht anrechenbare
  Quellensteuer und der Betrag in Fremdwährung stehen nur in der Gutschrift. PP übernimmt sie von dort. Gutschriften ohne
  „vor Steuern“ (bis 2008) sind endgültig und werden gebucht, solange sie in Kontowährung lauten.
- Ausführungsbestätigungen („Die Abrechnung lassen wir … folgen“) bucht PP als Verkauf; Openfolio überspringt sie, weil sie
  keine Abrechnung sind. Sonst stünde derselbe Verkauf ohne gemeinsame Kennung doppelt im Depot.
- Überschneidung mit der API: Beide Wege nutzen die Quelle `comdirect`, PDF-Kennungen beginnen mit `comdirect-pdf:`. Eine
  gemeinsame Kennung gibt es nicht. `comdirectOverlap.ts` gleicht daher Handel über Tag, ISIN und Stückzahl ab und Erträge
  über den Nettobetrag innerhalb von 5 Tagen (fehlt der API die ISIN, genügen Betrag und Datum). Je Buchung deckt genau eine
  der Gegenseite, gleiche Trades eines Tages bleiben also getrennt. Es bleibt die zuerst vorhandene Buchung: Liegt der API-Trade
  schon vor, fehlt dessen Gebühr; die Steuer aus der Steuermitteilung kommt trotzdem hinzu, weil die API sie nicht liefert.
  Vorabpauschale und Gebühren werden nicht abgeglichen. Das Verhalten ist nur synthetisch geprüft; ob API-`transactionValue`,
  Geschäftstag und Verwendungszweck in echten Daten so aussehen, steht aus.
- Kennung: Rechnungsnummer der Abrechnung, Referenz-Nummer der Steuermitteilung; bei fehlender Nummer ISIN, Datum und Stückzahl.
- Anleihen (Nennwert in Währung) wie bei flatex nicht gebucht. Finanzreport und Verwahrentgelt bucht PP; Openfolio meldet sie, weil
  die API dieselben Kontobewegungen liefert und ein Abgleich dafür fehlt.

### Abweichungen von der Vorlage (Yuh)

- Erkennung: Swissquote Bank und der Name Yuh im Dokument. PP behandelt beide gleich; Openfolio liest hier nur Yuh-Belege,
  weil für normale Swissquote-Konten der CSV-Import besteht.
- Abstimmung: Betrag ∓ Kommission ∓ Stempelsteuer ± Trading Credit muss den belasteten oder gutgeschriebenen Betrag ergeben.
- Trading Credit: PP weist die volle Kommission als Gebühr aus und verringert den Bruttowert. Openfolio bucht den Bruttowert
  des Belegs und als Gebühr nur, was tatsächlich bezahlt wurde (Kommission minus Credit).
- Stempelsteuer ist wie bei PP Steuer, aber eine eigene Buchung. Die Summenzeile der Zinsabrechnung wird nicht verwendet,
  weil sie bei Fremdwährungen in CHF steht (PP übernimmt dort den CHF-Wert als Fremdwährungsbetrag).
- Zinsen werden brutto mit Verrechnungssteuer als eigener Buchung übernommen; Nullzeilen entfallen.
- Handel in Fremdwährung: Die Abstimmung läuft in der Abrechnungswährung; `fxRate` wird aus beiden Beträgen errechnet, weil
  Swissquote Kurse teils skaliert druckt. Nur am deutschen Swissquote-Layout belegt, nicht an einem Yuh-Original.
- Englische Dividenden- und Zahlungsbelege: PP kennt nur die deutschen Bezeichnungen. Sie werden gemeldet, nicht erraten.

### Abweichungen von der Vorlage (CommSec)

- Dokumentart: PP kennt nur Bestätigungen („WE HAVE BOUGHT/SOLD“). Die Klasse deckt keine Dividenden, Bestände oder CommSec
  International ab; deshalb behauptet Openfolio dafür nichts.
- GST: PP bucht `TOTAL GST` als Steuer zusätzlich zur Gebühr und drückt damit den Bruttowert. `BROKERAGE & COSTS INCL GST` enthält
  die GST bereits; Openfolio bucht Consideration plus Brokerage, was genau `TOTAL COST` beziehungsweise `NET PROCEEDS` ergibt.
- Stückzahl aus `TOTAL UNITS`, damit Teilausführungen mit mehreren Kurszeilen stimmen; PP liest die erste Kurszeile.
- `APPLICATION MONEY` ungleich 0 wird gemeldet; PP bucht es als Gebühr, die Bedeutung ist aber nicht belegt.
- Wertpapier unter dem ASX-Code im Feld `isin` wie bei XTB oder Schwab; keine ISIN und kein geratener Yahoo-Suffix.

### Abweichungen von der Vorlage (Questrade)

- Abstimmung: Der Auszug führt je Aktivität eine Tabelle zwischen Opening und Closing balance. Openfolio prüft je Tabelle und Währung,
  ob die Netto-Spalte aufgeht, und meldet sonst die Tabelle. PP liest Zeilen einzeln. Einige PP-Testdokumente sind zusammengesetzt und
  gehen deshalb nicht auf; `AccountStatement01`, `Buy01/02`, `Dividend01–03` stimmen.
- Währung: PP nimmt für jede Zeile die Summenwährung des Auszugs. Openfolio liest die Spaltengruppe CAD oder USD der Zeile; USD-Zeilen
  sind nur aus dem Tabellenkopf abgeleitet.
- Verkäufe im Auszug: PP bucht nur `Buy`. Openfolio bucht `Sell` spiegelbildlich und prüft das Vorzeichen; nicht an einem Original belegt.
- Offene Trades (Abschnitt 05): PP bucht sie; Openfolio überspringt sie mit Meldung, sie stehen im Folgemonat in den Transaktionen.
- Kennung: Report und Auszug tragen keine gemeinsame Nummer, deshalb Konto, Datum, Richtung, Symbol, Stückzahl und Nettobetrag, bei Wiederholung
  im Dokument mit Zähler. Fasst der Auszug Teilausführungen zusammen, greift das nicht; die Anleitung rät zu einer Dokumentart je Zeitraum.
- Report-Datum `TT-MM-JJ` wie bei PP, im Auszug `MM-TT-JJJJ`. Der Punkt vor kanadischen Symbolen entfällt, die Währung geht an die Suche.
