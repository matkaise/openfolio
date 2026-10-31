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
import { questradeFileImporter as importer } from '../questrade';
import { readImportFile } from '../readImportFile';
import { flatexBuy } from './pdf/flatexDocuments';
import * as docs from './pdf/questradeDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => importer.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee, entry.currency]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const target = { id: 'p1', name: 'Questrade', isNew: true };

const { balance, questradeRows: rows, questradeStatement: statement } = docs;
const fullStatement = () => statement([
    [balance('Opening', '66.27'), rows.contribution, balance('Closing', '10,066.27')],
    [balance('Opening', '10,066.27'), rows.distribution, balance('Closing', '10,086.96')],
    [balance('Opening', '10,086.96', '500.00'), rows.buy, rows.buyOneLine, rows.sell, rows.usdBuy, balance('Closing', '7,969.18', '172.90')]
]);

describe('Questrade detection', () => {
    it('tells statements, reports and other documents apart', async () => {
        expect(importer.detect(await extract(fullStatement()))).toBe('statement');
        expect(importer.detect(await extract(docs.questradeReport()))).toBe('trade-confirmation');
        expect(importer.detect(await extract(docs.questradeOther()))).toBe('other');
        expect(detectPdfImporter(await extract(fullStatement()))?.id).toBe('questrade');
        expect(importer.detect(await extract(flatexBuy()))).toBeNull();
    });
});

