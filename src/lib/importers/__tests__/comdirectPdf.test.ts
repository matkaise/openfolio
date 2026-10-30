import { describe, expect, it } from 'vitest';
import { deriveCashBalances } from '@/lib/domain/ledger/ledger';
import { getLedger } from '@/lib/domain/ledger/store';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines, syntheticPdf } from '@/lib/pdf/__tests__/syntheticPdf';
import { extractPdfText } from '@/lib/pdf/extractPdfText';
import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { createEmptyProject } from '@/types/domain';
import { parseComdirectData, type ComdirectData } from '../comdirect';
import { comdirectFileImporter } from '../comdirectPdf';
import type { ImportEntry } from '../entries';
import { detectPdfImporter, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';
import * as docs from './pdf/comdirectDocuments';
import { ingBuy } from './pdf/ingDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

// Synthetic documents go through the real PDF extraction before the importer sees them
const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => comdirectFileImporter.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.fee]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const labels = (notes: { label: string }[]) => notes.map((note) => note.label);
const target = { id: 'p1', name: 'comdirect', isNew: true };

describe('comdirect PDF detection', () => {
    it('recognises settlements and letter-spaced tax notices, also by content of the second page', async () => {
        expect(comdirectFileImporter.detect(await extract(docs.comdirectBuy()))).toBe('comdirect');
        expect(detectPdfImporter(await extract(docs.comdirectDividendNotice()))?.id).toBe('comdirect');
    });

    it('leaves other banks alone', async () => {
        expect(comdirectFileImporter.detect(await extract(ingBuy()))).toBeNull();
    });
});

