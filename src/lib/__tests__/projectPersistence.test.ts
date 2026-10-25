import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, type ProjectData } from '@/types/domain';
import { createProjectKey, isEncryptedProjectBytes } from '../projectCrypto';
import { openProjectFile, serializeProjectForFile } from '../projectPersistence';
import { addTransactions } from '../domain/ledger/store';

// Low iteration count keeps the suite fast; production files use the default.
const TEST_ITERATIONS = 1_000;
const SECRET_MARKER = 'ZZ-SECRET-PORTFOLIO-NAME';

const makeProject = (): ProjectData => {
  const project = createEmptyProject(SECRET_MARKER);
  return addTransactions(project, [{
    id: 'tx-1',
    date: '2024-03-15',
    type: 'Buy',
    isin: 'US0000000001',
    name: 'ACME CORP',
    shares: 10,
    amount: -1000,
    currency: 'USD',
    broker: 'Test'
  }]);
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
    expect(opened.project.ledger).toEqual(project.ledger);
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

describe('damaged project files', () => {
  it('reports broken JSON and wrong field types in German instead of crashing later', async () => {
    const notJson = new File([new TextEncoder().encode('{"id": "x", ')], 'broken.json');
    await expect(openProjectFile(notJson)).rejects.toThrow(/beschädigt.*kein gültiges JSON/);

    const project = { ...createEmptyProject(), ledger: [{ id: 't', source: 'X', date: '2024-01-01', kind: 'buy', amount: null, currency: 'EUR' }] };
    const wrongType = new File([new TextEncoder().encode(JSON.stringify(project))], 'wrong.json');
    await expect(openProjectFile(wrongType)).rejects.toThrow(/ledger\.0\.amount: Zahl erwartet/);
  });
});

describe('files from older versions', () => {
  it('refuses SQLite projects in an old format (v2, or without schema version) with a hint to import again', async () => {
    const { data, sqliteSession } = await serializeProjectForFile('Test.openfolio', makeProject(), null, null);
    sqliteSession?.close();
    const SQL = await initSqlJs();
    const db = new SQL.Database(data as Uint8Array);
    db.run("UPDATE project_meta SET value = '2' WHERE key = 'schema_version'");
    const v2 = db.export();
    db.run("DELETE FROM project_meta WHERE key = 'schema_version'");
    const unversioned = db.export();
    db.close();

    await expect(openProjectFile(toFile(v2))).rejects.toThrow(/älteren Testversion/);
    await expect(openProjectFile(toFile(unversioned))).rejects.toThrow(/älteren Testversion/);
  });

  it('round-trips the ledger through an SQLite file', async () => {
    const project = makeProject();
    const { data, sqliteSession } = await serializeProjectForFile('Test.openfolio', project, null, null);
    sqliteSession?.close();
    const opened = await openProjectFile(toFile(data));
    opened.sqliteSession?.close();
    expect(opened.project.version).toBe(3);
    expect(opened.project.ledger).toEqual(project.ledger);
  });
});
