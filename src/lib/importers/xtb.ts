import { columnIndex, normalizeHeader, parseDotDecimal, readCsv } from './csv';
import { statementEntry, tradeEntry, type ImportEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';
import type { LedgerKind } from '@/types/domain';

// XTB cash operations. XTB exports the account history as XLSX ("EUR_account_<from>_<to>.xlsx");
// the sheet "Cash Operations" saved as CSV is what this importer reads. Format knowledge from
// Portfolio Performance (XTBCSVExtractor, its sample and PR #6085, commit 2a0ef52) and
// Export-To-Ghostfolio (xtbConverter.ts and sample, commit 9e35bd6); no code taken over. Variants:
//   cash-8:  four metadata rows (Account number, Cash Operations, Date from/to (UTC)), then
//            Type;Ticker;Instrument;Time;Amount;ID;Comment;Product and a closing "Total" row.
//            Time "2025-01-02 09:00:00" (UTC). Saved with ";" and decimal comma ("-50,25"), as
//            Excel does in German or Czech settings; "-comma" variants are saved with "," and a
//            decimal point, as English Excel does.
//   cash-10: the same with Type;Instrument;Ticker;Category;Time;Amount;ID;Comment;Product;Position ID.
//   legacy:  the former direct CSV export: ID;Type;Time;Symbol;Comment;Amount, time
//            "12.04.2024 13:01:45", decimal point.
// Amounts are in the account currency, which only the file name carries ("EUR_account_….csv").
// Instruments have an XTB ticker (SPYL.DE, FB.US) but no ISIN: stocks and ETFs are booked under
// that ticker and resolved by the market data sync like other securities without ISIN.

const SOURCE = 'XTB';
const CURRENCY_IN_NAME = /^([A-Z]{3})_/i;
/** Ticker of a listed stock or ETF: symbol plus exchange suffix. CFDs look like "US30.cash", "GOLD", "EURUSD". */
const STOCK_TICKER = /^[A-Z0-9][A-Z0-9.-]*\.[A-Z]{2}$/;
const QUANTITY = /^(?:OPEN|CLOSE) (?:BUY|SELL) (\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)? @ (\d+(?:\.\d+)?)/;

type Kind = 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'dividend' | 'withholdingTax' | 'transactionTax' | 'fee'
    | 'interest' | 'interestTax' | 'transfer' | 'cfd' | 'corporateAction';

/** Types of the current export (PP) and of older exports (Export-To-Ghostfolio, incl. Portuguese names). */
const classify = (type: string): Kind | null => {
    const value = type.trim().toLowerCase();
    if (['stock purchase', 'stocks/etf purchase', 'ações/etf compra'].includes(value)) return 'buy';
    if (['stock sale', 'stock sell', 'stocks/etf sale', 'ações/etf vende'].includes(value)) return 'sell';
    if (value === 'deposit') return 'deposit';
    if (value === 'withdrawal') return 'withdrawal';
    if (value === 'dividend') return 'dividend';
    if (value === 'withholding tax') return 'withholdingTax';
    if (value === 'tax iftt') return 'transactionTax';
    if (value === 'sec fee' || value === 'commission') return 'fee';
    if (value === 'free funds interest' || value === 'free funds interests') return 'interest';
    if (value === 'free funds interest tax' || value === 'free funds interests tax') return 'interestTax';
    if (value === 'transfer' || value === 'subaccount transfer') return 'transfer';
    if (value === 'close trade' || value === 'swap' || value === 'rollover' || value.startsWith('profit/loss')) return 'cfd';
    if (value === 'spinoff' || value === 'spin off') return 'corporateAction';
    return null;
};

type Layout = { variant: string; delimiter: string; decimal: ',' | '.'; headerRow: number };

const CASH_8 = ['Type', 'Ticker', 'Instrument', 'Time', 'Amount', 'ID', 'Comment', 'Product'];
const CASH_10 = ['Type', 'Instrument', 'Ticker', 'Category', 'Time', 'Amount', 'ID', 'Comment', 'Product', 'Position ID'];
const LEGACY = ['ID', 'Type', 'Time', 'Symbol', 'Comment', 'Amount'];

const sameHeader = (row: string[] | undefined, expected: string[]) => {
    const cells = (row || []).map(normalizeHeader);
    while (cells.length > expected.length && !cells[cells.length - 1]) cells.pop();
    return cells.length === expected.length && expected.every((name, index) => cells[index] === normalizeHeader(name));
};

const layoutOf = (text: string): Layout | null => {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/, 8).join('\n');
    for (const delimiter of [';', ',']) {
        const head = readCsv(lines, delimiter);
        const suffix = delimiter === ',' ? '-comma' : '';
        const decimal = delimiter === ',' ? '.' : ',';
        if (delimiter === ';' && sameHeader(head[0], LEGACY)) return { variant: 'legacy', delimiter, decimal: '.', headerRow: 0 };
        if (normalizeHeader(head[0]?.[0] || '') !== 'accountnumber' || normalizeHeader(head[1]?.[0] || '') !== 'cashoperations') continue;
        if (sameHeader(head[4], CASH_8)) return { variant: `cash-8${suffix}`, delimiter, decimal, headerRow: 4 };
        if (sameHeader(head[4], CASH_10)) return { variant: `cash-10${suffix}`, delimiter, decimal, headerRow: 4 };
    }
    return null;
};

