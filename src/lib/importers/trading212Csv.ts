import { columnIndex, normalizeHeader, parseDotDecimal, readCsv } from './csv';
import { statementEntry, tradeEntry, type ImportEntry } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Trading 212 history export (History → Export CSV). The columns depend on the account and
// the period: optional cost columns ("Stamp duty reserve tax", "Currency conversion fee", ...)
// only appear when they occur, so everything is read by header name, never by position.
// Header names from Export-To-Ghostfolio 9e35bd6 (sample, issue #315). Bookings follow the
// Trading 212 API importer (trading212.ts): trades in the instrument currency, costs as fees,
// dividends net in the account currency.

const SOURCE = 'Trading212';

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

// Columns with a "Currency (...)" sibling that are not costs
const NOT_COSTS = new Set(['priceshare', 'result', 'total', 'withholdingtax', 'currencyconversionfromamount', 'currencyconversiontoamount']);

const detect = (text: string): string | null => {
    const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
    if (!firstLine.startsWith('Action,')) return null;
    const header = readCsv(firstLine, ',')[0] || [];
    const column = columnIndex(header);
    const required = [['Action'], ['ISIN'], ['No. of shares'], ['Price / share'], ['Total'], ['Currency (Total)']];
    if (required.some((aliases) => column(...aliases) < 0)) return null;
    if (column('Time (UTC)') >= 0) return 'utc';
    return column('Time') >= 0 ? 'standard' : null;
};

type Kind = 'buy' | 'sell' | 'dividend' | 'interest' | 'deposit' | 'withdrawal' | 'conversion';

const classify = (action: string): Kind | null => {
    const value = action.trim().toLowerCase();
    if (/^(market|limit|stop|stop limit) buy$/.test(value)) return 'buy';
    if (/^(market|limit|stop|stop limit) sell$/.test(value)) return 'sell';
    if (value.startsWith('dividend')) return 'dividend';
    if (value === 'interest on cash' || value === 'lending interest') return 'interest';
    if (value === 'deposit') return 'deposit';
    if (value === 'withdrawal') return 'withdrawal';
    if (value === 'currency conversion') return 'conversion';
    return null;
};

