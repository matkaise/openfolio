import { describe, expect, it } from 'vitest';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import type { ImportEntry } from '../entries';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import { robinhoodFileImporter as importer } from '../robinhood';
import { flatexBuy } from './pdf/flatexDocuments';
import * as docs from './pdf/robinhoodDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => importer.parse(await extract(pages));
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const target = { id: 'p1', name: 'Robinhood', isNew: true };

describe('Robinhood detection', () => {
    it('recognises statements and reports its other documents', async () => {
        expect(importer.detect(await extract(docs.robinhoodStatement()))).toBe('statement');
        expect(detectPdfImporter(await extract(docs.robinhoodStatement()))?.id).toBe('robinhood');
        expect(importer.detect(await extract(flatexBuy()))).toBeNull();
        const form = await parse(docs.robinhoodTaxForm());
        expect(form.report).toMatchObject({ variant: 'other' });
        expect(form.report.unsupported.map((note) => note.label)).toEqual(['Form 1099 Tax Information']);
    });
});

describe('Robinhood statements', () => {
    it('books every known row over page breaks', async () => {
        const { batch, report } = await parse(docs.robinhoodStatement());
        expect(report.unsupported).toEqual([]);
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount])).toEqual([
            ['2026-01-02', 'dividend', 'BSPA', undefined, 2.15],
            ['2025-12-31', 'buy', 'BSPW', 10, -736.65],
            ['2026-01-02', 'deposit', undefined, undefined, 7500],
            ['2026-01-02', 'sell', 'BSPD', -1, 224.36],
            ['2026-01-09', 'buy', 'BSPC', 4, -181.44],
            ['2026-01-08', 'dividend', 'BSPT', undefined, 91.47],
            ['2026-01-08', 'withholding_tax', 'BSPT', undefined, -19.21],
            ['2026-01-12', 'withdrawal', undefined, undefined, -500],
            ['2026-01-13', 'deposit', undefined, undefined, 25],
            ['2026-01-14', 'deposit', undefined, undefined, 70],
            ['2026-01-20', 'interest', undefined, undefined, 102.83],
            ['2026-01-21', 'withdrawal', undefined, undefined, -1000]
        ]);
        expect(cash(batch.entries)).toEqual({ USD: 5578.51 });
    });

    it('takes the name from the row or the line above and keeps the CUSIP in the raw data', async () => {
        const { batch } = await parse(docs.robinhoodStatement());
        expect(batch.entries[1]).toMatchObject({ name: 'Beispiel All-World ETF', currency: 'USD', raw: { cusip: '000000AA1' } });
        expect(batch.entries[4]).toMatchObject({ name: 'Beispiel Corp Class A', raw: { cusip: '000000AC7' } });
        expect(JSON.stringify(batch.entries)).not.toMatch(/Max Beispiel|Beispiel Road|\$75/);
    });

    it('skips pending trades with a note and books no sweep movements', async () => {
        const { batch, report } = await parse(docs.robinhoodStatement());
        expect(report.ignored.map((note) => note.label)).toEqual(['Trade pending settlement']);
        expect(batch.entries.some((entry) => entry.amount === -75 || entry.amount === 700.4)).toBe(false);
    });

    it('reports unknown type codes, also rows without an amount, and books the rest', async () => {
        const rows = [...docs.defaultRows, 'Stock Split BSPD Cash SPL 01/22/2026 1', 'Gold subscription fee Cash GOLD 01/23/2026 $5.00'];
        const { batch, report } = await parse(docs.robinhoodStatement(rows, 'Total Funds Paid and Received $2,442.30 $8,015.81'));
        expect(batch.entries).toHaveLength(12);
        expect(report.unsupported.map((note) => note.label)).toEqual(['Account Activity: SPL', 'Account Activity: GOLD']);
    });

    it('reports the table when the rows do not reach the printed totals', async () => {
        const { batch, report } = await parse(docs.robinhoodStatement(docs.defaultRows, 'Total Funds Paid and Received $2,437.31 $8,015.81'));
        expect(batch.entries).toEqual([]);
        expect(report.unsupported.map((note) => note.label)).toEqual(['Account Activity']);
    });

    it('reports a statement without totals and accepts one without activity', async () => {
        expect((await parse(docs.robinhoodStatement([], ''))).report.unsupported.map((note) => note.label)).toEqual(['Account Activity']);
        const quiet = await parse([[...docs.robinhoodStatement()[0]]]);
        expect(quiet.batch.entries).toEqual([]);
        expect(quiet.report.ignored.map((note) => note.label)).toEqual(['Account statement']);
    });

    it('keeps equal trades of one statement apart and books a statement only once', async () => {
        const trade = docs.robinhoodStatementRow('BSPD', 'BSPD', 'Sell', '01/15/2026', '1', '$231.12000', '$231.12');
        const statement = docs.robinhoodStatement([trade, 'CUSIP: 000000AB9', trade, 'CUSIP: 000000AB9'], 'Total Funds Paid and Received $0.00 $462.24');
        const read = (name: string) => readImportFile(new File([pdfFromLines(statement) as BlobPart], name), nodePdfjs);
        const { batch } = readImportFiles([await read('jan.pdf')]).result;
        expect(new Set(batch.entries.map((entry) => entry.externalId)).size).toBe(2);
        const first = applyImportBatch(createEmptyProject(), batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 2, duplicateTransactions: 0 });
        const second = applyImportBatch(first.project, readImportFiles([await read('jan-again.pdf')]).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 0, duplicateTransactions: 2 });
    });
});
