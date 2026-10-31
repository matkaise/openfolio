import { describe, expect, it } from 'vitest';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines, syntheticPdf } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import { dkbFileImporter } from '../dkb';
import type { ImportEntry } from '../entries';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import * as docs from './pdf/dkbDocuments';
import { ingBuy } from './pdf/ingDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

// Synthetic documents go through the real PDF extraction before the importer sees them
const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => dkbFileImporter.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const labels = (notes: { label: string }[]) => notes.map((note) => note.label);
const target = { id: 'p1', name: 'DKB', isNew: true };

describe('DKB PDF detection', () => {
    it('recognises DKB documents', async () => {
        expect(dkbFileImporter.detect(await extract(docs.dkbBuy()))).toBe('dkb');
        expect(detectPdfImporter(await extract(docs.dkbDividend()))?.id).toBe('dkb');
        expect(detectPdfImporter(await extract(docs.dkbStatement()))?.id).toBe('dkb');
    });

    it('leaves other banks alone', async () => {
        expect(dkbFileImporter.detect(await extract(ingBuy()))).toBeNull();
    });
});

describe('DKB settlements', () => {
    it('reads a fund purchase', async () => {
        const { batch, report } = await parse(docs.dkbBuy());
        expect(report).toMatchObject({ importerId: 'dkb', variant: 'dkb', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2025-03-06', 'buy', 'LU00DTEST012', 29.2893, -1400, -10]]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL WORLD U.ETF INHABER-ANTEILE I O.N.', source: 'DKB', orderId: '495752/48.00', externalId: 'dkb:W00000-DKBTS1/25' });
        expect(cash(batch.entries)).toEqual({ EUR: -1410 });
        expect(JSON.stringify(batch.entries)).not.toMatch(/500000000|Beispielweg|Max Beispiel|DE00 0000|12345678/);
    });

    it('books a foreign buy with its fees and the rate', async () => {
        const { batch } = await parse(docs.dkbForeignBuy());
        expect(summary(batch.entries)).toEqual([['2025-01-31', 'buy', 'US00DTEST024', 2300, -3848.3, -36.51]]);
        expect(batch.entries[0].fxRate).toBe(1.0758);
    });

    it('books a financial transaction tax as tax', async () => {
        const { batch } = await parse(docs.dkbTransactionTaxBuy());
        expect(summary(batch.entries)).toEqual([
            ['2025-09-01', 'buy', 'FR00DTEST036', 3, -1902.6, -10],
            ['2025-09-01', 'tax', 'FR00DTEST036', undefined, -5.71, undefined]
        ]);
    });

    it('books the taxes of a sale once', async () => {
        const { batch } = await parse(docs.dkbSell());
        expect(summary(batch.entries)).toEqual([
            ['2025-05-06', 'sell', 'DE000DTEST48', -100, 4245.5, -7],
            ['2025-05-06', 'tax', 'DE000DTEST48', undefined, -115.38, undefined]
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 4123.12 });
    });

    it('books the tax offset of a loss with its own date', async () => {
        const { batch } = await parse(docs.dkbLossSell());
        expect(summary(batch.entries)).toEqual([
            ['2025-02-22', 'sell', 'US00DTEST052', -20, 109, -10],
            ['2025-02-23', 'tax', 'US00DTEST052', undefined, 16.08, undefined]
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 115.08 });
    });

    it('reports bonds, cancellations and settlements that do not add up', async () => {
        expect(labels((await parse(docs.dkbBondBuy())).report.unsupported)).toEqual(['Wertpapier Abrechnung Kauf']);
        expect(labels((await parse(docs.dkbCancelled())).report.unsupported)).toEqual(['Storno Wertpapier Abrechnung Ausgabe Investmentfonds']);
        const [page] = docs.dkbBuy();
        const wrong = await parse([page.map((line) => (line === 'Ausmachender Betrag 1.410,00- EUR' ? 'Ausmachender Betrag 1.420,00- EUR' : line))]);
        expect(wrong.batch.entries).toEqual([]);
        expect(labels(wrong.report.unsupported)).toEqual(['Wertpapier Abrechnung Ausgabe Investmentfonds']);
    });
});

