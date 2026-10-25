import initSqlJs from 'sql.js';
import { OUTDATED_PROJECT_MESSAGE, parseNumberRecordMap, parseProjectData, ProjectFormatError } from '@/lib/schemas/project';
import {
  InvalidPasswordError,
  decryptProjectBytes,
  encryptProjectBytes,
  isEncryptedProjectBytes,
  type ProjectEncryptionKey
} from '@/lib/projectCrypto';
import type { CashAccount, FxData, ISIN, LedgerEntry, Portfolio, ProjectData, Security } from '@/types/domain';

const SQLITE_FILE_EXTENSIONS = ['.openfolio', '.sqlite', '.sqlite3', '.db'];
const SQLITE_HEADER = 'SQLite format 3\u0000';
const SQLITE_SCHEMA_VERSION = '3'; // v3: one ledger section instead of transactions + cash movements
// Iteration default of the old hash-only "password protection" (pre-encryption files).

const SQLITE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS project_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_sections (
  name TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
`;

export type ProjectStorageFormat = 'json' | 'sqlite';

/**
 * - `none`: no password.
 * - `encrypted`: AES-GCM container (see projectCrypto).
 */
export type ProjectEncryptionStatus = 'none' | 'encrypted';

export interface SqliteProjectSession {
  readonly format: 'sqlite';
  readonly hasLazyPayload: boolean;
  hydrateHeavyData(baseProject: ProjectData): Promise<ProjectData>;
  /** Returns the plain SQLite bytes. Encryption happens in serializeProjectForFile. */
  saveProject(project: ProjectData): Promise<Uint8Array>;
  close(): void;
}

export interface OpenedProjectFile {
  project: ProjectData;
  format: ProjectStorageFormat;
  sqliteSession: SqliteProjectSession | null;
  hasLazyPayload: boolean;
  encryption: ProjectEncryptionStatus;
  encryptionKey: ProjectEncryptionKey | null;
}

let sqlJsPromise: Promise<initSqlJs.SqlJsStatic> | null = null;

const getSqlJs = async (): Promise<initSqlJs.SqlJsStatic> => {
  if (!sqlJsPromise) {
    // In the browser the wasm is served from /public; under Node sql.js finds its own copy.
    const buildPromise = typeof window !== 'undefined'
      ? initSqlJs({
        locateFile: (file: string) => {
          if (file.endsWith('.wasm')) {
            const wasmName = file.includes('sql-wasm-browser.wasm') ? 'sql-wasm-browser.wasm' : file;
            return `/${wasmName}`;
          }
          return `/${file}`;
        }
      })
      : initSqlJs();

    sqlJsPromise = buildPromise.catch((error) => {
      sqlJsPromise = null;
      throw error;
    });
  }

  return sqlJsPromise;
};

const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const sqlValueToText = (value: initSqlJs.SqlValue | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }
  return String(value);
};

const detectFormatByFileName = (fileName?: string | null): ProjectStorageFormat => {
  const lower = (fileName || '').toLowerCase();
  return SQLITE_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext)) ? 'sqlite' : 'json';
};

const isLikelySqliteBinary = (bytes: Uint8Array): boolean => {
  if (bytes.length < SQLITE_HEADER.length) return false;

  const header = new TextDecoder().decode(bytes.slice(0, SQLITE_HEADER.length));
  return header === SQLITE_HEADER;
};

const splitSecurityPayload = (securities: Record<ISIN, Security>) => {
  const core: Record<ISIN, Security> = {};
  const priceHistory: Record<ISIN, Record<string, number>> = {};

  Object.entries(securities || {}).forEach(([isin, security]) => {
    const { priceHistory: secPriceHistory, ...rest } = security;
    core[isin] = rest;

    if (secPriceHistory && Object.keys(secPriceHistory).length > 0) {
      priceHistory[isin] = secPriceHistory;
    }
  });

  return { core, priceHistory };
};

const mergeSecurityPayload = (
  core: Record<ISIN, Security>,
  priceHistory: Record<ISIN, Record<string, number>>
): Record<ISIN, Security> => {
  const result: Record<ISIN, Security> = {};

  Object.entries(core || {}).forEach(([isin, security]) => {
    const mappedHistory = priceHistory?.[isin];
    result[isin] = mappedHistory ? { ...security, priceHistory: mappedHistory } : security;
  });

  Object.entries(priceHistory || {}).forEach(([isin, history]) => {
    if (result[isin]) return;
    result[isin] = {
      isin,
      name: isin,
      symbol: isin,
      currency: 'EUR',
      quoteType: 'Stock',
      priceHistory: history
    };
  });

  return result;
};

class SqliteProjectSessionImpl implements SqliteProjectSession {
  readonly format = 'sqlite' as const;
  hasLazyPayload = false;

  private readonly db: initSqlJs.Database;
  private heavyDataHydrated = true;
  private readonly sectionSnapshot = new Map<string, string>();

  private constructor(db: initSqlJs.Database, isNewDatabase: boolean) {
    this.db = db;
    this.db.exec(SQLITE_SCHEMA_SQL);

    if (!isNewDatabase) {
      this.assertSchemaVersion();
    }

    this.hasLazyPayload = this.detectHeavyPayload();
    this.heavyDataHydrated = !this.hasLazyPayload;
    this.primeSnapshots();
  }

  private querySingleValue(sql: string, params?: initSqlJs.BindParams): initSqlJs.SqlValue | null {
    const stmt = this.db.prepare(sql);
    try {
      if (params !== undefined) {
        stmt.bind(params);
      }
      if (!stmt.step()) return null;
      const row = stmt.get();
      if (!row || row.length === 0) return null;
      return row[0] ?? null;
    } finally {
      stmt.free();
    }
  }

  static async fromBytes(bytes: Uint8Array): Promise<SqliteProjectSessionImpl> {
    const SQL = await getSqlJs();
    const db = new SQL.Database(bytes);
    return new SqliteProjectSessionImpl(db, false);
  }

  static async createEmpty(): Promise<SqliteProjectSessionImpl> {
    const SQL = await getSqlJs();
    const db = new SQL.Database();
    return new SqliteProjectSessionImpl(db, true);
  }

  private getMetaValue(key: string): string | null {
    const value = this.querySingleValue('SELECT value FROM project_meta WHERE key = ?', [key]);
    return sqlValueToText(value);
  }

  private sectionPayloadLength(name: string): number {
    const value = this.querySingleValue('SELECT LENGTH(payload) FROM project_sections WHERE name = ?', [name]);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value) || 0;
    return 0;
  }

  private detectHeavyPayload(): boolean {
    return this.sectionPayloadLength('security_price_history') > 2 || this.sectionPayloadLength('fx_rates') > 2;
  }

  private assertSchemaVersion(): void {
    const version = this.getMetaValue('schema_version');
    if (version === SQLITE_SCHEMA_VERSION) return;
    // No or an older schema version: written by an older test version of Openfolio
    if (!version || Number(version) < Number(SQLITE_SCHEMA_VERSION)) throw new Error(OUTDATED_PROJECT_MESSAGE);
    throw new Error(`Nicht unterstütztes SQLite-Projektformat v${version}. Erwartet: v${SQLITE_SCHEMA_VERSION}.`);
  }


  private primeSnapshots(): void {
    this.sectionSnapshot.clear();

    const rows = this.db.exec('SELECT name, payload FROM project_sections')[0]?.values ?? [];
    rows.forEach(([name, payload]) => {
      this.sectionSnapshot.set(String(name), String(payload));
    });
  }

  private readMetaMap(): Record<string, string> {
    const map: Record<string, string> = {};
    const rows = this.db.exec('SELECT key, value FROM project_meta')[0]?.values ?? [];
    rows.forEach(([key, value]) => {
      map[String(key)] = String(value);
    });
    return map;
  }

  private readSection<T>(name: string, fallback: T): T {
    const payload = this.querySingleValue('SELECT payload FROM project_sections WHERE name = ?', [name]);
    const payloadText = sqlValueToText(payload);
    if (!payloadText) return fallback;
    return safeJsonParse<T>(payloadText, fallback);
  }

  readProjectBase(lazy: boolean): ProjectData {
    const meta = this.readMetaMap();

    const portfolios = this.readSection<Portfolio[]>('portfolios', []);
    const ledger = this.readSection<LedgerEntry[]>('ledger', []);
    const cashAccounts = this.readSection<CashAccount[]>('cash_accounts', []);
    const securityCore = this.readSection<Record<ISIN, Security>>('securities_core', {});

    const securityPriceHistory = lazy
      ? {}
      : this.readSection<Record<ISIN, Record<string, number>>>('security_price_history', {});

    const fxRates = lazy
      ? {}
      : this.readSection<FxData['rates']>('fx_rates', {});

    const settings = safeJsonParse<ProjectData['settings']>(meta.settings_json, { baseCurrency: 'EUR' });

    const project: ProjectData = {
      version: Number(meta.version || '1'),
      id: meta.id || '',
      name: meta.name || 'Mein Portfolio',
      created: meta.created || new Date().toISOString(),
      modified: meta.modified || new Date().toISOString(),
      settings,
      portfolios,
      ledger,
      securities: mergeSecurityPayload(securityCore, securityPriceHistory),
      cashAccounts,
      fxData: {
        baseCurrency: 'EUR',
        rates: fxRates,
        lastUpdated: meta.fx_last_updated || ''
      }
    };

    return parseProjectData(project);
  }

  async hydrateHeavyData(baseProject: ProjectData): Promise<ProjectData> {
    if (!this.hasLazyPayload) {
      return baseProject;
    }

    const securityPriceHistory = parseNumberRecordMap(this.readSection<unknown>('security_price_history', {}));
    const fxRates = parseNumberRecordMap(this.readSection<unknown>('fx_rates', {}));

    this.heavyDataHydrated = true;

    return {
      ...baseProject,
      securities: mergeSecurityPayload(baseProject.securities, securityPriceHistory),
      fxData: {
        ...baseProject.fxData,
        rates: fxRates
      }
    };
  }

  private upsertMeta(key: string, value: unknown): void {
    const normalizedValue = String(value ?? '');
    const stmt = this.db.prepare(
      `INSERT INTO project_meta (key, value)
       VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    stmt.run([key, normalizedValue]);
    stmt.free();
  }

  private upsertSection(name: string, payload: string): void {
    const current = this.sectionSnapshot.get(name);
    if (current === payload) return;

    const stmt = this.db.prepare(
      `INSERT INTO project_sections (name, payload)
       VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET payload = excluded.payload`
    );
    stmt.run([name, payload]);
    stmt.free();

    this.sectionSnapshot.set(name, payload);
  }

  async saveProject(project: ProjectData): Promise<Uint8Array> {
    const preserveUnknownHeavyData = this.hasLazyPayload && !this.heavyDataHydrated;

    const { core: securityCore, priceHistory: securityPriceHistory } = splitSecurityPayload(project.securities || {});

    this.db.run('BEGIN TRANSACTION');
    try {
      this.upsertMeta('schema_version', SQLITE_SCHEMA_VERSION);
      this.upsertMeta('version', String(project.version));
      this.upsertMeta('id', project.id);
      this.upsertMeta('name', project.name);
      this.upsertMeta('created', project.created);
      this.upsertMeta('modified', project.modified);
      this.upsertMeta('settings_json', JSON.stringify(project.settings));
      this.upsertMeta('fx_base_currency', project.fxData.baseCurrency);
      this.upsertMeta('fx_last_updated', project.fxData.lastUpdated || '');

      this.upsertSection('portfolios', JSON.stringify(project.portfolios || []));
      this.upsertSection('ledger', JSON.stringify(project.ledger || []));
      this.upsertSection('cash_accounts', JSON.stringify(project.cashAccounts || []));
      this.upsertSection('securities_core', JSON.stringify(securityCore));

      if (!preserveUnknownHeavyData) {
        this.upsertSection('security_price_history', JSON.stringify(securityPriceHistory));
      }

      const fxRatesJson = JSON.stringify(project.fxData.rates || {});
      if (!preserveUnknownHeavyData || fxRatesJson !== '{}') {
        this.upsertSection('fx_rates', fxRatesJson);
      }

      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }

    this.hasLazyPayload = this.detectHeavyPayload();
    if (!preserveUnknownHeavyData || !this.hasLazyPayload) {
      this.heavyDataHydrated = true;
    }

    this.db.exec('VACUUM');
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}

