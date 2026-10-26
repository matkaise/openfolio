import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards against UI text written directly into components instead of the messages
// (src/lib/i18n/messages). Comments are ignored; brand and format names are allowed.

const ROOTS = ['src/components', 'src/app', 'src/contexts'];
const GERMAN = /[äöüÄÖÜß]|(?:['">`]|^\s+)(?:Abbrechen|Speichern|Bitte|Keine?|Noch|Neue[sn]?|Alle|Depot|Buchung|Wertpapier|Datei|Weiter|Zurück|Suchen|Erstellen|Verbinden|Gewinn|Rendite|Zeitraum)\b/;

const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : files(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
});

const codeLines = (source: string) => source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .split('\n')
    .map((line, index) => ({ line: line.replace(/(^|[^:'"`])\/\/.*$/, '$1'), number: index + 1 }));

describe('i18n coverage', () => {
    it('has no German UI text outside the messages', () => {
        const offenders = ROOTS.flatMap(files).flatMap((file) => (
            codeLines(readFileSync(file, 'utf8'))
                .filter(({ line }) => GERMAN.test(line))
                .map(({ line, number }) => `${file}:${number}: ${line.trim()}`)
        ));
        expect(offenders).toEqual([]);
    });
});
