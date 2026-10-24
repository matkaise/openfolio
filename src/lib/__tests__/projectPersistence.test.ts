import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, type ProjectData } from '@/types/domain';
import { createProjectKey, isEncryptedProjectBytes } from '../projectCrypto';
import { legacyProjectId, openProjectFile, serializeProjectForFile } from '../projectPersistence';

// Low iteration count keeps the suite fast; production files use the default.
const TEST_ITERATIONS = 1_000;
const SECRET_MARKER = 'ZZ-SECRET-PORTFOLIO-NAME';

const makeProject = (): ProjectData => {
  const project = createEmptyProject(SECRET_MARKER);
  project.transactions = [{
    id: 'tx-1',
    date: '2024-03-15',
    type: 'Buy',
    isin: 'US0000000001',
    name: 'ACME CORP',
    shares: 10,
    amount: -1000,
    currency: 'USD',
    broker: 'Test'
  }];
  return project;
};

const toFile = (data: string | Uint8Array, name = 'Test.openfolio') => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy], name);
};

const containsText = (bytes: Uint8Array, text: string) => (
  Buffer.from(bytes).includes(Buffer.from(text, 'utf-8'))
);

const saveEncrypted = async (project: ProjectData, password: string) => {
  const key = await createProjectKey(password, TEST_ITERATIONS);
  const { data, sqliteSession } = await serializeProjectForFile('Test.openfolio', project, null, key);
  sqliteSession?.close();
  return data as Uint8Array;
};

describe('encrypted project files', () => {
  it('does not store any readable project data when a password is set', async () => {
    const bytes = await saveEncrypted(makeProject(), 'correct horse');

    expect(isEncryptedProjectBytes(bytes)).toBe(true);
    expect(containsText(bytes, SECRET_MARKER)).toBe(false);
    expect(containsText(bytes, 'US0000000001')).toBe(false);
    expect(containsText(bytes, 'SQLite format 3')).toBe(false);
  });

  it('opens with the right password and rejects a wrong or missing one', async () => {
    const project = makeProject();
    const bytes = await saveEncrypted(project, 'correct horse');

    await expect(openProjectFile(toFile(bytes))).rejects.toThrow('PASSWORD_REQUIRED');
    await expect(openProjectFile(toFile(bytes), 'wrong')).rejects.toThrow('INVALID_PASSWORD');

    const opened = await openProjectFile(toFile(bytes), 'correct horse');
    opened.sqliteSession?.close();
    expect(opened.encryption).toBe('encrypted');
    expect(opened.encryptionKey).not.toBeNull();
    expect(opened.project.name).toBe(SECRET_MARKER);
    expect(opened.project.transactions).toEqual(project.transactions);
  });

  it('rejects a file whose header was modified', async () => {
    const bytes = await saveEncrypted(makeProject(), 'correct horse');
    const tampered = bytes.slice();
    tampered[10] ^= 0x01; // inside the iteration count

    await expect(openProjectFile(toFile(tampered), 'correct horse')).rejects.toThrow('INVALID_PASSWORD');
  });

  it('keeps saving encrypted with the key from opening, with a fresh IV each time', async () => {
    const first = await saveEncrypted(makeProject(), 'correct horse');
    const opened = await openProjectFile(toFile(first), 'correct horse');

    const { data } = await serializeProjectForFile('Test.openfolio', opened.project, opened.sqliteSession, opened.encryptionKey);
    opened.sqliteSession?.close();
    const second = data as Uint8Array;

    expect(isEncryptedProjectBytes(second)).toBe(true);
    expect(Buffer.from(second.subarray(28, 40)).equals(Buffer.from(first.subarray(28, 40)))).toBe(false);
    const reopened = await openProjectFile(toFile(second), 'correct horse');
    reopened.sqliteSession?.close();
    expect(reopened.project.name).toBe(SECRET_MARKER);
  });

  it('saves without a password as a plain SQLite file', async () => {
    const { data, sqliteSession } = await serializeProjectForFile('Test.openfolio', makeProject(), null, null);
    sqliteSession?.close();
    const opened = await openProjectFile(toFile(data));
    opened.sqliteSession?.close();

    expect(opened.encryption).toBe('none');
    expect(opened.project.name).toBe(SECRET_MARKER);
  });
});

