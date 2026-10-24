# Openfolio

Lokaler Portfolio-Tracker: Depots, Dividenden und Performance aus Broker-Exporten (DEGIRO/flatex, generische CSV), ohne Cloud. Projekte werden als `.openfolio`-Datei auf dem eigenen Rechner gespeichert, auf Wunsch mit Passwort verschlüsselt (AES-256-GCM).

## Entwicklung

Voraussetzung: Node.js ≥ 20 (siehe `.nvmrc`).

```bash
npm ci
npm run dev      # http://localhost:3000
```

Vor jedem Pull Request (läuft auch in der CI):

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

## Aufbau

- `src/lib/domain/` – reine Rechenlogik ohne React (Wechselkurse, Ledger). Berechnungen gehören hierher, nicht in Komponenten.
- `src/lib/csvParser.ts`, `src/lib/importMerge.ts` – Import und Deduplizierung.
- `src/lib/projectPersistence.ts`, `src/lib/projectCrypto.ts` – Projektdatei (SQLite) und Verschlüsselung.
- `src/app/api/` – lokale API-Routen (ECB-Kurse, Yahoo Finance, Ticker-Suche).

## Datenschutz

Keine echten Broker-Exporte ins Repository legen. `*.csv`, `*.openfolio` und `*.sqlite*` sind ignoriert; Testdaten liegen synthetisch unter `src/lib/__tests__/fixtures/`.
