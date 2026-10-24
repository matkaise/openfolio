// Fallbacks for browsers without the File System Access API (Firefox, Safari):
// open via <input type="file">, save via a download.

export const supportsFileSystemAccess = (): boolean => (
    typeof window !== 'undefined'
    && 'showOpenFilePicker' in window
    && 'showSaveFilePicker' in window
);

/** Lets the user pick a file. Resolves null if the dialog is cancelled. */
export const pickFileWithInput = (accept: string): Promise<File | null> => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    const finish = (file: File | null) => {
        input.remove();
        resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    // Supported by current browsers; older ones simply never resolve a cancel.
    input.addEventListener('cancel', () => finish(null), { once: true });

    document.body.appendChild(input);
    input.click();
});

/** Saves data as a browser download. */
export const downloadFile = (data: string | Uint8Array, fileName: string): void => {
    let blob: Blob;
    if (typeof data === 'string') {
        blob = new Blob([data], { type: 'application/json' });
    } else {
        const bytes = new Uint8Array(data.byteLength);
        bytes.set(data);
        blob = new Blob([bytes], { type: 'application/octet-stream' });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before revoking the URL
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
