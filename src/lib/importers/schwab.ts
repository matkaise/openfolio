import { columnIndex, locateHeader, normalizeHeader, parseUsNumber, readCsv } from './csv';
import { statementEntry, tradeEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Charles Schwab account history (Accounts → History → account → Date Range → Export → CSV).
// Columns from Export-To-Ghostfolio 9e35bd6 (sample, issues #75, #121, #191, #287):
//   Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
// Older exports start with a title row ("Transactions for account … as of …"); exports end with a
// "Transactions Total" row. Numbers are US formatted with "$", thousands commas and possibly
// parentheses. Dates are MM/DD/YYYY, corporate actions add " as of MM/DD/YYYY". The account is
// in USD. Symbols are tickers or, for some corporate-action legs, CUSIPs; there is no ISIN.

const SOURCE = 'Schwab';
const CURRENCY = 'USD';
const REQUIRED = ['Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price', 'Fees & Comm', 'Amount'];

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

type Kind = 'buy' | 'sell' | 'dividend' | 'interest' | 'tax' | 'fee' | 'cash';

/**
 * Action names. Buy, Sell, Reinvest Shares, the dividend and interest names, Foreign Tax Paid,
 * Advisor/ADR Mgmt Fee, Wire Sent, MoneyLink Transfer and Internal Transfer are in the upstream
 * sample or issues. Options (Buy to Open, …), Journaled Shares, splits, mergers, spin-offs, name
 * changes, conversions and Cash In Lieu are not booked.
 */
const classify = (action: string): Kind | null => {
    const value = action.trim().toLowerCase().replace(/\s+/g, ' ');
    if (value === 'buy' || value === 'reinvest shares') return 'buy';
    if (value === 'sell') return 'sell';
    if (/tax/.test(value)) return 'tax';
    if (/\bfee\b/.test(value)) return 'fee';
    if (/stock div/.test(value)) return null;
    if (/dividend|\bdiv\b|cap gain/.test(value)) return 'dividend';
    if (/interest/.test(value)) return 'interest';
    if (/^wire |moneylink|funds received|internal transfer|^journal$|journaled cash|^(deposit|withdrawal)$/.test(value)) return 'cash';
    return null;
};

/** "07/15/2024" or "07/15/2024 as of 07/12/2024" -> the booking date and the "as of" date. */
const toIsoDates = (value: string): { date: string; asOf?: string } | null => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+as of\s+(\d{2})\/(\d{2})\/(\d{4}))?$/.exec(value.trim());
    if (!match) return null;
    const iso = (month: string, day: string, year: string) => {
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day) ? date.toISOString().slice(0, 10) : null;
    };
    const date = iso(match[1], match[2], match[3]);
    if (!date) return null;
    const asOf = match[4] ? iso(match[4], match[5], match[6]) : undefined;
    if (asOf === null) return null;
    return { date, ...(asOf ? { asOf } : {}) };
};

const isFooter = (row: string[]) => normalizeHeader(row[0] || '') === 'transactionstotal';

const detect = (text: string): string | null => {
    const located = locateHeader(text, REQUIRED, [',']);
    if (!located) return null;
    return located.row > 0 ? 'titled' : 'standard';
};

const parse = (text: string) => {
    const variant = detect(text);
    const located = locateHeader(text, REQUIRED, [',']);
    if (!variant || !located) throw new FileImportError('unknownFormat');
    const rows = readCsv(text, ',');
    const column = columnIndex(located.header);
    const at = {
        date: column('Date'),
        action: column('Action'),
        symbol: column('Symbol'),
        description: column('Description'),
        quantity: column('Quantity'),
        price: column('Price'),
        fees: column('Fees & Comm'),
        amount: column('Amount')
    };
    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();
    const data = rows.slice(located.row + 1)
        .map((row, offset) => ({ row, line: located.row + offset + 2 }))
        .filter(({ row }) => !isFooter(row) && row.some((cell) => cell !== ''));
    if (data.length === 0) throw new FileImportError('noRows');

    data.forEach(({ row, line }) => {
        const cell = (index: number) => (index >= 0 ? row[index] || '' : '');
        const number = (index: number) => {
            const raw = cell(index);
            if (!raw) return 0;
            const value = parseUsNumber(raw);
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };
        const label = cell(at.action);
        const dates = toIsoDates(cell(at.date));
        if (!dates) throw new FileImportError('invalidDate', line);
        const { date } = dates;
        const amount = number(at.amount);
        const quantity = number(at.quantity);
        const price = number(at.price);
        const fees = Math.abs(number(at.fees));
        const symbol = cell(at.symbol);
        const description = cell(at.description);

        const kind = classify(label);
        if (!kind) {
            (amount === 0 && quantity === 0 ? ignored : unsupported).push({ line, label });
            return;
        }

        const baseKey = `schwab:${[cell(at.date), label, symbol, description, cell(at.quantity), cell(at.price), cell(at.fees), cell(at.amount)].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = { source: 'schwab-csv', variant, line, symbol: symbol || undefined, asOf: dates.asOf, row };

        if (kind === 'buy' || kind === 'sell') {
            const size = Math.abs(quantity);
            if (!symbol || !size) {
                unsupported.push({ line, label });
                return;
            }
            // Amount is the cash effect including fees and commissions
            const cashEffect = cell(at.amount) ? amount : round((kind === 'sell' ? 1 : -1) * size * Math.abs(price) - fees);
            batch.entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                date,
                side: kind,
                isin: symbol, // ticker (or CUSIP); resolved to a security by the market sync
                name: description || symbol,
                quantity: size,
                amount: round(cashEffect + fees),
                currency: CURRENCY,
                fee: fees ? -fees : undefined,
                feeCurrency: CURRENCY,
                raw: { ...raw, pricePerShare: Math.abs(price) || undefined }
            }));
            return;
        }

        if (kind === 'cash' && (quantity !== 0 || symbol)) {
            unsupported.push({ line, label }); // securities moved between accounts
            return;
        }
        if (amount === 0) {
            ignored.push({ line, label });
            return;
        }
        const type: StatementType = kind === 'dividend' ? 'Dividend'
            : kind === 'interest' ? 'Interest'
                : kind === 'tax' ? 'Tax'
                    : kind === 'fee' ? 'Fee'
                        : amount >= 0 ? 'Deposit' : 'Withdrawal';
        const security = kind === 'dividend' || kind === 'tax' || kind === 'fee';
        batch.entries.push(statementEntry({
            source: SOURCE,
            externalId: key,
            date,
            type,
            amount,
            currency: CURRENCY,
            description: [label, description].filter(Boolean).join(': '),
            isin: security && symbol ? symbol : undefined,
            name: security && symbol ? description || undefined : undefined,
            raw
        }));
    });

    return {
        batch,
        report: { importerId: 'schwab', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const schwabFileImporter: FileImporter = {
    id: 'schwab',
    broker: 'Charles Schwab',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Schwab', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#schwab' },
        { label: 'Export-To-Ghostfolio issue #191 (action types)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/191' },
        { label: 'Export-To-Ghostfolio issue #75 (header, transfers)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/75' }
    ],
    verified: '2026-10-28',
    detect,
    parse
};
