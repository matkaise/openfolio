import { describe, expect, it } from 'vitest';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { flatexFileImporter } from '../flatex';
import type { ImportEntry } from '../entries';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import * as docs from './pdf/flatexDocuments';
import { scalableBuyDe } from './pdf/scalableDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

// Synthetic documents go through the real PDF extraction before the importer sees them
const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => flatexFileImporter.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const target = { id: 'p1', name: 'flatex', isNew: true };

describe('flatex PDF detection', () => {
    it('recognises flatex, flatexDEGIRO and FinTech Group documents', async () => {
        expect(flatexFileImporter.detect(await extract(docs.flatexBuy()))).toBe('flatex');
        expect(flatexFileImporter.detect(await extract(docs.flatexCollective()))).toBe('flatex');
        expect(flatexFileImporter.detect(await extract(docs.fintechBuy()))).toBe('fintech');
        expect(detectPdfImporter(await extract(docs.flatexDividend()))?.id).toBe('flatex');
    });

    it('leaves Scalable, DEGIRO and other documents alone', async () => {
        expect(flatexFileImporter.detect(await extract(scalableBuyDe()))).toBeNull();
        expect(detectPdfImporter(await extract(scalableBuyDe()))?.id).toBe('scalable');
        expect(flatexFileImporter.detect(await extract([['flatexDEGIRO Bank Dutch Branch', 'DEGIRO B.V.', 'Transactions']]))).toBeNull();
    });
});

describe('flatex settlements', () => {
    it('reads the two-column layout of a buy with commission and third-party costs', async () => {
        const { batch, report } = await parse(docs.flatexBuy());
        expect(report).toMatchObject({ importerId: 'flatex', variant: 'flatex', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2023-03-27', 'buy', 'IE00FTEST012', 29, -751.68, -8.41]]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL EM IMI UCITS ETF', currency: 'EUR', orderId: '230000001/1', externalId: 'flatex:230000001/1:9000000001' });
        expect(cash(batch.entries)).toEqual({ EUR: -760.09 });
        expect(JSON.stringify(batch.entries)).not.toMatch(/1000000001|Beispielweg|Max Beispiel/);
    });

    it('books a sale with withheld tax as its own booking', async () => {
        const { batch } = await parse(docs.flatexSell());
        expect(summary(batch.entries)).toEqual([
            ['2023-05-24', 'sell', 'DE000FTEST18', -40, 2400, -5.9],
            ['2023-05-24', 'tax', 'DE000FTEST18', undefined, -105.5, undefined]
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 2288.6 });
    });

    it('books a foreign sale in the account currency with the exchange rate and a tax refund', async () => {
        const { batch } = await parse(docs.flatexForeignSellWithRefund());
        expect(summary(batch.entries)).toEqual([
            ['2026-08-14', 'sell', 'US00TEST0077', -60, 1274.85, -5.93],
            ['2026-08-14', 'tax', 'US00TEST0077', undefined, 58.02, undefined]
        ]);
        expect(batch.entries[0].fxRate).toBe(1.161544);
        expect(cash(batch.entries)).toEqual({ EUR: 1326.94 });
    });

    it('reads the earlier FinTech Group layout', async () => {
        const { batch, report } = await parse(docs.fintechBuy());
        expect(report.variant).toBe('fintech');
        expect(summary(batch.entries)).toEqual([['2016-12-15', 'buy', 'IE00FTEST038', 19.334524, -1050, undefined]]);
    });

    it('books every settlement of a collective statement and reports the bond', async () => {
        const { batch, report } = await parse(docs.flatexCollective());
        expect(summary(batch.entries)).toEqual([
            ['2026-01-27', 'buy', 'CA00TEST0013', 10, -181.05, -8.3],
            ['2026-01-27', 'sell', 'US00TEST0044', -5, 1406.25, -6.64],
            ['2026-01-27', 'tax', 'US00TEST0044', undefined, -0.41, undefined]
        ]);
        expect(batch.entries[0].name).toBe('BEISPIEL GOLD MINES LTD.');
        expect(report.unsupported).toEqual([{ line: 10, page: 2, label: 'Sammelabrechnung (Wertpapierkauf/-verkauf): Kauf' }]);
        expect(cash(batch.entries)).toEqual({ EUR: 1209.85 });
    });

    it('reports a settlement that does not add up instead of guessing', async () => {
        const [page] = docs.flatexBuy();
        const changed = page.map((line) => (Array.isArray(line) && line.some(([, text]) => text.includes('-760,09'))
            ? [[300, 'Endbetrag     :            -765,00 EUR']] as [number, string][]
            : line));
        const { batch, report } = await parse([changed]);
        expect(batch.entries).toEqual([]);
        expect(report.unsupported.map((note) => note.label)).toEqual(['Wertpapierabrechnung Kauf Fonds/Zertifikate: Kauf']);
    });
});

