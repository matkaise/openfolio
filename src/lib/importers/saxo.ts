import { columnIndex, decimalSeparatorOf, locateHeader, parseLocaleNumber, readCsv, type DecimalSeparator } from './csv';
import { statementEntry, tradeEntry, type ImportEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Saxo "Transactions" export (profile → Transaction overview → Export → Excel), saved as CSV by
// the user. Columns from Export-To-Ghostfolio 9e35bd6 (sample, issue #319):
//   amount: Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,
//           Exchange Description,Instrument Symbol,Event,Amount,Order ID,Conversion Rate
//   booked: "Booked Amount" instead of "Amount", plus "From Derivative" and "Underlying asset type" (2026)
// The amount is the cash booked on the account, in the account currency, costs included. The
// event text carries quantity and price of a trade in the instrument currency ("Buy 3 @ 139.74 USD").
// Number and date formats depend on the Excel locale used for the conversion, so they are
// determined per file (amounts) or from unambiguous patterns (dates) and fail visibly otherwise.

const SOURCE = 'Saxo';

const REQUIRED = ['Trade Date', 'Value Date', 'Type', 'Instrument ISIN', 'Instrument currency', 'Event', 'Conversion Rate'];
const AMOUNT = ['Booked Amount', 'Amount'];

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

/** GBX (pence) stays apart from GBP; "GBp" is the other spelling of GBX. */
const currencyCode = (value: string) => (value.trim() === 'GBp' ? 'GBX' : value.trim().toUpperCase());

// Month abbreviations of English, Dutch and German Excel ("02-Apr-2025", "16-jan-2025", "02-Mär-2025")
const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, mrt: 3, mär: 3, mrz: 3, apr: 4, may: 5, mei: 5, mai: 5, jun: 6, jul: 7,
    aug: 8, sep: 9, sept: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12
};

const isoDate = (year: number, month: number, day: number): string | null => {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date.toISOString().slice(0, 10);
};

/** "02-Apr-2025", "16-jan-2025", "2025-04-02" or "02.04.2025"; slash dates are ambiguous (US/EU) and rejected. */
const toIsoDate = (value: string): string | null => {
    const raw = value.trim();
    const named = /^(\d{1,2})[- ]([A-Za-zä]{3,4})\.?[- ](\d{4})$/.exec(raw);
    if (named) {
        const month = MONTHS[named[2].toLowerCase()];
        return month ? isoDate(Number(named[3]), month, Number(named[1])) : null;
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/.exec(raw);
    if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
    if (dotted) return isoDate(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]));
    return null;
};

/** An amount of the file; an empty cell is 0. */
const parseAmount = (raw: string, separator: DecimalSeparator): number => (raw.trim() ? parseLocaleNumber(raw, separator) : 0);

/** Quantity and price in the event text: written by Saxo with "." as decimal separator ("Koop 1.5 @ 110.01 EUR"). */
const parseEventNumber = (raw: string): number => (
    /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(raw) ? Number(raw.replace(/,/g, '')) : Number.NaN
);

/** Conversion rate: never has thousands separators, so "," or "." is the decimal separator. */
const parseRate = (raw: string): number => {
    const value = raw.trim();
    if (!value) return 1;
    return /^\d+([.,]\d+)?$/.test(value) ? Number(value.replace(',', '.')) : Number.NaN;
};

const TRADE = /^(buy|sell|koop|verkoop)\s+-?([\d.,]+)\s*@\s*([\d.,]+)(?:\s+([A-Za-z]{3}))?$/i;

type Kind = 'trade' | 'dividend' | 'tax' | 'cash' | 'fee' | 'interest';

/**
 * Event texts. Trades, "Dividend", "Deposit", "Withdrawal" and "Custody Fee" are in the upstream
 * sample; "Koop" is from its Dutch test row. The Dutch cash words, interest and withholding tax
 * rows are not in any public sample and only recognised by their usual wording.
 */
