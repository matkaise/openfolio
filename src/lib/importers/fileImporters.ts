import { avanzaFileImporter } from './avanza';
import { degiroFileImporter } from './degiroFile';
import { directaFileImporter } from './directa';
import { etoroFileImporter } from './etoro';
import { freetradeFileImporter } from './freetrade';
import { investEngineFileImporter } from './investengine';
import { revolutFileImporter } from './revolut';
import { saxoFileImporter } from './saxo';
import { schwabFileImporter } from './schwab';
import { swissquoteFileImporter } from './swissquote';
import { tradeRepublicFileImporter } from './traderepublic';
import { trading212FileImporter } from './trading212Csv';
import { xtbFileImporter } from './xtb';
import { hasTextLayer, type PdfDocumentText } from '@/lib/pdf/pdfText';
import {
    FileImportError,
    isPdfImporter,
    mergeFileImports,
    type BrokerFileImporter,
    type FileImporter,
    type FileImportResult,
    type ImportFile,
    type PdfFileImporter
} from './fileImport';

/** Every broker file importer, in the order the import dialog lists them. */
export const FILE_IMPORTERS: BrokerFileImporter[] = [
    degiroFileImporter,
    swissquoteFileImporter,
    tradeRepublicFileImporter,
    trading212FileImporter,
    xtbFileImporter,
    saxoFileImporter,
    schwabFileImporter,
    revolutFileImporter,
    etoroFileImporter,
    freetradeFileImporter,
    investEngineFileImporter,
    avanzaFileImporter,
    directaFileImporter
];

export const findFileImporter = (id: string): BrokerFileImporter | undefined => (
    FILE_IMPORTERS.find((importer) => importer.id === id)
);

/** The importer whose format the file is in, by content. */
export const detectFileImporter = (text: string): FileImporter | undefined => (
    FILE_IMPORTERS.find((importer): importer is FileImporter => !isPdfImporter(importer) && importer.detect(text) !== null)
);

/** The PDF importer of the broker that issued the document, by content. */
export const detectPdfImporter = (pdf: PdfDocumentText, importers: BrokerFileImporter[] = FILE_IMPORTERS): PdfFileImporter | undefined => (
    importers.find((importer): importer is PdfFileImporter => isPdfImporter(importer) && importer.detect(pdf) !== null)
);

/** Text files may be passed as plain `{ name, text }`. */
type ReadableFile = ImportFile | { name: string; text: string; kind?: undefined };

/**
 * Reads files that belong to one import. All files must be recognised by the same
 * importer; a file of another broker or an unknown format fails the whole import,
 * naming the file. Several PDFs (one settlement each) are read one by one and merged.
 */
export const readImportFiles = (
    files: ReadableFile[],
    importers: BrokerFileImporter[] = FILE_IMPORTERS
): { importer: BrokerFileImporter; result: FileImportResult } => {
    if (files.length === 0) throw new FileImportError('noRows');
    const detected = files.map((file) => {
        if (file.kind === 'pdf') {
            if (!hasTextLayer(file.pdf)) throw new FileImportError('noTextLayer', undefined, file.name);
            return detectPdfImporter(file.pdf, importers);
        }
        return importers.find((importer) => !isPdfImporter(importer) && importer.detect(file.text) !== null);
    });
    const importer = detected[0];
    const unknown = detected.findIndex((candidate) => !candidate);
    if (unknown >= 0) throw new FileImportError('unknownFormat', undefined, files.length > 1 ? files[unknown].name : undefined);
    if (!importer || detected.some((candidate) => candidate !== importer)) throw new FileImportError('mixedFiles');

    const results = files.map((file) => {
        const result = file.kind === 'pdf'
            ? (importer as PdfFileImporter).parse(file.pdf, file.name)
            : (importer as FileImporter).parse(file.text, file.name);
        if (files.length === 1) return result;
        const withFile = (notes: FileImportResult['report']['ignored']) => notes.map((note) => ({ ...note, file: file.name }));
        return { ...result, report: { ...result.report, ignored: withFile(result.report.ignored), unsupported: withFile(result.report.unsupported) } };
    });
    return { importer, result: results.length === 1 ? results[0] : mergeFileImports(importer, results) };
};