describe('flatex income, taxes and fees', () => {
    it('books a foreign dividend gross in EUR with withholding tax and fees converted at the stated rate', async () => {
        const { batch } = await parse(docs.flatexDividend());
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.amount, entry.currency])).toEqual([
            ['2022-06-17', 'dividend', 10.14, 'EUR'],
            ['2022-06-17', 'withholding_tax', -2.67, 'EUR'],
            ['2022-06-17', 'fee', -0.1, 'EUR']
        ]);
        expect(cash(batch.entries)).toEqual({ EUR: 7.37 });

        const taxed = await parse(docs.flatexDividend('1,50', '5,87'));
        expect(taxed.batch.entries.map((entry) => [entry.kind, entry.amount, entry.description])).toEqual([
            ['dividend', 10.14, 'Dividendengutschrift für ausländische Wertpapiere'],
            ['withholding_tax', -2.67, 'Quellensteuer'],
            ['withholding_tax', -1.5, 'Einbehaltene Steuer'],
            ['fee', -0.1, 'Gebühren']
        ]);
    });

    it('books only the tax of an accumulating fund', async () => {
        const { batch } = await parse(docs.flatexAccumulation());
        expect(summary(batch.entries)).toEqual([['2021-10-08', 'tax', 'IE00FTEST046', undefined, -15.24, undefined]]);
    });

    it('books the tax on the advance lump sum and the custody fee of a foreign custodian', async () => {
        expect(summary((await parse(docs.flatexAdvanceTax())).batch.entries)).toEqual([['2024-01-29', 'tax', 'IE00FTEST053', undefined, -1.23, undefined]]);
        expect((await parse(docs.flatexAdvanceTax('0,00'))).report.ignored.map((note) => note.label)).toEqual(['Wertpapierabrechnung Vorabpauschale']);
        const fee = await parse(docs.flatexCustodyFee());
        expect(summary(fee.batch.entries)).toEqual([['2023-03-23', 'fee', 'US00TEST0069', undefined, -0.18, undefined]]);
        expect(fee.batch.entries[0].name).toBe('BEISPIEL BIOTECH ADR');
    });

    it('skips order confirmations and reports cancellations and statements', async () => {
        const confirmation = await parse(docs.flatexOrderConfirmation());
        expect(confirmation.batch.entries).toEqual([]);
        expect(confirmation.report.ignored.map((note) => note.label)).toEqual(['Auftragsbestätigung']);
        expect((await parse(docs.flatexCancelledBuy())).report.unsupported.map((note) => note.label)).toEqual(['Stornierung Wertpapierabrechnung Kauf Fonds']);
        expect((await parse(docs.flatexStatement())).report.unsupported.map((note) => note.label)).toEqual(['Kontoauszug']);
    });
});

describe('flatex import of several PDFs', () => {
    const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));

    it('imports a folder of settlements once, and only new ones again', async () => {
        const files = await read([
            ['kauf.pdf', docs.flatexBuy()], ['verkauf.pdf', docs.flatexSell()], ['sammel.pdf', docs.flatexCollective()],
            ['dividende.pdf', docs.flatexDividend()], ['auftrag.pdf', docs.flatexOrderConfirmation()]
        ]);
        const { importer, result } = readImportFiles(files);
        expect(importer.id).toBe('flatex');
        expect(result.report.rows).toBe(5);
        expect(result.report.ignored).toEqual([{ line: 4, page: 1, label: 'Auftragsbestätigung', file: 'auftrag.pdf' }]);
        const first = applyImportBatch(createEmptyProject(), result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 4, addedMovements: 5, duplicateTransactions: 0 });

        const later = await read([['verkauf.pdf', docs.flatexSell()], ['fremd.pdf', docs.flatexForeignSellWithRefund()]]);
        const second = applyImportBatch(first.project, readImportFiles(later).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 1, addedMovements: 1, duplicateTransactions: 1, duplicateMovements: 1 });
    });

    it('keeps flatex PDFs apart from DEGIRO CSV imports of the same bank', async () => {
        const [pdf] = await read([['kauf.pdf', docs.flatexBuy()]]);
        const { result } = readImportFiles([pdf]);
        expect(new Set(result.batch.entries.map((entry) => entry.source))).toEqual(new Set(['flatex']));
        // DEGIRO CSV bookings carry the source "Flatex"; flatex PDFs never match them as duplicates
        expect(result.batch.entries.every((entry) => entry.source !== 'Flatex')).toBe(true);
    });
});
