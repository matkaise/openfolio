import { describe, expect, it } from 'vitest';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import { commSecFileImporter } from '../commsec';
import type { ImportEntry } from '../entries';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import * as docs from './pdf/commsecDocuments';
import { flatexBuy } from './pdf/flatexDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => commSecFileImporter.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee, entry.currency]);
const target = { id: 'p1', name: 'CommSec', isNew: true };

describe('CommSec confirmations', () => {
    it('recognises both layouts by content', async () => {
        expect(commSecFileImporter.detect(await extract(docs.commsecBuy()))).toBe('colon');
        expect(commSecFileImporter.detect(await extract(docs.commsecSell()))).toBe('plain');
        expect(detectPdfImporter(await extract(docs.commsecBuy()))?.id).toBe('commsec');
        expect(commSecFileImporter.detect(await extract(flatexBuy()))).toBeNull();
    });

    it('books a buy under the ASX code; GST is part of the brokerage', async () => {
        const { batch, report } = await parse(docs.commsecBuy());
        expect(report).toMatchObject({ importerId: 'commsec', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2024-04-22', 'buy', 'BSP', 277, -999.97, -29.95, 'AUD']]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL AIRWAYS LIMITED', externalId: 'commsec:90000001', orderId: 'N100000001' });
        expect(JSON.stringify(batch.entries)).not.toMatch(/MAX BEISPIEL|BEISPIEL ROAD|10000001"/);
    });

    it('books a sale of the second layout', async () => {
        const { batch } = await parse(docs.commsecSell());
        expect(summary(batch.entries)).toEqual([['2024-04-22', 'sell', 'BGL', -1000, 28060, -28.06, 'AUD']]);
    });

    it('books every confirmation of a PDF with several', async () => {
        const { batch, report } = await parse(docs.commsecBoth());
        expect(batch.entries.map((entry) => entry.externalId)).toEqual(['commsec:90000001', 'commsec:90000002']);
        expect(report.unsupported).toEqual([]);
    });

    it('reports notes that do not add up or carry application money', async () => {
        const wrong = await parse(docs.commsecBuy({ total: '1,030.92' }));
        expect(wrong.batch.entries).toEqual([]);
        expect(wrong.report.unsupported.map((note) => note.label)).toEqual(['Confirmation: BOUGHT']);
        expect((await parse(docs.commsecBuy({ application: '10.00', total: '1,039.92' }))).report.unsupported).toHaveLength(1);
    });

    it('reports other CommSec documents with their title', async () => {
        const { batch, report } = await parse(docs.commsecHoldings());
        expect(batch.entries).toEqual([]);
        expect(report.unsupported.map((note) => note.label)).toEqual(['HOLDINGS SUMMARY']);
    });

    it('imports overlapping PDFs without double bookings and keeps equal trades with their own number', async () => {
        const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));
        const first = applyImportBatch(createEmptyProject(), readImportFiles(await read([['a.pdf', docs.commsecBuy()], ['b.pdf', docs.commsecBuy({ confirmation: '90000003' })]])).result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 2, duplicateTransactions: 0 });
        const second = applyImportBatch(first.project, readImportFiles(await read([['both.pdf', docs.commsecBoth()]])).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 1, duplicateTransactions: 1 });
    });
});