describe('comdirect settlements', () => {
    it('books a buy with its fees and leaves the summary of the fees out', async () => {
        const { batch, report } = await parse(docs.comdirectBuy());
        expect(report).toMatchObject({ importerId: 'comdirect', variant: 'comdirect', rows: 1, ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([['2025-01-02', 'buy', 'LU00CTEST012', 8.544, -999.9, -6.4]]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL Weltfonds - ESG Inhaber-Anteile LC o.N.', source: 'comdirect', externalId: 'comdirect-pdf:878649826981DB85' });
        expect(cash(batch.entries)).toEqual({ EUR: -1006.3 });
        expect(JSON.stringify(batch.entries)).not.toMatch(/1000000|Beispielweg|Max Beispiel|DE00 0000/);
    });

    it('books a foreign buy in the account currency: foreign costs are part of the converted amount', async () => {
        const { batch } = await parse(docs.comdirectForeignBuy());
        expect(summary(batch.entries)).toEqual([['2025-04-16', 'buy', 'US00CTEST024', 2, -4425.22, -18.93]]);
        expect(batch.entries[0].fxRate).toBe(1.0806);
    });

    it('reads the summary of partial executions and costs with a trailing minus', async () => {
        const { batch } = await parse(docs.comdirectPartialSell());
        expect(summary(batch.entries)).toEqual([['2025-03-10', 'sell', 'DE000CTEST36', -400, 8000, -40.64]]);
    });

    it('takes a discount off the purchase amount', async () => {
        expect(summary((await parse(docs.comdirectFundDiscount())).batch.entries)).toEqual([['2025-01-08', 'buy', 'LU00CTEST053', 0.205, -24.97, undefined]]);
    });

    it('books a fixed-price fund sale only if unit price and rate explain the amount', async () => {
        const { batch } = await parse(docs.comdirectFixedPriceSell());
        expect(summary(batch.entries)).toEqual([['2025-03-31', 'sell', 'LU00CTEST046', -0.156, 6.95, undefined]]);
        const [page] = docs.comdirectFixedPriceSell();
        const wrong = await parse([page.map((line) => (typeof line === 'string' && line.includes('EUR 6,95') ? line.replace('6,95', '9,95') : line))]);
        expect(wrong.batch.entries).toEqual([]);
        expect(labels(wrong.report.unsupported)).toEqual(['Wertpapierverkauf']);
    });

    it('reports bonds and settlements that do not add up', async () => {
        expect(labels((await parse(docs.comdirectBondBuy())).report.unsupported)).toEqual(['Wertpapierkauf']);
        const [page] = docs.comdirectBuy();
        const wrong = await parse([page.map((line) => (typeof line === 'string' && line.includes('1.006,30') ? line.replace('1.006,30', '1.016,30') : line))]);
        expect(wrong.batch.entries).toEqual([]);
        expect(labels(wrong.report.unsupported)).toEqual(['Wertpapierkauf']);
    });
});

describe('comdirect tax notices', () => {
    it('adds the tax of a sale from its notice, so the two PDFs give the final amount', async () => {
        const sale = await parse(docs.comdirectPartialSell());
        const notice = await parse(docs.comdirectSellNotice());
        expect(summary(notice.batch.entries)).toEqual([['2025-03-12', 'tax', 'DE000CTEST36', undefined, -131.87, undefined]]);
        expect(cash([...sale.batch.entries, ...notice.batch.entries])).toEqual({ EUR: 7827.49 });
    });

    it('books a refund positive', async () => {
        expect(summary((await parse(docs.comdirectRefundNotice())).batch.entries)).toEqual([['2025-04-03', 'tax', 'LU00CTEST046', undefined, 0.02, undefined]]);
    });

    it('reads settlement and notice from one PDF; a notice without tax books nothing', async () => {
        const { batch, report } = await parse(docs.comdirectBuyCombined());
        expect(summary(batch.entries)).toEqual([['2025-01-02', 'buy', 'LU00CTEST012', 8.544, -999.9, -6.4]]);
        expect(report.unsupported).toEqual([]);
        expect(labels(report.ignored)).toEqual(['Steuerliche Behandlung: Wertpapierkauf']);
    });

    it('books the advance lump sum tax, and nothing without tax', async () => {
        expect(summary((await parse(docs.comdirectAdvanceTax())).batch.entries)).toEqual([['2025-01-14', 'tax', 'IE00CTEST085', undefined, -0.09, undefined]]);
        const free = await parse(docs.comdirectAdvanceTax(false));
        expect(free.batch.entries).toEqual([]);
        expect(labels(free.report.ignored)).toEqual(['Steuerliche Behandlung: Vorabpauschale Ausland']);
    });
});

describe('comdirect dividends', () => {
    const expected = [
        ['2025-02-18', 'dividend', 'US00CTEST071', undefined, 15.9, undefined],
        ['2025-02-18', 'withholding_tax', 'US00CTEST071', undefined, -2.38, undefined],
        ['2025-02-18', 'tax', 'US00CTEST071', undefined, -1.68, undefined]
    ];

    it('books the dividend from the Steuermitteilung: gross, credited withholding tax and tax', async () => {
        const { batch } = await parse(docs.comdirectDividendNotice());
        expect(summary(batch.entries)).toEqual(expected);
        expect(batch.entries[0]).toMatchObject({ name: 'MUSTER REALTY CORP. DL 1' });
        expect(cash(batch.entries)).toEqual({ EUR: 11.84 });
    });

    it('never books the Dividendengutschrift, alone or in one PDF with the notice', async () => {
        const credit = await parse(docs.comdirectDividendCredit());
        expect(credit.batch.entries).toEqual([]);
        expect(labels(credit.report.ignored)).toEqual(['Dividendengutschrift (gebucht wird die Steuermitteilung)']);

        const both = await parse(docs.comdirectDividendBoth());
        expect(summary(both.batch.entries)).toEqual(expected);
    });

    it('books both documents of a dividend as one dividend, whichever way they are imported', async () => {
        const read = (files: [string, Pages][]) => Promise.all(files.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));
        const separate = readImportFiles(await read([['gutschrift.pdf', docs.comdirectDividendCredit()], ['steuer.pdf', docs.comdirectDividendNotice()]]));
        const first = applyImportBatch(createEmptyProject(), separate.result.batch, target);
        expect(first.summary).toMatchObject({ addedMovements: 3 });
        const combined = readImportFiles(await read([['beide.pdf', docs.comdirectDividendBoth()]]));
        const second = applyImportBatch(first.project, combined.result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedMovements: 0, duplicateMovements: 3 });
    });

    it('books a credit from before 2009, which has no notice', async () => {
        const { batch } = await parse(docs.comdirectOldDividend());
        expect(summary(batch.entries)).toEqual([
            ['2008-05-15', 'dividend', 'DE000CTEST77', undefined, 160, undefined],
            ['2008-05-15', 'tax', 'DE000CTEST77', undefined, -33.76, undefined]
        ]);
    });

    it('skips accumulation without a payout', async () => {
        const { batch, report } = await parse(docs.comdirectAccumulation());
        expect(batch.entries).toEqual([]);
        expect(labels(report.ignored)).toEqual(['Ertragsthesaurierung']);
    });
});

describe('comdirect documents that are not booked', () => {
    it('skips announcements of a settlement and cost information', async () => {
        expect(labels((await parse(docs.comdirectExecutionNotice())).report.ignored)).toEqual(['Ausführungsbestätigung']);
        expect(labels((await parse(docs.comdirectCostInformation())).report.ignored)).toEqual(['Kosteninformation']);
    });

    it('reports statements, custody fees and unknown documents', async () => {
        const reported = async (pages: Pages) => {
            const { batch, report } = await parse(pages);
            expect(batch.entries).toEqual([]);
            return labels(report.unsupported);
        };
        expect(await reported(docs.comdirectFinancialReport())).toEqual(['Finanzreport Nr. 9 per 01.10.2025']);
        expect(await reported(docs.comdirectCustodyFee())).toEqual(['Abrechnung Verwahrentgelt']);
        expect(await reported(docs.comdirectUnknown())).toEqual(['comdirect bank AG, 25449 Quickborn']);
    });

    it('refuses a PDF without a text layer, naming the file', async () => {
        const scan = new File([syntheticPdf([{ runs: [], imageOnly: true }]) as BlobPart], 'scan.pdf');
        await expect(readImportFile(scan, nodePdfjs)).rejects.toMatchObject({ code: 'noTextLayer', file: 'scan.pdf' });
    });
});

describe('comdirect PDF and API in one depot', () => {
    const data: ComdirectData = {
        depot: { depotId: 'D1', defaultSettlementAccountId: 'A1' },
        positions: [],
        depotTransactions: [{
            transactionId: 'T1', bookingStatus: 'BOOKED', bookingDate: '2025-01-06', businessDate: '2025-01-02', quantity: { value: '8.544', unit: 'XXX' },
            instrument: { isin: 'LU00CTEST012', name: 'BEISPIEL' }, transactionValue: { value: '999.90', unit: 'EUR' }, transactionType: { key: 'BUY', text: 'Kauf' }
        }, {
            transactionId: 'T2', bookingStatus: 'BOOKED', bookingDate: '2025-03-12', businessDate: '2025-03-10', quantity: { value: '-400', unit: 'XXX' },
            instrument: { isin: 'DE000CTEST36', name: 'MUSTER' }, transactionValue: { value: '8000', unit: 'EUR' }, transactionType: { key: 'SELL', text: 'Verkauf' }
        }],
        accountTransactions: [{
            reference: 'R1', bookingStatus: 'BOOKED', bookingDate: '2025-02-19', amount: { value: '11.84', unit: 'EUR' },
            transactionType: { key: 'INTEREST_DIVIDENDS', text: 'Zinsen / Dividenden' }, remittanceInfo: '01Dividendengutschrift MUSTER 02US00CTEST071'
        }]
    };
    const api = () => parseComdirectData(data).batch;
    const pdfs = async () => {
        const files = await Promise.all([
            ['kauf.pdf', docs.comdirectBuy()], ['verkauf.pdf', docs.comdirectPartialSell()], ['steuer.pdf', docs.comdirectSellNotice()],
            ['dividende.pdf', docs.comdirectDividendNotice()], ['fremd.pdf', docs.comdirectForeignBuy()]
        ].map(([name, pages]) => readImportFile(new File([pdfFromLines(pages as Pages) as BlobPart], name as string), nodePdfjs)));
        return readImportFiles(files).result.batch;
    };

    it('adds from PDFs only what the API does not hold', async () => {
        const synced = applyImportBatch(createEmptyProject(), api(), target);
        expect(synced.summary).toMatchObject({ addedTransactions: 2, addedMovements: 1 });
        const { project, summary: applied } = applyImportBatch(synced.project, await pdfs(), { ...target, isNew: false });
        expect(applied).toMatchObject({ addedTransactions: 1, duplicateTransactions: 2, addedMovements: 1, duplicateMovements: 3 });
        const ledger = getLedger(project);
        expect(ledger.filter((entry) => entry.kind === 'dividend').map((entry) => entry.amount)).toEqual([11.84]);
        expect(ledger.filter((entry) => entry.kind === 'tax').map((entry) => entry.amount)).toEqual([-131.87]);
    });

    it('does not repeat PDF bookings in a later API sync', async () => {
        const imported = applyImportBatch(createEmptyProject(), await pdfs(), target);
        const { summary: applied, project } = applyImportBatch(imported.project, api(), { ...target, isNew: false });
        expect(applied).toMatchObject({ addedTransactions: 0, duplicateTransactions: 2, addedMovements: 0, duplicateMovements: 1 });
        expect(getLedger(project)).toHaveLength(getLedger(imported.project).length);
    });

    it('keeps equal trades of one day apart: each API trade covers one PDF', async () => {
        const twice: ComdirectData = { ...data, depotTransactions: [data.depotTransactions[0]], accountTransactions: [] };
        const synced = applyImportBatch(createEmptyProject(), parseComdirectData(twice).batch, target);
        const one = await parse(docs.comdirectBuy());
        const other = { ...one.batch, entries: one.batch.entries.map((entry) => ({ ...entry, externalId: `${entry.externalId}-2` })) };
        const merged = { ...one.batch, entries: [...one.batch.entries, ...other.entries] };
        expect(applyImportBatch(synced.project, merged, { ...target, isNew: false }).summary).toMatchObject({ addedTransactions: 1, duplicateTransactions: 1 });
    });

    it('leaves another depot alone', async () => {
        const synced = applyImportBatch(createEmptyProject(), api(), target);
        const { summary: applied } = applyImportBatch(synced.project, await pdfs(), { id: 'p2', name: 'other', isNew: true });
        expect(applied).toMatchObject({ addedTransactions: 3, duplicateTransactions: 0 });
    });
});
