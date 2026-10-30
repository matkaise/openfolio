import { pdfLines, type PdfDocumentText } from '@/lib/pdf/pdfText';
import type { ImportEntry } from './entries';
import { batchPeriod, type FileImportResult, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Helpers for PDF importers: one PDF is one document (a settlement, a dividend notice,
// ...). An importer turns it into bookings or reports it with its title. Amounts are
// only booked when they add up to the amount the document settles, so a layout the
// importer does not fully understand is reported instead of booked wrongly.

export type DocLine = { page: number; line: number; text: string };

export const documentLines = (pdf: PdfDocumentText): DocLine[] => pdfLines(pdf);

/** First line from `from` on that matches, with its index and match. */
export const findLine = (lines: DocLine[], pattern: RegExp, from = 0, to = lines.length): { index: number; match: RegExpExecArray } | null => {
    for (let index = Math.max(0, from); index < Math.min(to, lines.length); index += 1) {
        const match = pattern.exec(lines[index].text);
        if (match) return { index, match };
    }
    return null;
};

export type DecimalStyle = 'de' | 'en';

/**
 * An amount as printed: "1.176,42" (de) or "1,176.42" (en), optional sign. Thousands
 * separators must group three digits; anything else is NaN rather than a guess.
 */
export const parseAmount = (raw: string, style: DecimalStyle): number => {
    const value = raw.trim();
    const [thousands, decimal] = style === 'de' ? ['.', ','] : [',', '.'];
    const escaped = (char: string) => `\\${char}`;
    const pattern = new RegExp(`^([+-]?)(\\d{1,3}(?:${escaped(thousands)}\\d{3})*|\\d+)(?:${escaped(decimal)}(\\d+))?$`);
    const match = pattern.exec(value);
    if (!match) return Number.NaN;
    const number = Number(`${match[2].split(thousands).join('')}.${match[3] || '0'}`);
    return match[1] === '-' ? -number : number;
};

/** "12.12.2024" → "2024-12-12", null if not a valid date. */
export const parseDottedDate = (raw: string): string | null => {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
    if (!match) return null;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
};

export const roundCents = (value: number): number => Math.round(value * 100) / 100;

/** The parts add up to the total to the cent. */
export const reconciles = (parts: number[], total: number): boolean => (
    Math.abs(Math.round(parts.reduce((sum, part) => sum + part, 0) * 100) - Math.round(total * 100)) === 0
);

/** What an importer made of one document. */
export type DocumentOutcome =
    | { kind: 'booked'; entries: ImportEntry[] }
    | { kind: 'ignored' | 'unsupported'; label: string; at?: DocLine };

export const unsupported = (label: string, at?: DocLine): DocumentOutcome => ({ kind: 'unsupported', label, at });
export const ignored = (label: string, at?: DocLine): DocumentOutcome => ({ kind: 'ignored', label, at });

/** Import result of one PDF. */
export const documentResult = (importerId: string, source: string, variant: string, outcome: DocumentOutcome): FileImportResult => {
    const batch = emptyImportBatch(source);
    const notes: { ignored: ImportRowNote[]; unsupported: ImportRowNote[] } = { ignored: [], unsupported: [] };
    if (outcome.kind === 'booked') batch.entries.push(...outcome.entries);
    else notes[outcome.kind].push({ line: outcome.at?.line ?? 1, page: outcome.at?.page ?? 1, label: outcome.label });
    return { batch, report: { importerId, variant, period: batchPeriod(batch), rows: 1, ...notes } };
};
