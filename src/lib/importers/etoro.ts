import { columnIndex, decimalSeparatorOf, locateHeader, parseLocaleNumber, readCsv } from './csv';
import { statementEntry, tradeEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// eToro account statement (Portfolio → History → Account statement → Excel), sheet "Account Activity"
// saved as CSV by the user. Columns from Export-To-Ghostfolio 9e35bd6 (sample, issues #29, #177, #188, #249):
//   Date,Type,Details,Amount,Units,Realized Equity Change,Realized Equity,Balance,Position ID,Asset type,NWA
//   newer exports: "Units / Contracts" instead of "Units"
// Amounts are in USD: trades always run from the USD investment account; deposits in other currencies
// are converted on arrival ("300.00 EUR eToroMoney" → Amount 309.94). Details holds "TICKER/CURRENCY"
// for instruments, the currency being the instrument's, not the amount's. Dates are DD/MM/YYYY.
// Numbers follow the Excel locale used for the conversion ("1,000.00", " 1 757,95 ", "(0,10)").

const SOURCE = 'eToro';
const ACCOUNT_CURRENCY = 'USD';
const REQUIRED = ['Date', 'Type', 'Details', 'Amount', 'Realized Equity Change', 'Balance', 'Position ID', 'Asset type'];
const UNITS = ['Units / Contracts', 'Units'];

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

type Kind = 'open' | 'close' | 'dividend' | 'interest' | 'deposit' | 'withdrawal' | 'fee' | 'cfd';

/**
 * Types of the sample and issues: Open Position, Position closed, Dividend, Interest Payment, Deposit,
 * Withdraw Request, Withdraw Fee, Deposit/Withdrawal Conversion Fee, SDRT (UK stamp duty), Overnight
 * fee/refund (CFD financing). Copy trading (Start Copy) and anything else are not booked.
 */
const classify = (type: string): Kind | null => {
    const value = type.trim().toLowerCase();
    if (value.startsWith('overnight')) return 'cfd';
    if (value === 'open position') return 'open';
    if (value === 'position closed') return 'close';
    if (value === 'dividend') return 'dividend';
    if (value === 'interest payment') return 'interest';
    if (value === 'deposit') return 'deposit';
    if (value === 'withdraw request' || value === 'withdrawal request') return 'withdrawal';
    if (value === 'sdrt' || /\bfee$/.test(value)) return 'fee';
    return null;
};

/** Real stocks and ETFs; CFDs, crypto and anything else are other instruments. */
const SECURITY = /^(stocks?|etfs?)$/i;

/** "02/01/2025 20:16:43" (day first, as eToro writes it), "2025-01-02 20:16:43" or "02.01.2025 20:16". */
const toIsoDate = (value: string): string | null => {
    const raw = value.trim();
    const dayFirst = /^(\d{2})[/.](\d{2})[/.](\d{4})(?:\s|$)/.exec(raw);
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/.exec(raw);
    const [year, month, day] = dayFirst ? [dayFirst[3], dayFirst[2], dayFirst[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
    if (!year) return null;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day) ? date.toISOString().slice(0, 10) : null;
};

const detect = (text: string): string | null => {
    const located = locateHeader(text, REQUIRED);
    if (!located) return null;
    const column = columnIndex(located.header);
    if (column('Units / Contracts') >= 0) return 'contracts';
    return column('Units') >= 0 ? 'units' : null;
};

const parse = (text: string) => {
    const variant = detect(text);
    const located = locateHeader(text, REQUIRED);
    if (!variant || !located) throw new FileImportError('unknownFormat');
    const rows = readCsv(text, located.delimiter);
    const column = columnIndex(located.header);
    const at = {
        date: column('Date'),
        type: column('Type'),
        details: column('Details'),
        amount: column('Amount'),
        units: column(...UNITS),
        equityChange: column('Realized Equity Change'),
        balance: column('Balance'),
        position: column('Position ID'),
        assetType: column('Asset type')
    };
    const data = rows.slice(located.row + 1);
    if (data.length === 0) throw new FileImportError('noRows');
    const lineOf = (offset: number) => located.row + offset + 2;
    const cellOf = (row: string[], index: number) => (index >= 0 ? row[index] || '' : '');

    // One decimal separator for all money columns of the file
    const money = data.flatMap((row, offset) => [at.amount, at.equityChange, at.balance].map((index) => ({ raw: cellOf(row, index), line: lineOf(offset) })));
    const decimal = decimalSeparatorOf(money);
    if (!('separator' in decimal)) throw new FileImportError('invalidNumber', decimal.line);
    const number = (raw: string, line: number) => {
        const value = parseLocaleNumber(raw, decimal.separator);
        if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
        return value;
    };
    /** Units: "-" for rows without units; eToro writes them with a decimal point whatever the money format is. */
    const units = (raw: string, line: number) => {
        const value = raw.trim();
        if (!value || value === '-') return 0;
        if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
        return number(value, line);
    };

    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach((row, offset) => {
        const line = lineOf(offset);
        const cell = (index: number) => cellOf(row, index);
        const label = cell(at.type);
        const date = toIsoDate(cell(at.date));
        if (!date) throw new FileImportError('invalidDate', line);
        const amount = number(cell(at.amount), line);
        const equityChange = number(cell(at.equityChange), line);
        const quantity = units(cell(at.units), line);
        const details = cell(at.details);
        const assetType = cell(at.assetType);
        const positionId = cell(at.position);
        const instrument = /^([^/\s]+)\/([A-Za-z]{3})$/.exec(details.trim());

        const kind = classify(label);
        const security = SECURITY.test(assetType.trim());
        const otherInstrument = Boolean(instrument) && !security;
        if (!kind || kind === 'cfd' || otherInstrument) {
            // CFDs, crypto, copy trading and unknown types: reported unless nothing moved
            (amount === 0 && equityChange === 0 && !quantity && !otherInstrument && kind !== 'cfd' ? ignored : unsupported).push({ line, label });
            return;
        }

        const baseKey = `etoro:${[cell(at.date), label, details, cell(at.amount), cell(at.units), positionId].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = {
            source: 'etoro-csv',
            variant,
            line,
            positionId: positionId && positionId !== '-' ? positionId : undefined,
            assetType: assetType || undefined,
            instrumentCurrency: instrument ? (instrument[2] === 'GBp' ? 'GBX' : instrument[2].toUpperCase()) : undefined,
            row
        };

        if (kind === 'open' || kind === 'close') {
            const value = Math.abs(amount);
            if (!instrument || !quantity || !value) {
                unsupported.push({ line, label });
                return;
            }
            // Amount: invested (open) or paid out (close) in USD; eToro shows no trading fee on these rows
            batch.entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                date,
                side: kind === 'open' ? 'buy' : 'sell',
                isin: instrument[1], // eToro symbol; resolved to a security by the market sync
                name: instrument[1],
                quantity,
                amount: round(kind === 'open' ? -value : value),
                currency: ACCOUNT_CURRENCY,
                raw: { ...raw, realizedEquityChange: equityChange || undefined }
            }));
            return;
        }

        // Conversion fees are information: the converted deposit or withdrawal already carries them,
        // so the balance and the realized equity do not change
        const cashEffect = kind === 'fee' ? equityChange : amount;
        if (cashEffect === 0) {
            ignored.push({ line, label });
            return;
        }
        if ((kind === 'dividend' && (!instrument || amount < 0)) || (kind === 'fee' && amount !== equityChange)) {
            unsupported.push({ line, label });
            return;
        }
        const type: StatementType = kind === 'dividend' ? 'Dividend'
            : kind === 'interest' ? 'Interest'
                : kind === 'fee' ? 'Fee'
                    : kind === 'deposit' ? 'Deposit' : 'Withdrawal';
        const position = instrument && (kind === 'dividend' || kind === 'fee') ? { isin: instrument[1], name: instrument[1] } : {};
        batch.entries.push(statementEntry({
            source: SOURCE,
            externalId: key,
            date,
            type,
            amount: round(cashEffect), // dividends net, as credited
            currency: ACCOUNT_CURRENCY,
            description: details && details !== '-' ? `${label} ${details}` : label,
            raw,
            ...position
        }));
    });

    return {
        batch,
        report: { importerId: 'etoro', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const etoroFileImporter: FileImporter = {
    id: 'etoro',
    broker: 'eToro',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: eToro', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#etoro' },
        { label: 'Export-To-Ghostfolio issue #177 (Units / Contracts, copy trading)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/177' },
        { label: 'Export-To-Ghostfolio issue #249 (SDRT)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/249' },
        { label: 'eToro: Currency accounts', url: 'https://www.etoro.com/trading/currency-accounts/' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
