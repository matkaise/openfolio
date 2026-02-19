import initSqlJs from 'sql.js';
import { normalizeProjectWealthGoal } from '@/lib/wealthGoalUtils';
import type { CashAccount, CashMovement, FxData, ISIN, Portfolio, ProjectData, Security, Transaction } from '@/types/domain';

const SQLITE_FILE_EXTENSIONS = ['.sqlite', '.sqlite3', '.db'];
const SQLITE_HEADER = 'SQLite format 3\u0000';
const SQLITE_SCHEMA_VERSION = '2';

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

export interface SqliteProjectSession {
  readonly format: 'sqlite';
  readonly hasLazyPayload: boolean;
  hydrateHeavyData(baseProject: ProjectData): Promise<ProjectData>;
  saveProject(project: ProjectData): Promise<Uint8Array>;
  close(): void;
}

export interface OpenedProjectFile {
  project: ProjectData;
  format: ProjectStorageFormat;
  sqliteSession: SqliteProjectSession | null;
  hasLazyPayload: boolean;
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
    if (value === undefined || value === null) return null;
    return String(value);
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
    if (payload === undefined || payload === null) return fallback;
    return safeJsonParse<T>(String(payload), fallback);
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

    this.db.exec('VACUUM');
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }
}

export const openProjectFile = async (file: File): Promise<OpenedProjectFile> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormatByFileName(file.name);

  if (format === 'sqlite' || isLikelySqliteBinary(bytes)) {
    const session = await SqliteProjectSessionImpl.fromBytes(bytes);
    const hasLazyPayload = session.hasLazyPayload;
    const project = session.readProjectBase(hasLazyPayload);

    return {
      project,
      format: 'sqlite',
      sqliteSession: session,
      hasLazyPayload
    };
  }

  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as ProjectData;
  const project = normalizeProjectWealthGoal(parsed);

  return {
    project,
    format: 'json',
    sqliteSession: null,
    hasLazyPayload: false
  };
};

export const serializeProjectForFile = async (
  fileName: string,
  project: ProjectData,
  sqliteSession: SqliteProjectSession | null
): Promise<{ data: string | Uint8Array; sqliteSession: SqliteProjectSession | null }> => {
  const format = detectFormatByFileName(fileName);

  if (format === 'sqlite') {
    const session = sqliteSession ?? await SqliteProjectSessionImpl.createEmpty();
    const data = await session.saveProject(project);
    return { data, sqliteSession: session };
  }

  return {
    data: JSON.stringify(project, null, 2),
    sqliteSession: null
  };
};

export const isSqliteFileName = (fileName?: string | null): boolean => {
  return detectFormatByFileName(fileName) === 'sqlite';
};
