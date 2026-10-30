import { describe, expect, it } from 'vitest';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines, syntheticPdf } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import type { ImportEntry } from '../entries';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { ingFileImporter } from '../ing';
import { readImportFile } from '../readImportFile';
import * as docs from './pdf/ingDocuments';
import { flatexBuy } from './pdf/flatexDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

// Synthetic documents go through the real PDF extraction before the importer sees them
const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => ingFileImporter.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const labels = (notes: { label: string }[]) => notes.map((note) => note.label);
const target = { id: 'p1', name: 'ING', isNew: true };

describe('ING PDF detection', () => {
    it('recognises documents of ING Deutschland', async () => {
        expect(ingFileImporter.detect(await extract(docs.ingBuy()))).toBe('ing');
        expect(detectPdfImporter(await extract(docs.ingDividend()))?.id).toBe('ing');
    });

    it('leaves ING Spain and other banks alone', async () => {
        expect(detectPdfImporter(await extract(docs.ingSpain()))).toBeUndefined();
        expect(ingFileImporter.detect(await extract(flatexBuy()))).toBeNull();
    });
});

describe('ING settlements', () => {
    it('reads a buy with the depot data beside the address, and skips the tax details on page 2', async () => {
        const { batch, report } = await parse(docs.ingBuy());
        expect(report).toMatchObject({ importerId: 'ing', variant: 'ing', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2025-11-17', 'buy', 'DE000ITEST12', 14, -533.4, -6.8]]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL STOXX 600 U.ETF DE Inhaber-Anteile', currency: 'EUR', orderId: '12345678.001' });
        expect(cash(batch.entries)).toEqual({ EUR: -540.2 });
        expect(JSON.stringify(batch.entries)).not.toMatch(/1000000000|Beispielweg|Max Beispiel|DE00 0000/);
    });

    it('books a foreign buy in the account currency with the exchange rate', async () => {
        const { batch } = await parse(docs.ingForeignBuy());
        expect(summary(batch.entries)).toEqual([['2025-11-10', 'buy', 'US00TEST0011', 15, -1311.99, -23.08]]);
        expect(batch.entries[0]).toMatchObject({ currency: 'EUR', fxRate: 1.146163 });
        expect(cash(batch.entries)).toEqual({ EUR: -1335.07 });
    });

    it('marks savings plans and takes a discount off the purchase amount', async () => {
        const { batch } = await parse(docs.ingSavingsPlan());
        expect(summary(batch.entries)).toEqual([['2025-09-15', 'buy', 'LU00ITEST029', 2.41234, -75, undefined]]);
        expect(batch.entries[0].savingsPlan).toBe(true);
    });

    it('adds up the tax lines of both holders of a joint account into one tax booking', async () => {
        const { batch } = await parse(docs.ingJointSell());
        expect(summary(batch.entries)).toEqual([
            ['2025-11-16', 'sell', 'US00TEST0011', -5, 729.54, -21.62],
            ['2025-11-16', 'tax', 'US00TEST0011', undefined, -73.58, undefined]
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 634.34 });
    });

    it('books the redemption of a certificate as a sale at maturity', async () => {
        const { batch } = await parse(docs.ingRedemption());
        expect(summary(batch.entries)).toEqual([
            ['2025-06-25', 'sell', 'DE000ITEST38', -5, 1417.4, undefined],
            ['2025-06-25', 'tax', 'DE000ITEST38', undefined, -13.06, undefined]
        ]);
        expect(batch.entries[0].name).toBe('Beispiel Effekten GmbH DISC.Z 25.06.25 Muster 310');
    });

    it('reports bonds, and settlements that do not add up, instead of guessing', async () => {
        const bond = await parse(docs.ingBondBuy());
        expect(bond.batch.entries).toEqual([]);
        expect(labels(bond.report.unsupported)).toEqual(['Wertpapierabrechnung Kauf']);

        const [first] = docs.ingBuy();
        const changed = first.map((line) => (line === 'Endbetrag zu Ihren Lasten EUR 540,20' ? 'Endbetrag zu Ihren Lasten EUR 545,00' : line));
        const wrong = await parse([changed]);
        expect(wrong.batch.entries).toEqual([]);
        expect(labels(wrong.report.unsupported)).toEqual(['Wertpapierabrechnung Kauf']);
    });

    it('reads titles and labels printed with a broken font encoding in older documents', async () => {
        const broken = (pages: Pages) => pages.map((page) => page.map((line) => (typeof line === 'string'
            ? line.replace(/Stück/g, 'St¸ck').replace(/Ausführungstag/, 'Ausf¸hrungstag').replace(/Solidaritätszuschlag/, 'Solidarit¾tszuschlag')
            : line)));
        expect(summary((await parse(broken(docs.ingBuy()))).batch.entries)).toEqual(summary((await parse(docs.ingBuy())).batch.entries));
        expect((await parse(broken(docs.ingFundDistribution()))).batch.entries).toHaveLength(2);
    });
});

