import { emptyImportBatch, isEmptyImportBatch, parseDegiroFiles, type ImportBatch } from '@/lib/importers/importBatch';

/** The parts of FileSystemDirectoryHandle the scan needs (lets tests pass plain objects). */
export interface DirectoryLike {
    values(): AsyncIterable<{ kind: string; name: string }>;
}

type FileEntry = { kind: 'file'; name: string; getFile(): Promise<File> };

// DEGIRO exports "Account.csv" and "Transactions.csv"; browsers add " (1)" for repeats.
const EXPORT_NAME = /^(account|transactions)( \(\d+\))?\.csv$/i;

export const isDegiroExportName = (name: string): boolean => EXPORT_NAME.test(name.trim());

export interface DegiroFolderScan {
    batch: ImportBatch;
    files: string[];
    /** lastModified of the newest file read; store it to skip these files next time. */
    newestModified: number;
}

/**
 * Reads DEGIRO exports from a folder (e.g. Downloads) that changed after `modifiedAfter`.
 * Files with an export name but other content are ignored. Duplicates across scans are
 * harmless: applyImportBatch skips trades and account rows that are already imported.
 */
export const scanDegiroFolder = async (
    directory: DirectoryLike,
    options?: { modifiedAfter?: number }
): Promise<DegiroFolderScan> => {
    const modifiedAfter = options?.modifiedAfter ?? 0;
    const candidates: File[] = [];

    for await (const entry of directory.values()) {
        if (entry.kind !== 'file' || !isDegiroExportName(entry.name)) continue;
        const file = await (entry as FileEntry).getFile();
        if (file.lastModified > modifiedAfter) candidates.push(file);
    }
    candidates.sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name));

    const batch = emptyImportBatch('Flatex');
    const files: string[] = [];
    let newestModified = 0;
    for (const file of candidates) {
        const fileBatch = parseDegiroFiles([await file.text()]);
        if (isEmptyImportBatch(fileBatch)) continue;
        batch.transactions.push(...fileBatch.transactions);
        batch.cashMovements.push(...fileBatch.cashMovements);
        batch.cashBalances.push(...fileBatch.cashBalances);
        files.push(file.name);
        newestModified = Math.max(newestModified, file.lastModified);
    }

    return { batch, files, newestModified };
};
