// Encrypted project container.
//
// Layout (all integers big-endian):
//   magic       6 bytes  "OFENC1"
//   version     1 byte   1
//   kdf         1 byte   1 = PBKDF2-HMAC-SHA256
//   iterations  4 bytes
//   salt       16 bytes
//   iv         12 bytes
//   ciphertext  rest     AES-256-GCM over the SQLite bytes, 16-byte tag appended
//
// The whole header is passed as additional authenticated data, so tampering with
// the iteration count or salt fails decryption just like a wrong password.

export const ENCRYPTED_MAGIC = 'OFENC1';
export const ENCRYPTION_FORMAT_VERSION = 1;
export const KDF_PBKDF2_SHA256 = 1;
export const DEFAULT_KDF_ITERATIONS = 600_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const MAGIC_BYTES = new TextEncoder().encode(ENCRYPTED_MAGIC);
const HEADER_BYTES = MAGIC_BYTES.length + 1 + 1 + 4 + SALT_BYTES + IV_BYTES;

export interface ProjectEncryptionKey {
    key: CryptoKey;
    salt: Uint8Array;
    iterations: number;
}

export class InvalidPasswordError extends Error {
    constructor() {
        super('INVALID_PASSWORD');
        this.name = 'InvalidPasswordError';
    }
}

const getSubtle = (): SubtleCrypto => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error('WebCrypto ist in diesem Browser nicht verfügbar.');
    }
    return subtle;
};

// WebCrypto wants ArrayBuffer-backed views; copy to drop any SharedArrayBuffer typing.
const toBuffer = (bytes: Uint8Array): ArrayBuffer => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
};

export const isEncryptedProjectBytes = (bytes: Uint8Array): boolean => {
    if (bytes.length < MAGIC_BYTES.length) return false;
    return MAGIC_BYTES.every((value, index) => bytes[index] === value);
};

export const deriveProjectKey = async (
    password: string,
    salt: Uint8Array,
    iterations: number = DEFAULT_KDF_ITERATIONS
): Promise<ProjectEncryptionKey> => {
    if (!password) {
        throw new Error('Passwort darf nicht leer sein.');
    }
    const subtle = getSubtle();
    const keyMaterial = await subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    const key = await subtle.deriveKey(
        { name: 'PBKDF2', salt: toBuffer(salt), iterations, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
    return { key, salt, iterations };
};

export const createProjectKey = async (
    password: string,
    iterations: number = DEFAULT_KDF_ITERATIONS
): Promise<ProjectEncryptionKey> => {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    return deriveProjectKey(password, salt, iterations);
};

const writeHeader = (salt: Uint8Array, iv: Uint8Array, iterations: number): Uint8Array => {
    const header = new Uint8Array(HEADER_BYTES);
    const view = new DataView(header.buffer);
    let offset = 0;
    header.set(MAGIC_BYTES, offset);
    offset += MAGIC_BYTES.length;
    header[offset++] = ENCRYPTION_FORMAT_VERSION;
    header[offset++] = KDF_PBKDF2_SHA256;
    view.setUint32(offset, iterations);
    offset += 4;
    header.set(salt, offset);
    offset += SALT_BYTES;
    header.set(iv, offset);
    return header;
};

export interface EncryptedProjectHeader {
    version: number;
    kdf: number;
    iterations: number;
    salt: Uint8Array;
    iv: Uint8Array;
}

export const readEncryptedHeader = (bytes: Uint8Array): EncryptedProjectHeader => {
    if (!isEncryptedProjectBytes(bytes) || bytes.length < HEADER_BYTES) {
        throw new Error('Keine verschlüsselte Openfolio-Datei.');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = MAGIC_BYTES.length;
    const version = bytes[offset++];
    const kdf = bytes[offset++];
    const iterations = view.getUint32(offset);
    offset += 4;
    const salt = bytes.slice(offset, offset + SALT_BYTES);
    offset += SALT_BYTES;
    const iv = bytes.slice(offset, offset + IV_BYTES);

    if (version !== ENCRYPTION_FORMAT_VERSION) {
        throw new Error(`Nicht unterstützte Verschlüsselungsversion ${version}.`);
    }
    if (kdf !== KDF_PBKDF2_SHA256 || iterations <= 0) {
        throw new Error('Unbekanntes Schlüsselverfahren in der Projektdatei.');
    }
    return { version, kdf, iterations, salt, iv };
};

export const encryptProjectBytes = async (
    plaintext: Uint8Array,
    encryptionKey: ProjectEncryptionKey
): Promise<Uint8Array> => {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const header = writeHeader(encryptionKey.salt, iv, encryptionKey.iterations);
    const ciphertext = await getSubtle().encrypt(
        { name: 'AES-GCM', iv: toBuffer(iv), additionalData: toBuffer(header) },
        encryptionKey.key,
        toBuffer(plaintext)
    );
    const out = new Uint8Array(header.length + ciphertext.byteLength);
    out.set(header, 0);
    out.set(new Uint8Array(ciphertext), header.length);
    return out;
};

/**
 * Decrypts a container. Pass either the password (the key is derived from the
 * header's salt and iterations) or a key that was derived for this file before.
 * A wrong password or a modified file throws InvalidPasswordError.
 */
export const decryptProjectBytes = async (
    bytes: Uint8Array,
    secret: string | ProjectEncryptionKey
): Promise<{ plaintext: Uint8Array; encryptionKey: ProjectEncryptionKey }> => {
    const header = readEncryptedHeader(bytes);
    const encryptionKey = typeof secret === 'string'
        ? await deriveProjectKey(secret, header.salt, header.iterations)
        : secret;

    try {
        const plaintext = await getSubtle().decrypt(
            { name: 'AES-GCM', iv: toBuffer(header.iv), additionalData: toBuffer(bytes.subarray(0, HEADER_BYTES)) },
            encryptionKey.key,
            toBuffer(bytes.subarray(HEADER_BYTES))
        );
        return { plaintext: new Uint8Array(plaintext), encryptionKey };
    } catch {
        throw new InvalidPasswordError();
    }
};