describe('Questrade statements', () => {
    it('books contributions, distributions and trades in CAD and USD under the symbol', async () => {
        const { batch, report } = await parse(fullStatement());
        expect(report).toMatchObject({ importerId: 'questrade', variant: 'statement', ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([
            ['2025-04-09', 'deposit', undefined, undefined, 10000, undefined, 'CAD'],
            ['2025-04-07', 'dividend', 'BSPT', undefined, 20.69, undefined, 'CAD'],
            ['2025-04-10', 'buy', 'BSPT', 50, -2046.5, -0.1, 'CAD'],
            ['2025-01-17', 'buy', 'XBSP', 19, -481.08, undefined, 'CAD'],
            ['2025-04-14', 'sell', 'BSPT', -10, 410, -0.1, 'CAD'],
            ['2025-04-16', 'buy', 'IVLB', 10, -327.1, undefined, 'USD']
        ]);
        expect(batch.entries[2].name).toBe('BEISPIEL ALL-EQUITY ETF PORTFOLIO');
        expect(cash(batch.entries)).toEqual({ CAD: 7902.91, USD: -327.1 });
        expect(JSON.stringify(batch.entries)).not.toMatch(/MAX BEISPIEL|BEISPIEL ROAD|1000000199/);
    });

    it('reports a table that does not reach its closing balance', async () => {
        const { batch, report } = await parse(statement([[balance('Opening', '66.27'), rows.contribution, balance('Closing', '10,066.28')]]));
        expect(batch.entries).toEqual([]);
        expect(report.unsupported.map((note) => note.label)).toEqual(['Transactions']);
    });

    it('reports rows it does not know and books the rest of the table', async () => {
        const { batch, report } = await parse(statement([[balance('Opening', '66.27'), rows.contribution, rows.withholding, balance('Closing', '10,063.17')]]));
        expect(batch.entries.map((entry) => entry.kind)).toEqual(['deposit']);
        expect(report.unsupported).toHaveLength(1);
    });

    it('skips trades that settle after month end, with a note', async () => {
        const { batch, report } = await parse(statement([[balance('Opening', '66.27'), balance('Closing', '66.27')]], [
            '05. TRADES TO SETTLE AFTER',
            'Unsettled trades MONTH END',
            '04-30-2025 05-02-2025 Buy .BSPT BEISPIEL ALL-EQUITY ETF  PORTFOLIO UNITS',
            'WE ACTED AS AGENT 9 25.690 (231.21) (0.03) (231.24)'
        ]));
        expect(batch.entries).toEqual([]);
        expect(report.ignored.map((note) => note.label)).toEqual(['Trade to settle after month end']);
    });

    it('keeps two equal trades of one statement apart', async () => {
        const { batch } = await parse(statement([[balance('Opening', '1,000.00'), rows.buyOneLine, rows.buyOneLine, balance('Closing', '37.84')]]));
        expect(new Set(batch.entries.map((entry) => entry.externalId)).size).toBe(2);
    });
});

describe('Questrade trade confirmation reports', () => {
    it('books a trade with commission and the description of the next line', async () => {
        const { batch, report } = await parse(docs.questradeReport());
        expect(report).toMatchObject({ variant: 'trade-confirmation', unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2025-04-15', 'buy', 'BSPT', 50, -2046.5, -0.1, 'CAD']]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL ALL-EQUITY ETF, CL A UNIT', orderId: '30F9C7' });
    });

    it('books sales in the currency of the table', async () => {
        const { batch } = await parse(docs.questradeReport({
            currency: 'USD', rows: ['06-05-26 07-05-26 A3DB70 Sell 160 IVLB  A NY 50.02 8,003.20 0.00 (0.14) 0.00 8,003.06', 'Description BEISPIEL INTL VALUE, ETF'], totals: 'Totals 8,003.20 0.00 (0.14) 0.00 8,003.06'
        }));
        expect(summary(batch.entries)).toEqual([['2026-05-06', 'sell', 'IVLB', -160, 8003.2, -0.14, 'USD']]);
    });

    it('reports options, accrued interest and totals that do not add up', async () => {
        const option = await parse(docs.questradeReport({ rows: ['15-04-25 16-04-25 30F9C7 Buy to open 1 AAPL15Jan27C200 A X 2.00 (200.00) (1.00) 0.00 0.00 (201.00)'], totals: 'Totals (200.00) (1.00) 0.00 0.00 (201.00)' }));
        expect(option.batch.entries).toEqual([]);
        expect(option.report.unsupported).toHaveLength(1);
        const interest = await parse(docs.questradeReport({ rows: ['15-04-25 16-04-25 30F9C7 Buy 10 BOND1 A T 100.00 (1,000.00) 0.00 0.00 (5.00) (1,005.00)'], totals: 'Totals (1,000.00) 0.00 0.00 (5.00) (1,005.00)' }));
        expect(interest.batch.entries).toEqual([]);
        expect(interest.report.unsupported).toHaveLength(1);
        const totals = await parse(docs.questradeReport({ totals: 'Totals (2,046.50) (0.10) 0.00 0.00 (2,047.60)' }));
        expect(totals.batch.entries).toEqual([]);
        expect(totals.report.unsupported.map((note) => note.label)).toEqual(['Trade confirmation report: totals']);
    });
});

describe('Questrade imports', () => {
    const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));

    it('imports a statement once and recognises the same trade in a report', async () => {
        const first = applyImportBatch(createEmptyProject(), readImportFiles(await read([['april.pdf', fullStatement()]])).result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 4, addedMovements: 2, duplicateTransactions: 0 });
        const again = applyImportBatch(first.project, readImportFiles(await read([['april.pdf', fullStatement()]])).result.batch, { ...target, isNew: false });
        expect(again.summary).toMatchObject({ addedTransactions: 0, addedMovements: 0, duplicateTransactions: 4, duplicateMovements: 2 });
        const report = docs.questradeReport({ rows: ['10-04-25 11-04-25 30F9C7 Buy 50 .BSPT  A T 40.93 (2,046.50) (0.10) 0.00 0.00 (2,046.60)', 'Description BEISPIEL'] });
        const overlap = applyImportBatch(first.project, readImportFiles(await read([['report.pdf', report]])).result.batch, { ...target, isNew: false });
        expect(overlap.summary).toMatchObject({ addedTransactions: 0, duplicateTransactions: 1 });
    });

    it('keeps the accounts of two statements apart', async () => {
        const [a] = await read([['a.pdf', docs.questradeReport()]]);
        const [b] = await read([['b.pdf', docs.questradeReport({ account: '10000002' })]]);
        const first = applyImportBatch(createEmptyProject(), readImportFiles([a]).result.batch, target);
        expect(applyImportBatch(first.project, readImportFiles([b]).result.batch, { ...target, isNew: false }).summary).toMatchObject({ addedTransactions: 1, duplicateTransactions: 0 });
    });
});
