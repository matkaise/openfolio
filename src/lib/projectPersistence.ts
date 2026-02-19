import initSqlJs from 'sql.js';
import { normalizeProjectWealthGoal } from '@/lib/wealthGoalUtils';
import type { CashAccount, CashMovement, FxData, ISIN, Portfolio, ProjectData, Security, Transaction } from '@/types/domain';

const SQLITE_FILE_EXTENSIONS = ['.openfolio', '.sqlite', '.sqlite3', '.db'];
const SQLITE_HEADER = 'SQLite format 3\u0000';
const SQLITE_SCHEMA_VERSION = '2';
const PASSWORD_ITERATIONS = 210000;

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

export interface ProjectPasswordConfig {
  salt: string;
  hash: string;
  iterations: number;
}

export interface SqliteProjectSession {
  readonly format: 'sqlite';
  readonly hasLazyPayload: boolean;
  getPasswordConfig(): ProjectPasswordConfig | null;
  hydrateHeavyData(baseProject: ProjectData): Promise<ProjectData>;
  verifyPassword(password: string): Promise<boolean>;
  saveProject(project: ProjectData, options?: { passwordConfig?: ProjectPasswordConfig | null }): Promise<Uint8Array>;
  close(): void;
}

export interface OpenedProjectFile {
  project: ProjectData;
  format: ProjectStorageFormat;
  sqliteSession: SqliteProjectSession | null;
  hasLazyPayload: boolean;
  passwordConfig: ProjectPasswordConfig | null;
}

let sqlJsPromise: Promise<initSqlJs.SqlJsStatic> | null = null;

const getSqlJs = async (): Promise<initSqlJs.SqlJsStatic> => {
  if (!sqlJsPromise) {
    const buildPromise = initSqlJs({
      locateFile: (file: string) => {
        if (typeof window !== 'undefined') {
          if (file.endsWith('.wasm')) {
            const wasmName = file.includes('sql-wasm-browser.wasm') ? 'sql-wasm-browser.wasm' : file;
            return `/${wasmName}`;
          }
          return `/${file}`;
        }
        return file;
      }
    });

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

const bytesToBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
};

const derivePasswordHashBytes = async (
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto ist in diesem Browser nicht verfuegbar.');
  }

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const normalizedSalt = new Uint8Array(salt.byteLength);
  normalizedSalt.set(salt);

  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: normalizedSalt.buffer,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return new Uint8Array(bits);
};

export const createPasswordConfig = async (password: string): Promise<ProjectPasswordConfig> => {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error('Passwort darf nicht leer sein.');
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error('WebCrypto ist in diesem Browser nicht verfuegbar.');
  }

  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHashBytes(trimmed, salt, PASSWORD_ITERATIONS);

  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: PASSWORD_ITERATIONS
  };
};

