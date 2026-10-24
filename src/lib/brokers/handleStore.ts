import Dexie, { type Table } from 'dexie';

// Directory handles cannot go into the project file; the browser keeps them in IndexedDB.
// They grant read access to one folder only and contain no data themselves.

interface StoredHandle {
    connectionId: string;
    handle: FileSystemDirectoryHandle;
}

class HandleDatabase extends Dexie {
    handles!: Table<StoredHandle, string>;

    constructor() {
        super('openfolio');
        this.version(1).stores({ handles: 'connectionId' });
    }
}

let database: HandleDatabase | null = null;
const getDatabase = () => {
    database ??= new HandleDatabase();
    return database;
};

export const saveFolderHandle = async (connectionId: string, handle: FileSystemDirectoryHandle) => {
    await getDatabase().handles.put({ connectionId, handle });
};

export const loadFolderHandle = async (connectionId: string): Promise<FileSystemDirectoryHandle | null> => {
    return (await getDatabase().handles.get(connectionId))?.handle ?? null;
};

export const deleteFolderHandle = async (connectionId: string) => {
    await getDatabase().handles.delete(connectionId);
};

type PermissionedHandle = FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
    requestPermission?: (options: { mode: 'read' }) => Promise<PermissionState>;
};

/** Read access survives reloads in Chromium only after the user confirms it again. */
export const hasFolderPermission = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
    const query = (handle as PermissionedHandle).queryPermission;
    return query ? (await query.call(handle, { mode: 'read' })) === 'granted' : true;
};

/** Must be called from a click handler. */
export const requestFolderPermission = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
    const request = (handle as PermissionedHandle).requestPermission;
    return request ? (await request.call(handle, { mode: 'read' })) === 'granted' : true;
};

export const supportsFolderAccess = (): boolean => (
    typeof window !== 'undefined' && 'showDirectoryPicker' in window
);

export const pickFolder = async (): Promise<FileSystemDirectoryHandle> => {
    const picker = (window as unknown as {
        showDirectoryPicker: (options: { id?: string; mode?: 'read' }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    return picker({ id: 'openfolio-degiro', mode: 'read' });
};
