import { columnIndex, locateHeader, parseUsNumber, readCsv } from './csv';
import { tradeEntry } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// InvestEngine "Trading statement" (Reports → Create report → Trading statement → period → portfolio → CSV),
// file name e.g. GIA_Trading_statement_14_Aug_2024_to_14_Aug_2025.csv. Columns from Export-To-Ghostfolio
// 9e35bd6 (sample, issue #241, PR #248):
//   Security / ISIN,Transaction Type,Quantity,Share Price,Total Trade Value,Trade Date/Time,Settlement Date,Broker
// Only buys and sells: dividends, platform fees and cash movements are in the Cash Statement, whose
// format has no public source and is not read. Amounts are GBP with a "£" sign, dates DD/MM/YY.

const SOURCE = 'InvestEngine';
const CURRENCY = 'GBP';
const REQUIRED = ['Security / ISIN', 'Transaction Type', 'Quantity', 'Share Price', 'Total Trade Value', 'Trade Date/Time'];

/** "Vanguard FTSE All-World / ISIN IE00BK5BQT80" -> name and ISIN. */
const SECURITY = /^(.*?)\s*\/\s*ISIN\s+([A-Z]{2}[A-Z0-9]{9}\d)$/;

/** "£1,093.41" or "£299.04"; GBP only, pence or other currencies are not expected here. */
const parsePounds = (value: string): number => {
    const raw = value.trim().replace(/^([-+]?)£/, '$1');
    return raw ? parseUsNumber(raw) : Number.NaN;
};

/** "23/12/24 15:18:12" -> "2024-12-23"; day first, two-digit year in the 2000s. */
const toIsoDate = (value: string): string | null => {
    const match = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:\s|$)/.exec(value.trim());
    if (!match) return null;
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
    return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[1]) ? date.toISOString().slice(0, 10) : null;
};

const detect = (text: string): string | null => (locateHeader(text, REQUIRED, [',']) ? 'trading-statement' : null);

const parse = (text: string) => {
    const located = locateHeader(text, REQUIRED, [',']);
    if (!located) throw new FileImportError('unknownFormat');
    const variant = 'trading-statement';
    const rows = readCsv(text, ',');
    const column = columnIndex(located.header);
    const at = {
        security: column('Security / ISIN'),
        type: column('Transaction Type'),
        quantity: column('Quantity'),
        price: column('Share Price'),
        total: column('Total Trade Value'),
        tradeDate: column('Trade Date/Time'),
        settlement: column('Settlement Date'),
        broker: column('Broker')
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
        const date = toIsoDate(cell(at.tradeDate));
        if (!date) throw new FileImportError('invalidDate', line);
        const quantity = cell(at.quantity) ? parseUsNumber(cell(at.quantity)) : 0;
        const total = cell(at.total) ? parsePounds(cell(at.total)) : 0;
        const price = cell(at.price) ? parsePounds(cell(at.price)) : 0;
        if (![quantity, total, price].every(Number.isFinite)) throw new FileImportError('invalidNumber', line);

        const side = label.trim().toLowerCase();
        if (side !== 'buy' && side !== 'sell') {
            (total === 0 && quantity === 0 ? ignored : unsupported).push({ line, label });
            return;
        }
        const security = SECURITY.exec(cell(at.security).trim());
        const size = Math.abs(quantity);
        const value = Math.abs(total);
        if (!security || !size || !value) {
            unsupported.push({ line, label });
            return;
        }

        const baseKey = `investengine:${[cell(at.tradeDate), label, security[2], cell(at.quantity), cell(at.total)].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        // Total Trade Value is the cash effect; InvestEngine charges no dealing fee per trade
        batch.entries.push(tradeEntry({
            source: SOURCE,
            externalId: occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey,
            date,
            side,
            isin: security[2],
            name: security[1] || security[2],
            quantity: size,
            amount: side === 'buy' ? -value : value,
            currency: CURRENCY,
            raw: {
                source: 'investengine-csv',
                variant,
                line,
                pricePerShare: price || undefined,
                settlementDate: cell(at.settlement) || undefined,
                broker: cell(at.broker) || undefined,
                row
            }
        }));
    });

    return {
        batch,
        report: { importerId: 'investengine', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const investEngineFileImporter: FileImporter = {
    id: 'investengine',
    broker: 'InvestEngine',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'InvestEngine: Generate and download a custom report', url: 'https://help.investengine.com/hc/en-gb/articles/8927819031581-How-can-I-generate-and-download-a-custom-report' },
        { label: 'InvestEngine: Choosing the right statement or report', url: 'https://help.investengine.com/hc/en-gb/articles/24811340395037-Guide-Choosing-the-Right-Statement-or-Report-for-Your-Needs' },
        { label: 'Export-To-Ghostfolio: InvestEngine (issue #241)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/241' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
