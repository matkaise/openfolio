import type { PdfjsApi } from '../extractPdfText';

// The same pdf.js build the browser loads (legacy); in Node it parses on the main thread.
export const nodePdfjs = async (): Promise<PdfjsApi> => (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsApi;
