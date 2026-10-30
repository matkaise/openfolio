import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { concatImportBatches, type ImportBatch } from './importBatch';

// Broker file importers (CSV, XML, PDF, ...): the user exports a file at the broker and
// Openfolio reads it. Each importer recognises its files by content (never by file
// name), turns them into an ImportBatch and reports every row it did not book, so
// nothing disappears silently. PDF importers get the extracted text layer
// (lib/pdf/extractPdfText.ts), one settlement per file, and report documents they do
// not book (order confirmations, statements, ...) the same way.

/** A row (or for PDFs: a document or booking line) that did not become a booking. */
export interface ImportRowNote {
    line: number; // line in the file; for PDFs the line on `page`
    page?: number; // PDFs only
    label: string; // the file's own type label, for PDFs the document title
    file?: string; // set when several files are imported together
}

export interface FileImportReport {
    importerId: string;
    variant: string; // format variant the file was recognised as, e.g. 'en-15' (see messages fileImport.variants)
    period: { from: string; to: string } | null;
    rows: number; // data rows read
    ignored: ImportRowNote[]; // administrative rows without cash or position effect
    unsupported: ImportRowNote[]; // rows with a financial effect Openfolio does not book yet
}

export interface FileImportResult {
    batch: ImportBatch;
    report: FileImportReport;
}

export type ImportErrorCode =
    | 'unknownFormat' | 'noRows' | 'invalidNumber' | 'invalidDate' | 'severalAccounts' | 'missingCurrency'
    | 'noTextLayer' | 'pdfEncrypted' | 'pdfUnreadable' | 'mixedFiles';

/** A file that cannot be imported; the UI shows a message for `code`. */
export class FileImportError extends Error {
    constructor(public readonly code: ImportErrorCode, public readonly line?: number, public readonly file?: string) {
        super([code, line ? `line ${line}` : '', file || ''].filter(Boolean).join(' '));
        this.name = 'FileImportError';
    }
}

/** A file as the import reads it: text files as their text, PDFs as their text layer. */
export type ImportFile =
    | { name: string; kind: 'text'; text: string }
    | { name: string; kind: 'pdf'; pdf: PdfDocumentText };

interface FileImporterInfo {
    id: string; // also the key of its export guide in the messages (fileImport.guides)
    broker: string; // brand name, not translated
    formats: string[]; // e.g. ['CSV']
    accept: string; // file input filter
    multiple?: boolean; // the broker exports several files that belong together
    sources: { label: string; url: string }[]; // where the export guide was checked
    verified: string; // YYYY-MM-DD of the last check of guide and format
}

/** Importer of a text file (CSV, XML). */
export interface FileImporter extends FileImporterInfo {
    input?: 'text';
    /** The format variant this file is in, or null if it is not a file of this importer. */
    detect: (text: string) => string | null;
    /** `fileName` only for data the file itself lacks (XTB: account currency), never for detection. */
    parse: (text: string, fileName?: string) => FileImportResult;
    /** Runs once all files of an import are read, for checks across them (DEGIRO: trades listed in only one file). */
    finish?: (result: FileImportResult) => FileImportResult;
}

/** Importer of PDF documents; several files (one per settlement) can be imported together. */
export interface PdfFileImporter extends FileImporterInfo {
    input: 'pdf';
    /**
     * The format variant (e.g. document generation) if the PDF was issued by this broker,
     * otherwise null. Documents of the broker that are not booked (order confirmations,
     * cost statements) are recognised too and reported by `parse`.
     */
    detect: (pdf: PdfDocumentText) => string | null;
    parse: (pdf: PdfDocumentText, fileName?: string) => FileImportResult;
}

export type BrokerFileImporter = FileImporter | PdfFileImporter;

export const isPdfImporter = (importer: BrokerFileImporter): importer is PdfFileImporter => importer.input === 'pdf';

/** First and last booking date of a batch. */
export const batchPeriod = (batch: ImportBatch): FileImportReport['period'] => {
    const dates = [...batch.entries.map((entry) => entry.date), ...batch.cashBalances.map((point) => point.date)].sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
};

/** Combines the results of several files of one importer (e.g. DEGIRO Transactions.csv and Account.csv). */
export const mergeFileImports = (importer: Pick<BrokerFileImporter, 'id'>, results: FileImportResult[]): FileImportResult => {
    const batch = concatImportBatches(results[0]?.batch.source || importer.id, results.map((result) => result.batch));
    const variants = Array.from(new Set(results.map((result) => result.report.variant)));
    return {
        batch,
        report: {
            importerId: importer.id,
            variant: variants.join('+'),
            period: batchPeriod(batch),
            rows: results.reduce((sum, result) => sum + result.report.rows, 0),
            ignored: results.flatMap((result) => result.report.ignored),
            unsupported: results.flatMap((result) => result.report.unsupported)
        }
    };
};
