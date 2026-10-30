import { columnIndex, locateHeader, parseUsNumber, readCsv } from './csv';
import { statementEntry, tradeEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';
import type { CashBalanceImportPoint } from '@/lib/csvParser';

// Finpension transaction report (portfolio → Transactions → "transaction report (CSV-file)"), semicolon
// separated. Columns from Export-To-Ghostfolio 9e35bd6 (3a and BVG samples, PRs #267, #284):
//   Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";
//   "Cash Flow";Balance
// Pillar 3a and vested benefits (BVG/Freizügigkeit) share the columns but name their categories differently.
// Cash Flow is the signed CHF effect on the portfolio's cash, Balance the cash after the row; newest row
// first. Numbers have a decimal point, dates are ISO.

const SOURCE = 'Finpension';
const CURRENCY = 'CHF';
const REQUIRED = ['Date', 'Category', 'Asset Name', 'ISIN', 'Number of Shares', 'Asset Currency', 'Asset Price in CHF', 'Cash Flow', 'Balance'];

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

type Kind = 'buy' | 'sell' | 'trade' | 'dividend' | 'interest' | 'fee' | 'deposit' | 'withdrawal' | 'transfer';

/**
 * 3a sample: Buy, Sell, Dividend, Interests, Flat-rate administrative fee, Deposit. BVG sample: Portfolio
 * Transaction (direction from the cash flow), Dividend and Interest Distributions, Interests, Flat-rate
 * administration fee, Transfer vested benefits.
 */
const classify = (category: string): Kind | null => {
    const value = category.trim().toLowerCase();
    if (value === 'buy') return 'buy';
    if (value === 'sell') return 'sell';
    if (value === 'portfolio transaction') return 'trade';
    if (value === 'dividend' || value === 'dividend and interest distributions') return 'dividend';
    if (value === 'interests' || value === 'interest') return 'interest';
    if (/\bfee\b/.test(value)) return 'fee';
    if (value === 'deposit') return 'deposit';
    if (value.startsWith('withdraw')) return 'withdrawal';
    if (value.startsWith('transfer vested benefits')) return 'transfer';
    return null;
};

/** Categories only the vested benefits (BVG) report uses. */
const BVG = new Set(['portfolio transaction', 'dividend and interest distributions', 'transfer vested benefits', 'flat-rate administration fee']);
/** Categories only the pillar 3a report uses. */
const PILLAR_3A = new Set(['buy', 'sell', 'dividend', 'deposit', 'flat-rate administrative fee']);

const toIsoDate = (value: string): string | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date.toISOString().slice(0, 10) : null;
};

const detect = (text: string): string | null => {
    const located = locateHeader(text, REQUIRED, [';']);
    if (!located) return null;
    const category = columnIndex(located.header)('Category');
    const categories = readCsv(text, ';').slice(located.row + 1).map((row) => (row[category] || '').trim().toLowerCase());
    if (categories.some((value) => BVG.has(value))) return 'bvg';
    if (categories.some((value) => PILLAR_3A.has(value))) return '3a';
    return 'report';
};

const parse = (text: string) => {
    const variant = detect(text);
    const located = locateHeader(text, REQUIRED, [';']);
    if (!variant || !located) throw new FileImportError('unknownFormat');
    const rows = readCsv(text, ';');
    const column = columnIndex(located.header);
    const at = {
        date: column('Date'),
        category: column('Category'),
        name: column('Asset Name'),
        isin: column('ISIN'),
        shares: column('Number of Shares'),
        assetCurrency: column('Asset Currency'),
        rate: column('Currency Rate'),
        price: column('Asset Price in CHF'),
        cashFlow: column('Cash Flow'),
        balance: column('Balance')
    };
    const data = rows.slice(located.row + 1);
    if (data.length === 0) throw new FileImportError('noRows');
    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();
    // Closing cash per day: the export lists the newest row first, so the first row of a day wins
    const balances = new Map<string, CashBalanceImportPoint>();

    data.forEach((row, offset) => {
        const line = located.row + offset + 2;
        const cell = (index: number) => (index >= 0 ? row[index] || '' : '');
        const number = (index: number) => {
            const raw = cell(index);
            if (!raw) return 0;
            const value = parseUsNumber(raw);
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };
        const label = cell(at.category);
        const date = toIsoDate(cell(at.date));
        if (!date) throw new FileImportError('invalidDate', line);
        const cashFlow = number(at.cashFlow);
        const shares = number(at.shares);
        const price = number(at.price);
        const isin = cell(at.isin);
        if (cell(at.balance)) {
            const balance = number(at.balance);
            if (!balances.has(date)) balances.set(date, { date, currency: CURRENCY, balance, accountLabel: SOURCE });
        }

        const kind = classify(label);
        if (!kind) {
            (cashFlow === 0 && shares === 0 ? ignored : unsupported).push({ line, label });
            return;
        }

        const baseKey = `finpension:${[cell(at.date), label, isin, cell(at.shares), cell(at.cashFlow), cell(at.balance)].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = {
            source: 'finpension-csv',
            variant,
            line,
            assetCurrency: cell(at.assetCurrency) || undefined,
            currencyRate: cell(at.rate) || undefined,
            row
        };
        const name = cell(at.name) || isin;

        if (kind === 'buy' || kind === 'sell' || kind === 'trade') {
            // Portfolio Transaction (BVG): the cash flow tells the direction
            const side = kind === 'trade' ? (cashFlow < 0 ? 'buy' : 'sell') : kind;
            const size = Math.abs(shares);
            const cashFits = (side === 'buy') === cashFlow < 0;
            const sharesFit = kind === 'trade' || (side === 'buy') === shares > 0;
            if (!isin || !size || !cashFlow || !cashFits || !sharesFit) {
                unsupported.push({ line, label });
                return;
            }
            batch.entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                date,
                side,
                isin,
                name,
                quantity: size,
                amount: round(cashFlow), // Finpension charges no trading fee; the flat-rate fee is a row of its own
                currency: CURRENCY,
                raw: { ...raw, pricePerShare: price || undefined }
            }));
            return;
        }
        if (cashFlow === 0) {
            ignored.push({ line, label });
            return;
        }
        if (kind === 'dividend' && (!isin || cashFlow < 0)) {
            unsupported.push({ line, label });
            return;
        }
        const type: StatementType = kind === 'dividend' ? 'Dividend'
            : kind === 'interest' ? 'Interest'
                : kind === 'fee' ? 'Fee'
                    : cashFlow > 0 ? 'Deposit' : 'Withdrawal';
        batch.entries.push(statementEntry({
            source: SOURCE,
            externalId: key,
            date,
            type,
            amount: round(cashFlow),
            currency: CURRENCY,
            description: label,
            raw,
            ...(kind === 'dividend' ? { isin, name } : {})
        }));
    });

    batch.cashBalances.push(...Array.from(balances.values()).sort((a, b) => a.date.localeCompare(b.date)));
    return {
        batch,
        report: { importerId: 'finpension', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const finpensionFileImporter: FileImporter = {
    id: 'finpension',
    broker: 'Finpension',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Finpension', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#finpension' },
        { label: 'Export-To-Ghostfolio PR #284 (BVG / vested benefits)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/pull/284' },
        { label: 'Portfolio Performance forum: CSV import for Finpension 3a', url: 'https://forum.portfolio-performance.info/t/csv-import-fur-finpension-3a-schweiz/17051' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
