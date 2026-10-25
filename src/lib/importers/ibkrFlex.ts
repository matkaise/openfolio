import { statementEntry, tradeEntry, type StatementType } from './entries';
import { emptyImportBatch, type ImportBatch } from './importBatch';

// Interactive Brokers Activity Flex Query (XML). Only the sections Openfolio uses are read:
// Trades, CashTransactions and OpenPositions. Attribute names follow IBKR's Flex fields.

export interface FlexPosition {
    isin: string;
    symbol: string;
    quantity: number;
}

export interface FlexParseResult {
    batch: ImportBatch;
    positions: FlexPosition[];
    period: { from: string; to: string; accountId: string } | null;
    skipped: { fx: number; unsupported: number };
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

const elements = (xml: string, tag: string): Record<string, string>[] => {
    const pattern = new RegExp(`<${tag}\\s([^>]*?)\\/?>`, 'g');
    const result: Record<string, string>[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
        result.push(parseAttributes(match[1]));
    }
    return result;
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

// Instruments Openfolio models as positions. Options, futures, etc. are not supported yet.
const POSITION_CATEGORIES = new Set(['STK', 'ETF', 'FUND', 'BOND']);

/**
 * Prefer the finest level of detail: queries can contain the same trade per execution and
 * per order (or cash rows in detail and as summary), which would count it twice.
 */
const pickDetailLevel = (rows: Record<string, string>[], preferred: string[]): Record<string, string>[] => {
    for (const level of preferred) {
        const matching = rows.filter((row) => (row.levelOfDetail || '').toUpperCase() === level);
        if (matching.length > 0) return matching;
    }
    return rows.filter((row) => (row.levelOfDetail || '').toUpperCase() !== 'SUMMARY');
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

    const statement = elements(xml, 'FlexStatement')[0];
    const period = statement
        ? { from: toIsoDate(statement.fromDate) || '', to: toIsoDate(statement.toDate) || '', accountId: statement.accountId || '' }
        : null;

    const batch = emptyImportBatch('IBKR');
    const skipped = { fx: 0, unsupported: 0 };

    pickDetailLevel(elements(xml, 'Trade'), ['EXECUTION', 'ORDER']).forEach((row) => {
        const category = (row.assetCategory || '').toUpperCase();
        if (category === 'CASH') {
            skipped.fx += 1; // currency conversions move cash between currencies only
            return;
        }
        if (!POSITION_CATEGORIES.has(category)) {
            skipped.unsupported += 1;
            return;
        }
        const date = toIsoDate(row.tradeDate || row.dateTime);
        const quantity = toNumber(row.quantity);
        if (!date || !quantity) return;

        const id = row.transactionID || row.tradeID || `${row.dateTime}|${row.conid}|${row.quantity}|${row.tradePrice}`;
        const fee = toNumber(row.ibCommission);
        batch.entries.push(tradeEntry({
            source: 'IBKR',
            externalId: `ibkr:${row.accountId || ''}:trade:${id}`,
            orderId: row.ibOrderID || undefined,
            date,
            side: quantity < 0 || (row.buySell || '').toUpperCase().startsWith('SELL') ? 'sell' : 'buy',
            isin: row.isin || row.symbol,
            name: row.description || row.symbol,
            quantity,
            amount: toNumber(row.proceeds), // signed: negative for buys
            currency: row.currency,
            fee,
            feeCurrency: row.ibCommissionCurrency || row.currency,
            fxRate: toNumber(row.fxRateToBase) || undefined,
            raw: { source: 'ibkr-flex', conid: row.conid, symbol: row.symbol, pricePerShare: toNumber(row.tradePrice) || undefined }
        }));
    });

    pickDetailLevel(elements(xml, 'CashTransaction'), ['DETAIL']).forEach((row) => {
        const date = toIsoDate(row.settleDate || row.dateTime || row.reportDate);
        const amount = toNumber(row.amount);
        if (!date || !amount || !row.currency) return;
        const id = row.transactionID || `${date}|${row.type}|${row.amount}|${row.description}`;
        batch.entries.push(statementEntry({
            source: 'IBKR',
            externalId: `ibkr:${row.accountId || ''}:cash:${id}`,
            date,
            type: cashMovementType(row.type || '', amount),
            amount,
            currency: row.currency,
            description: row.description || row.type || '',
            isin: row.isin,
            name: row.symbol,
            raw: { source: 'ibkr-flex', type: row.type }
        }));
    });

    const positions = elements(xml, 'OpenPosition')
        .filter((row) => (row.levelOfDetail || 'SUMMARY').toUpperCase() !== 'LOT')
        .filter((row) => POSITION_CATEGORIES.has((row.assetCategory || '').toUpperCase()))
        .map((row) => ({ isin: row.isin || row.symbol, symbol: row.symbol, quantity: toNumber(row.position) }));

    return { batch, positions, period, skipped };
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
