import { describe, expect, it } from 'vitest';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import { scalableFileImporter } from '../scalable';
import * as docs from './pdf/scalableDocuments';

// Synthetic documents go through the real PDF extraction before the importer sees them
const extract = async (pages: Parameters<typeof pdfFromLines>[0]): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Parameters<typeof pdfFromLines>[0]) => scalableFileImporter.parse(await extract(pages));
const summary = (entries: { kind: string; amount: number; fee?: number; quantity?: number; date: string; isin?: string }[]) => (
    entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee])
);
const target = { id: 'p1', name: 'Scalable', isNew: true };

describe('Scalable Capital PDF detection', () => {
    it('recognises both document generations and the language', async () => {
        expect(scalableFileImporter.detect(await extract(docs.scalableBuyDe()))).toBe('de');
        expect(scalableFileImporter.detect(await extract(docs.scalableBuyEn()))).toBe('en');
        expect(scalableFileImporter.detect(await extract(docs.baaderBuy()))).toBe('baader');
        expect(scalableFileImporter.detect(await extract(docs.baaderSell()))).toBe('baader');
        expect(detectPdfImporter(await extract(docs.scalableDividendDe()))?.id).toBe('scalable');
    });

    it('does not claim documents of other banks, even about a "Scalable" fund', async () => {
        expect(scalableFileImporter.detect(await extract([['Andere Bank AG', 'Wertpapierabrechnung Kauf', 'Kauf Scalable MSCI AC World Xtrackers 1,00 Stk.']]))).toBeNull();
        expect(scalableFileImporter.detect(await extract([['Baader Bank AG', 'Wertpapierabrechnung: Kauf']]))).toBeNull();
    });
});

describe('Scalable Capital settlements (current documents)', () => {
    it('books a savings plan buy with order fee and financial transaction tax', async () => {
        const { batch, report } = await parse(docs.scalableBuyDe({ savingsPlan: true }));
        expect(report).toMatchObject({ importerId: 'scalable', variant: 'de', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([
            ['2025-02-03', 'buy', 'IE00BTEST016', 12.5, -13000, -0.99],
            ['2025-02-03', 'tax', 'IE00BTEST016', undefined, -2.4, undefined]
        ]);
        expect(batch.entries[0]).toMatchObject({ savingsPlan: true, currency: 'EUR', name: 'Beispiel Welt ETF (Acc)', orderId: 'SCALtest00000001' });
        expect(deriveCashBalances(batch.entries.map((entry, index) => ({ ...entry, id: String(index) })))).toEqual({ EUR: -13003.39 });
        // no IBAN or address in the stored source lines
        expect(JSON.stringify(batch.entries)).not.toMatch(/DE0000000000|Beispielweg|Erika/);
    });

    it('books a sale with fee and capital gains tax as its own booking', async () => {
        const { batch } = await parse(docs.scalableSellDe());
        expect(summary(batch.entries)).toEqual([
            ['2025-06-18', 'sell', 'DE000TEST018', -20, 1201, -0.99],
            ['2025-06-18', 'tax', 'DE000TEST018', undefined, -50.51, undefined]
        ]);
        expect(batch.entries[0].savingsPlan).toBeUndefined();
        expect(deriveCashBalances(batch.entries.map((entry, index) => ({ ...entry, id: String(index) })))).toEqual({ EUR: 1149.5 });
    });

    it('reads English contract notes with English number format', async () => {
        const { batch, report } = await parse(docs.scalableBuyEn());
        expect(report.variant).toBe('en');
        expect(summary(batch.entries)).toEqual([['2025-08-12', 'buy', 'IE00BTEST024', 21, -4845.75, -0.99]]);
    });

    it('books dividends gross with withholding tax and German taxes', async () => {
        const { batch } = await parse(docs.scalableDividendDe());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.description])).toEqual([
            ['2025-01-16', 'dividend', 11.69, 'Dividende'],
            ['2025-01-16', 'withholding_tax', -1.75, 'Ausländische Quellensteuer'],
            ['2025-01-16', 'withholding_tax', -2.46, 'Steuern']
        ]);
        expect(batch.entries.every((entry) => entry.isin === 'US00TEST0010' && entry.currency === 'EUR')).toBe(true);

        const english = await parse(docs.scalableDividendEn());
        expect(english.batch.entries.map((entry) => [entry.date, entry.kind, entry.amount])).toEqual([
            ['2026-04-28', 'dividend', 9.69], ['2026-04-28', 'withholding_tax', -2.55]
        ]);
    });

    it('books the tax on the advance lump sum and tax recalculations', async () => {
        expect(summary((await parse(docs.scalableAdvanceTax())).batch.entries)).toEqual([['2026-01-24', 'tax', 'IE00BTEST016', undefined, -0.01, undefined]]);
        const free = await parse(docs.scalableAdvanceTax('0,00'));
        expect(free.batch.entries).toEqual([]);
        expect(free.report.ignored).toEqual([{ line: expect.any(Number), page: 1, label: 'Vorabpauschale' }]);
        expect(summary((await parse(docs.scalableTaxAdjustment())).batch.entries)).toEqual([['2026-01-10', 'tax', undefined, undefined, 3.37, undefined]]);
    });

    it('reports documents it does not book', async () => {
        const statement = await parse(docs.scalableStatement());
        expect(statement.batch.entries).toEqual([]);
        expect(statement.report.unsupported).toEqual([{ line: 5, page: 1, label: 'Verrechnungskonto' }]);
        expect((await parse(docs.scalableCostInformation())).report.ignored).toEqual([{ line: 5, page: 1, label: 'Kosteninformation' }]);
        expect((await parse(docs.scalableReclassification())).report.unsupported.map((note) => note.label)).toEqual(['Dividende']);
    });

    it('reports a settlement that does not add up or has an unknown booking line instead of guessing', async () => {
        const [page] = docs.scalableBuyDe();
        const wrongTotal = page.map((line) => (line === 'Belastung 13.003,39 EUR' ? 'Belastung 13.010,00 EUR' : line));
        expect((await parse([wrongTotal])).batch.entries).toEqual([]);
        expect((await parse([wrongTotal])).report.unsupported.map((note) => note.label)).toEqual(['Wertpapierabrechnung']);
        const unknown = page.map((line) => (line === 'Finanztransaktionssteuer +2,40 EUR' ? 'Stempelgebühr +2,40 EUR' : line));
        expect((await parse([unknown])).report.unsupported.map((note) => note.label)).toEqual(['Wertpapierabrechnung: Stempelgebühr']);
    });
});

