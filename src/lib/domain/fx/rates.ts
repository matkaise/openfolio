import type { CurrencyHistory, ProjectData } from '@/types/domain';
import { getLedger } from '../ledger/store';

/** ECB reference rates: rates[currency][YYYY-MM-DD] = units of currency per 1 EUR. */
export type FxRates = Record<string, CurrencyHistory>;

/** Quote units that are a fraction of an ISO currency (Yahoo prices LSE stocks in pence). */
const MINOR_UNITS: Record<string, { currency: string; divisor: number }> = {
    GBp: { currency: 'GBP', divisor: 100 },
    GBX: { currency: 'GBP', divisor: 100 },
    ZAc: { currency: 'ZAR', divisor: 100 },
    ZAC: { currency: 'ZAR', divisor: 100 },
    ILA: { currency: 'ILS', divisor: 100 }
};

export interface FxTable {
    /**
     * Units of `currency` per 1 EUR on `date` (the last fixing on or before it), or the
     * latest rate without a date. `null` if there is no rate: never guessed.
     */
    rateAt(currency: string, date?: string | number): number | null;
    /** Converts via EUR. `null` if either side has no rate. */
    convert(amount: number, from: string, to: string, date?: string | number): number | null;
    /** True if the currency can be converted at all (has at least one rate). */
    hasRates(currency: string): boolean;
}

type Series = { dates: string[]; values: number[] };

const pad2 = (value: number) => String(value).padStart(2, '0');

const toDateKey = (date: string | number): string => {
    if (typeof date === 'string') return date.slice(0, 10);
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

/** Index of the last entry <= key, or -1. */
const lastIndexAtOrBefore = (sorted: string[], key: string): number => {
    let lo = 0;
    let hi = sorted.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] <= key) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
};

const normalizeCurrency = (currency: string): { currency: string; divisor: number } => {
    const trimmed = (currency || '').trim();
    return MINOR_UNITS[trimmed] || { currency: trimmed.toUpperCase(), divisor: 1 };
};

const buildTable = (rates: FxRates): FxTable => {
    const seriesCache = new Map<string, Series | null>();

    const getSeries = (currency: string): Series | null => {
        if (seriesCache.has(currency)) return seriesCache.get(currency) ?? null;
        const history = rates[currency];
        let series: Series | null = null;
        if (history) {
            const dates = Object.keys(history)
                .filter((date) => Number.isFinite(history[date]) && history[date] > 0)
                .sort();
            if (dates.length > 0) {
                series = { dates, values: dates.map((date) => history[date]) };
            }
        }
        seriesCache.set(currency, series);
        return series;
    };

    // Rate of an ISO currency (no minor units) against EUR
    const isoRateAt = (currency: string, date?: string | number): number | null => {
        if (currency === 'EUR') return 1;
        const series = getSeries(currency);
        if (!series) return null;
        if (date === undefined) return series.values[series.values.length - 1];
        const index = lastIndexAtOrBefore(series.dates, toDateKey(date));
        return index >= 0 ? series.values[index] : null;
    };

    const rateAt = (currency: string, date?: string | number): number | null => {
        const { currency: iso, divisor } = normalizeCurrency(currency);
        const rate = isoRateAt(iso, date);
        return rate === null ? null : rate * divisor;
    };

    return {
        rateAt,
        convert(amount, from, to, date) {
            if (from === to) return amount;
            const rateFrom = rateAt(from, date);
            const rateTo = rateAt(to, date);
            if (rateFrom === null || rateTo === null) return null;
            return (amount / rateFrom) * rateTo;
        },
        hasRates(currency) {
            const { currency: iso } = normalizeCurrency(currency);
            return iso === 'EUR' || getSeries(iso) !== null;
        }
    };
};

// One table per rates object: an FX sync creates a new object, which invalidates the cache.
const tableCache = new WeakMap<FxRates, FxTable>();
const EMPTY_RATES: FxRates = {};

export const getFxTable = (rates: FxRates | null | undefined): FxTable => {
    const key = rates || EMPTY_RATES;
    let table = tableCache.get(key);
    if (!table) {
        table = buildTable(key);
        tableCache.set(key, table);
    }
    return table;
};

/**
 * The rates of just these currencies (minor units like GBp resolve to their ISO currency).
 * Conversions between them give the same results as with the full table, at a fraction of
 * the size, e.g. for sending them to the calculation worker.
 */
export const pickFxRates = (rates: FxRates | null | undefined, currencies: Iterable<string | undefined>): FxRates => {
    const picked: FxRates = {};
    if (!rates) return picked;
    for (const currency of currencies) {
        if (!currency) continue;
        const { currency: iso } = normalizeCurrency(currency);
        if (rates[iso]) picked[iso] = rates[iso];
    }
    return picked;
};

/** Currencies the project uses but cannot convert. Shown in the UI as "Kurs fehlt". */
export const findMissingFxCurrencies = (project: ProjectData): string[] => {
    const fx = getFxTable(project.fxData?.rates);
    const used = new Set<string>();
    const add = (currency?: string) => {
        const trimmed = (currency || '').trim();
        if (trimmed) used.add(trimmed);
    };

    add(project.settings?.baseCurrency);
    getLedger(project).forEach((entry) => {
        add(entry.currency);
        add(entry.feeCurrency);
    });
    Object.values(project.securities || {}).forEach((sec) => add(sec.currency));
    project.cashAccounts?.forEach((account) => add(account.currency));

    return Array.from(used).filter((currency) => !fx.hasRates(currency)).sort();
};
