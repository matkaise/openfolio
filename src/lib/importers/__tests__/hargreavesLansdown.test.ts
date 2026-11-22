import { describe, expect, it } from 'vitest';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import type { ImportEntry } from '../entries';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { hargreavesLansdownFileImporter as importer } from '../hargreavesLansdown';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import { flatexBuy } from './pdf/flatexDocuments';
import * as docs from './pdf/hargreavesLansdownDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => importer.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const target = { id: 'p1', name: 'HL', isNew: true };

describe('Hargreaves Lansdown contract notes', () => {
    it('recognises its notes by content', async () => {
        expect(importer.detect(await extract(docs.hlEtfBuy()))).toBe('contract-note');
        expect(detectPdfImporter(await extract(docs.hlFundBuy()))?.id).toBe('hargreaveslansdown');
        expect(importer.detect(await extract(flatexBuy()))).toBeNull();
    });

    it('books an ETF buy from the consideration in pounds, not the price in pence', async () => {
        const { batch, report } = await parse(docs.hlEtfBuy());
        expect(report).toMatchObject({ importerId: 'hargreaveslansdown', variant: 'contract-note', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2024-10-15', 'buy', 'IE00HTEST012', 2539, -57569.74, -11.95]]);
        expect(batch.entries[0]).toMatchObject({ name: 'Beispiel ETFs Plc MSCI World ETF GBP', currency: 'GBP', externalId: 'hl:B100000001-01000000' });
        expect(cash(batch.entries)).toEqual({ GBP: -57581.69 });
        expect(JSON.stringify(batch.entries)).not.toMatch(/Max Beispiel|Beispiel Road/);
    });

    it('books a fund buy without commission and a fractional quantity', async () => {
        const { batch } = await parse(docs.hlFundBuy());
        expect(summary(batch.entries)).toEqual([['2023-04-03', 'buy', 'GB00HTEST020', 1043.478, -3000, undefined]]);
        expect(batch.entries[0].name).toBe('Beispiel UK Index Class C - Accumulation (GBP)');
    });

    it('reads notes with spaced-out letters and a stock code ending in a dot', async () => {
        const { batch } = await parse(docs.hlShareSale());
        expect(summary(batch.entries)).toEqual([['2024-01-25', 'sell', 'GB00HTEST038', -132, 993.82, -11.95]]);
        expect(batch.entries[0].raw).toMatchObject({ stockCode: 'BE', settlementDate: '2024-01-29' });
    });

    it('books stamp duty and PTM levy as tax when the note adds up', async () => {
        const { batch } = await parse(docs.hlShareBuyWithStampDuty());
        expect(summary(batch.entries)).toEqual([
            ['2024-02-12', 'buy', 'GB00HTEST038', 200, -1000, -11.95],
            ['2024-02-12', 'tax', 'GB00HTEST038', undefined, -5, undefined],
            ['2024-02-12', 'tax', 'GB00HTEST038', undefined, -1, undefined]
        ]);
        expect(cash(batch.entries)).toEqual({ GBP: -1017.95 });
    });

    it('reports unknown cost lines and notes that do not add up', async () => {
        const unknown = await parse(docs.hlShareBuyWithStampDuty(['FX Charge 2.50']));
        expect(unknown.batch.entries).toEqual([]);
        expect(unknown.report.unsupported.map((note) => note.label)).toEqual(['Contract Note']);
        expect((await parse(docs.hlEtfBuy('B100000005-01000000', '57,581.70'))).report.unsupported).toHaveLength(1);
    });

    it('reports other HL documents with their title', async () => {
        const { batch, report } = await parse(docs.hlInvestmentReport());
        expect(batch.entries).toEqual([]);
        expect(report.unsupported.map((note) => note.label)).toEqual(['Investment Report']);
    });

    it('imports a folder once, and only new notes again', async () => {
        const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));
        const files = await read([['a.pdf', docs.hlEtfBuy()], ['b.pdf', docs.hlFundBuy()], ['report.pdf', docs.hlInvestmentReport()]]);
        const { result } = readImportFiles(files);
        expect(result.report.rows).toBe(3);
        const first = applyImportBatch(createEmptyProject(), result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 2, duplicateTransactions: 0 });
        const later = await read([['b.pdf', docs.hlFundBuy()], ['c.pdf', docs.hlShareSale()], ['d.pdf', docs.hlEtfBuy('B100000006-01000000')]]);
        const second = applyImportBatch(first.project, readImportFiles(later).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 2, duplicateTransactions: 1 });
    });
});
