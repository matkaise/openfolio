import { statementEntry, tradeEntry, type StatementType } from './entries';
import type { ImportRowNote } from './fileImport';
import { emptyImportBatch, type ImportBatch } from './importBatch';

// Interactive Brokers Activity Flex Query (XML). Bookings come from Trades, CashTransactions
// and SalesTaxes, positions for the reconciliation from OpenPositions. Corporate actions and
// transfers are not booked but reported, so they do not disappear. Attribute names follow
// IBKR's Flex fields.

export interface FlexPosition {
    isin: string;
    symbol: string;
    quantity: number;
}

export interface FlexParseResult {
    batch: ImportBatch;
    positions: FlexPosition[];
    period: { from: string; to: string; accountId: string } | null;
    accounts: string[];
    rows: number; // booking rows read
    ignored: ImportRowNote[]; // rows without cash or position effect
    unsupported: ImportRowNote[]; // rows with a financial effect that are not booked
}

const decodeEntities = (value: string) => value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');

const parseAttributes = (raw: string): Record<string, string> => {
    const attributes: Record<string, string> = {};
    const pattern = /([A-Za-z_][\w.-]*)="([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
        attributes[match[1]] = decodeEntities(match[2]);
    }
    return attributes;
};

type FlexRow = Record<string, string>;

/** A part of the file: one FlexStatement, with the file line it starts on. */
interface XmlPart {
    xml: string;
    line: number;
}

const lineAfter = (part: XmlPart, offset: number) => part.line + (part.xml.slice(0, offset).match(/\n/g)?.length ?? 0);

const elementsWithLines = (part: XmlPart, tag: string): { row: FlexRow; line: number }[] => {
    const pattern = new RegExp(`<${tag}\\s([^>]*?)\\/?>`, 'g');
    const result: { row: FlexRow; line: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(part.xml)) !== null) {
        result.push({ row: parseAttributes(match[1]), line: lineAfter(part, match.index) });
    }
    return result;
};

const statementParts = (xml: string): { part: XmlPart; attributes: Record<string, string> }[] => {
    const pattern = /<FlexStatement\s([^>]*?)>([\s\S]*?)<\/FlexStatement>/g;
    const whole = { xml, line: 1 };
    const parts: { part: XmlPart; attributes: Record<string, string> }[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
        parts.push({ part: { xml: match[2], line: lineAfter(whole, match.index + match[0].indexOf(match[2])) }, attributes: parseAttributes(match[1]) });
    }
    return parts.length > 0 ? parts : [{ part: whole, attributes: {} }];
};

/** Flex dates come as "20240315", "2024-03-15" or with a time ("20240315;153000", "2024-03-15, 15:30:00"). */
const toIsoDate = (value: string | undefined): string | null => {
    const raw = (value || '').trim();
    const compact = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const dashed = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;
    return null;
};

