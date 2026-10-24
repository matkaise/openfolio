// Small leveled logger for browser and server code. Default level: 'debug' in development,
// 'warn' in production. Override in the browser with localStorage 'openfolio:logLevel' or on
// the server with OPENFOLIO_LOG_LEVEL. Values under secret-like keys are masked.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SECRET_KEY = /token|secret|password|passwort|^pin$|apikey|api_key|authorization|cookie|credential/i;
const MAX_DEPTH = 4;

let override: LogLevel | null = null;

const isLevel = (value: unknown): value is LogLevel => typeof value === 'string' && value in ORDER;

const configuredLevel = (): LogLevel => {
    if (override) return override;
    if (typeof window !== 'undefined') {
        try {
            const stored = window.localStorage.getItem('openfolio:logLevel');
            if (isLevel(stored)) return stored;
        } catch {
            // Storage blocked: use the default
        }
    } else if (typeof process !== 'undefined' && isLevel(process.env.OPENFOLIO_LOG_LEVEL)) {
        return process.env.OPENFOLIO_LOG_LEVEL;
    }
    return process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
};

/** For tests and the settings page; null restores the configured level. */
export const setLogLevel = (level: LogLevel | null) => {
    override = level;
};

/** Copy of plain objects and arrays with secret-like values replaced by '***'. */
export const redact = (value: unknown, depth = 0): unknown => {
    if (value === null || typeof value !== 'object' || value instanceof Error || depth > MAX_DEPTH) return value;
    if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        clean[key] = SECRET_KEY.test(key) ? '***' : redact(item, depth + 1);
    }
    return clean;
};

export interface Logger {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

export const createLogger = (scope: string): Logger => {
    const emit = (level: Exclude<LogLevel, 'silent'>) => (...args: unknown[]) => {
        if (ORDER[level] < ORDER[configuredLevel()]) return;
        console[level](`[${scope}]`, ...args.map((arg) => redact(arg)));
    };
    return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
};
