// Number and money formatting with a user-selected locale (separators).

export type NumberLocale = 'de-DE' | 'de-CH' | 'de-AT' | 'en-US';

export const NUMBER_LOCALES: { value: NumberLocale; label: string }[] = [
    { value: 'de-DE', label: '1.234,56 (Deutschland)' },
    { value: 'de-CH', label: '1’234.56 (Schweiz)' },
    { value: 'de-AT', label: '1 234,56 (Österreich)' },
    { value: 'en-US', label: '1,234.56 (Englisch)' }
];

export const DEFAULT_NUMBER_LOCALE: NumberLocale = 'de-DE';

const MINUS = '−'; // typographic minus, aligns with "+" in tabular figures
const cache = new Map<string, Intl.NumberFormat>();

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

export const createFormatters = (locale: NumberLocale = DEFAULT_NUMBER_LOCALE, currency: string = 'EUR') => {
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

    return {
        money,
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