describe('legacy password files (hash only, data in plain text)', () => {
  const LEGACY_ITERATIONS = 1_000;

  const makeLegacyFile = async (password: string): Promise<Uint8Array> => {
    const { data, sqliteSession } = await serializeProjectForFile('Test.openfolio', makeProject(), null, null);
    sqliteSession?.close();

    const salt = new Uint8Array(16).fill(7);
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const hash = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: LEGACY_ITERATIONS, hash: 'SHA-256' }, material, 256
    ));

    const SQL = await initSqlJs();
    const db = new SQL.Database(data as Uint8Array);
    const upsert = db.prepare('INSERT INTO project_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    upsert.run(['password_enabled', '1']);
    upsert.run(['password_salt', Buffer.from(salt).toString('base64')]);
    upsert.run(['password_hash', Buffer.from(hash).toString('base64')]);
    upsert.run(['password_iterations', String(LEGACY_ITERATIONS)]);
    upsert.free();
    const bytes = db.export();
    db.close();
    return bytes;
  };

  it('still asks for the password and checks it', async () => {
    const legacy = await makeLegacyFile('old secret');

    await expect(openProjectFile(toFile(legacy))).rejects.toThrow('PASSWORD_REQUIRED');
    await expect(openProjectFile(toFile(legacy), 'nope')).rejects.toThrow('INVALID_PASSWORD');
  });

  it('is migrated to an encrypted file on the next save and drops the old hash', async () => {
    const legacy = await makeLegacyFile('old secret');
    const opened = await openProjectFile(toFile(legacy), 'old secret');
    expect(opened.encryption).toBe('legacy-unencrypted');
    expect(opened.encryptionKey).not.toBeNull();

    const { data } = await serializeProjectForFile('Test.openfolio', opened.project, opened.sqliteSession, opened.encryptionKey);
    opened.sqliteSession?.close();
    const migrated = data as Uint8Array;

    expect(isEncryptedProjectBytes(migrated)).toBe(true);
    expect(containsText(migrated, SECRET_MARKER)).toBe(false);

    const reopened = await openProjectFile(toFile(migrated), 'old secret');
    expect(reopened.encryption).toBe('encrypted');
    const { data: plain, sqliteSession } = await serializeProjectForFile('Test.openfolio', reopened.project, reopened.sqliteSession, null);
    sqliteSession?.close();
    const SQL = await initSqlJs();
    const db = new SQL.Database(plain as Uint8Array);
    const row = db.exec("SELECT value FROM project_meta WHERE key = 'password_hash'")[0]?.values?.[0]?.[0];
    db.close();
    expect(row ?? '').toBe('');
  });
});

describe('files without a project id (B19)', () => {
  it('get the same id on every open', async () => {
    const { data, sqliteSession } = await serializeProjectForFile('Test.openfolio', makeProject(), null, null);
    sqliteSession?.close();
    const SQL = await initSqlJs();
    const db = new SQL.Database(data as Uint8Array);
    db.run("DELETE FROM project_meta WHERE key = 'id'");
    const withoutId = db.export();
    db.close();

    const first = await openProjectFile(toFile(withoutId));
    const second = await openProjectFile(toFile(withoutId));
    first.sqliteSession?.close();
    second.sqliteSession?.close();

    expect(first.project.id).toBe(second.project.id);
    expect(first.project.id).toMatch(/^legacy-[0-9a-f]{8}$/);
  });

  it('derives the id from the stored metadata', () => {
    expect(legacyProjectId({ created: '2024-01-01', name: 'A' })).not.toBe(legacyProjectId({ created: '2024-01-01', name: 'B' }));
  });
});
