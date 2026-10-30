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
import { yuhFileImporter } from '../yuh';
import { flatexBuy } from './pdf/flatexDocuments';
import * as docs from './pdf/yuhDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => yuhFileImporter.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const target = { id: 'p1', name: 'Yuh', isNew: true };

describe('Yuh PDF detection', () => {
    it('recognises German and English notices of Yuh accounts', async () => {
        expect(yuhFileImporter.detect(await extract(docs.yuhBuy()))).toBe('de');
        expect(yuhFileImporter.detect(await extract(docs.yuhSell()))).toBe('en');
        expect(detectPdfImporter(await extract(docs.yuhInterest()))?.id).toBe('yuh');
    });

    it('leaves Swissquote trading accounts and other brokers alone', async () => {
        expect(yuhFileImporter.detect(await extract(docs.swissquoteBuy()))).toBeNull();
        expect(detectPdfImporter(await extract(docs.swissquoteBuy()))).toBeUndefined();
        expect(yuhFileImporter.detect(await extract(flatexBuy()))).toBeNull();
    });
});

describe('Yuh trades', () => {
    it('books a fractional buy with the commission paid by trading credit and stamp duty as tax', async () => {
        const { batch, report } = await parse(docs.yuhBuy());
        expect(report).toMatchObject({ importerId: 'yuh', variant: 'de', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([
            ['2024-10-31', 'buy', 'CH00YTEST018', 1.0269, -100, undefined],
            ['2024-10-31', 'tax', 'CH00YTEST018', undefined, -0.1, undefined]
        ]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL HOLDING N', currency: 'CHF', externalId: 'yuh:700000001' });
        expect(cash(batch.entries)).toEqual({ CHF: -100.1 });
        expect(JSON.stringify(batch.entries)).not.toMatch(/Max Beispiel|Beispielweg|CH0000000000000000000|100000100/);
    });

    it('books an English sale with Swiss number format', async () => {
        const { batch } = await parse(docs.yuhSell());
        expect(summary(batch.entries)).toEqual([
            ['2025-10-21', 'sell', 'CH00YTEST026', -50.0721, 5442.84, -27.2],
            ['2025-10-21', 'tax', 'CH00YTEST026', undefined, -4.1, undefined]
        ]);
        expect(cash(batch.entries)).toEqual({ CHF: 5411.54 });
    });

    it('books a foreign security in the settled currency with the rate of the document', async () => {
        const { batch } = await parse(docs.yuhForeignBuy());
        expect(summary(batch.entries)[0]).toEqual(['2025-02-05', 'buy', 'US00YTEST034', 2, -270, -1.35]);
        expect(batch.entries[0].fxRate).toBeCloseTo(300 / 270, 8);
        expect(cash(batch.entries)).toEqual({ CHF: -271.75 });
    });

    it('reports a notice that does not add up instead of guessing', async () => {
        const { batch, report } = await parse(docs.yuhBuy('700000001', 'Zu Ihren Lasten CHF 105.00'));
        expect(batch.entries).toEqual([]);
        expect(report.unsupported.map((note) => note.label)).toEqual(['Kauf']);
    });
});

describe('Yuh income, payments and interest', () => {
    it('books a dividend gross with Swiss withholding tax', async () => {
        const { batch } = await parse(docs.yuhDividendCh());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.currency, entry.description])).toEqual([
            ['2024-03-20', 'dividend', 38.51, 'CHF', 'Dividende'],
            ['2024-03-20', 'withholding_tax', -13.48, 'CHF', 'Verrechnungssteuer']
        ]);
        expect(cash(batch.entries)).toEqual({ CHF: 25.03 });
    });

    it('keeps a capital gain distribution apart in its description', async () => {
        const { batch } = await parse(docs.yuhDividendCh('Kapitalgewinn', '700000044'));
        expect(batch.entries[0]).toMatchObject({ kind: 'dividend', description: 'Kapitalgewinn', externalId: 'yuh:700000044' });
    });

    it('books a USD dividend in USD and a converted dividend in the credited currency', async () => {
        expect(cash((await parse(docs.yuhDividendUsd())).batch.entries)).toEqual({ USD: 1.51 });
        const { batch } = await parse(docs.yuhDividendInChf());
        expect(batch.entries.map((entry) => [entry.kind, entry.amount, entry.currency])).toEqual([
            ['dividend', 25.28, 'CHF'],
            ['withholding_tax', -3.8, 'CHF']
        ]);
    });

    it('books deposits and withdrawals from the payment notices', async () => {
        const deposit = await parse(docs.yuhPayment('Gutschrift', '700000009', "1'000.00"));
        expect(deposit.batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.currency])).toEqual([['2024-10-27', 'deposit', 1000, 'EUR']]);
        const withdrawal = await parse(docs.yuhPayment('Belastung', '700000010', '11.00'));
        expect(withdrawal.batch.entries.map((entry) => [entry.kind, entry.amount])).toEqual([['withdrawal', -11]]);
    });

    it('books interest per currency and keeps withholding tax apart', async () => {
        const { batch } = await parse(docs.yuhInterest());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.currency])).toEqual([
            ['2024-12-30', 'interest', 201.36, 'CHF'],
            ['2024-12-30', 'tax', -70.48, 'CHF'],
            ['2024-12-30', 'interest', 0.08, 'USD']
        ]);
    });

    it('reports title transfers and other documents with their title', async () => {
        const transfer = await parse(docs.yuhTitleTransfer());
        expect(transfer.batch.entries).toEqual([]);
        expect(transfer.report.unsupported.map((note) => note.label)).toEqual(['Titelumbuchung']);
        const statement = await parse([['KONTOAUSZUG', 'Die Bankdienstleistungen für Yuh werden von Swissquote Bank AG erbracht']]);
        expect(statement.report.unsupported.map((note) => note.label)).toEqual(['KONTOAUSZUG']);
    });
});

