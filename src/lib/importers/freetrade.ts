import { columnIndex, locateHeader, parseDotDecimal, readCsv } from './csv';
import { statementEntry, tradeEntry, type ImportEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Freetrade activity feed export (app → Activity → export → All Activity), comma separated, 29 columns
// from Export-To-Ghostfolio 9e35bd6 (sample, PR #55, #220):
//   Title,Type,Timestamp,Account Currency,Total Amount,Buy / Sell,Ticker,ISIN,Price per Share in Account
//   Currency,Stamp Duty,Quantity,Venue,Order ID,Order Type,Instrument Currency,Total Shares Amount,Price per
//   Share,FX Rate,Base FX Rate,FX Fee (BPS),FX Fee Amount,Dividend Ex Date,Dividend Pay Date,Dividend
//   Eligible Quantity,Dividend Amount Per Share,Dividend Gross Distribution Amount,Dividend Net Distribution
//   Amount,Dividend Withheld Tax Percentage,Dividend Withheld Tax Amount
// Total Amount is unsigned and in the account currency: the cash paid or received including stamp duty
// and FX fee (both in the account currency). Dividend gross/net/tax amounts are in the instrument currency.
// Numbers have a decimal point and no thousands separator; timestamps are ISO in UTC.

const SOURCE = 'Freetrade';
const REQUIRED = ['Title', 'Type', 'Timestamp', 'Account Currency', 'Total Amount', 'Buy / Sell', 'Ticker', 'ISIN', 'Stamp Duty', 'Quantity', 'Order ID', 'FX Fee Amount', 'Dividend Withheld Tax Amount'];

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;
const cents = (value: number) => Math.round(value * 100) / 100;

/** GBX (pence) stays apart from GBP; "GBp" is the other spelling of GBX. */
const currencyCode = (value: string) => (value.trim() === 'GBp' ? 'GBX' : value.trim().toUpperCase());

type Kind = 'order' | 'freeShare' | 'dividend' | 'interest' | 'deposit' | 'withdrawal' | 'statement';

/** Types of the sample: ORDER, FREESHARE_ORDER, DIVIDEND, PROPERTY (property income distribution), INTEREST_FROM_CASH, TOP_UP, WITHDRAWAL, MONTHLY_STATEMENT. */
const classify = (type: string): Kind | null => {
    switch (type.trim().toUpperCase()) {
        case 'ORDER': return 'order';
        case 'FREESHARE_ORDER': return 'freeShare';
        case 'DIVIDEND':
        case 'PROPERTY': return 'dividend';
        case 'INTEREST_FROM_CASH': return 'interest';
        case 'TOP_UP': return 'deposit';
        case 'WITHDRAWAL': return 'withdrawal';
        case 'MONTHLY_STATEMENT': return 'statement';
        default: return null;
    }
};

/** "2024-03-04T11:01:19.356Z" -> "2024-03-04" (UTC, as exported). */
const toIsoDate = (value: string): string | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/.exec(value.trim());
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date.toISOString().slice(0, 10) : null;
};

const detect = (text: string): string | null => (locateHeader(text, REQUIRED, [',']) ? 'activity' : null);

