import { describe, expect, it } from 'vitest';
import { extractPdfText } from '../extractPdfText';
import { isPdfData, layoutLines, pdfLines, pdfPlainText, PdfReadError, type PdfTextItem } from '../pdfText';
import { nodePdfjs } from './nodePdfjs';
import { pdfFromLines, syntheticPdf } from './syntheticPdf';

const run = (str: string, x: number, y: number, extra: Partial<PdfTextItem> = {}): PdfTextItem => ({
    str, x, y, width: str.length * 5, height: 10, ...extra
});

const codeOf = async (promise: Promise<unknown>) => {
    try {
        await promise;
    } catch (error) {
        return error instanceof PdfReadError ? error.code : String(error);
    }
    return null;
};

describe('layoutLines', () => {
    it('joins runs on one baseline left to right and orders lines top to bottom', () => {
        const lines = layoutLines([
            run('1.690,00 EUR', 450, 700),
            run('Kurs :', 50, 700),
            run('Wertpapierabrechnung Kauf', 50, 720),
            run('92,25 EUR', 130, 700.8), // slightly off baseline, same line
            run('Kurswert :', 300, 699.5)
        ]);
        expect(lines).toEqual(['Wertpapierabrechnung Kauf', 'Kurs : 92,25 EUR Kurswert : 1.690,00 EUR']);
    });

    it('keeps adjoining runs of one word together and drops whitespace and rotated runs', () => {
        const lines = layoutLines([
            run('Ausf', 50, 700, { width: 20 }),
            run('ührung', 70, 700),
            run(' ', 100, 700, { height: 0 }),
            run('12.12.2024', 110, 700),
            run('Seitenrand', 10, 400, { rotated: true })
        ]);
        expect(lines).toEqual(['Ausführung 12.12.2024']);
    });
});

describe('extractPdfText (pdf.js)', () => {
    it('reads columns, umlauts and the euro sign in page and line order', async () => {
        const data = pdfFromLines([
            ['Wertpapierabrechnung Kauf', [[50, 'Kurs :'], [130, '92,25 €'], [300, 'Kurswert :'], [450, '1.690,00 EUR']], 'Solidaritätszuschlag 0,14 EUR'],
            ['Seite 2 / 2', 'Gesamt 50,51 EUR']
        ]);
        const doc = await extractPdfText(data, await nodePdfjs());
        expect(doc.pages).toEqual([
            ['Wertpapierabrechnung Kauf', 'Kurs : 92,25 € Kurswert : 1.690,00 EUR', 'Solidaritätszuschlag 0,14 EUR'],
            ['Seite 2 / 2', 'Gesamt 50,51 EUR']
        ]);
        expect(pdfLines(doc)[3]).toEqual({ page: 2, line: 1, text: 'Seite 2 / 2' });
        expect(pdfPlainText(doc).split('\n')).toHaveLength(5);
    });

    it('sorts by position, not by the order of the content stream', async () => {
        const data = syntheticPdf([{ runs: [
            { x: 300, y: 700, text: 'rechts' },
            { x: 50, y: 650, text: 'unten' },
            { x: 50, y: 700, text: 'links' }
        ] }]);
        expect((await extractPdfText(data, await nodePdfjs())).pages).toEqual([['links rechts', 'unten']]);
    });

    it('rejects a scan without text layer, a password protected and a broken file', async () => {
        const pdfjs = await nodePdfjs();
        expect(await codeOf(extractPdfText(syntheticPdf([{ runs: [], imageOnly: true }]), pdfjs))).toBe('noTextLayer');
        expect(await codeOf(extractPdfText(syntheticPdf([{ runs: [{ x: 50, y: 700, text: 'geheim' }] }], { encrypted: true }), pdfjs))).toBe('pdfEncrypted');
        expect(await codeOf(extractPdfText(new TextEncoder().encode('%PDF-1.4\nkaputt'), pdfjs))).toBe('pdfUnreadable');
    });

    it('leaves the caller\'s bytes intact', async () => {
        const data = pdfFromLines([['Hallo']]);
        const copy = data.slice();
        await extractPdfText(data, await nodePdfjs());
        expect(data).toEqual(copy);
    });

    it('recognises PDFs by their header', () => {
        expect(isPdfData(pdfFromLines([['x']]))).toBe(true);
        expect(isPdfData(new TextEncoder().encode('Datum;Betrag\n'))).toBe(false);
    });
});
