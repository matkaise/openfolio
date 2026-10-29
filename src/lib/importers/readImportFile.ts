import { extractPdfText, type PdfjsApi } from '@/lib/pdf/extractPdfText';
import { loadPdfjs } from '@/lib/pdf/loadPdfjs';
import { isPdfData, PdfReadError } from '@/lib/pdf/pdfText';
import { FileImportError, type ImportFile } from './fileImport';

/**
 * Reads a dropped file for the import: a PDF (recognised by its `%PDF-` header, not by
 * its name) as its text layer, anything else as text. Unreadable PDFs fail with a
 * FileImportError that names the file.
 */
export const readImportFile = async (file: File, loadPdf: () => Promise<PdfjsApi> = loadPdfjs): Promise<ImportFile> => {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    if (!isPdfData(head)) return { name: file.name, kind: 'text', text: await file.text() };
    try {
        const pdf = await extractPdfText(new Uint8Array(await file.arrayBuffer()), await loadPdf());
        return { name: file.name, kind: 'pdf', pdf };
    } catch (error) {
        if (error instanceof PdfReadError) throw new FileImportError(error.code, undefined, file.name);
        throw error;
    }
};
