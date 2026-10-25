import { statementEntry, tradeEntry, type StatementType } from './entries';
import { emptyImportBatch, type ImportBatch } from './importBatch';

// Trading 212 Public API (Invest / Stocks ISA). Shapes follow the API's schemas
// (HistoricalOrder, HistoryDividendItem, HistoryTransactionItem, Position); only the
// fields Openfolio uses are typed.

type T212Instrument = { ticker?: string; isin?: string; name?: string; currency?: string };

export interface Trading212Data {
    orders: {
        order?: { id?: number; side?: 'BUY' | 'SELL'; status?: string; ticker?: string; currency?: string; instrument?: T212Instrument };
        fill?: {
            id?: number;
            type?: string;
            filledAt?: string;
            price?: number;
            quantity?: number;
            walletImpact?: { currency?: string; taxes?: { name?: string; quantity?: number; currency?: string }[] };
        };
    }[];
    dividends: {
        reference?: string;
        ticker?: string;
        type?: string;
        paidOn?: string;
        amount?: number;
        currency?: string;
        instrument?: T212Instrument;
    }[];
    transactions: { reference?: string; type?: string; amount?: number; currency?: string; dateTime?: string }[];
    positions: { instrument?: T212Instrument; ticker?: string; quantity?: number }[];
}

export interface Trading212ParseResult {
    batch: ImportBatch;
    positions: { isin: string; symbol: string; quantity: number }[];
    skipped: { unfilled: number; corporateActions: number };
}

const toDate = (value?: string): string | null => {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value || '');
    return match ? match[1] : null;
};

const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Position key: the ISIN, or the T212 ticker for instruments without one. */
const instrumentKey = (instrument?: T212Instrument, ticker?: string) => instrument?.isin || instrument?.ticker || ticker || '';

const cashType = (type: string, amount: number): StatementType => {
    switch (type) {
        case 'DEPOSIT': return 'Deposit';
        case 'WITHDRAW': return 'Withdrawal';
        case 'FEE': return 'Fee';
        case 'INTEREST_ON_FREE_CASH':
        case 'LENDING_INTEREST': return 'Interest';
        // Transfers move money to or from another Trading 212 account: external to this portfolio
        case 'TRANSFER': return amount >= 0 ? 'Deposit' : 'Withdrawal';
        default: return 'Adjustment';
    }
};

// The API reports some amounts unsigned; the type decides the direction.
const OUTFLOW_TYPES = new Set(['WITHDRAW', 'FEE']);

export const parseTrading212Data = (data: Trading212Data): Trading212ParseResult => {
    const batch = emptyImportBatch('Trading212');
    const skipped = { unfilled: 0, corporateActions: 0 };

    data.orders.forEach(({ order, fill }) => {
        if (!fill || !order) {
            skipped.unfilled += 1;
            return;
        }
        if (fill.type && fill.type !== 'TRADE') {
            // Splits, spin-offs etc.: splits come from the market data, the rest is not modelled yet
            skipped.corporateActions += 1;
            return;
        }
        const date = toDate(fill.filledAt);
        const quantity = Math.abs(finite(fill.quantity));
        const price = finite(fill.price);
        if (!date || !quantity) return;

        const isSell = order.side === 'SELL' || finite(fill.quantity) < 0;
        const value = quantity * price; // in instrument currency
        // Taxes are costs (stamp duty, FX fee, ...); some are reported unsigned
        const fees = (fill.walletImpact?.taxes || []).reduce((sum, tax) => sum - Math.abs(finite(tax.quantity)), 0);
        const feeCurrency = fill.walletImpact?.taxes?.find((tax) => tax.currency)?.currency || fill.walletImpact?.currency;
        const instrument = order.instrument;

        batch.entries.push(tradeEntry({
            source: 'Trading212',
            externalId: `t212:fill:${fill.id ?? `${order.id}-${date}`}`,
            orderId: order.id !== undefined ? String(order.id) : undefined,
            date,
            side: isSell ? 'sell' : 'buy',
            isin: instrumentKey(instrument, order.ticker),
            name: instrument?.name || order.ticker,
            quantity,
            amount: Math.round((isSell ? value : -value) * 1e8) / 1e8,
            currency: instrument?.currency || order.currency || 'EUR',
            fee: fees ? Math.round(fees * 1e8) / 1e8 : undefined,
            feeCurrency,
            raw: { source: 'trading212', ticker: order.ticker, pricePerShare: price || undefined }
        }));
    });

    data.dividends.forEach((dividend) => {
        const date = toDate(dividend.paidOn);
        const amount = finite(dividend.amount);
        if (!date || !amount || !dividend.currency) return;
        const isin = instrumentKey(dividend.instrument, dividend.ticker);
        batch.entries.push(statementEntry({
            source: 'Trading212',
            externalId: `t212:dividend:${dividend.reference || `${date}|${dividend.ticker}|${amount}`}`,
            date,
            type: 'Dividend',
            amount, // net, in the account currency
            currency: dividend.currency,
            description: `${dividend.instrument?.name || dividend.ticker || 'Dividende'} (${dividend.type || 'Dividende'})`,
            isin,
            name: dividend.instrument?.name,
            raw: { source: 'trading212', type: dividend.type }
        }));
    });

    data.transactions.forEach((transaction) => {
        const date = toDate(transaction.dateTime);
        const raw = finite(transaction.amount);
        const type = transaction.type || '';
        if (!date || !raw || !transaction.currency) return;
        const amount = OUTFLOW_TYPES.has(type) ? -Math.abs(raw) : type === 'DEPOSIT' ? Math.abs(raw) : raw;
        batch.entries.push(statementEntry({
            source: 'Trading212',
            externalId: `t212:transaction:${transaction.reference || `${date}|${type}|${raw}`}`,
            date,
            type: cashType(type, amount),
            amount,
            currency: transaction.currency,
            description: type,
            raw: { source: 'trading212', type }
        }));
    });

    const positions = data.positions
        .map((position) => ({
            isin: instrumentKey(position.instrument, position.ticker),
            symbol: position.instrument?.ticker || position.ticker || '',
            quantity: finite(position.quantity)
        }))
        .filter((position) => position.isin);

    return { batch, positions, skipped };
};
