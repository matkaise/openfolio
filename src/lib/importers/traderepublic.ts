import { columnIndex, parseDotDecimal, readCsv } from './csv';
import { statementEntry, tradeEntry, type ImportEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';
import type { LedgerKind } from '@/types/domain';

// Trade Republic transaction report (Profil → Kontoauszüge → Transaktionsreport), the native CSV
// export. Not the CSV of the community tool pytr, which has other columns and is not recognised here.
// Format knowledge from Portfolio Performance (TradeRepublicCSVExtractor and its test files,
// commit 2a0ef52); no code taken over. Columns, by name:
//   datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,
//   currency,original_amount,original_currency,fx_rate,description,transaction_id, then either
//   value_date or counterparty_name,counterparty_iban,payment_reference,mcc_code.
// Separated by "," (quoted cells) or ";". `amount` is the gross value, `fee` and `tax` are signed
// columns of their own: the cash effect of a row is amount + fee + tax, in `currency`.

const SOURCE = 'Trade Republic';
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const COLUMNS = {
    datetime: 'datetime',
    date: 'date',
    account: 'account_type',
    category: 'category',
    type: 'type',
    assetClass: 'asset_class',
    name: 'name',
    symbol: 'symbol',
    shares: 'shares',
    price: 'price',
    amount: 'amount',
    fee: 'fee',
    tax: 'tax',
    currency: 'currency',
    originalAmount: 'original_amount',
    originalCurrency: 'original_currency',
    fxRate: 'fx_rate',
    description: 'description',
    id: 'transaction_id'
} as const;

const REQUIRED: (keyof typeof COLUMNS)[] = ['datetime', 'account', 'category', 'type', 'symbol', 'shares', 'amount', 'fee', 'tax', 'currency', 'id'];

/** Payment details of the counterparty; not kept in the stored source row. */
const PRIVATE_COLUMNS = new Set(['counterparty_name', 'counterparty_iban', 'payment_reference']);

type Kind = 'trade' | 'redemption' | 'dividend' | 'interest' | 'cash' | 'fee' | 'tax' | 'taxOnly' | 'earnings' | 'covered';

// Money moving in or out of the account: transfers, card payments, gifts and rewards credited by
// Trade Republic. Booked as deposit or withdrawal by the sign of the amount.
const CASH_TYPES = new Set([
    'CUSTOMER_INBOUND', 'CUSTOMER_INPAYMENT', 'CUSTOMER_INPAYMENT_REVERSAL', 'CUSTOMER_OUTBOUND_REQUEST',
    'TRANSFER_IN', 'TRANSFER_OUT', 'TRANSFER_INBOUND', 'TRANSFER_OUTBOUND', 'TRANSFER_INSTANT_INBOUND',
    'TRANSFER_INSTANT_OUTBOUND', 'TRANSFER_DIRECT_DEBIT_INBOUND', 'VIBAN_TRANSFER_INBOUND', 'VIBAN_TRANSFER_OUTBOUND',
    'GENERAL_INBOUND', 'MANUAL_CASH_TRANSFER', 'PAYMENT', 'GIFT',
    'CARD_TRANSACTION', 'CARD_TRANSACTION_INTERNATIONAL', 'CARD_TRANSACTION_REFUND', 'CARD_TRANSACTION_REFUND_REVERSAL',
    'BENEFITS_SAVEBACK', 'BONUS', 'REFERRAL', 'KINDERGELD_BONUS', 'PEA_MARKETING', 'COMPENSATION'
]);

/**
 * Category and type of the report. Rows that change a position in another way (crypto, private
 * markets, mergers, exchanges, CFDs, splits, ...) have no kind and are reported as not imported.
 */
const classify = (category: string, type: string): Kind | null => {
    if (category === 'TRADING') return type === 'BUY' || type === 'SELL' ? 'trade' : null;
    if (category === 'CORPORATE_ACTION') {
        // Position side of a bond maturity or warrant exercise; the payout is a CASH row of its own
        return type === 'REDEMPTION' || type === 'FINAL_MATURITY' || type === 'WARRANT_EXERCISE' ? 'covered' : null;
    }
    if (category !== 'CASH') return null;
    if (CASH_TYPES.has(type)) return 'cash';
    switch (type) {
        case 'DIVIDEND':
        case 'DISTRIBUTION':
        case 'DIVIDEND_EQUIVALENT_PAYMENT':
            return 'dividend';
        case 'INTEREST_PAYMENT': return 'interest';
        case 'FINAL_MATURITY':
        case 'TILG':
            return 'redemption';
        case 'FEE':
        case 'CARD_ORDERING_FEE':
            return 'fee';
        case 'TAX': return 'tax';
        case 'EARNINGS': return 'earnings'; // Vorabpauschale: tax only, or a payout with tax
        case 'PRE_DETERMINED_TAX_BASE':
        case 'SEC_ACCOUNT':
        case 'TAX_OPTIMIZATION':
            return 'taxOnly';
        default: return null;
    }
};

const headerOf = (text: string): { delimiter: string; header: string[] } | null => {
    const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
    for (const delimiter of [',', ';']) {
        const header = readCsv(firstLine, delimiter)[0] || [];
        const column = columnIndex(header);
        if (REQUIRED.every((key) => column(COLUMNS[key]) >= 0)) return { delimiter, header };
    }
    return null;
};

const detect = (text: string): string | null => {
    const found = headerOf(text);
    if (!found) return null;
    return found.delimiter === ',' ? 'comma' : 'semicolon';
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const parse = (text: string) => {
    const found = headerOf(text);
    if (!found) throw new FileImportError('unknownFormat');
    const variant = found.delimiter === ',' ? 'comma' : 'semicolon';
    const rows = readCsv(text, found.delimiter);
    const header = rows[0];
    const column = columnIndex(header);
    const index = Object.fromEntries(Object.entries(COLUMNS).map(([key, name]) => [key, column(name)])) as Record<keyof typeof COLUMNS, number>;
    const data = rows.slice(1);
    if (data.length === 0) throw new FileImportError('noRows');

    // One report per account: the main account and a junior depot belong into different portfolios
    const accounts = new Set(data.map((row) => (row[index.account] || '').trim()).filter(Boolean));
    if (accounts.size > 1) throw new FileImportError('severalAccounts');

    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach((row, offset) => {
        const line = offset + 2;
        const cell = (key: keyof typeof COLUMNS) => (index[key] >= 0 ? row[index[key]] || '' : '');
        const number = (key: keyof typeof COLUMNS) => {
            const raw = cell(key);
            if (!raw) return 0;
            const value = parseDotDecimal(raw);
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };
        const category = cell('category').toUpperCase();
        const type = cell('type').toUpperCase();
        const label = [category, type].filter(Boolean).join(' / ');

        // `date` is the booking date; `datetime` the UTC timestamp, which can fall on the next day
        const date = cell('date') || (/^\d{4}-\d{2}-\d{2}T/.test(cell('datetime')) ? cell('datetime').slice(0, 10) : '');
        if (!ISO_DATE.test(date)) throw new FileImportError('invalidDate', line);
        const amount = number('amount');
        const fee = number('fee');
        const tax = number('tax');
        const shares = Math.abs(number('shares'));

        const kind = classify(category, type);
        if (!kind || kind === 'covered') {
            const noEffect = kind === 'covered' || (amount === 0 && fee === 0 && tax === 0 && shares === 0);
            (noEffect ? ignored : unsupported).push({ line, label });
            return;
        }

        // The transaction id is unique per booking; a repeated id is the same booking listed twice
        const id = cell('id');
        const baseKey = `traderepublic:${id || [cell('datetime'), category, type, cell('symbol'), cell('shares'), cell('amount'), cell('fee'), cell('tax')].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        if (id && occurrence > 1) {
            ignored.push({ line, label });
            return;
        }
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;

        const currency = cell('currency').toUpperCase();
        const symbol = cell('symbol');
        const isin = ISIN.test(symbol) ? symbol : undefined;
        const name = cell('name') || undefined;
        const description = cell('description') || label;
        const fields = Object.fromEntries(header
            .map((name, position) => [name, row[position] || ''] as const)
            .filter(([name, value]) => value && !PRIVATE_COLUMNS.has(name)));
        const raw = { source: 'traderepublic-csv', variant, line, fields };

        const entries: ImportEntry[] = [];
        const statement = (part: string, statementType: StatementType, value: number, extra: { kind?: LedgerKind; isin?: string; name?: string } = {}) => {
            if (!value) return;
            entries.push(statementEntry({
                source: SOURCE,
                externalId: part ? `${key}:${part}` : key,
                date,
                type: statementType,
                amount: value,
                currency,
                description,
                raw,
                ...extra
            }));
        };
        const security = { isin, name };

        if (kind === 'trade' || kind === 'redemption') {
            // Crypto has a ticker instead of an ISIN; Openfolio does not guess the security
            if (!isin || !shares) {
                unsupported.push({ line, label });
                return;
            }
            const side = kind === 'redemption' || type === 'SELL' ? 'sell' : 'buy';
            entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                date,
                side,
                savingsPlan: /savings plan|sparplan/i.test(description) || undefined,
                isin,
                name: name || isin,
                quantity: shares,
                amount,
                currency,
                fee: fee || undefined,
                feeCurrency: currency,
                raw: { ...raw, pricePerShare: number('price') || undefined }
            }));
            // Capital gains tax (or its refund) on the sale
            statement('tax', 'Tax', tax, { kind: 'tax', ...security });
        } else if (kind === 'dividend' || (kind === 'interest' && isin)) {
            // Gross payout with its tax; a negative row reverses an earlier payout (storno)
            statement('', 'Dividend', amount, security);
            statement('tax', 'Tax', tax, security);
            statement('fee', 'Fee', fee, security);
        } else if (kind === 'interest') {
            statement('', 'Interest', amount);
            statement('tax', 'Tax', tax, { kind: 'tax' });
            statement('fee', 'Fee', fee);
        } else if (kind === 'cash') {
            // Card top-ups carry their fee in `fee`: the full payment comes in, the fee goes out
            statement('', amount >= 0 ? 'Deposit' : 'Withdrawal', amount);
            statement('fee', 'Fee', fee);
            statement('tax', 'Tax', tax, { kind: 'tax' });
        } else if (kind === 'fee') {
            statement('', 'Fee', amount + fee);
            statement('tax', 'Tax', tax, { kind: 'tax' });
        } else if (kind === 'tax') {
            statement('', 'Tax', amount + tax, { kind: 'tax' });
            statement('fee', 'Fee', fee);
        } else if (kind === 'earnings' || kind === 'taxOnly') {
            if (kind === 'taxOnly' && amount !== 0) {
                unsupported.push({ line, label });
                return;
            }
            statement('', 'Dividend', amount, security);
            statement('tax', 'Tax', tax, { kind: 'tax', ...security });
            statement('fee', 'Fee', fee, security);
        }

        if (entries.length === 0) {
            // Vorabpauschale or tax optimisation without amount (covered by the allowance)
            ignored.push({ line, label });
            return;
        }
        batch.entries.push(...entries);
    });

    return {
        batch,
        report: { importerId: 'traderepublic', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const tradeRepublicFileImporter: FileImporter = {
    id: 'traderepublic',
    broker: 'Trade Republic',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        {
            label: 'Portfolio Performance: TradeRepublicCSVExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/2a0ef52a93882c0845596b2c6b834e54f592b7ec/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/traderepublic/TradeRepublicCSVExtractor.java'
        },
        { label: 'Parqet: Trade Republic CSV-Import', url: 'https://faq.parqet.com/de/articles/651186-trade-republic-csv-import' },
        { label: 'Portfolio Performance forum: Transaktionsexport', url: 'https://forum.portfolio-performance.info/t/import-trade-republic-csv-transaktionsexport/39126' }
    ],
    verified: '2026-10-28',
    detect,
    parse
};