describe('Yuh import of several PDFs', () => {
    const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));

    it('imports a folder of notices once, and only new ones again', async () => {
        const files = await read([
            ['kauf.pdf', docs.yuhBuy()], ['verkauf.pdf', docs.yuhSell()], ['dividende.pdf', docs.yuhDividendCh()],
            ['gutschrift.pdf', docs.yuhPayment('Gutschrift', '700000009', "1'000.00")], ['umbuchung.pdf', docs.yuhTitleTransfer()]
        ]);
        const { importer, result } = readImportFiles(files);
        expect(importer.id).toBe('yuh');
        expect(result.report.rows).toBe(5);
        expect(result.report.unsupported).toMatchObject([{ label: 'Titelumbuchung', file: 'umbuchung.pdf' }]);
        const first = applyImportBatch(createEmptyProject(), result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 2, addedMovements: 5, duplicateTransactions: 0 });

        const later = await read([['verkauf.pdf', docs.yuhSell()], ['fremd.pdf', docs.yuhForeignBuy()]]);
        const second = applyImportBatch(first.project, readImportFiles(later).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 1, addedMovements: 1, duplicateTransactions: 1, duplicateMovements: 1 });
    });

    it('keeps two buys with the same values apart by their reference', async () => {
        const files = await read([['a.pdf', docs.yuhBuy('700000011')], ['b.pdf', docs.yuhBuy('700000012')]]);
        const { batch } = readImportFiles(files).result;
        expect(applyImportBatch(createEmptyProject(), batch, target).summary).toMatchObject({ addedTransactions: 2, duplicateTransactions: 0 });
    });

    it('refuses a PDF of another broker in the same import', async () => {
        const files = await read([['a.pdf', docs.yuhBuy()], ['b.pdf', flatexBuy()]]);
        expect(() => readImportFiles(files)).toThrow('mixedFiles');
    });
});
