import { describe, expect, it } from 'vitest';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines, syntheticPdf } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import { consorsbankFileImporter } from '../consorsbank';
import type { ImportEntry } from '../entries';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import * as docs from './pdf/consorsbankDocuments';
import { dkbBuy } from './pdf/dkbDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

// Synthetic documents go through the real PDF extraction before the importer sees them
const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => consorsbankFileImporter.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const labels = (notes: { label: string }[]) => notes.map((note) => note.label);
const target = { id: 'p1', name: 'Consorsbank', isNew: true };

describe('Consorsbank PDF detection', () => {
    it('recognises Consorsbank and Cortal Consors documents', async () => {
        expect(consorsbankFileImporter.detect(await extract(docs.consorsBuy()))).toBe('consorsbank');
        expect(detectPdfImporter(await extract(docs.consorsOldSell()))?.id).toBe('consorsbank');
    });

    it('leaves other banks alone', async () => {
        expect(consorsbankFileImporter.detect(await extract(dkbBuy()))).toBeNull();
    });
});

describe('Consorsbank settlements', () => {
    it('reads a buy with its fees', async () => {
        const { batch, report } = await parse(docs.consorsBuy());
        expect(report).toMatchObject({ importerId: 'consorsbank', variant: 'consorsbank', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2025-09-06', 'buy', 'DE000CTSB012', 300, -3390, -18.64]]);
        expect(batch.entries[0]).toMatchObject({ name: 'MUSTER AG O.N.', source: 'Consorsbank', externalId: 'consorsbank:148553598.001', orderId: '148553598.001' });
        expect(cash(batch.entries)).toEqual({ EUR: -3408.64 });
        expect(JSON.stringify(batch.entries)).not.toMatch(/0815081508|Beispielweg|Max Beispiel|9876543210|DE00 0000/);
    });

    it('marks savings plans and books a financial transaction tax as tax', async () => {
        const { batch } = await parse(docs.consorsSavingsPlan());
        expect(summary(batch.entries)).toEqual([
            ['2025-02-03', 'buy', 'FR00CTSB0024', 1.01514, -24.56, -0.37],
            ['2025-02-03', 'tax', 'FR00CTSB0024', undefined, -0.07, undefined]
        ]);
        expect(batch.entries[0].savingsPlan).toBe(true);
    });

    it('reads the current layout of a sale and books its taxes once', async () => {
        const { batch } = await parse(docs.consorsSell());
        expect(summary(batch.entries)).toEqual([
            ['2025-01-25', 'sell', 'DE000CTSB036', -240, 5184, -23.02],
            ['2025-01-25', 'tax', 'DE000CTSB036', undefined, -115.38, undefined]
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 5045.6 });
    });

    it('books a foreign buy from the amount in account currency', async () => {
        const { batch } = await parse(docs.consorsForeignBuy());
        expect(summary(batch.entries)).toEqual([['2025-07-01', 'buy', 'JP00CTSB0048', 200, -7284.43, -68.02]]);
        expect(batch.entries[0].fxRate).toBe(141.09);
    });

    it('books a foreign fund purchase at the converted amount', async () => {
        const { batch } = await parse(docs.consorsForeignFund());
        expect(summary(batch.entries)).toEqual([['2025-10-16', 'buy', 'LU00CTSB0053', 0.3299, -100, undefined]]);
        expect(batch.entries[0].fxRate).toBe(1.1848);
    });

    it('books a redemption in units as a sale', async () => {
        expect(summary((await parse(docs.consorsRedemption())).batch.entries)).toEqual([['2025-05-20', 'sell', 'DE000CTSB085', -1000, 1, undefined]]);
    });

    it('reports bonds, trades without an ISIN and settlements that do not add up', async () => {
        expect(labels((await parse(docs.consorsBondBuy())).report.unsupported)).toEqual(['KAUF']);
        const old = await parse(docs.consorsOldSell());
        expect(old.batch.entries).toEqual([]);
        expect(labels(old.report.unsupported)).toEqual(['Verkauf']);
        const [page] = docs.consorsBuy();
        const wrong = await parse([page.map((line) => (line === 'Wert 10.09.2025 EUR 3.408,64' ? 'Wert 10.09.2025 EUR 3.418,64' : line))]);
        expect(wrong.batch.entries).toEqual([]);
        expect(labels(wrong.report.unsupported)).toEqual(['KAUF']);
    });
});

describe('Consorsbank income and taxes', () => {
    it('books a credit whose amounts stand above their labels', async () => {
        const { batch } = await parse(docs.consorsDividend());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.amount])).toEqual([
            ['2025-11-17', 'dividend', 'US00CTSB0105', 90.99],
            ['2025-11-17', 'withholding_tax', 'US00CTSB0105', -13.65],
            ['2025-11-17', 'tax', 'US00CTSB0105', -9.6]
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 67.74 });
    });

    it('books an old credit with only a WKN by name, without an ISIN', async () => {
        const { batch } = await parse(docs.consorsOldDividend());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.amount, entry.name])).toEqual([
            ['2016-01-11', 'dividend', undefined, 336, 'BEISPIEL GROUP INC.'],
            ['2016-01-11', 'withholding_tax', undefined, -50.4, 'BEISPIEL GROUP INC.']
        ]);
        expect(batch.entries[0].raw).toMatchObject({ wkn: 'CBTST9' });
    });

    it('reports a credit to a foreign currency account', async () => {
        const { batch, report } = await parse(docs.consorsForeignAccountDividend());
        expect(batch.entries).toEqual([]);
        expect(labels(report.unsupported)).toEqual(['Dividendengutschrift']);
    });

    it('books the advance lump sum tax, and nothing if there is none', async () => {
        expect(summary((await parse(docs.consorsAdvanceTax())).batch.entries)).toEqual([['2025-01-02', 'tax', 'DE000CTSB129', undefined, -0.73, undefined]]);
        const free = await parse(docs.consorsAdvanceTax(false));
        expect(free.batch.entries).toEqual([]);
        expect(labels(free.report.ignored)).toEqual(['Vorabpauschale']);
    });

    it('books a later loss offset, positive or as a charge', async () => {
        expect(summary((await parse(docs.consorsLossOffset())).batch.entries)).toEqual([['2025-07-10', 'tax', undefined, undefined, 90.61, undefined]]);
        expect((await parse(docs.consorsLossOffset('12,34-'))).batch.entries[0].amount).toBe(-12.34);
    });
});