describe('DKB savings plans', () => {
    it('books every purchase of a half-yearly statement, each with its order number', async () => {
        const { batch, report } = await parse(docs.dkbSavingsPlan());
        expect(report.rows).toBe(1);
        expect(summary(batch.entries)).toEqual([
            ['2025-07-05', 'buy', 'LU00DTEST105', 2.2394, -90, undefined],
            ['2025-08-05', 'buy', 'LU00DTEST105', 2.1692, -90, undefined]
        ]);
        expect(batch.entries.every((entry) => entry.savingsPlan)).toBe(true);
        expect(batch.entries.map((entry) => entry.externalId)).toEqual(['dkb:plan:531781/77.00', 'dkb:plan:548714/63.00']);
    });

    it('reports a statement whose purchases do not add up', async () => {
        const [page] = docs.dkbSavingsPlan();
        const wrong = await parse([page.map((line) => (line === 'Im Abrechnungszeitraum angelegter Betrag EUR 180,00' ? 'Im Abrechnungszeitraum angelegter Betrag EUR 270,00' : line))]);
        expect(wrong.batch.entries).toEqual([]);
        expect(labels(wrong.report.unsupported)).toEqual(['Halbjahresabrechnung Sparplan']);
    });
});

describe('DKB income and taxes', () => {
    it('books a foreign dividend in EUR with withholding tax and taxes, on the credit date', async () => {
        const { batch } = await parse(docs.dkbDividend());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.amount])).toEqual([
            ['2025-07-01', 'dividend', 180.17],
            ['2025-07-01', 'withholding_tax', -27.59],
            ['2025-07-01', 'tax', -19]
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 133.58 });
    });

    it('reads a distribution whose ISIN stands on its own line', async () => {
        const { batch } = await parse(docs.dkbDistribution());
        expect(summary(batch.entries)).toEqual([['2025-10-04', 'dividend', 'IE00DTEST087', undefined, 2.09, undefined]]);
    });

    it('books a bond coupon as interest', async () => {
        expect(summary((await parse(docs.dkbInterest())).batch.entries)).toEqual([['2025-01-02', 'interest', 'DE000DTEST90', undefined, 181.25, undefined]]);
    });

    it('books the tax on the advance lump sum, and nothing if the allowance covers it', async () => {
        expect(summary((await parse(docs.dkbAdvanceTax())).batch.entries)).toEqual([['2025-01-06', 'tax', 'IE00DTEST095', undefined, -0.08, undefined]]);
        const free = await parse(docs.dkbAdvanceTax(false));
        expect(free.batch.entries).toEqual([]);
        expect(labels(free.report.ignored)).toEqual(['Vorabpauschale Investmentfonds']);
    });
});

describe('DKB documents that are not booked', () => {
    it('reports transfers, statements and unknown documents', async () => {
        expect(labels((await parse(docs.dkbTransfer())).report.unsupported)).toEqual(['Depotbuchung - Belastung']);
        expect(labels((await parse(docs.dkbStatement())).report.unsupported)).toEqual(['Kontoauszug Nummer 011 / 2025 vom 05.10.2025 bis 04.11.2025']);
        expect(labels((await parse(docs.dkbUnknown())).report.unsupported)).toEqual(['Ihre neuen Bedingungen']);
    });

    it('skips cost information, which is no booking', async () => {
        const { batch, report } = await parse(docs.dkbCostInformation());
        expect(batch.entries).toEqual([]);
        expect(labels(report.ignored)).toEqual(['Ex-ante Kosteninformation']);
        expect(report.unsupported).toEqual([]);
    });

    it('refuses a PDF without a text layer, naming the file', async () => {
        const scan = new File([syntheticPdf([{ runs: [], imageOnly: true }]) as BlobPart], 'scan.pdf');
        await expect(readImportFile(scan, nodePdfjs)).rejects.toMatchObject({ code: 'noTextLayer', file: 'scan.pdf' });
    });
});

describe('DKB import of several PDFs', () => {
    const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));

    it('imports a folder of documents once, and only new ones again', async () => {
        const files = await read([
            ['kauf.pdf', docs.dkbBuy()], ['verkauf.pdf', docs.dkbSell()], ['dividende.pdf', docs.dkbDividend()],
            ['sparplan.pdf', docs.dkbSavingsPlan()], ['kosten.pdf', docs.dkbCostInformation()]
        ]);
        const { importer, result } = readImportFiles(files);
        expect(importer.id).toBe('dkb');
        expect(result.report.rows).toBe(5);
        const first = applyImportBatch(createEmptyProject(), result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 4, addedMovements: 4, duplicateTransactions: 0 });

        const later = await read([['sparplan.pdf', docs.dkbSavingsPlan()], ['dividende.pdf', docs.dkbDividend()], ['fremd.pdf', docs.dkbForeignBuy()]]);
        const second = applyImportBatch(first.project, readImportFiles(later).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 1, addedMovements: 0, duplicateTransactions: 2, duplicateMovements: 3 });
    });
});