describe('Scalable Capital via Baader Bank (until 2024)', () => {
    it('books buys and sales with commission and taxes', async () => {
        const buy = await parse(docs.baaderBuy());
        expect(buy.report.variant).toBe('baader');
        expect(summary(buy.batch.entries)).toEqual([['2023-04-14', 'buy', 'US00TEST0028', 10, -357.6, -0.99]]);
        expect(buy.batch.entries[0].name).toBe('Beispiel Foods Co.');

        const sale = await parse(docs.baaderSell());
        expect(summary(sale.batch.entries)).toEqual([
            ['2019-07-19', 'sell', 'IE00BTEST040', -11, 1161.6, -1.16],
            ['2019-07-19', 'tax', 'IE00BTEST040', undefined, -21.1, undefined]
        ]);
    });

    it('books a fund distribution gross in account currency with US withholding tax', async () => {
        const { batch } = await parse(docs.baaderDistribution());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.currency])).toEqual([
            ['2022-10-14', 'dividend', 1.34, 'EUR'], ['2022-10-14', 'withholding_tax', -0.2, 'EUR']
        ]);
    });

    it('reports cancellations', async () => {
        expect((await parse(docs.baaderDistribution({ storno: true }))).report.unsupported.map((note) => note.label)).toEqual(['Fondsausschüttung STORNO']);
    });
});

describe('Scalable Capital import of several PDFs', () => {
    const files = async () => Promise.all([
        ['kauf.pdf', docs.scalableBuyDe()],
        ['verkauf.pdf', docs.scalableSellDe()],
        ['dividende.pdf', docs.scalableDividendDe()],
        ['baader.pdf', docs.baaderBuy()],
        ['konto.pdf', docs.scalableStatement()]
    ].map(async ([name, pages]) => readImportFile(new File([pdfFromLines(pages as Parameters<typeof pdfFromLines>[0]) as BlobPart], name as string), nodePdfjs)));

    it('merges the documents, reports the rest per file and imports nothing twice', async () => {
        const read = await files();
        const { importer, result } = readImportFiles(read);
        expect(importer.id).toBe('scalable');
        expect(result.report.variant).toBe('de+baader');
        expect(result.report.rows).toBe(5);
        expect(result.report.period).toEqual({ from: '2023-04-14', to: '2025-06-18' });
        expect(result.report.unsupported).toEqual([{ line: 5, page: 1, label: 'Verrechnungskonto', file: 'konto.pdf' }]);

        const first = applyImportBatch(createEmptyProject(), result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 3, addedMovements: 5, duplicateTransactions: 0, duplicateMovements: 0 });
        expect(first.project.securities['IE00BTEST016']).toMatchObject({ name: 'Beispiel Welt ETF (Acc)', currency: 'EUR' });

        // again, with one more settlement: only that one is new
        const again = readImportFiles([...read, await readImportFile(new File([pdfFromLines(docs.scalableBuyDe({ order: 'SCALtest00000009', deal: '1000009' })) as BlobPart], 'kauf2.pdf'), nodePdfjs)]);
        const second = applyImportBatch(first.project, again.result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 1, addedMovements: 1, duplicateTransactions: 3, duplicateMovements: 5 });
    });

    it('keeps two executions of one order apart', async () => {
        const partA = pdfFromLines(docs.scalableBuyDe({ order: 'SCALtest00000005', deal: '5000001' }));
        const partB = pdfFromLines(docs.scalableBuyDe({ order: 'SCALtest00000005', deal: '5000002' }));
        const read = await Promise.all([partA, partB].map((data, index) => readImportFile(new File([data as BlobPart], `${index}.pdf`), nodePdfjs)));
        const { summary: result } = applyImportBatch(createEmptyProject(), readImportFiles(read).result.batch, target);
        expect(result.addedTransactions).toBe(2);
    });
});
