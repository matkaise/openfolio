import type { PdfjsApi } from './extractPdfText';

// pdf.js for the browser, loaded on the first PDF import only (it is large). Parsing
// runs in pdf.js's own worker so a long settlement does not block the page. Version
// pinned in package.json; the worker comes from the same package. The legacy build is
// used on purpose: the modern one needs Promise.try (Safari 18.2+, Chrome 128+).

let loading: Promise<PdfjsApi> | null = null;

export const loadPdfjs = (): Promise<PdfjsApi> => {
    loading ??= import('pdfjs-dist/legacy/build/pdf.mjs')
        .then((pdfjs) => {
            if (typeof Worker !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerPort) {
                pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module', name: 'openfolio-pdf' });
            }
            return pdfjs as unknown as PdfjsApi;
        })
        .catch((error) => {
            loading = null; // allow a retry, e.g. after a failed chunk download
            throw error;
        });
    return loading;
};
