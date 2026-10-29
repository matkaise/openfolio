// Text layer of a PDF as lines in reading order. Broker settlements are laid out in
// columns ("Kurswert : 1.690,00 EUR" next to "Kurs : 92,25 EUR"); the extraction joins
// everything on one baseline into one line, left to right, the way the documents read
// and the way Portfolio Performance's extractors (PDFBox, sorted by position) see them.

/** One text run of a page as pdf.js reports it, in PDF points (origin bottom left). */
export interface PdfTextItem {
    str: string;
    x: number;
    y: number; // baseline
    width: number;
    height: number; // font size; 0 for whitespace runs pdf.js inserts
    rotated?: boolean;
}

/** Extracted text of one PDF: per page its lines from top to bottom. */
export interface PdfDocumentText {
    pages: string[][];
}

export type PdfReadErrorCode = 'noTextLayer' | 'pdfEncrypted' | 'pdfUnreadable';

/** A PDF that cannot be read (scan without text layer, password, broken file). */
export class PdfReadError extends Error {
    constructor(public readonly code: PdfReadErrorCode, cause?: unknown) {
        super(code, cause === undefined ? undefined : { cause });
        this.name = 'PdfReadError';
    }
}

/** Items closer than this fraction of the font size share a line (sub-/superscripts, rounding). */
const SAME_LINE = 0.45;
/** A horizontal gap wider than this fraction of the font size separates two words. */
const WORD_GAP = 0.15;

/**
 * Groups the text runs of one page into lines: same baseline (within tolerance), ordered
 * left to right, separated by one space where the runs have a gap. Rotated text (margin
 * notes printed vertically) is left out; whitespace is collapsed.
 */
export const layoutLines = (items: PdfTextItem[]): string[] => {
    const runs = items
        .filter((item) => !item.rotated && item.str.trim() !== '')
        .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; size: number; runs: PdfTextItem[] }[] = [];
    runs.forEach((run) => {
        const size = run.height || 10;
        const line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= SAME_LINE * Math.max(size, candidate.size));
        if (line) line.runs.push(run);
        else lines.push({ y: run.y, size, runs: [run] });
    });
    return lines
        .sort((a, b) => b.y - a.y)
        .map((line) => {
            const ordered = line.runs.sort((a, b) => a.x - b.x);
            let text = '';
            let end = -Infinity;
            ordered.forEach((run) => {
                const gap = run.x - end;
                if (text && gap > WORD_GAP * (run.height || line.size)) text += ' ';
                text += run.str;
                end = Math.max(end, run.x + run.width);
            });
            return text.replace(/\s+/g, ' ').trim();
        })
        .filter(Boolean);
};

/** Every line of the document with its page and its line number on that page (both from 1). */
export const pdfLines = (doc: PdfDocumentText): { page: number; line: number; text: string }[] => (
    doc.pages.flatMap((lines, pageIndex) => lines.map((text, lineIndex) => ({ page: pageIndex + 1, line: lineIndex + 1, text })))
);

/** The document as plain text: lines joined by newlines, pages too. */
export const pdfPlainText = (doc: PdfDocumentText): string => doc.pages.map((lines) => lines.join('\n')).join('\n');

export const hasTextLayer = (doc: PdfDocumentText): boolean => doc.pages.some((lines) => lines.length > 0);

/** `%PDF-` within the first bytes; the file name is not used to recognise a PDF. */
export const isPdfData = (head: Uint8Array): boolean => {
    const text = String.fromCharCode(...head.subarray(0, 1024));
    return text.includes('%PDF-');
};
