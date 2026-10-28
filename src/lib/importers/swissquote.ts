import { columnIndex, normalizeHeader, parseDotDecimal, readCsv } from './csv';
import { statementEntry, tradeEntry, type ImportEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';
import type { CashBalanceImportPoint } from '@/lib/csvParser';

// Swissquote transaction export (eTrading → Transactions → Export CSV), semicolon separated.
// Variants (Export-To-Ghostfolio 9e35bd6, samples and issue #138):
//   en-13: Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency
//   en-15: as en-13 plus "Net amount currency" and "Net amount in account currency" after Net Amount
//   de-15: Datum;Auftrag #;Transaktionen;Symbol;Name;ISIN;Anzahl;Stückpreis;Kosten;Aufgelaufene Zinsen;Nettobetrag;
//          Währung Nettobetrag;Nettobetrag in der Währung des Kontos;Saldo;Währung
// "Currency"/"Währung" is the account currency (the one the balance is in). Net Amount is the
// cash effect including costs, in the net amount currency where that column exists.

const SOURCE = 'Swissquote';
const NO_ORDER = /^0+$/;

const COLUMNS = {
    date: ['Date', 'Datum'],
    order: ['Order #', 'Auftrag #'],
    type: ['Transaction', 'Transaktionen', 'Transaktion'],
    symbol: ['Symbol'],
    name: ['Name'],
    isin: ['ISIN'],
    quantity: ['Quantity', 'Anzahl'],
    price: ['Unit price', 'Stückpreis'],
    costs: ['Costs', 'Kosten'],
    net: ['Net Amount', 'Nettobetrag'],
    netCurrency: ['Net amount currency', 'Währung Nettobetrag'],
    netInAccount: ['Net amount in account currency', 'Nettobetrag in der Währung des Kontos'],
    balance: ['Balance', 'Saldo'],
    currency: ['Currency', 'Währung']
} as const;

type Kind = 'buy' | 'sell' | 'dividend' | 'fee' | 'interest' | 'fx' | 'cash' | 'taxStatement';

/**
 * Transaction types of the export. English names from the upstream sample; German ones from
 * issue #138 (Depotgebühren, Zahlung) and the upstream German detection (Kauf, Verkauf,
 * Dividende). Order matters: "verkauf" contains "kauf", "forex credit" contains "credit".
 */
const classify = (type: string): Kind | null => {
    const value = type.trim().toLowerCase();
    if (value.includes('forex')) return 'fx';
    if (value.includes('sell') || value.includes('verkauf')) return 'sell';
    if (value.includes('buy') || value.includes('kauf')) return 'buy';
    if (value.includes('dividend')) return 'dividend';
    if (value.includes('custody fee') || value.includes('depotgebühr')) return 'fee';
    if (value.includes('interest') || value.includes('zins')) return 'interest';
    if (value.includes('tax statement')) return 'taxStatement';
    if (value === 'payment' || value === 'zahlung' || value === 'credit' || value === 'debit') return 'cash';
    return null;
};

const headerOf = (text: string): string[] | null => {
    const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
    if (!firstLine.includes(';')) return null;
    return firstLine.split(';').map((cell) => cell.trim().replace(/^"|"$/g, ''));
};

const detect = (text: string): string | null => {
    const header = headerOf(text);
    if (!header) return null;
    const column = columnIndex(header);
    const required = [COLUMNS.date, COLUMNS.order, COLUMNS.type, COLUMNS.isin, COLUMNS.net, COLUMNS.balance, COLUMNS.currency, COLUMNS.costs];
    if (required.some((aliases) => column(...aliases) < 0)) return null;
    const language = normalizeHeader(header[0]) === 'datum' ? 'de' : 'en';
    const extended = column(...COLUMNS.netCurrency) >= 0 && column(...COLUMNS.netInAccount) >= 0;
    return `${language}-${extended ? 15 : 13}`;
};

/** "24-08-2022 07:00:15" -> "2022-08-24". */
const toIsoDate = (value: string): string | null => {
    const match = /^(\d{2})[-.](\d{2})[-.](\d{4})(?:\s|$)/.exec(value.trim());
    if (!match) return null;
    const [, day, month, year] = match;
    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
    return `${year}-${month}-${day}`;
};

const parse = (text: string) => {
    const variant = detect(text);
    if (!variant) throw new FileImportError('unknownFormat');
    const rows = readCsv(text, ';');
    const column = columnIndex(rows[0]);
    const index = Object.fromEntries(Object.entries(COLUMNS).map(([key, aliases]) => [key, column(...aliases)])) as Record<keyof typeof COLUMNS, number>;
    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();
    const data = rows.slice(1);
    // Closing balance per day and account currency: the row with the latest time; on equal
    // times the upper one, as the export lists the newest booking first.
    const balances = new Map<string, { stamp: string; point: CashBalanceImportPoint }>();

    data.forEach((row, offset) => {
        const line = offset + 2;
        const cell = (key: keyof typeof COLUMNS) => (index[key] >= 0 ? row[index[key]] || '' : '');
        const label = cell('type');
        const number = (key: keyof typeof COLUMNS, required = true) => {
            const raw = cell(key);
            if (!raw && !required) return 0;
            const value = parseDotDecimal(raw);
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };

        const date = toIsoDate(cell('date'));
        if (!date) throw new FileImportError('invalidDate', line);
        const net = number('net');
        const balanceCurrency = cell('currency').toUpperCase();
        const balance = parseDotDecimal(cell('balance'));
        if (balanceCurrency && Number.isFinite(balance)) {
            const stamp = cell('date').slice(11);
            const balanceKey = `${date}|${balanceCurrency}`;
            const previous = balances.get(balanceKey);
            if (!previous || stamp > previous.stamp) {
                balances.set(balanceKey, { stamp, point: { date, currency: balanceCurrency, balance, accountLabel: SOURCE } });
            }
        }
        const kind = classify(label);
        if (!kind) {
            // Without cash, security or quantity it is an information row; anything else changes the account
            const quantity = parseDotDecimal(cell('quantity'));
            const administrative = net === 0 && !cell('isin') && (!Number.isFinite(quantity) || quantity <= 1);
            (administrative ? ignored : unsupported).push({ line, label });
            return;
        }
        if (net === 0 && kind !== 'buy' && kind !== 'sell') {
            ignored.push({ line, label });
            return;
        }

        const accountCurrency = cell('currency').toUpperCase();
        const currency = (cell('netCurrency') || accountCurrency).toUpperCase();
        const costs = number('costs', false);
        const isin = cell('isin');
        const orderRaw = cell('order');
        const orderId = orderRaw && !NO_ORDER.test(orderRaw) ? orderRaw : undefined;
        const raw = { source: 'swissquote-csv', variant, line, row };

        const baseKey = `swissquote:${[cell('date'), orderRaw, label, isin, cell('quantity'), cell('net'), cell('balance'), accountCurrency].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;

        const entries: ImportEntry[] = [];
        const statement = (part: string, type: StatementType, amount: number, extra: Partial<Parameters<typeof statementEntry>[0]> = {}) => {
            entries.push(statementEntry({
                source: SOURCE,
                externalId: part ? `${key}:${part}` : key,
                orderId,
                date,
                type,
                amount,
                currency,
                description: label,
                raw,
                ...extra
            }));
        };

        if (kind === 'buy' || kind === 'sell') {
            if (!isin) {
                unsupported.push({ line, label });
                return;
            }
            const quantity = number('quantity');
            entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                orderId,
                date,
                side: kind,
                isin,
                name: cell('name') || cell('symbol') || isin,
                quantity,
                // Net Amount includes the costs; the trade carries them as its fee
                amount: net + costs,
                currency,
                fee: -costs,
                feeCurrency: currency,
                raw: { ...raw, symbol: cell('symbol') || undefined, pricePerShare: number('price', false) || undefined }
            }));
        } else if (kind === 'dividend') {
            statement('', 'Dividend', net + costs, { isin: isin || undefined, name: cell('name') || undefined });
            if (costs) statement('fee', 'Fee', -costs, { isin: isin || undefined, name: cell('name') || undefined });
        } else if (kind === 'fee' || kind === 'taxStatement') {
            statement('', 'Fee', net);
        } else if (kind === 'interest') {
            statement('', 'Interest', net);
        } else if (kind === 'fx') {
            statement('', 'Transfer', net, { kind: 'fx', internal: true });
        } else {
            // Payment, credit, debit: money in or out of the account; costs (e.g. transfer fees) booked apart
            const principal = net + costs;
            statement('', principal >= 0 ? 'Deposit' : 'Withdrawal', principal);
            if (costs) statement('fee', 'Fee', -costs);
        }

        // Booked in another currency than the account: the account pays in its own currency
        const netInAccount = index.netInAccount >= 0 ? number('netInAccount', false) : 0;
        if (kind !== 'fx' && accountCurrency && currency !== accountCurrency && netInAccount) {
            statement('fx-in', 'Transfer', -net, { kind: 'fx', internal: true, description: `${label} ${accountCurrency}/${currency}` });
            statement('fx-out', 'Transfer', netInAccount, { kind: 'fx', internal: true, currency: accountCurrency, description: `${label} ${accountCurrency}/${currency}` });
        }

        batch.entries.push(...entries);
    });

    if (data.length === 0) throw new FileImportError('noRows');
    batch.cashBalances.push(...Array.from(balances.values(), ({ point }) => point).sort((a, b) => a.date.localeCompare(b.date)));
    return {
        batch,
        report: { importerId: 'swissquote', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const swissquoteFileImporter: FileImporter = {
    id: 'swissquote',
    broker: 'Swissquote',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Swissquote', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#swissquote' },
        { label: 'Export-To-Ghostfolio issue #138 (German export)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/138' },
        { label: 'Parqet: Swissquote CSV-Import', url: 'https://faq.parqet.com/de/articles/714176-swissquote-csv-import' }
    ],
    verified: '2026-10-28',
    detect,
    parse
};
