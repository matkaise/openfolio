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
| Saxo | Transaktionsexport, aus Excel als CSV gespeichert (`,` oder `;`): `booked` (Booked Amount, 15 Spalten), `amount` (Amount, 13 Spalten) | Käufe/Verkäufe aus dem Buchungstext (Buy/Sell, Koop/Verkoop), Differenz zum gebuchten Betrag als Gebühr, Fremdwährungskäufe mit Umrechnung als interne FX-Buchungen, Dividenden (netto), Quellensteuer als eigene Zeile, Ein-/Auszahlungen, Gebühren, Zinsen | Kapitalmaßnahmen außer Dividenden, Derivate (`From Derivative` = Yes), unbekannte Texte, Zeilen ohne ISIN, umgerechnete Zeilen ohne bestimmbare Kontowährung; XLSX nicht direkt |

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
| Saxo | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `saxoConverter.ts`, `models/saxoRecord.ts`, `samples/saxo-export.csv`, Issues #155, #319 | Commit `9e35bd6` | Apache-2.0 | Spaltennamen beider Varianten, Ereignistexte, Datums- und Betragsformat des Beispiels, Exportweg |
| Saxo | [Saxo Help: Monitoring your Portfolio](https://www.help.saxo/hc/en-us/articles/360039762472-Monitoring-your-Portfolio) | 28.10.2026 | – (Dokumentation) | Bereich Transactions mit Filtern (Trades, Corporate actions, Cash transfers) und Export als PDF oder Excel |
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