const verifyPasswordWithConfig = async (password: string, config: ProjectPasswordConfig): Promise<boolean> => {
  const saltBytes = base64ToBytes(config.salt);
  const expectedHash = base64ToBytes(config.hash);
  const actualHash = await derivePasswordHashBytes(password, saltBytes, config.iterations || PASSWORD_ITERATIONS);
  return constantTimeEqual(actualHash, expectedHash);
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
  private passwordConfig: ProjectPasswordConfig | null = null;

  private constructor(db: initSqlJs.Database, isNewDatabase: boolean) {
    this.db = db;
    this.db.exec(SQLITE_SCHEMA_SQL);

    if (!isNewDatabase) {
      this.assertSchemaVersion();
    }

    this.hasLazyPayload = this.detectHeavyPayload();
    this.heavyDataHydrated = !this.hasLazyPayload;
    this.passwordConfig = this.readPasswordConfig();
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

  private tableExists(name: string): boolean {
    const row = this.querySingleValue(
      'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1',
      ['table', name]
    );
    return Boolean(row);
  }

  private scalarCount(sql: string): number {
    const value = this.db.exec(sql)[0]?.values?.[0]?.[0];
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value) || 0;
    return 0;
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

  private readPasswordConfig(): ProjectPasswordConfig | null {
    const enabled = this.getMetaValue('password_enabled');
    if (enabled !== '1') return null;

    const salt = this.getMetaValue('password_salt');
    const hash = this.getMetaValue('password_hash');
    const iterationsRaw = this.getMetaValue('password_iterations');
    const iterations = Number(iterationsRaw || PASSWORD_ITERATIONS);

    if (!salt || !hash || !Number.isFinite(iterations) || iterations <= 0) {
      throw new Error('Ungueltige Passwort-Metadaten im Projekt.');
    }

    return {
      salt,
      hash,
      iterations
    };
  }

  private assertSchemaVersion(): void {
    const version = this.getMetaValue('schema_version');
    if (!version) {
      const metaRows = this.scalarCount('SELECT COUNT(*) FROM project_meta');
      const sectionRows = this.scalarCount('SELECT COUNT(*) FROM project_sections');

      // Accept blank/new DBs and partially written v2 files without schema_version.
      // This avoids false "old version" errors for freshly created files.
      if (metaRows === 0 || sectionRows > 0) {
        this.upsertMeta('schema_version', SQLITE_SCHEMA_VERSION);
        return;
      }

      const hasLegacyTables = [
        'portfolios',
        'transactions',
        'securities',
        'cash_accounts',
        'cash_movements',
        'fx_rates',
        'security_price_history',
        'fx_rate_points'
      ].some((name) => this.tableExists(name));

      if (hasLegacyTables) {
        throw new Error('Nicht unterstuetztes SQLite-Projektformat (alte Version). Bitte neu als .sqlite speichern.');
      }

      throw new Error('SQLite-Datei ist unvollstaendig oder beschaedigt.');
    }

    if (version !== SQLITE_SCHEMA_VERSION) {
      throw new Error(`Nicht unterstuetztes SQLite-Projektformat v${version}. Erwartet: v${SQLITE_SCHEMA_VERSION}.`);
    }
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

  getPasswordConfig(): ProjectPasswordConfig | null {
    return this.passwordConfig;
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (!this.passwordConfig) return true;
    return verifyPasswordWithConfig(password, this.passwordConfig);
  }

  readProjectBase(lazy: boolean): ProjectData {
    const meta = this.readMetaMap();

    const portfolios = this.readSection<Portfolio[]>('portfolios', []);
    const transactions = this.readSection<Transaction[]>('transactions', []);
    const cashAccounts = this.readSection<CashAccount[]>('cash_accounts', []);
    const cashMovements = this.readSection<CashMovement[]>('cash_movements', []);
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
      id: meta.id || crypto.randomUUID(),
      name: meta.name || 'Mein Portfolio',
      created: meta.created || new Date().toISOString(),
      modified: meta.modified || new Date().toISOString(),
      settings,
      portfolios,
      transactions,
      securities: mergeSecurityPayload(securityCore, securityPriceHistory),
      cashAccounts,
      cashMovements,
      fxData: {
        baseCurrency: 'EUR',
        rates: fxRates,
        lastUpdated: meta.fx_last_updated || ''
      }
    };

    return normalizeProjectWealthGoal(project);
  }

  async hydrateHeavyData(baseProject: ProjectData): Promise<ProjectData> {
    if (!this.hasLazyPayload) {
      return baseProject;
    }

    const securityPriceHistory = this.readSection<Record<ISIN, Record<string, number>>>('security_price_history', {});
    const fxRates = this.readSection<FxData['rates']>('fx_rates', {});

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

  async saveProject(project: ProjectData, options?: { passwordConfig?: ProjectPasswordConfig | null }): Promise<Uint8Array> {
    const preserveUnknownHeavyData = this.hasLazyPayload && !this.heavyDataHydrated;
    const effectivePasswordConfig =
      options && 'passwordConfig' in options ? (options.passwordConfig ?? null) : this.passwordConfig;

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
      this.upsertMeta('password_enabled', effectivePasswordConfig ? '1' : '0');
      this.upsertMeta('password_salt', effectivePasswordConfig?.salt || '');
      this.upsertMeta('password_hash', effectivePasswordConfig?.hash || '');
      this.upsertMeta('password_iterations', String(effectivePasswordConfig?.iterations || ''));

      this.upsertSection('portfolios', JSON.stringify(project.portfolios || []));
      this.upsertSection('transactions', JSON.stringify(project.transactions || []));
      this.upsertSection('cash_accounts', JSON.stringify(project.cashAccounts || []));
      this.upsertSection('cash_movements', JSON.stringify(project.cashMovements || []));
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
    this.passwordConfig = effectivePasswordConfig;

    this.db.exec('VACUUM');
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}

export const openProjectFile = async (
  file: File,
  password?: string
): Promise<OpenedProjectFile> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormatByFileName(file.name);

  if (format === 'sqlite' || isLikelySqliteBinary(bytes)) {
    const session = await SqliteProjectSessionImpl.fromBytes(bytes);
    const passwordConfig = session.getPasswordConfig();
    if (passwordConfig) {
      if (!password || password.length === 0) {
        session.close();
        throw new Error('PASSWORD_REQUIRED');
      }
      const isValid = await session.verifyPassword(password);
      if (!isValid) {
        session.close();
        throw new Error('INVALID_PASSWORD');
      }
    }
    const hasLazyPayload = session.hasLazyPayload;
    const project = session.readProjectBase(hasLazyPayload);

    return {
      project,
      format: 'sqlite',
      sqliteSession: session,
      hasLazyPayload,
      passwordConfig
    };
  }

  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as ProjectData;
  const project = normalizeProjectWealthGoal(parsed);

  return {
    project,
    format: 'json',
    sqliteSession: null,
    hasLazyPayload: false,
    passwordConfig: null
  };
};

export const serializeProjectForFile = async (
  fileName: string,
  project: ProjectData,
  sqliteSession: SqliteProjectSession | null,
  passwordConfig?: ProjectPasswordConfig | null
): Promise<{ data: string | Uint8Array; sqliteSession: SqliteProjectSession | null; passwordConfig: ProjectPasswordConfig | null }> => {
  const format = detectFormatByFileName(fileName);

  if (format === 'sqlite') {
    const session = sqliteSession ?? await SqliteProjectSessionImpl.createEmpty();
    const data = await session.saveProject(project, { passwordConfig: passwordConfig ?? null });
    return { data, sqliteSession: session, passwordConfig: passwordConfig ?? null };
  }

  return {
    data: JSON.stringify(project, null, 2),
    sqliteSession: null,
    passwordConfig: null
  };
};

export const isSqliteFileName = (fileName?: string | null): boolean => {
  return detectFormatByFileName(fileName) === 'sqlite';
};
