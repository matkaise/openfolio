import { concatImportBatches, type ImportBatch } from './importBatch';

// Broker file importers (CSV, XML, ...): the user exports a file at the broker and
// Openfolio reads it. Each importer recognises its files by content (never by file
// name), turns them into an ImportBatch and reports every row it did not book, so
// nothing disappears silently.

/** A row of the file that did not become a booking: its line number and the file's own type label. */
export interface ImportRowNote {
    line: number;
    label: string;
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

export type ImportErrorCode = 'unknownFormat' | 'noRows' | 'invalidNumber' | 'invalidDate' | 'severalAccounts' | 'missingCurrency';

/** A file that cannot be imported; the UI shows a message for `code`. */
export class FileImportError extends Error {
    constructor(public readonly code: ImportErrorCode, public readonly line?: number) {
        super(line ? `${code} (line ${line})` : code);
        this.name = 'FileImportError';
    }
}

export interface FileImporter {
    id: string; // also the key of its export guide in the messages (fileImport.guides)
    broker: string; // brand name, not translated
    formats: string[]; // e.g. ['CSV']
    accept: string; // file input filter
    multiple?: boolean; // the broker exports several files that belong together
    sources: { label: string; url: string }[]; // where the export guide was checked
    verified: string; // YYYY-MM-DD of the last check of guide and format
    /** The format variant this file is in, or null if it is not a file of this importer. */
    detect: (text: string) => string | null;
    /** `fileName` only for data the file itself lacks (XTB: account currency), never for detection. */
    parse: (text: string, fileName?: string) => FileImportResult;
}

/** First and last booking date of a batch. */
export const batchPeriod = (batch: ImportBatch): FileImportReport['period'] => {
    const dates = [...batch.entries.map((entry) => entry.date), ...batch.cashBalances.map((point) => point.date)].sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
};

/** Combines the results of several files of one importer (e.g. DEGIRO Transactions.csv and Account.csv). */
export const mergeFileImports = (importer: Pick<FileImporter, 'id'>, results: FileImportResult[]): FileImportResult => {
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
