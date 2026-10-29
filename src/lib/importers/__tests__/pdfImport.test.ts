import { describe, expect, it } from 'vitest';
import { nodePdfjs } from '@/lib/pdf/__tests__/nodePdfjs';
import { pdfFromLines, syntheticPdf } from '@/lib/pdf/__tests__/syntheticPdf';
import { createEmptyProject } from '@/types/domain';
import { statementEntry } from '../entries';
import { batchPeriod, FileImportError, type BrokerFileImporter, type PdfFileImporter } from '../fileImport';
import { FILE_IMPORTERS, readImportFiles } from '../fileImporters';
import { applyImportBatch, emptyImportBatch } from '../importBatch';
import { readImportFile } from '../readImportFile';

// The PDF path of the import with a minimal importer of a made-up bank: one fee per
// "Gebührenabrechnung", other documents of the bank are reported, not booked.
const testBank: PdfFileImporter = {
    id: 'testbank',
    broker: 'Testbank',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [{ label: 'synthetic', url: 'https://example.org' }],
    verified: '2026-10-29',
    detect: (pdf) => (pdf.pages[0]?.[0] === 'Testbank AG' ? 'standard' : null),
    parse: (pdf) => {
        const lines = pdf.pages.flat();
        const batch = emptyImportBatch('Testbank');
        const fee = lines.map((line) => /^Gebühr (\d{4}-\d{2}-\d{2}) (\d+),(\d{2}) EUR Nr\. (\d+)$/.exec(line)).find(Boolean);
        if (lines[1] === 'Gebührenabrechnung' && fee) {
            batch.entries.push(statementEntry({ source: 'Testbank', externalId: `testbank:${fee[4]}`, date: fee[1], type: 'Fee', amount: -Number(`${fee[2]}.${fee[3]}`), currency: 'EUR' }));
            return { batch, report: { importerId: 'testbank', variant: 'standard', period: batchPeriod(batch), rows: 1, ignored: [], unsupported: [] } };
        }
        return { batch, report: { importerId: 'testbank', variant: 'standard', period: null, rows: 1, ignored: [], unsupported: [{ line: 2, page: 1, label: lines[1] }] } };
    }
};
const importers: BrokerFileImporter[] = [...FILE_IMPORTERS, testBank];

const feePdf = (number: number, date: string) => pdfFromLines([['Testbank AG', 'Gebührenabrechnung', `Gebühr ${date} 4,90 EUR Nr. ${number}`]]);
const asFile = (data: Uint8Array | string, name: string) => new File([data as BlobPart], name);

const read = async (files: File[]) => Promise.all(files.map((file) => readImportFile(file, nodePdfjs)));

const errorOf = async (run: () => Promise<unknown> | unknown) => {
    try {
        await run();
    } catch (error) {
        if (error instanceof FileImportError) return { code: error.code, file: error.file };
        throw error;
    }
    return null;
};

describe('PDF import', () => {
    it('reads several PDFs of one broker together and reports documents it does not book', async () => {
        const files = await read([
            asFile(feePdf(1, '2026-01-05'), 'a.pdf'),
            asFile(feePdf(2, '2026-02-05'), 'b.pdf'),
            asFile(pdfFromLines([['Testbank AG', 'Auftragsbestätigung', 'Kauf 3 Stk.']]), 'order.pdf')
        ]);
        expect(files.map((file) => file.kind)).toEqual(['pdf', 'pdf', 'pdf']);
        const { importer, result } = readImportFiles(files, importers);
        expect(importer.id).toBe('testbank');
        expect(result.batch.entries.map((entry) => [entry.date, entry.amount])).toEqual([['2026-01-05', -4.9], ['2026-02-05', -4.9]]);
        expect(result.report.rows).toBe(3);
        expect(result.report.period).toEqual({ from: '2026-01-05', to: '2026-02-05' });
        expect(result.report.unsupported).toEqual([{ line: 2, page: 1, label: 'Auftragsbestätigung', file: 'order.pdf' }]);
    });

    it('books a settlement once when it is dropped twice or imported again', async () => {
        const target = { id: 'p1', name: 'Testbank', isNew: true };
        const files = await read([asFile(feePdf(1, '2026-01-05'), 'a.pdf'), asFile(feePdf(1, '2026-01-05'), 'a (1).pdf')]);
        const first = applyImportBatch(createEmptyProject(), readImportFiles(files, importers).result.batch, target);
        expect(first.summary.addedMovements).toBe(1);
        expect(first.summary.duplicateMovements).toBe(1);
        const again = applyImportBatch(first.project, readImportFiles(files.slice(0, 1), importers).result.batch, { ...target, isNew: false });
        expect(again.summary.addedMovements).toBe(0);
        expect(again.project).toBe(first.project);
    });

    it('names the file that is not readable or of another broker', async () => {
        const scan = asFile(syntheticPdf([{ runs: [], imageOnly: true }]), 'scan.pdf');
        expect(await errorOf(() => read([scan]))).toEqual({ code: 'noTextLayer', file: 'scan.pdf' });
        const locked = asFile(syntheticPdf([{ runs: [{ x: 50, y: 700, text: 'Testbank AG' }] }], { encrypted: true }), 'locked.pdf');
        expect(await errorOf(() => read([locked]))).toEqual({ code: 'pdfEncrypted', file: 'locked.pdf' });

        const files = await read([asFile(feePdf(1, '2026-01-05'), 'a.pdf'), asFile(pdfFromLines([['Andere Bank', 'Kontoauszug']]), 'other.pdf')]);
        expect(await errorOf(() => readImportFiles(files, importers))).toEqual({ code: 'unknownFormat', file: 'other.pdf' });
        expect(await errorOf(() => readImportFiles(files.slice(1), importers))).toEqual({ code: 'unknownFormat', file: undefined });
        expect(await errorOf(() => readImportFiles([{ name: 'empty.pdf', kind: 'pdf', pdf: { pages: [[]] } }], importers))).toEqual({ code: 'noTextLayer', file: 'empty.pdf' });
    });

    it('does not mix PDFs and CSV exports of different importers', async () => {
        const [pdf] = await read([asFile(feePdf(1, '2026-01-05'), 'a.pdf')]);
        const csv = 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id\n'
            + '2026-01-02T10:00:00Z,2026-01-02,DEFAULT,CASH,CUSTOMER_INBOUND,,,,,,100,,,EUR,,,,Einzahlung,t1\n';
        expect(await errorOf(() => readImportFiles([pdf, { name: 'tr.csv', kind: 'text', text: csv }], importers))).toEqual({ code: 'mixedFiles', file: undefined });
    });

    it('reads other files as text, whatever their name', async () => {
        const [file] = await read([asFile('Datum;Betrag\n', 'looks-like.pdf')]);
        expect(file).toEqual({ name: 'looks-like.pdf', kind: 'text', text: 'Datum;Betrag\n' });
    });
});