const toOpenedSqliteProject = (
  session: SqliteProjectSessionImpl,
  encryption: ProjectEncryptionStatus,
  encryptionKey: ProjectEncryptionKey | null
): OpenedProjectFile => {
  const hasLazyPayload = session.hasLazyPayload;
  const project = session.readProjectBase(hasLazyPayload);
  return {
    project,
    format: 'sqlite',
    sqliteSession: session,
    hasLazyPayload,
    encryption,
    encryptionKey
  };
};

export const openProjectFile = async (
  file: File,
  password?: string
): Promise<OpenedProjectFile> => {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isEncryptedProjectBytes(bytes)) {
    if (!password) {
      throw new Error('PASSWORD_REQUIRED');
    }
    try {
      const { plaintext, encryptionKey } = await decryptProjectBytes(bytes, password);
      return toOpenedSqliteProject(await SqliteProjectSessionImpl.fromBytes(plaintext), 'encrypted', encryptionKey);
    } catch (error) {
      if (error instanceof InvalidPasswordError) throw new Error('INVALID_PASSWORD');
      throw error;
    }
  }

  const format = detectFormatByFileName(file.name);

  if (format === 'sqlite' || isLikelySqliteBinary(bytes)) {
    return toOpenedSqliteProject(await SqliteProjectSessionImpl.fromBytes(bytes), 'none', null);
  }

  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProjectFormatError('kein gültiges JSON');
  }
  const project = parseProjectData(parsed);

  return {
    project,
    format: 'json',
    sqliteSession: null,
    hasLazyPayload: false,
    encryption: 'none',
    encryptionKey: null
  };
};

export const serializeProjectForFile = async (
  fileName: string,
  project: ProjectData,
  sqliteSession: SqliteProjectSession | null,
  encryptionKey?: ProjectEncryptionKey | null
): Promise<{ data: string | Uint8Array; sqliteSession: SqliteProjectSession | null }> => {
  const format = detectFormatByFileName(fileName);

  if (format === 'sqlite') {
    const session = sqliteSession ?? await SqliteProjectSessionImpl.createEmpty();
    const sqliteBytes = await session.saveProject(project);
    const data = encryptionKey ? await encryptProjectBytes(sqliteBytes, encryptionKey) : sqliteBytes;
    return { data, sqliteSession: session };
  }

  if (encryptionKey) {
    throw new Error('Verschlüsselte Projekte können nur als .openfolio gespeichert werden.');
  }

  return {
    data: JSON.stringify(project, null, 2),
    sqliteSession: null
  };
};

export const isSqliteFileName = (fileName?: string | null): boolean => {
  return detectFormatByFileName(fileName) === 'sqlite';
};