const classify = (event: string): Kind | null => {
    const value = event.trim().toLowerCase();
    if (TRADE.test(event.trim())) return 'trade';
    if (/withholding|bronbelasting|dividend ?tax|dividendbelasting/.test(value)) return 'tax';
    if (/^dividend\b/.test(value)) return 'dividend';
    if (/deposit|storting|withdrawal|opname/.test(value)) return 'cash';
    if (/\bfee\b|kosten|commissie/.test(value)) return 'fee';
    if (/interest|rente/.test(value)) return 'interest';
    return null;
};

const amountColumn = (header: string[]) => {
    const column = columnIndex(header);
    return column(...AMOUNT);
};

const detect = (text: string): string | null => {
    const located = locateHeader(text, REQUIRED);
    if (!located) return null;
    if (amountColumn(located.header) < 0) return null;
    return columnIndex(located.header)('Booked Amount') >= 0 ? 'booked' : 'amount';
};

const parse = (text: string) => {
    const variant = detect(text);
    const located = locateHeader(text, REQUIRED);
    if (!variant || !located) throw new FileImportError('unknownFormat');
    const rows = readCsv(text, located.delimiter);
    const header = rows[located.row];
    const column = columnIndex(header);
    const at = {
        client: column('Client ID'),
        tradeDate: column('Trade Date'),
        valueDate: column('Value Date'),
        type: column('Type'),
        instrument: column('Instrument'),
        isin: column('Instrument ISIN'),
        currency: column('Instrument currency'),
        symbol: column('Instrument Symbol'),
        event: column('Event'),
        amount: amountColumn(header),
        order: column('Order ID'),
        rate: column('Conversion Rate'),
        derivative: column('From Derivative')
    };
    const data = rows.slice(located.row + 1);
    if (data.length === 0) throw new FileImportError('noRows');
    const lineOf = (offset: number) => located.row + offset + 2;
    const cellOf = (row: string[], index: number) => (index >= 0 ? row[index] || '' : '');

    const decimal = decimalSeparatorOf(data.map((row, offset) => ({ raw: cellOf(row, at.amount).trim(), line: lineOf(offset) })));
    if (!('separator' in decimal)) throw new FileImportError('invalidNumber', decimal.line);

    // Account currency: the currency of rows without instrument (cash rows), else of rows
    // without conversion. Needed where the amount is converted from another instrument currency.
    const currencies = (rowsOf: string[][]) => new Set(rowsOf.map((row) => currencyCode(cellOf(row, at.currency))).filter(Boolean));
    const cashRows = data.filter((row) => !cellOf(row, at.isin) && !TRADE.test(cellOf(row, at.event).trim()));
    const unconverted = data.filter((row) => parseRate(cellOf(row, at.rate)) === 1);
    const accountCandidates = currencies(cashRows).size ? currencies(cashRows) : currencies(unconverted);
    const accountCurrency = accountCandidates.size === 1 ? Array.from(accountCandidates)[0] : null;

    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach((row, offset) => {
        const line = lineOf(offset);
        const cell = (index: number) => cellOf(row, index);
        const event = cell(at.event).trim();
        const label = event || cell(at.type);
        const date = toIsoDate(cell(at.tradeDate));
        if (!date) throw new FileImportError('invalidDate', line);
        const amount = parseAmount(cell(at.amount), decimal.separator);
        const rate = parseRate(cell(at.rate));
        if (!Number.isFinite(amount) || !Number.isFinite(rate)) throw new FileImportError('invalidNumber', line);

        const kind = classify(event);
        const isin = cell(at.isin);
        // Bookings from options, futures and CFDs are not modelled as security trades
        const derivative = /^(yes|ja|true)$/i.test(cell(at.derivative).trim());
        if (!kind || derivative) {
            (amount === 0 && !isin && !derivative ? ignored : unsupported).push({ line, label });
            return;
        }
        const instrumentCurrency = currencyCode(cell(at.currency));
        // Converted rows are booked in the account currency; without one known, the currency is open
        const bookingCurrency = rate === 1 ? instrumentCurrency || accountCurrency : accountCurrency;
        const orderId = cell(at.order) || undefined;
        const name = cell(at.instrument) || cell(at.symbol) || undefined;
        const raw = { source: 'saxo-csv', variant, line, symbol: cell(at.symbol) || undefined, conversionRate: rate, row };

        const baseKey = `saxo:${[cell(at.client), cell(at.tradeDate), cell(at.valueDate), cell(at.type), isin, event, cell(at.amount), orderId, instrumentCurrency].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;

        const entries: ImportEntry[] = [];
        const statement = (part: string, type: StatementType, value: number, currency: string, extra: Partial<Parameters<typeof statementEntry>[0]> = {}) => {
            entries.push(statementEntry({
                source: SOURCE,
                externalId: part ? `${key}:${part}` : key,
                orderId,
                date,
                type,
                amount: round(value),
                currency,
                description: label,
                raw,
                ...extra
            }));
        };

        if (kind === 'trade') {
            const match = TRADE.exec(event)!;
            const side = /^(sell|verkoop)$/i.test(match[1]) ? 'sell' : 'buy';
            const quantity = parseEventNumber(match[2]);
            const price = parseEventNumber(match[3]);
            if (!Number.isFinite(quantity) || !Number.isFinite(price)) throw new FileImportError('invalidNumber', line);
            const currency = match[4] ? currencyCode(match[4]) : instrumentCurrency;
            if (!isin || !quantity || !currency) {
                unsupported.push({ line, label });
                return;
            }
            const gross = round(quantity * price);
            const signedGross = side === 'sell' ? gross : -gross;
            const converted = rate !== 1 && accountCurrency !== currency;
            if (converted && !accountCurrency) {
                unsupported.push({ line, label });
                return;
            }
            // Same currency: the difference between booked amount and quantity × price is the cost.
            // Converted: costs and FX are priced into the conversion and cannot be told apart.
            const fee = converted ? 0 : round(amount - signedGross);
            entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                orderId,
                date,
                side,
                isin,
                name,
                quantity,
                amount: fee > 0 ? amount : signedGross,
                currency,
                fee: fee < 0 ? fee : undefined,
                feeCurrency: currency,
                raw: { ...raw, pricePerShare: price }
            }));
            if (converted && accountCurrency) {
                const description = `${label} ${accountCurrency}/${currency}`;
                statement('fx-in', 'Transfer', -signedGross, currency, { kind: 'fx', internal: true, description });
                statement('fx-out', 'Transfer', amount, accountCurrency, { kind: 'fx', internal: true, description });
            }
        } else {
            if (amount === 0) {
                ignored.push({ line, label });
                return;
            }
            if (!bookingCurrency) {
                unsupported.push({ line, label });
                return;
            }
            const security = { isin: isin || undefined, name: isin ? name : undefined };
            if (kind === 'dividend') statement('', 'Dividend', amount, bookingCurrency, security); // net, as booked
            else if (kind === 'tax') statement('', 'Tax', amount, bookingCurrency, security);
            else if (kind === 'fee') statement('', 'Fee', amount, bookingCurrency, security);
            else if (kind === 'interest') statement('', 'Interest', amount, bookingCurrency);
            else statement('', amount >= 0 ? 'Deposit' : 'Withdrawal', amount, bookingCurrency);
        }
        batch.entries.push(...entries);
    });

    return {
        batch,
        report: { importerId: 'saxo', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const saxoFileImporter: FileImporter = {
    id: 'saxo',
    broker: 'Saxo',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Saxo', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#saxo' },
        { label: 'Export-To-Ghostfolio issue #319 (new columns)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/319' },
        { label: 'Saxo: Monitoring your portfolio', url: 'https://www.help.saxo/hc/en-us/articles/360039762472-Monitoring-your-Portfolio' }
    ],
    verified: '2026-10-28',
    detect,
    parse
};