const detect = (text: string): string | null => layoutOf(text)?.variant ?? null;

/** "-50,25" or "100" with decimal comma, "-399.43" with decimal point; anything else is NaN. */
const parseAmount = (raw: string, decimal: ',' | '.'): number => {
    const value = raw.trim();
    if (decimal === '.') return parseDotDecimal(value);
    return /^[-+]?\d+(,\d+)?$/.test(value) ? Number(value.replace(',', '.')) : Number.NaN;
};

/** "2025-01-02 09:00:00" or "12.04.2024 13:01:45" -> "2025-01-02" / "2024-04-12". */
const toIsoDate = (value: string): string | null => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:\s|$)/.exec(value.trim());
    const dotted = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s|$)/.exec(value.trim());
    const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : dotted ? [dotted[3], dotted[2], dotted[1]] : [];
    if (!year || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
    return `${year}-${month}-${day}`;
};

const parse = (text: string, fileName?: string) => {
    const layout = layoutOf(text);
    if (!layout) throw new FileImportError('unknownFormat');
    const { variant } = layout;
    const currencyMatch = CURRENCY_IN_NAME.exec((fileName || '').split(/[\\/]/).pop() || '');
    if (!currencyMatch) throw new FileImportError('missingCurrency');
    const currency = currencyMatch[1].toUpperCase();

    const rows = readCsv(text, layout.delimiter);
    const account = layout.headerRow > 0 ? (rows[0][1] || '').trim() : '';
    const column = columnIndex(rows[layout.headerRow]);
    const at = {
        type: column('Type'),
        ticker: column('Ticker', 'Symbol'),
        instrument: column('Instrument'),
        time: column('Time'),
        amount: column('Amount'),
        id: column('ID'),
        comment: column('Comment'),
        product: column('Product')
    };
    const firstData = layout.headerRow + 1;
    const data = rows.slice(firstData)
        .map((row, offset) => ({ row, line: firstData + offset + 1 }))
        .filter(({ row }) => normalizeHeader(row[0] || '') !== 'total');
    if (data.length === 0) throw new FileImportError('noRows');

    const cell = (row: string[], index: number) => (index >= 0 ? row[index] || '' : '');
    const amountOf = (row: string[], line: number) => {
        const value = parseAmount(cell(row, at.amount), layout.decimal);
        if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
        return value;
    };

    // Transfers between sub-accounts of this file (same time and text, opposite amounts) cancel out
    const pairedTransfers = new Set<number>();
    data.forEach((outgoing, index) => {
        if (classify(cell(outgoing.row, at.type)) !== 'transfer' || pairedTransfers.has(index)) return;
        const amount = amountOf(outgoing.row, outgoing.line);
        if (amount >= 0) return;
        const match = data.findIndex((incoming, other) => !pairedTransfers.has(other) && other !== index
            && cell(incoming.row, at.type) === cell(outgoing.row, at.type)
            && cell(incoming.row, at.time) === cell(outgoing.row, at.time)
            && cell(incoming.row, at.comment) === cell(outgoing.row, at.comment)
            && amountOf(incoming.row, incoming.line) === -amount);
        if (match >= 0) {
            pairedTransfers.add(index);
            pairedTransfers.add(match);
        }
    });

    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach(({ row, line }, index) => {
        const label = cell(row, at.type);
        const date = toIsoDate(cell(row, at.time));
        if (!date) throw new FileImportError('invalidDate', line);
        const amount = amountOf(row, line);
        const kind = classify(label);
        const ticker = cell(row, at.ticker).toUpperCase();
        const stock = STOCK_TICKER.test(ticker);

        if (pairedTransfers.has(index)) {
            ignored.push({ line, label });
            return;
        }
        if (!kind || kind === 'transfer' || kind === 'cfd' || kind === 'corporateAction') {
            // Transfers to another XTB account, CFD results and financing, spin-offs, unknown types
            (amount === 0 && kind !== 'cfd' && kind !== 'corporateAction' ? ignored : unsupported).push({ line, label });
            return;
        }
        // Rows of an instrument must be a listed stock or ETF; dividends of a CFD position are adjustments
        const needsStock = kind === 'buy' || kind === 'sell' || kind === 'dividend' || kind === 'withholdingTax' || kind === 'transactionTax' || kind === 'fee';
        if (needsStock && ticker && (!stock || (kind === 'dividend' && amount < 0))) {
            unsupported.push({ line, label });
            return;
        }

        const id = cell(row, at.id);
        const baseKey = `xtb:${account ? `${account}:` : ''}${id ? `${id}:${normalizeHeader(label)}` : [cell(row, at.time), label, ticker, cell(row, at.comment), cell(row, at.amount)].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        if (id && occurrence > 1) {
            // The same operation id twice: the row is listed twice, not booked twice
            ignored.push({ line, label });
            return;
        }
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;

        const comment = cell(row, at.comment);
        const name = cell(row, at.instrument) || ticker || undefined;
        const raw = { source: 'xtb-csv', variant, line, ticker: ticker || undefined, product: cell(row, at.product) || undefined, row };
        const entries: ImportEntry[] = [];
        const statement = (type: StatementType, extra: { kind?: LedgerKind; isin?: string; name?: string } = {}) => {
            entries.push(statementEntry({
                source: SOURCE,
                externalId: key,
                date,
                type,
                amount,
                currency,
                description: comment || label,
                raw,
                ...extra
            }));
        };
        const security = ticker ? { isin: ticker, name } : {};

        if (kind === 'buy' || kind === 'sell') {
            const quantity = QUANTITY.exec(comment);
            if (!ticker || !quantity) {
                unsupported.push({ line, label });
                return;
            }
            entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                date,
                side: kind,
                // No ISIN in the export: the XTB ticker identifies the security until the market sync resolves it
                isin: ticker,
                name,
                quantity: Number(quantity[1]),
                amount,
                currency,
                raw: { ...raw, pricePerShare: Number(quantity[2]) }
            }));
        } else if (kind === 'deposit' || kind === 'withdrawal') {
            statement(amount >= 0 ? 'Deposit' : 'Withdrawal');
        } else if (kind === 'dividend') {
            statement('Dividend', security);
        } else if (kind === 'withholdingTax') {
            statement('Tax', { kind: 'withholding_tax', ...security });
        } else if (kind === 'transactionTax') {
            statement('Tax', { kind: 'tax', ...security });
        } else if (kind === 'fee') {
            statement('Fee', security);
        } else if (kind === 'interest') {
            statement('Interest');
        } else if (kind === 'interestTax') {
            statement('Tax', { kind: 'tax' });
        }
        batch.entries.push(...entries);
    });

    return {
        batch,
        report: { importerId: 'xtb', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const xtbFileImporter: FileImporter = {
    id: 'xtb',
    broker: 'XTB',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        {
            label: 'Portfolio Performance: XTBCSVExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/2a0ef52a93882c0845596b2c6b834e54f592b7ec/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/xtb/XTBCSVExtractor.java'
        },
        { label: 'Export-To-Ghostfolio: XTB', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#xtb' }
    ],
    verified: '2026-10-28',
    detect,
    parse
};