describe('Consorsbank documents that are not booked', () => {
    it('reports cancellations, reissued credits, transfers, statements and unknown documents', async () => {
        const reported = async (pages: Pages) => {
            const { batch, report } = await parse(pages);
            expect(batch.entries).toEqual([]);
            return labels(report.unsupported);
        };
        expect(await reported(docs.consorsCancelled())).toEqual(['Storno Ertragsgutschrift']);
        expect(await reported(docs.consorsReissued())).toEqual(['Ertragsgutschrift / Neuabrechnung']);
        expect(await reported(docs.consorsTransfer())).toEqual(['UEBERTRAG EINGANG']);
        expect(await reported(docs.consorsStatement())).toEqual(['Kontoauszug']);
        expect(await reported(docs.consorsUnknown())).toEqual(['Consorsbank • 90318 Nürnberg']);
    });

    it('skips order confirmations', async () => {
        const { batch, report } = await parse(docs.consorsOrderConfirmation());
        expect(batch.entries).toEqual([]);
        expect(labels(report.ignored)).toEqual(['Orderbestätigung']);
    });

    it('refuses a PDF without a text layer, naming the file', async () => {
        const scan = new File([syntheticPdf([{ runs: [], imageOnly: true }]) as BlobPart], 'scan.pdf');
        await expect(readImportFile(scan, nodePdfjs)).rejects.toMatchObject({ code: 'noTextLayer', file: 'scan.pdf' });
    });
});

describe('Consorsbank import of several PDFs', () => {
    const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));

    it('imports a folder of documents once, and only new ones again', async () => {
        const files = await read([
            ['kauf.pdf', docs.consorsBuy()], ['verkauf.pdf', docs.consorsSell()], ['dividende.pdf', docs.consorsDividend()], ['order.pdf', docs.consorsOrderConfirmation()]
        ]);
        const { importer, result } = readImportFiles(files);
        expect(importer.id).toBe('consorsbank');
        expect(result.report.rows).toBe(4);
        const first = applyImportBatch(createEmptyProject(), result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 2, addedMovements: 4, duplicateTransactions: 0 });

        const later = await read([['dividende.pdf', docs.consorsDividend()], ['kauf.pdf', docs.consorsBuy()], ['japan.pdf', docs.consorsForeignBuy()]]);
        const second = applyImportBatch(first.project, readImportFiles(later).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 1, addedMovements: 0, duplicateTransactions: 1, duplicateMovements: 3 });
    });
});
