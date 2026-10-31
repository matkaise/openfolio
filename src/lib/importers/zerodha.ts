import { columnIndex, locateHeader, parseDotDecimal, readCsvLines } from './csv';
import { tradeEntry } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Zerodha Console tradebook (Reports → Tradebook → segment → period → CSV):
//   symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
// F&O files add expiry_date. One row per fill, comma separated, quantity and price with a decimal
// point. Zerodha documents the export, not its columns; they come from public sample exports
// (see docs/broker-imports.md). The tradebook holds trades only: no charges, dividends or cash.

const SOURCE = 'Zerodha';
const CURRENCY = 'INR';
const REQUIRED = ['symbol', 'isin', 'trade_date', 'exchange', 'segment', 'series', 'trade_type', 'quantity', 'price', 'trade_id', 'order_id', 'order_execution_time'];
const BOOKED_SEGMENTS = new Set(['EQ', 'MF']);
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const isoDate = (value: string): string | null => {
    const raw = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : raw;
};

const detect = (text: string): string | null => (locateHeader(text, REQUIRED, [',']) ? 'tradebook' : null);

const parse = (text: string) => {
    const located = locateHeader(text, REQUIRED, [',']);
    if (!located) throw new FileImportError('unknownFormat');
    const rows = readCsvLines(text, ',');
    const column = columnIndex(located.header);
    const at = Object.fromEntries(REQUIRED.map((name) => [name, column(name)])) as Record<string, number>;
    const headerAt = rows.findIndex((row) => row.cells.join(',') === located.header.join(','));
    const data = rows.slice(headerAt + 1);
    if (data.length === 0) throw new FileImportError('noRows');
    const batch = emptyImportBatch(SOURCE);
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach(({ cells, line }) => {
        const cell = (name: string) => cells[at[name]] || '';
        const segment = cell('segment').toUpperCase();
        const side = cell('trade_type').toLowerCase();
        const label = `${segment || '?'} ${side || '?'}`;
        if (!BOOKED_SEGMENTS.has(segment) || (side !== 'buy' && side !== 'sell')) {
            unsupported.push({ line, label });
            return;
        }
        const date = isoDate(cell('trade_date'));
        if (!date) throw new FileImportError('invalidDate', line);
        const quantity = parseDotDecimal(cell('quantity'));
        const price = parseDotDecimal(cell('price'));
        if (!Number.isFinite(quantity) || !Number.isFinite(price)) throw new FileImportError('invalidNumber', line);
        const symbol = cell('symbol');
        const isin = cell('isin').toUpperCase();
        const security = ISIN.test(isin) ? isin : symbol; // without ISIN the symbol, resolved by the next market sync
        if (!security || !(quantity > 0) || !(price > 0)) {
            unsupported.push({ line, label });
            return;
        }
        const tradeId = cell('trade_id');
        const base = `zerodha:${cell('exchange')}:${segment}:${tradeId || [date, side, security, cell('quantity'), cell('price'), cell('order_execution_time')].join('|')}`;
        const occurrence = (seen.get(base) || 0) + 1;
        seen.set(base, occurrence);
        const value = Math.round(quantity * price * 100) / 100;
        batch.entries.push(tradeEntry({
            source: SOURCE,
            externalId: occurrence > 1 ? `${base}#${occurrence}` : base,
            orderId: cell('order_id'),
            date,
            side: side as 'buy' | 'sell',
            isin: security,
            name: symbol,
            quantity,
            amount: side === 'buy' ? -value : value,
            currency: CURRENCY,
            raw: { source: 'zerodha-csv', line, row: cells }
        }));
    });

    return {
        batch,
        report: { importerId: 'zerodha', variant: 'tradebook', period: batchPeriod(batch), rows: data.length, ignored: [], unsupported }
    };
};

export const zerodhaFileImporter: FileImporter = {
    id: 'zerodha',
    broker: 'Zerodha',
    formats: ['CSV'],
    accept: '.csv',
    multiple: true,
    sources: [
        { label: 'Zerodha Support: Tradebook', url: 'https://support.zerodha.com/category/console/reports/other-queries/articles/where-can-i-see-all-the-trades-i-ve-taken-for-a-particular-period' },
        { label: 'paisa: Zerodha tradebook import', url: 'https://github.com/ananthakumaran/paisa/discussions/46' }
    ],
    verified: '2026-10-31',
    detect,
    parse
};