const toNumber = (value: string | undefined): number => {
    const parsed = Number((value || '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

/** IBKR fills unused id fields with "N/A" or "0". */
const usableId = (value: string | undefined): string | undefined => {
    const id = (value || '').trim();
    return id && id !== 'N/A' && id !== '0' ? id : undefined;
};

// Instruments Openfolio models as positions. Options, futures, etc. are not supported yet.
const POSITION_CATEGORIES = new Set(['STK', 'ETF', 'FUND', 'BOND']);

/**
 * Prefer the finest level of detail: queries can contain the same trade per execution and
 * per order (or cash rows in detail and as summary), which would count it twice.
 */
const pickDetailLevel = <T extends { row: FlexRow }>(rows: T[], preferred: string[]): T[] => {
    for (const level of preferred) {
        const matching = rows.filter(({ row }) => (row.levelOfDetail || '').toUpperCase() === level);
        if (matching.length > 0) return matching;
    }
    return rows.filter(({ row }) => !(row.levelOfDetail || '').toUpperCase().includes('SUMMARY'));
};

const cashMovementType = (type: string, amount: number): StatementType => {
    const normalized = type.toLowerCase();
    if (normalized.includes('deposit') || normalized.includes('withdrawal')) return amount >= 0 ? 'Deposit' : 'Withdrawal';
    if (normalized.includes('withholding')) return 'Tax';
    if (normalized.includes('dividend')) return 'Dividend'; // incl. "Payment In Lieu Of Dividends"
    if (normalized.includes('interest')) return 'Interest';
    if (normalized.includes('fee') || normalized.includes('commission')) return 'Fee';
    if (normalized.includes('tax')) return 'Tax';
    return 'Adjustment';
};

export const parseIbkrFlexXml = (xml: string): FlexParseResult => {
    if (!/<FlexQueryResponse[\s>]/.test(xml) && !/<FlexStatement[\s>]/.test(xml)) {
        throw new Error('Keine IBKR-Flex-Abfrage (FlexQueryResponse) gefunden.');
    }

    const statements = statementParts(xml);
    const batch = emptyImportBatch('IBKR');
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const latestPositions = new Map<string, { to: string; positions: FlexPosition[] }>();
    let rows = 0;

    // Rows without an id get a key from their content. Identical ones stay separate bookings.
    const seenKeys = new Map<string, number>();
    const numbered = (key: string) => {
        const occurrence = (seenKeys.get(key) || 0) + 1;
        seenKeys.set(key, occurrence);
        return occurrence > 1 ? `${key}#${occurrence}` : key;
    };

    statements.forEach(({ part, attributes }) => {
        const statementAccount = attributes.accountId || '';
        const accountOf = (row: FlexRow) => row.accountId || statementAccount;

        const tradeRows = pickDetailLevel(elementsWithLines(part, 'Trade'), ['EXECUTION', 'ORDER']);
        rows += tradeRows.length;
        tradeRows.forEach(({ row, line }) => {
            const category = (row.assetCategory || '').toUpperCase();
            const label = `${category || 'Trade'} ${row.symbol || row.description || ''}`.trim();
            const date = toIsoDate(row.tradeDate || row.dateTime);
            const quantity = toNumber(row.quantity);
            if (category !== 'CASH' && !POSITION_CATEGORIES.has(category)) {
                unsupported.push({ line, label });
                return;
            }
            if (!date) {
                unsupported.push({ line, label });
                return;
            }
            if (!quantity) {
                ignored.push({ line, label });
                return;
            }

            const id = usableId(row.transactionID) || usableId(row.tradeID);
            const key = `ibkr:${accountOf(row)}:trade:${id || numbered(`${row.dateTime}|${row.conid}|${row.quantity}|${row.tradePrice}`)}`;
            const fee = toNumber(row.ibCommission);
            const feeCurrency = row.ibCommissionCurrency || row.currency;
            const raw = { source: 'ibkr-flex', conid: row.conid, symbol: row.symbol };

            if (category === 'CASH') {
                // Currency conversion: EUR.USD with a quantity in EUR and proceeds in USD
                const [base, quote] = (row.symbol || '').split('.');
                if (!/^[A-Z]{3}$/.test(base || '') || quote !== row.currency) {
                    unsupported.push({ line, label });
                    return;
                }
                const leg = (suffix: string, amount: number, currency: string) => statementEntry({
                    source: 'IBKR',
                    externalId: `${key}:${suffix}`,
                    date,
                    type: 'Transfer',
                    kind: 'fx',
                    internal: true,
                    amount,
                    currency,
                    description: row.description || row.symbol,
                    raw
                });
                batch.entries.push(leg('base', quantity, base), leg('quote', toNumber(row.proceeds), quote));
                if (fee) {
                    batch.entries.push(statementEntry({
                        source: 'IBKR',
                        externalId: `${key}:fee`,
                        date,
                        type: 'Fee',
                        amount: fee,
                        currency: feeCurrency,
                        description: row.description || row.symbol,
                        raw
                    }));
                }
                return;
            }

            // The sign of the quantity decides: a cancelled sell ("SELL (Ca.)") has a positive
            // quantity and negative proceeds, and booked that way it reverses the original trade.
            const cancelled = (row.buySell || '').includes('(Ca.)');
            const sold = quantity < 0 || (!cancelled && (row.buySell || '').toUpperCase().startsWith('SELL'));
            batch.entries.push(tradeEntry({
                source: 'IBKR',
                externalId: key,
                orderId: row.ibOrderID || undefined,
                date,
                side: sold ? 'sell' : 'buy',
                isin: row.isin || row.symbol,
                name: row.description || row.symbol,
                quantity,
                amount: toNumber(row.proceeds), // signed: negative for buys
                currency: row.currency,
                fee,
                feeCurrency,
                fxRate: toNumber(row.fxRateToBase) || undefined,
                raw: { ...raw, pricePerShare: toNumber(row.tradePrice) || undefined }
            }));

            // Stamp duty and transaction taxes are not part of proceeds or commission
            const taxes = toNumber(row.taxes);
            if (taxes) {
                batch.entries.push(statementEntry({
                    source: 'IBKR',
                    externalId: `${key}:tax`,
                    date,
                    type: 'Tax',
                    kind: 'tax',
                    amount: taxes,
                    currency: row.currency,
                    description: row.description || row.symbol,
                    isin: row.isin || row.symbol,
                    name: row.symbol,
                    raw
                }));
            }
        });

        // A query without executions has only order summaries, which are no bookings
        if (tradeRows.length === 0) {
            elementsWithLines(part, 'Order').forEach(({ row, line }) => {
                rows += 1;
                unsupported.push({ line, label: `Order ${row.symbol || ''}`.trim() });
            });
        }

        const cashRows = pickDetailLevel(elementsWithLines(part, 'CashTransaction'), ['DETAIL']);
        rows += cashRows.length;
        cashRows.forEach(({ row, line }) => {
            const date = toIsoDate(row.settleDate || row.dateTime || row.reportDate);
            const amount = toNumber(row.amount);
            const label = row.type || row.description || 'CashTransaction';
            if (!amount || row.currency === 'BASE_SUMMARY') {
                ignored.push({ line, label });
                return;
            }
            if (!date || !row.currency) {
                unsupported.push({ line, label });
                return;
            }
            const id = usableId(row.transactionID) || numbered(`${date}|${row.type}|${row.amount}|${row.description}`);
            const security = row.isin || row.symbol;
            batch.entries.push(statementEntry({
                source: 'IBKR',
                externalId: `ibkr:${accountOf(row)}:cash:${id}`,
                date,
                type: cashMovementType(row.type || '', amount),
                amount,
                currency: row.currency,
                description: row.description || row.type || '',
                isin: security,
                name: row.symbol,
                raw: { source: 'ibkr-flex', type: row.type }
            }));
        });

        // VAT on fees and market data: a cash effect of its own, not listed under CashTransactions
        const salesTaxRows = elementsWithLines(part, 'SalesTax');
        rows += salesTaxRows.length;
        salesTaxRows.forEach(({ row, line }) => {
            const date = toIsoDate(row.date || row.reportDate);
            const amount = toNumber(row.salesTax);
            if (!amount) {
                ignored.push({ line, label: 'SalesTax' });
                return;
            }
            if (!date || !row.currency) {
                unsupported.push({ line, label: 'SalesTax' });
                return;
            }
            const id = usableId(row.transactionID) || numbered(`${date}|${row.salesTax}|${row.taxableDescription}`);
            batch.entries.push(statementEntry({
                source: 'IBKR',
                externalId: `ibkr:${accountOf(row)}:salestax:${id}`,
                date,
                type: 'Tax',
                kind: 'tax',
                amount,
                currency: row.currency,
                description: row.taxableDescription || 'Sales Tax',
                raw: { source: 'ibkr-flex', type: 'SalesTax' }
            }));
        });

        // Quantities change here without a trade; Openfolio does not book these yet
        pickDetailLevel(elementsWithLines(part, 'CorporateAction'), ['DETAIL']).forEach(({ row, line }) => {
            rows += 1;
            unsupported.push({ line, label: `CorporateAction ${row.type || ''} ${row.symbol || row.description || ''}`.replace(/\s+/g, ' ').trim() });
        });
        elementsWithLines(part, 'Transfer').forEach(({ row, line }) => {
            rows += 1;
            unsupported.push({ line, label: `Transfer ${row.type || ''} ${row.symbol || row.description || ''}`.replace(/\s+/g, ' ').trim() });
        });

        const positions = elementsWithLines(part, 'OpenPosition')
            .map(({ row }) => row)
            .filter((row) => (row.levelOfDetail || 'SUMMARY').toUpperCase() !== 'LOT')
            .filter((row) => POSITION_CATEGORIES.has((row.assetCategory || '').toUpperCase()))
            .map((row) => ({ isin: row.isin || row.symbol, symbol: row.symbol, quantity: toNumber(row.position) }));
        const to = toIsoDate(attributes.toDate) || '';
        const known = latestPositions.get(statementAccount);
        if (!known || to >= known.to) latestPositions.set(statementAccount, { to, positions });
    });

    const dated = statements.filter(({ attributes }) => attributes.fromDate || attributes.toDate);
    const period = dated.length > 0 ? {
        from: dated.map(({ attributes }) => toIsoDate(attributes.fromDate) || '').sort()[0],
        to: dated.map(({ attributes }) => toIsoDate(attributes.toDate) || '').sort().at(-1) || '',
        accountId: dated[0].attributes.accountId || ''
    } : null;
    const accounts = Array.from(new Set(statements.map(({ attributes }) => attributes.accountId).filter(Boolean)));

    return {
        batch,
        positions: Array.from(latestPositions.values()).flatMap((entry) => entry.positions),
        period,
        accounts,
        rows,
        ignored,
        unsupported
    };
};

// --- Flex Web Service answers ---

// "Please try again shortly" codes: generation in progress, server busy, rate limit
const RETRYABLE_CODES = new Set([1001, 1004, 1005, 1006, 1007, 1008, 1009, 1018, 1019, 1021]);

export type FlexServiceResponse =
    | { status: 'success'; referenceCode: string }
    | { status: 'fail'; code: number; message: string; retryable: boolean };

/** Parses a FlexStatementResponse (SendRequest answer or GetStatement error). Null if it is a statement. */
export const parseFlexStatementResponse = (xml: string): FlexServiceResponse | null => {
    if (!/<FlexStatementResponse[\s>]/.test(xml)) return null;
    const text = (tag: string) => {
        const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
        return match ? decodeEntities(match[1].trim()) : '';
    };
    if (text('Status').toLowerCase() === 'success') {
        return { status: 'success', referenceCode: text('ReferenceCode') };
    }
    const code = Number(text('ErrorCode')) || 0;
    return { status: 'fail', code, message: text('ErrorMessage') || 'Unbekannter Fehler', retryable: RETRYABLE_CODES.has(code) };
};
