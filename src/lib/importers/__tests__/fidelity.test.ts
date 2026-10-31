import { describe, expect, it } from 'vitest';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import type { ImportEntry } from '../entries';
import { fidelityFileImporter as importer } from '../fidelity';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import * as docs from './pdf/fidelityDocuments';
import { flatexBuy } from './pdf/flatexDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => importer.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee, entry.currency]);
const target = { id: 'p1', name: 'Fidelity', isNew: true };

describe('Fidelity detection', () => {
    it('reads only the two known issuers', async () => {
        expect(importer.detect(await extract(docs.fidelityConfirmation()))).toBe('confirmation');
        expect(importer.detect(await extract(docs.planSale()))).toBe('stock-plan');
        expect(importer.detect(await extract(docs.planPurchase()))).toBe('stock-plan');
        expect(detectPdfImporter(await extract(docs.planSale()))?.id).toBe('fidelity');
        expect(importer.detect(await extract(docs.otherFidelity()))).toBeNull();
        expect(importer.detect(await extract(flatexBuy()))).toBeNull();
    });

    it('reports other documents of the same issuer', async () => {
        const { batch, report } = await parse(docs.fidelityStatement());
        expect(batch.entries).toEqual([]);
        expect(report).toMatchObject({ variant: 'other' });
        expect(report.unsupported.map((note) => note.label)).toEqual(['Investment Report']);
    });
});

describe('Fidelity transaction confirmations', () => {
    it('books every trade of a PDF over page breaks', async () => {
        const { batch, report } = await parse(docs.fidelityConfirmation());
        expect(report).toMatchObject({ importerId: 'fidelity', variant: 'confirmation', ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([
            ['2023-12-14', 'buy', 'BSPC', 30, -3990, undefined, 'USD'],
            ['2023-12-14', 'sell', 'CA00FTEST012', -203, 7935.27, -0.07, 'USD'],
            ['2023-12-14', 'sell', 'CA00FTEST012', -0.032, 1.25, undefined, 'USD'],
            ['2023-12-14', 'buy', 'CA00FTEST020', 80, -4427.59, undefined, 'USD']
        ]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL INC CAP STK CL C', externalId: 'fidelity:12345-AAA45A', orderId: '12345-BB72C', raw: { cusip: '123450AA7' } });
        expect(batch.entries[3].name).toBe('BEISPIEL LTD COM NPV');
        expect(JSON.stringify(batch.entries)).not.toMatch(/MAX BEISPIEL|\*\*\*\*\*1234/);
    });

    it('reports a trade with a further cost line instead of guessing', async () => {
        const { batch, report } = await parse(docs.fidelityConfirmation(docs.usBuy('12345-AAA46A', '3,994.95')));
        expect(batch.entries).toEqual([]);
        expect(report.unsupported.map((note) => note.label)).toEqual(['Transaction Confirmation: Bought']);
    });

    it('imports overlapping PDFs without double bookings and keeps equal trades apart', async () => {
        const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));
        const twin = docs.fidelityConfirmation(docs.usBuy('12345-AAA47A'));
        const first = applyImportBatch(createEmptyProject(), readImportFiles(await read([['a.pdf', docs.fidelityConfirmation(docs.usBuy())], ['b.pdf', twin]])).result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 2, duplicateTransactions: 0 });
        const second = applyImportBatch(first.project, readImportFiles(await read([['all.pdf', docs.fidelityConfirmation()]])).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 3, duplicateTransactions: 1 });
    });
});

describe('Fidelity Stock Plan Services', () => {
    it('books a sale with its fees as an inflow, although the net proceeds print negative', async () => {
        const { batch, report } = await parse(docs.planSale());
        expect(report).toMatchObject({ variant: 'stock-plan', unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2023-12-12', 'sell', 'BSPL', -14, 2423.54, -0.13, 'USD']]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL INC', externalId: 'fidelity:sps:23346-K9T1Q9', raw: { cusip: '111111AA1' } });
    });

    it('books an ESPP purchase at the contributions paid', async () => {
        const { batch } = await parse(docs.planPurchase());
        expect(summary(batch.entries)).toEqual([['2023-12-08', 'buy', 'BSPE', 7.5146, -442.83, undefined, 'USD']]);
    });

    it('reports notes that do not add up', async () => {
        expect((await parse(docs.planSale('2,423.40'))).report.unsupported.map((note) => note.label)).toEqual(['Stock Plan Services: SOLD']);
        expect((await parse(docs.planPurchase('500.00'))).report.unsupported.map((note) => note.label)).toEqual(['Stock Plan Services: PURCHASED']);
    });
});