describe('ING income and taxes', () => {
    it('books a foreign dividend gross in EUR with the withholding tax in EUR', async () => {
        const { batch } = await parse(docs.ingDividend());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.currency])).toEqual([
            ['2025-03-01', 'dividend', 3.15, 'EUR'],
            ['2025-03-01', 'withholding_tax', -0.47, 'EUR']
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 2.68 });
    });

    it('books a fund distribution with its taxes', async () => {
        const { batch } = await parse(docs.ingFundDistribution());
        expect(summary(batch.entries)).toEqual([
            ['2025-12-15', 'dividend', 'DE000ITEST12', undefined, 303.6, undefined],
            ['2025-12-15', 'tax', 'DE000ITEST12', undefined, -68.68, undefined]
        ]);
    });

    it('books a bond coupon as interest', async () => {
        const { batch } = await parse(docs.ingCoupon());
        expect(summary(batch.entries)).toEqual([['2025-01-02', 'interest', 'DE000ITEST46', undefined, 50, undefined]]);
    });

    it('books only the tax of accumulating funds and of the advance lump sum', async () => {
        expect(summary((await parse(docs.ingAccumulation())).batch.entries)).toEqual([['2025-01-02', 'tax', 'LU00ITEST029', undefined, -20.03, undefined]]);
        expect(summary((await parse(docs.ingAdvanceTax())).batch.entries)).toEqual([['2026-01-04', 'tax', 'LU00ITEST029', undefined, -0.16, undefined]]);
        const untaxed = await parse(docs.ingAdvanceTax(false));
        expect(untaxed.batch.entries).toEqual([]);
        expect(labels(untaxed.report.ignored)).toEqual(['Vorabpauschale']);
    });

    it('books the result of a later loss offset as tax', async () => {
        expect(summary((await parse(docs.ingLossOffset())).batch.entries)).toEqual([['2026-01-16', 'tax', undefined, undefined, -0.29, undefined]]);
        expect(summary((await parse(docs.ingLossOffset('0,02'))).batch.entries)).toEqual([['2026-01-16', 'tax', undefined, undefined, 0.02, undefined]]);
        expect(labels((await parse(docs.ingLossOffset('0,00'))).report.ignored)).toEqual(['Nachträgliche Verlustverrechnung']);
    });
});

describe('ING documents that are not booked', () => {
    it('reports cancellations, statements, exchanges and unknown documents by title', async () => {
        const reported = async (pages: Pages) => {
            const { batch, report } = await parse(pages);
            expect(batch.entries).toEqual([]);
            return labels(report.unsupported);
        };
        expect(await reported(docs.ingCancelledDividend())).toEqual(['Storno Dividendengutschrift']);
        expect(await reported(docs.ingStatement())).toEqual(['Kontoauszug Februar 2025']);
        expect(await reported(docs.ingExchange())).toEqual(['Umtausch Eingang']);
        expect(await reported(docs.ingUnknown())).toEqual(['Information zu Ihrem Depot']);
    });

    it('skips cost information, which is no settlement', async () => {
        const { batch, report } = await parse(docs.ingCostInformation());
        expect(batch.entries).toEqual([]);
        expect(labels(report.ignored)).toEqual(['Kosteninformation']);
        expect(report.unsupported).toEqual([]);
    });
});

describe('ING import of several PDFs', () => {
    const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));

    it('imports a folder of documents once, and only new ones again', async () => {
        const files = await read([
            ['kauf.pdf', docs.ingBuy()], ['verkauf.pdf', docs.ingJointSell()], ['dividende.pdf', docs.ingDividend()],
            ['kosten.pdf', docs.ingCostInformation()], ['konto.pdf', docs.ingStatement()]
        ]);
        const { importer, result } = readImportFiles(files);
        expect(importer.id).toBe('ing');
        expect(result.report.rows).toBe(5);
        expect(result.report.ignored).toMatchObject([{ label: 'Kosteninformation', file: 'kosten.pdf' }]);
        expect(result.report.unsupported).toMatchObject([{ label: 'Kontoauszug Februar 2025', file: 'konto.pdf' }]);
        const first = applyImportBatch(createEmptyProject(), result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 2, addedMovements: 3, duplicateTransactions: 0 });

        const later = await read([['dividende.pdf', docs.ingDividend()], ['kauf.pdf', docs.ingBuy()], ['fremd.pdf', docs.ingForeignBuy()]]);
        const second = applyImportBatch(first.project, readImportFiles(later).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 1, addedMovements: 0, duplicateTransactions: 1, duplicateMovements: 2 });
    });

    it('keeps partial executions of one order apart', async () => {
        const files = await read([['a.pdf', docs.ingBuy('16:17:32')], ['b.pdf', docs.ingBuy('16:17:40')]]);
        const { summary: applied } = applyImportBatch(createEmptyProject(), readImportFiles(files).result.batch, target);
        expect(applied).toMatchObject({ addedTransactions: 2, duplicateTransactions: 0 });
    });

    it('refuses a PDF without a text layer, naming the file', async () => {
        const scan = new File([syntheticPdf([{ runs: [], imageOnly: true }]) as BlobPart], 'scan.pdf');
        await expect(readImportFile(scan, nodePdfjs)).rejects.toMatchObject({ code: 'noTextLayer', file: 'scan.pdf' });
    });
});
