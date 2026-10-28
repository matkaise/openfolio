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

## Importer

| Importer | Formate / Varianten | Buchungsarten | Nicht übernommen (wird gemeldet) |
|---|---|---|---|
| DEGIRO | CSV, deutsch: `Transactions.csv`, `Account.csv` | Käufe/Verkäufe mit Gebühren, Dividenden, Steuern, Zinsen, Gebühren, Ein-/Auszahlungen, Währungswechsel, Salden | Kapitalmaßnahmen; englische Exporte werden nicht erkannt |
| Trading 212 | CSV-Verlaufsexport (`standard`, `utc`), Spalten nach Namen | Käufe/Verkäufe (Market/Limit/Stop) in Instrumentwährung, Kostenspalten als Gebühr, Dividenden (netto), Zinsen, Ein-/Auszahlungen, Currency conversion | Splits, Stock distribution, Transfer in/out, Kartenzahlungen; Zeilen ohne ISIN |
| Swissquote | CSV `;`: `en-13`, `en-15`, `de-15`, `de-13` | Käufe/Verkäufe (Kosten als Gebühr), Dividenden (netto), Depotgebühren, Zinsen, Steuerauszugskosten, Payment/Credit/Debit, Forex credit/debit, Umrechnung bei abweichender Kontowährung, Tagessalden | Transfer in/out, Splits, Bezugsrechte und andere unbekannte Typen; Zeilen ohne ISIN |
| Trade Republic | CSV „Transaktionsexport“: `comma` (Komma, gequotet), `semicolon` | Käufe/Verkäufe mit Gebühr (Sparpläne markiert), Steuer auf Verkäufe, Dividenden/Ausschüttungen brutto mit Steuer, Dividendenstornos, Zinsen mit Steuer, Anleihekupons, Endfälligkeit/Tilgung als Verkauf, Vorabpauschale, Steueroptimierung, Ein-/Auszahlungen, Überweisungen, Kartenzahlungen, Geschenke, Saveback/Prämien, Gebühren | Krypto (keine ISIN), Private-Markets-Vorauszahlungen, Splits, Fusionen, Umtausch, CFD, unbekannte Typen; Dateien mit mehreren Konten (`account_type`) werden abgelehnt |
| XTB | CSV aus dem Blatt „Cash Operations“ des XLSX-Exports: `cash-8`, `cash-10` (`;`, Dezimalkomma), `cash-8-comma`, `cash-10-comma` (`,`, Dezimalpunkt); früherer CSV-Export `legacy` | Käufe/Verkäufe von Aktien/ETFs (Stückzahl aus dem Kommentar, Wertpapier unter XTB-Kürzel), Dividenden, Quellensteuer als Steuer, Finanztransaktionssteuer, Kommission/SEC-Gebühr, Zinsen und Zinssteuer, Ein-/Auszahlungen; Umbuchungen zwischen Unterkonten derselben Datei heben sich auf | CFD (Close trade, Profit/Loss, Swap/Rollover, CFD-Dividendenausgleich), Spin-offs, Überträge zu anderen Konten, unbekannte/nicht englische Typen; ohne Währung im Dateinamen wird die Datei abgelehnt |

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
| DEGIRO | [Export-To-Ghostfolio README](https://github.com/dickwolff/Export-To-Ghostfolio#degiro) | Commit `9e35bd6` | Apache-2.0 | Exportweg Kontoübersicht |

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
