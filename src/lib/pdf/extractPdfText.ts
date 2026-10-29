import { layoutLines, PdfReadError, type PdfDocumentText, type PdfTextItem } from './pdfText';

// The one place where PDFs are read: pdf.js parses the file locally and reports the
// positioned text runs of each page, layoutLines turns them into lines. No OCR and
// nothing leaves the device. The browser loads pdf.js lazily with its worker
// (loadPdfjs.ts); tests pass the Node build of the same library.

/** The part of the pdf.js API used here; satisfied by `pdfjs-dist` and its legacy build. */
export interface PdfjsApi {
    getDocument: (params: {
        data: Uint8Array;
        isEvalSupported?: boolean;
        useSystemFonts?: boolean;
        disableFontFace?: boolean;
        verbosity?: number;
    }) => { promise: Promise<PdfjsDocument>; destroy: () => Promise<void> };
}

interface PdfjsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: unknown[] }>;
        cleanup: () => unknown;
    }>;
}

interface RawTextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
}

const isTextItem = (item: unknown): item is RawTextItem => (
    typeof item === 'object' && item !== null && typeof (item as RawTextItem).str === 'string' && Array.isArray((item as RawTextItem).transform)
);

const toItem = ({ str, transform, width, height }: RawTextItem): PdfTextItem => ({
    str,
    x: transform[4],
    y: transform[5],
    width,
    height,
    ...(transform[1] !== 0 || transform[2] !== 0 ? { rotated: true } : {})
});

const VERBOSITY_ERRORS = 0;

/**
 * Text of every page in reading order. Throws PdfReadError: `pdfEncrypted` for a password
 * protected file, `pdfUnreadable` for a broken one, `noTextLayer` for a scan (no text at all).
 */
export const extractPdfText = async (data: Uint8Array, pdfjs: PdfjsApi): Promise<PdfDocumentText> => {
    // pdf.js may transfer the buffer to its worker; keep the caller's copy intact
    const task = pdfjs.getDocument({
        data: data.slice(),
        isEvalSupported: false,
        useSystemFonts: false,
        disableFontFace: true,
        verbosity: VERBOSITY_ERRORS
    });
    let doc: PdfjsDocument;
    try {
        doc = await task.promise;
    } catch (error) {
        await task.destroy().catch(() => undefined);
        const name = (error as { name?: string })?.name;
        throw new PdfReadError(name === 'PasswordException' ? 'pdfEncrypted' : 'pdfUnreadable', error);
    }
    try {
        const pages: string[][] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
            const page = await doc.getPage(pageNumber);
            const content = await page.getTextContent();
            pages.push(layoutLines(content.items.filter(isTextItem).map(toItem)));
            page.cleanup();
        }
        if (!pages.some((lines) => lines.length > 0)) throw new PdfReadError('noTextLayer');
        return { pages };
    } catch (error) {
        if (error instanceof PdfReadError) throw error;
        throw new PdfReadError('pdfUnreadable', error);
    } finally {
        await task.destroy().catch(() => undefined);
    }
};