const parse = (text: string) => {
    const variant = detect(text);
    if (!variant) throw new FileImportError('unknownFormat');
    const rows = readCsv(text, ',');
    const header = rows[0];
    const column = columnIndex(header);
    const at = {
        action: column('Action'),
        time: column('Time (UTC)', 'Time'),
        isin: column('ISIN'),
        ticker: column('Ticker'),
        name: column('Name'),
        id: column('ID'),
        shares: column('No. of shares'),
        price: column('Price / share'),
        priceCurrency: column('Currency (Price / share)'),
        total: column('Total'),
        totalCurrency: column('Currency (Total)'),
        withholding: column('Withholding tax'),
        withholdingCurrency: column('Currency (Withholding tax)'),
        fromAmount: column('Currency conversion from amount'),
        fromCurrency: column('Currency (Currency conversion from amount)'),
        toAmount: column('Currency conversion to amount'),
        toCurrency: column('Currency (Currency conversion to amount)')
    };
    // Cost columns: every "<name>" with a "Currency (<name>)" sibling that is not one of the known amounts
    const costColumns = header.flatMap((name, index) => {
        const key = normalizeHeader(name);
        if (!key || (key.startsWith('currency') && !key.startsWith('currencyconversionfee')) || NOT_COSTS.has(key)) return [];
        const currencyIndex = column(`Currency (${name})`);
        return currencyIndex >= 0 ? [{ index, currencyIndex }] : [];
    });

    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();
    const data = rows.slice(1);

    data.forEach((row, offset) => {
        const line = offset + 2;
        const cell = (index: number) => (index >= 0 ? row[index] || '' : '');
        const amount = (index: number) => {
            const raw = cell(index);
            if (!raw) return 0;
            const value = parseDotDecimal(raw);
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };
        const label = cell(at.action);
        const time = cell(at.time);
        const date = /^\d{4}-\d{2}-\d{2}(?:[ T]|$)/.test(time) ? time.slice(0, 10) : null;
        if (!date) throw new FileImportError('invalidDate', line);

        const kind = classify(label);
        const total = Math.abs(amount(at.total));
        const totalCurrency = cell(at.totalCurrency).toUpperCase();
        if (!kind) {
            (total === 0 && !cell(at.isin) && !amount(at.shares) ? ignored : unsupported).push({ line, label });
            return;
        }

        const isin = cell(at.isin);
        const name = cell(at.name) || cell(at.ticker) || undefined;
        const id = cell(at.id);
        const baseKey = `t212:csv:${id || [time, label, isin, cell(at.shares), cell(at.total)].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = { source: 'trading212-csv', line, ticker: cell(at.ticker) || undefined, row };
        const entries: ImportEntry[] = [];

        if (kind === 'buy' || kind === 'sell') {
            const shares = Math.abs(amount(at.shares));
            const price = amount(at.price);
            const currency = cell(at.priceCurrency).toUpperCase();
            if (!isin || !shares || !currency) {
                unsupported.push({ line, label });
                return;
            }
            // Costs per currency; the first currency goes onto the trade, others become fee rows
            const costs = new Map<string, number>();
            costColumns.forEach(({ index, currencyIndex }) => {
                const value = Math.abs(amount(index));
                if (!value) return;
                const costCurrency = cell(currencyIndex).toUpperCase() || totalCurrency;
                costs.set(costCurrency, (costs.get(costCurrency) || 0) + value);
            });
            const [first, ...others] = Array.from(costs.entries());
            const value = shares * price;
            entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                orderId: id || undefined,
                date,
                side: kind,
                isin,
                name,
                quantity: shares,
                amount: round(kind === 'sell' ? value : -value),
                currency,
                fee: first ? -round(first[1]) : undefined,
                feeCurrency: first?.[0],
                raw: { ...raw, pricePerShare: price || undefined }
            }));
            others.forEach(([costCurrency, cost]) => entries.push(statementEntry({
                source: SOURCE, externalId: `${key}:fee:${costCurrency}`, orderId: id || undefined, date, type: 'Fee',
                amount: -round(cost), currency: costCurrency, description: label, isin, name, raw
            })));
        } else if (kind === 'conversion') {
            const from = Math.abs(amount(at.fromAmount));
            const to = Math.abs(amount(at.toAmount));
            const fromCurrency = cell(at.fromCurrency).toUpperCase();
            const toCurrency = cell(at.toCurrency).toUpperCase();
            if (!from || !to || !fromCurrency || !toCurrency) {
                unsupported.push({ line, label });
                return;
            }
            entries.push(
                statementEntry({ source: SOURCE, externalId: `${key}:out`, date, type: 'Transfer', kind: 'fx', internal: true, amount: -from, currency: fromCurrency, description: label, raw }),
                statementEntry({ source: SOURCE, externalId: `${key}:in`, date, type: 'Transfer', kind: 'fx', internal: true, amount: to, currency: toCurrency, description: label, raw })
            );
        } else {
            if (!total || !totalCurrency) {
                ignored.push({ line, label });
                return;
            }
            const withholding = Math.abs(amount(at.withholding));
            const withholdingCurrency = cell(at.withholdingCurrency).toUpperCase();
            entries.push(statementEntry({
                source: SOURCE,
                externalId: key,
                date,
                type: kind === 'dividend' ? 'Dividend' : kind === 'interest' ? 'Interest' : kind === 'deposit' ? 'Deposit' : 'Withdrawal',
                amount: kind === 'withdrawal' ? -total : total, // dividends: net, as Trading 212 credits them
                currency: totalCurrency,
                description: withholding ? `${label} (${withholdingCurrency || totalCurrency} ${withholding} withholding tax)` : label,
                isin: kind === 'dividend' ? isin || undefined : undefined,
                name: kind === 'dividend' ? name : undefined,
                raw
            }));
        }
        batch.entries.push(...entries);
    });

    if (data.length === 0) throw new FileImportError('noRows');
    return {
        batch,
        report: { importerId: 'trading212', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const trading212FileImporter: FileImporter = {
    id: 'trading212',
    broker: 'Trading 212',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Trading 212', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#trading-212' },
        { label: 'Export-To-Ghostfolio issue #315 (columns)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/315' },
        { label: 'Parqet: Trading 212 CSV-Import', url: 'https://faq.parqet.com/de/articles/765626-trading-212-csv-import' }
    ],
    verified: '2026-10-28',
    detect,
    parse
};
