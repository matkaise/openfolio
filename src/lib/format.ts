// Number and money formatting with a user-selected locale (separators).

export type NumberLocale = 'de-DE' | 'de-CH' | 'de-AT' | 'en-US';

/** Labels live in the messages (numberLocales). */
export const NUMBER_LOCALES: NumberLocale[] = ['de-DE', 'de-CH', 'de-AT', 'en-US'];

export const DEFAULT_NUMBER_LOCALE: NumberLocale = 'de-DE';

const MINUS = '−'; // typographic minus, aligns with "+" in tabular figures
const cache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

const getDateFormat = (locale: string, options: Intl.DateTimeFormatOptions) => {
    const key = `${locale}|${JSON.stringify(options)}`;
    let format = dateCache.get(key);
    if (!format) {
        format = new Intl.DateTimeFormat(locale, options);
        dateCache.set(key, format);
    }
    return format;
};

/** "2026-03-07" is a calendar day: parsed as local midnight, not UTC (no shift west of UTC). */
const toDate = (value: string | number | Date): Date => {
    if (value instanceof Date) return value;
    const dateOnly = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
    return dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
};

const NUMERIC_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };

const getFormat = (locale: string, options: Intl.NumberFormatOptions) => {
    const key = `${locale}|${JSON.stringify(options)}`;
    let format = cache.get(key);
    if (!format) {
        format = new Intl.NumberFormat(locale, options);
        cache.set(key, format);
    }
    return format;
};

const withSign = (formatted: string, value: number, sign: boolean) => {
    const unsigned = formatted.replace(/^[-−]/, '').replace(/^(\D*?)[-−]/, '$1');
    if (value < 0) return `${MINUS}${unsigned}`;
    return sign && value > 0 ? `+${unsigned}` : unsigned;
};

/** `dateLocale` follows the interface language; the number format can differ (project setting). */
export const createFormatters = (locale: NumberLocale = DEFAULT_NUMBER_LOCALE, currency: string = 'EUR', dateLocale: string = 'de-DE') => {
    const money = (value: number, options: { decimals?: number; sign?: boolean } = {}) => {
        const decimals = options.decimals ?? 2;
        const formatted = getFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(Math.abs(value));
        return withSign(formatted, value, Boolean(options.sign));
    };

    /** Amount in another currency (e.g. a share price in USD), same number format. */
    const moneyIn = (value: number, valueCurrency: string, options: { decimals?: number; sign?: boolean } = {}) => {
        const decimals = options.decimals ?? 2;
        const formatted = getFormat(locale, {
            style: 'currency',
            currency: valueCurrency || currency,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(Math.abs(value));
        return withSign(formatted, value, Boolean(options.sign));
    };

    return {
        dateLocale,
        money,
        moneyIn,
        /** Date (ISO string, timestamp or Date); numeric "07.03.2026" / "07/03/2026" by default. */
        date(value: string | number | Date, options: Intl.DateTimeFormatOptions = NUMERIC_DATE) {
            const date = toDate(value);
            return Number.isNaN(date.getTime()) ? String(value) : getDateFormat(dateLocale, options).format(date);
        },
        time(value: string | number | Date) {
            const date = toDate(value);
            return getDateFormat(dateLocale, { hour: '2-digit', minute: '2-digit' }).format(date);
        },
        /** Integer part and the rest (decimals + currency), so the cents can be shown lighter. */
        moneyParts(value: number): { main: string; rest: string } {
            const parts = getFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
                .formatToParts(Math.abs(value));
            const decimalIndex = parts.findIndex((part) => part.type === 'decimal');
            const split = decimalIndex >= 0 ? decimalIndex : parts.length;
            const main = parts.slice(0, split).map((part) => part.value).join('').trim();
            const rest = parts.slice(split).map((part) => part.value).join('');
            return { main: value < 0 ? `${MINUS}${main}` : main, rest };
        },
        percent(value: number, options: { decimals?: number; sign?: boolean } = {}) {
            const decimals = options.decimals ?? 2;
            const formatted = getFormat(locale, {
                style: 'percent',
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(Math.abs(value) / 100);
            return withSign(formatted, value, Boolean(options.sign));
        },
        number(value: number, decimals = 0) {
            return withSign(getFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(value)), value, false);
        }
    };
};

export type Formatters = ReturnType<typeof createFormatters>;
