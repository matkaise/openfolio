import Papa from 'papaparse';

// CSV reading for broker file importers. Papa Parse handles quotes, escaped quotes,
// line breaks inside quoted cells and CRLF/LF; this module adds what every importer
// needs on top: BOM removal, trimmed cells and finding the header row.

/** Rows of a CSV file. Empty lines are dropped; cells are trimmed. */
export const readCsv = (text: string, delimiter: string): string[][] => {
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
        delimiter,
        skipEmptyLines: 'greedy'
    });
    return parsed.data.map((row) => row.map((cell) => cell.trim()));
};

/** Header names compared without case, accents, spaces and punctuation ("Stückpreis" -> "stuckpreis"). */
export const normalizeHeader = (value: string): string => value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** Index of the first row whose normalized cells contain all `required` names, or -1. */
export const findHeaderRow = (rows: string[][], required: string[], maxRow = 20): number => {
    const wanted = required.map(normalizeHeader);
    for (let index = 0; index < Math.min(rows.length, maxRow); index += 1) {
        const cells = new Set(rows[index].map(normalizeHeader));
        if (wanted.every((name) => cells.has(name))) return index;
    }
    return -1;
};

/**
 * Delimiter and header row of a file whose header holds all `required` names, or null.
 * For exports users convert from Excel themselves: the delimiter then depends on their
 * Excel locale. Only the first lines are read, so detection stays cheap on large files.
 */
export const locateHeader = (text: string, required: string[], delimiters = [',', ';', '\t']): { delimiter: string; row: number; header: string[] } | null => {
    const head = text.replace(/^\uFEFF/, '').split(/\r?\n/, 20).join('\n');
    for (const delimiter of delimiters) {
        const rows = readCsv(head, delimiter);
        const row = findHeaderRow(rows, required);
        if (row >= 0) return { delimiter, row, header: rows[row] };
    }
    return null;
};

/** Column lookup by header name; the first matching alias wins. */
export const columnIndex = (header: string[]) => {
    const positions = new Map<string, number>();
    header.forEach((name, index) => {
        const key = normalizeHeader(name);
        if (key && !positions.has(key)) positions.set(key, index);
    });
    return (...aliases: string[]): number => {
        for (const alias of aliases) {
            const index = positions.get(normalizeHeader(alias));
            if (index !== undefined) return index;
        }
        return -1;
    };
};

/**
 * A number written with "." as decimal separator and no thousands separator ("-1234.5").
 * Anything else is NaN, so a file in an unexpected number format fails visibly instead
 * of being read wrong.
 */
export const parseDotDecimal = (value: string | undefined): number => {
    const raw = (value || '').trim();
    if (!/^[-+]?\d+(\.\d+)?$/.test(raw)) return Number.NaN;
    return Number(raw);
};

/**
 * A number in US format: "." as decimal separator, optional "," thousands separators,
 * an optional "$" and negatives as "-" or in parentheses ("-$1,259.59", "($0.40)", "500,135").
 * Anything else is NaN.
 */
export const parseUsNumber = (value: string | undefined): number => {
    let raw = (value || '').trim();
    const parenthesized = /^\((.*)\)$/.exec(raw);
    if (parenthesized) raw = parenthesized[1].trim();
    const match = /^([-+]?)\$?([-+]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/.exec(raw);
    if (!match || (match[1] && match[2])) return Number.NaN;
    const number = Number(`${match[3].replace(/,/g, '')}${match[4] || ''}`);
    return (parenthesized || match[1] === '-' || match[2] === '-') ? -number : number;
};
