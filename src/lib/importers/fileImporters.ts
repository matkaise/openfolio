import { degiroFileImporter } from './degiroFile';
import { swissquoteFileImporter } from './swissquote';
import { tradeRepublicFileImporter } from './traderepublic';
import { trading212FileImporter } from './trading212Csv';
import { FileImportError, mergeFileImports, type FileImporter, type FileImportResult } from './fileImport';

/** Every broker file importer, in the order the import dialog lists them. */
export const FILE_IMPORTERS: FileImporter[] = [
    degiroFileImporter,
    swissquoteFileImporter,
    tradeRepublicFileImporter,
    trading212FileImporter
];

export const findFileImporter = (id: string): FileImporter | undefined => (
    FILE_IMPORTERS.find((importer) => importer.id === id)
);

/** The importer whose format the file is in, by content. */
export const detectFileImporter = (text: string): FileImporter | undefined => (
    FILE_IMPORTERS.find((importer) => importer.detect(text) !== null)
);

/**
 * Reads files that belong to one import. All files must be recognised by the same
 * importer; a file of another broker or an unknown format fails the whole import.
 */
export const readImportFiles = (files: { name: string; text: string }[]): { importer: FileImporter; result: FileImportResult } => {
    if (files.length === 0) throw new FileImportError('noRows');
    const importers = files.map((file) => detectFileImporter(file.text));
    const importer = importers[0];
    if (!importer || importers.some((candidate) => candidate !== importer)) throw new FileImportError('unknownFormat');
    const results = files.map((file) => {
        const result = importer.parse(file.text);
        if (files.length === 1) return result;
        const withFile = (notes: FileImportResult['report']['ignored']) => notes.map((note) => ({ ...note, file: file.name }));
        return { ...result, report: { ...result.report, ignored: withFile(result.report.ignored), unsupported: withFile(result.report.unsupported) } };
    });
    return { importer, result: results.length === 1 ? results[0] : mergeFileImports(importer, results) };
};
