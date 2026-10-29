import { columnIndex, locateHeader, parseUsNumber, readCsv } from './csv';
import { statementEntry, tradeEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Revolut investment account statement (Invest → More → Documents → brokerage account →
// Account statement). Columns from Export-To-Ghostfolio 9e35bd6 (sample, issues #107, #163):
//   Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate
// The app delivers CSV/TSV or Excel; an Excel file is saved as CSV by the user, so comma, semicolon
// and tab are accepted. Amounts carry a currency sign ("$85.11", "-$30.93", "€50"), quantities may
// use a decimal comma ("0,76672417"). The crypto statement (Symbol,Type,Quantity,Price,Value,Fees,Date)
// is a different export and not read here.

const SOURCE = 'Revolut';
const REQUIRED = ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency'];
const VARIANTS: Record<string, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

/** GBX (pence) stays apart from GBP; "GBp" is the other spelling of GBX. */
const currencyCode = (value: string) => (value.trim() === 'GBp' ? 'GBX' : value.trim().toUpperCase());

/** "$1,500", "-$30.93", "€50", "USD 12.00", "12,50 €": the currency sign is dropped, a lone decimal comma accepted. */
const parseMoney = (value: string): number => {
    const raw = value.trim().replace(/^([-+]?)\s*(?:[$€£]|[A-Z]{3}\s)\s*/, '$1').replace(/\s*(?:[$€£]|\s[A-Z]{3})$/, '');
    if (!raw) return 0;
    const us = parseUsNumber(raw);
    if (Number.isFinite(us)) return us;
    return /^[-+]?\d+,\d{1,2}$/.test(raw) ? Number(raw.replace(',', '.')) : Number.NaN;
};

/**
 * Quantities: "1.63453043" or "0,76672417". A single comma followed by three digits ("1,500") is
 * a thousands separator or a decimal comma; quantity × price must then match the total.
 */
const parseQuantity = (value: string, price: number, total: number): number => {
    const raw = value.trim();
    if (!raw) return 0;
    if (/^[-+]?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    if (/^[-+]?\d{1,3}(,\d{3})+\.\d+$/.test(raw)) return Number(raw.replace(/,/g, ''));
    if (!/^[-+]?\d+,\d+$/.test(raw)) return Number.NaN;
    const decimal = Number(raw.replace(',', '.'));
    if (!/^[-+]?\d{1,3},\d{3}$/.test(raw)) return decimal;
    const thousands = Number(raw.replace(',', ''));
    if (!price || !total) return Number.NaN;
    const miss = (quantity: number) => Math.abs(Math.abs(quantity * price) - Math.abs(total));
    return miss(decimal) < miss(thousands) ? decimal : thousands;
};

type Kind = 'buy' | 'sell' | 'dividend' | 'tax' | 'fee' | 'deposit' | 'withdrawal' | 'transfer';

/**
 * Types of the sample: "BUY - MARKET", "SELL - MARKET", "DIVIDEND", "CASH TOP-UP", "CASH WITHDRAWAL",
 * "CUSTODY FEE", "STOCK SPLIT" and "TRANSFER FROM … TO …". Limit/stop orders and tax corrections
 * are recognised by their prefix or wording. Splits and anything else are not booked.
 */
const classify = (type: string): Kind | null => {
    const value = type.trim().toUpperCase();
    if (/^BUY\b/.test(value)) return 'buy';
    if (/^SELL\b/.test(value)) return 'sell';
    if (/\bTAX\b/.test(value)) return 'tax';
    if (/^DIVIDEND\b/.test(value)) return 'dividend';
    if (/\bFEE\b/.test(value)) return 'fee';
    if (value === 'CASH TOP-UP') return 'deposit';
    if (value === 'CASH WITHDRAWAL') return 'withdrawal';
    if (/^TRANSFER\b/.test(value)) return 'transfer';
    return null;
};

/** "2023-09-22T13:30:10.514Z" (UTC) or "22.09.2023 13:30:10" after an Excel conversion. */
const toIsoDate = (value: string): string | null => {
    const raw = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/.exec(raw);
    const dotted = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s|$)/.exec(raw);
    const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : dotted ? [dotted[3], dotted[2], dotted[1]] : [];
    if (!year) return null;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day) ? date.toISOString().slice(0, 10) : null;
};

const detect = (text: string): string | null => {
    const located = locateHeader(text, REQUIRED);
    return located ? VARIANTS[located.delimiter] : null;
};

const parse = (text: string) => {
    const located = locateHeader(text, REQUIRED);
    if (!located) throw new FileImportError('unknownFormat');
    const variant = VARIANTS[located.delimiter];
    const rows = readCsv(text, located.delimiter);
    const column = columnIndex(located.header);
    const at = {
        date: column('Date'),
        ticker: column('Ticker'),
        type: column('Type'),
        quantity: column('Quantity'),
        price: column('Price per share'),
        total: column('Total Amount'),
        currency: column('Currency'),
        fxRate: column('FX Rate')
    };
    const data = rows.slice(located.row + 1);
    if (data.length === 0) throw new FileImportError('noRows');
    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach((row, offset) => {
        const line = located.row + offset + 2;
        const cell = (index: number) => (index >= 0 ? row[index] || '' : '');
        const label = cell(at.type);
        const date = toIsoDate(cell(at.date));
        if (!date) throw new FileImportError('invalidDate', line);
        const total = parseMoney(cell(at.total));
        const price = parseMoney(cell(at.price));
        const quantity = parseQuantity(cell(at.quantity), price, total);
        if (![total, price, quantity].every(Number.isFinite)) throw new FileImportError('invalidNumber', line);
        const ticker = cell(at.ticker);
        const currency = currencyCode(cell(at.currency));

        const kind = classify(label);
        if (!kind || kind === 'transfer') {
            // Transfers between Revolut entities move positions and cash without a price: reported
            (total === 0 && !ticker && !quantity ? ignored : unsupported).push({ line, label });
            return;
        }

        const baseKey = `revolut:${[cell(at.date), label, ticker, cell(at.quantity), cell(at.total), currency].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = { source: 'revolut-csv', variant, line, ticker: ticker || undefined, fxRate: cell(at.fxRate) || undefined, row };

        if (kind === 'buy' || kind === 'sell') {
            const size = Math.abs(quantity);
            const value = Math.abs(total);
            if (!ticker || !size || !value || !currency) {
                unsupported.push({ line, label });
                return;
            }
            // Total Amount is the cash effect; Revolut does not show trading fees separately
            batch.entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                date,
                side: kind,
                isin: ticker, // ticker; resolved to a security by the market sync
                name: ticker,
                quantity: size,
                amount: round(kind === 'sell' ? value : -value),
                currency,
                raw: { ...raw, pricePerShare: Math.abs(price) || undefined }
            }));
            return;
        }

        if (total === 0 || !currency) {
            (total === 0 ? ignored : unsupported).push({ line, label });
            return;
        }
        const type: StatementType = kind === 'dividend' ? 'Dividend'
            : kind === 'tax' ? 'Tax'
                : kind === 'fee' ? 'Fee'
                    : kind === 'deposit' ? 'Deposit' : 'Withdrawal';
        const security = (kind === 'dividend' || kind === 'tax') && ticker ? { isin: ticker, name: ticker } : {};
        batch.entries.push(statementEntry({
            source: SOURCE,
            externalId: key,
            date,
            type,
            amount: total, // sign as in the statement; dividends net, as credited
            currency,
            description: label,
            raw,
            ...security
        }));
    });

    return {
        batch,
        report: { importerId: 'revolut', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const revolutFileImporter: FileImporter = {
    id: 'revolut',
    broker: 'Revolut',
    formats: ['CSV'],
    accept: '.csv,.tsv',
    sources: [
        { label: 'Export-To-Ghostfolio: Revolut', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#revolut-invest-and-crypto' },
        { label: 'Export-To-Ghostfolio issue #163 (split, transfers)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/163' },
        { label: 'Revolut: Trading statements and reports', url: 'https://help.revolut.com/help/profile-and-plan/managing-my-account/trading-statements-and-reports/' }
    ],
    verified: '2026-10-28',
    detect,
    parse
};
