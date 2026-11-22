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
import { wealthsimpleFileImporter as importer } from '../wealthsimple';
import { flatexBuy } from './pdf/flatexDocuments';
import * as docs from './pdf/wealthsimpleDocuments';

type Pages = Parameters<typeof pdfFromLines>[0];

const extract = async (pages: Pages): Promise<PdfDocumentText> => extractPdfText(pdfFromLines(pages), await nodePdfjs());
const parse = async (pages: Pages) => importer.parse(await extract(pages));
const summary = (entries: ImportEntry[]) => entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.currency]);
const cash = (entries: ImportEntry[]) => deriveCashBalances(entries.map((entry, index) => ({ ...entry, id: String(index) })));
const target = { id: 'p1', name: 'Wealthsimple', isNew: true };

describe('Wealthsimple detection', () => {
    it('recognises performance reports and reports other documents', async () => {
        expect(importer.detect(await extract(docs.wealthsimpleReport()))).toBe('performance-report');
        expect(detectPdfImporter(await extract(docs.wealthsimpleReport()))?.id).toBe('wealthsimple');
        expect(importer.detect(await extract(flatexBuy()))).toBeNull();
        const other = await parse(docs.wealthsimpleConfirmation());
        expect(other.report).toMatchObject({ variant: 'other' });
        expect(other.report.unsupported.map((note) => note.label)).toEqual(['Trade confirmation']);
    });
});

describe('Wealthsimple performance reports', () => {
    it('books all sections with the year of the title', async () => {
        const { batch, report } = await parse(docs.wealthsimpleReport());
        expect(report).toMatchObject({ importerId: 'wealthsimple', variant: 'performance-report', ignored: [], unsupported: [] });
        expect(summary(batch.entries)).toEqual([
            ['2020-07-02', 'withdrawal', undefined, undefined, -1000, 'CAD'],
            ['2020-04-02', 'deposit', undefined, undefined, 5000, 'CAD'],
            ['2020-05-02', 'deposit', undefined, undefined, 5000, 'CAD'],
            ['2020-09-25', 'sell', 'BSPA', -14.0853, 1521.49, 'CAD'],
            ['2020-12-29', 'buy', 'BSPB', 1.7582, -35.04, 'CAD'],
            ['2020-12-22', 'dividend', 'BSPC', undefined, 8.55, 'CAD'],
            ['2020-10-02', 'dividend', 'BSPD', undefined, 4.29, 'CAD'],
            ['2020-12-03', 'dividend', 'BSPB', undefined, 6.38, 'CAD'],
            ['2020-12-22', 'withholding_tax', 'BSPC', undefined, -1.28, 'CAD'],
            ['2020-12-31', 'fee', undefined, undefined, -4.42, 'CAD'],
            ['2020-12-31', 'fee', undefined, undefined, 0.26, 'CAD'],
            ['2020-12-31', 'fee', undefined, undefined, -0.21, 'CAD']
        ]);
        expect(cash(batch.entries)).toEqual({ CAD: 10500.02 });
        expect(batch.entries[3].name).toBe('Beispiel Corp');
        expect(JSON.stringify(batch.entries)).not.toMatch(/Max Beispiel|Beispiel Road/);
    });

    it('reads the year of a monthly report and matches the yearly one', async () => {
        const { batch } = await parse(docs.wealthsimpleReport({ title: 'June 2021 Performance Report' }));
        expect(batch.entries[0].date).toBe('2021-07-02');
    });

    it('reports dividends without a symbol', async () => {
        const { batch, report } = await parse(docs.wealthsimpleReport({
            pageTwo: [
                'Canadian and Foreign Dividends',
                'Jul 10 Beispiel US TIPS Index ETF (CAD-Hedged): 03-JUL-20 (record date) 14.0853 shares – – $1.36',
                'Dec 03 BSPB-Beispiel Long Bond ETF: 30-NOV-20 (record date) 148.3070 shares – – $6.38',
                'Total - Canadian and Foreign Dividends $7.74'
            ]
        }));
        expect(report.unsupported.map((note) => note.label)).toEqual(['Dividend without symbol']);
        expect(batch.entries.filter((entry) => entry.kind === 'dividend').map((entry) => entry.amount)).toEqual([6.38]);
    });

    it('reports a section that misses its total and rows of unknown sections', async () => {
        const wrong = await parse(docs.wealthsimpleReport({ pageTwo: [...docs.defaultTaxes.slice(0, 2), 'Total - Tax -$1.29'] }));
        expect(wrong.report.unsupported.map((note) => note.label)).toEqual(['Tax: total']);
        expect(wrong.batch.entries.some((entry) => entry.kind === 'withholding_tax')).toBe(false);
        const unknown = await parse(docs.wealthsimpleReport({ pageOne: docs.defaultDeposits, pageTwo: ['Interest', 'Dec 31 Interest on cash – – $1.00', 'Total - Interest $1.00'] }));
        expect(unknown.report.unsupported.map((note) => note.label)).toEqual(['Activity']);
    });

    it('reports a trade whose amount differs from the Total column', async () => {
        const { batch, report } = await parse(docs.wealthsimpleReport({ pageOne: ['Trades', 'Dec 29 settled Dec 31 Bought 1.7582 of BSPB - Beispiel Long Bond ETF for 35.04 CAD 1.7582 $19.93 $35.05'] }));
        expect(batch.entries.some((entry) => entry.kind === 'buy')).toBe(false);
        expect(report.unsupported.map((note) => note.label)).toEqual(['Trades (Dec 29)']);
    });

    it('refuses a report with several accounts', async () => {
        await expect(parse(docs.wealthsimpleReport({ second: 'RRSP' }))).rejects.toMatchObject({ code: 'severalAccounts' });
    });

    it('imports overlapping reports without double bookings and keeps equal rows of a report', async () => {
        const equal = ['Contributions and Deposits', 'Apr 02 Electronic Funds Transfer In: $5,000.00 CAD – – $5,000.00', 'Apr 02 Electronic Funds Transfer In: $5,000.00 CAD – – $5,000.00', 'Total - Contributions and Deposits $10,000.00'];
        const read = (entries: [string, Pages][]) => Promise.all(entries.map(([name, pages]) => readImportFile(new File([pdfFromLines(pages) as BlobPart], name), nodePdfjs)));
        const yearly = docs.wealthsimpleReport({ pageOne: equal });
        const first = applyImportBatch(createEmptyProject(), readImportFiles(await read([['2020.pdf', yearly]])).result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 0, duplicateMovements: 0 });
        const monthly = docs.wealthsimpleReport({ title: 'June 2020 Performance Report', pageOne: equal });
        const second = applyImportBatch(first.project, readImportFiles(await read([['june.pdf', monthly]])).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 0, addedMovements: 0 });
    });
});