const parse = (text: string) => {
    const located = locateHeader(text, REQUIRED, [',']);
    if (!located) throw new FileImportError('unknownFormat');
    const variant = 'activity';
    const rows = readCsv(text, ',');
    const column = columnIndex(located.header);
    const at = {
        title: column('Title'),
        type: column('Type'),
        timestamp: column('Timestamp'),
        accountCurrency: column('Account Currency'),
        total: column('Total Amount'),
        side: column('Buy / Sell'),
        ticker: column('Ticker'),
        isin: column('ISIN'),
        stampDuty: column('Stamp Duty'),
        quantity: column('Quantity'),
        orderId: column('Order ID'),
        instrumentCurrency: column('Instrument Currency'),
        sharesAmount: column('Total Shares Amount'),
        price: column('Price per Share'),
        fxFee: column('FX Fee Amount'),
        gross: column('Dividend Gross Distribution Amount'),
        net: column('Dividend Net Distribution Amount'),
        tax: column('Dividend Withheld Tax Amount')
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
        /** An optional number: empty is 0, anything but "123.45" fails. */
        const number = (index: number) => {
            const raw = cell(index);
            if (!raw) return 0;
            const value = parseDotDecimal(raw);
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };
        const label = cell(at.type);
        const date = toIsoDate(cell(at.timestamp));
        if (!date) throw new FileImportError('invalidDate', line);
        const total = number(at.total);
        const quantity = number(at.quantity);
        const isin = cell(at.isin);
        const currency = cell(at.accountCurrency).toUpperCase();

        const kind = classify(label);
        if (!kind || kind === 'statement') {
            // Statements and tax certificates are documents; other types are reported if they move something
            (total === 0 && !isin && (kind === 'statement' || !quantity) ? ignored : unsupported).push({ line, label });
            return;
        }
        if (!currency) {
            unsupported.push({ line, label });
            return;
        }

        const orderId = cell(at.orderId) || undefined;
        const baseKey = `freetrade:${[cell(at.timestamp), label, isin, cell(at.side), cell(at.quantity), cell(at.total), orderId, currency].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = {
            source: 'freetrade-csv',
            variant,
            line,
            ticker: cell(at.ticker) || undefined,
            instrumentCurrency: cell(at.instrumentCurrency) ? currencyCode(cell(at.instrumentCurrency)) : undefined,
            row
        };
        const name = cell(at.title) || cell(at.ticker) || isin;
        const entries: ImportEntry[] = [];
        const statement = (part: string, type: StatementType, amount: number, extra: Partial<Parameters<typeof statementEntry>[0]> = {}) => {
            entries.push(statementEntry({
                source: SOURCE,
                externalId: part ? `${key}:${part}` : key,
                date,
                type,
                amount: round(amount),
                currency,
                description: cell(at.title) || label,
                raw,
                ...extra
            }));
        };

        if (kind === 'order' || kind === 'freeShare') {
            const side = cell(at.side).toUpperCase();
            if (!isin || !quantity || (side !== 'BUY' && side !== 'SELL')) {
                unsupported.push({ line, label });
                return;
            }
            const fees = round(number(at.stampDuty) + number(at.fxFee));
            // A free share costs nothing: its value comes in as a bonus and pays for the buy
            const free = kind === 'freeShare' && side === 'BUY' && number(at.sharesAmount) === 0;
            const gross = side === 'BUY' ? round(total - fees) : round(total + fees);
            if (gross < 0) {
                unsupported.push({ line, label });
                return;
            }
            entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                orderId,
                date,
                side: side === 'BUY' ? 'buy' : 'sell',
                isin,
                name,
                quantity,
                amount: side === 'BUY' ? -gross : gross,
                currency,
                fee: fees ? -fees : undefined,
                feeCurrency: currency,
                raw: { ...raw, pricePerShare: number(at.price) || undefined }
            }));
            if (free) statement('bonus', 'Deposit', total, { description: `${cell(at.title) || label} (free share)` });
        } else if (kind === 'dividend') {
            if (!isin || total <= 0) {
                (total === 0 ? ignored : unsupported).push({ line, label });
                return;
            }
            const security = { isin, name };
            // Total Amount is the net dividend in the account currency. With gross and net given (in the
            // instrument currency), the withholding tax is their difference in the same proportion.
            const grossInstrument = number(at.gross);
            const netInstrument = number(at.net);
            const tax = number(at.tax);
            const gross = tax > 0 && grossInstrument > netInstrument && netInstrument > 0 ? cents(total * grossInstrument / netInstrument) : total;
            statement('', 'Dividend', gross, security);
            if (gross !== total) statement('tax', 'Tax', round(total - gross), { ...security, description: `${cell(at.title) || label} withholding tax` });
        } else if (kind === 'interest') {
            statement('', 'Interest', total);
        } else {
            if (total === 0) {
                ignored.push({ line, label });
                return;
            }
            statement('', kind === 'deposit' ? 'Deposit' : 'Withdrawal', kind === 'deposit' ? total : -total);
        }
        batch.entries.push(...entries);
    });

    return {
        batch,
        report: { importerId: 'freetrade', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const freetradeFileImporter: FileImporter = {
    id: 'freetrade',
    broker: 'Freetrade',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Freetrade', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#freetrade' },
        { label: 'Export-To-Ghostfolio PR #220 (free shares, property income)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/pull/220' },
        { label: 'Freetrade: Download a CSV export of the activity feed', url: 'https://help.freetrade.io/en/articles/6627908-how-do-i-download-a-csv-export-of-my-activity-feed' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
