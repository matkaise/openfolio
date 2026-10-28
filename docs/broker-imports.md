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
| Swissquote | CSV `;`: `en-13`, `en-15`, `de-15`, `de-13` | Käufe/Verkäufe (Kosten als Gebühr), Dividenden (netto), Depotgebühren, Zinsen, Steuerauszugskosten, Payment/Credit/Debit, Forex credit/debit, Umrechnung bei abweichender Kontowährung, Tagessalden | Transfer in/out, Splits, Bezugsrechte und andere unbekannte Typen; Zeilen ohne ISIN |

## Quellen und Lizenzen

Es wurde kein Quellcode übernommen. Aus den Projekten stammen nur Formatwissen (Spaltennamen,
Buchungstypen, Exportwege), das in eigenem Code umgesetzt ist.

| Importer | Quelle | Stand | Lizenz | Verwendet |
|---|---|---|---|---|
| Swissquote | [Export-To-Ghostfolio](https://github.com/dickwolff/Export-To-Ghostfolio) `src/converters/swissquoteConverter.ts`, `samples/swissquote-export.csv`, Issue #138 | Commit `9e35bd602f054f563b8c728bcb36dc5eb2bbcaa5` (geprüft 28.10.2026) | Apache-2.0 | Spaltennamen der englischen und deutschen Variante, Buchungstypen, Exportweg, Hinweis zur Anzeigesprache |
| Swissquote | [Parqet FAQ](https://faq.parqet.com/de/articles/714176-swissquote-csv-import) | 28.10.2026 | – (Dokumentation) | Exportweg, Hinweis auf fehlende Steuerausweisung, Typ „Transfer in“ |
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
