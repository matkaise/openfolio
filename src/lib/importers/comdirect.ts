import type { CashMovementImportEntry } from '@/lib/csvParser';
import type { Transaction } from '@/types/domain';
import { emptyImportBatch, type ImportBatch } from './importBatch';

// comdirect REST API (brokerage v3, banking v1). Shapes follow the official
// "comdirect REST API - Schnittstellenspezifikation"; only the used fields are typed.

type AmountValue = { value?: string; unit?: string };
type EnumText = { key?: string; text?: string };
type ComdirectInstrument = { instrumentId?: string; wkn?: string; isin?: string; name?: string; shortName?: string };

export interface ComdirectData {
    depot: { depotId: string; depotDisplayId?: string; defaultSettlementAccountId?: string };
    positions: { positionId?: string; wkn?: string; quantity?: AmountValue; instrument?: ComdirectInstrument }[];
    depotTransactions: {
        transactionId?: string;
        bookingStatus?: string;
        bookingDate?: string | null;
        businessDate?: string;
        quantity?: AmountValue;
        instrument?: ComdirectInstrument | null;
        executionPrice?: AmountValue;
        transactionValue?: AmountValue;
        transactionDirection?: string;
        transactionType?: EnumText;
    }[];
    accountTransactions: {
        reference?: string;
        bookingStatus?: string;
        bookingDate?: string | null;
        amount?: AmountValue;
        transactionType?: EnumText;
        remittanceInfo?: string;
    }[];
}

export interface ComdirectParseResult {
    batch: ImportBatch;
    positions: { isin: string; symbol: string; quantity: number }[];
    skipped: { notBooked: number; transfers: number };
    warnings: string[];
}

const amount = (value?: AmountValue): number => {
    const parsed = Number(value?.value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const isoDate = (value?: string | null): string | null => (
    value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
);

// "remittanceInfo" lines are prefixed with line numbers ("01", "02", ...): drop them.
// Only strip two digits directly followed by a letter, so numbers in the text survive.
const cleanRemittance = (value?: string) => (value || '')
    .replace(/^\d{2}(?=\p{L})/u, '')
    .replace(/\s*(?<!\d)\d{2}(?=\p{L})/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ISIN_PATTERN = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/;

/**
 * Settlement account bookings. Security purchases and sales ("Wertpapier", "Sparplan")
 * are skipped: the trade comes from the depot transactions.
 */
const classifyAccountBooking = (category: string, text: string, value: number): CashMovementImportEntry['type'] | null => {
    const normalized = category.toLowerCase();
    if (normalized.includes('wertpapier') || normalized.includes('sparplan') || normalized.includes('securities') || normalized.includes('saving plan')) return null;
    if (normalized.includes('zinsen') || normalized.includes('dividend') || normalized.includes('interest')) {
        return /dividend|ertrag|aussch(ü|ue)ttung/i.test(text) ? 'Dividend' : 'Interest';
    }
    if (normalized.includes('gebühr') || normalized.includes('fee')) return 'Fee';
    if (normalized.includes('devisen') || normalized.includes('currency')) return 'Transfer';
    if (normalized.includes('storno') || normalized.includes('cancellation') || normalized.includes('sonstig') || normalized.includes('misc')) return 'Adjustment';
    // Transfers, direct debits, cash, cards: money entering or leaving the account
    return value >= 0 ? 'Deposit' : 'Withdrawal';
};

export const parseComdirectData = (data: ComdirectData): ComdirectParseResult => {
    const batch = emptyImportBatch('comdirect');
    const skipped = { notBooked: 0, transfers: 0 };
    const warnings: string[] = [];
    const depotId = data.depot.depotId;

    data.depotTransactions.forEach((row) => {
        if (row.bookingStatus !== 'BOOKED') {
            skipped.notBooked += 1;
            return;
        }
        const type = row.transactionType?.key;
        const name = row.instrument?.name || row.instrument?.isin || 'Unbekanntes Wertpapier';
        if (type === 'TRANSFER_IN' || type === 'TRANSFER_OUT') {
            // No purchase price in the API: the position must be added manually
            skipped.transfers += 1;
            warnings.push(`Depotübertrag ${type === 'TRANSFER_IN' ? 'eingehend' : 'ausgehend'}: ${amount(row.quantity)} × ${name} – bitte manuell mit Einstandskurs erfassen.`);
            return;
        }
        if (type !== 'BUY' && type !== 'SELL') return;

        const date = isoDate(row.businessDate) || isoDate(row.bookingDate);
        const shares = Math.abs(amount(row.quantity));
        const value = Math.abs(amount(row.transactionValue));
        if (!date || !shares) return;

        const transaction: Transaction = {
            id: `comdirect:${depotId}:${row.transactionId}`,
            date,
            type: type === 'SELL' ? 'Sell' : 'Buy',
            isin: row.instrument?.isin || row.instrument?.wkn || '',
            name,
            shares,
            amount: type === 'SELL' ? value : -value,
            currency: row.transactionValue?.unit || 'EUR',
            externalId: `comdirect:${depotId}:${row.transactionId}`,
            broker: 'comdirect',
            originalData: { source: 'comdirect', wkn: row.instrument?.wkn, pricePerShare: amount(row.executionPrice) || undefined }
        };
        batch.transactions.push(transaction);
    });

    data.accountTransactions.forEach((row) => {
        if (row.bookingStatus !== 'BOOKED') {
            skipped.notBooked += 1;
            return;
        }
        const date = isoDate(row.bookingDate);
        const value = amount(row.amount);
        const currency = row.amount?.unit;
        if (!date || !value || !currency) return;
        const text = cleanRemittance(row.remittanceInfo);
        const type = classifyAccountBooking(row.transactionType?.text || row.transactionType?.key || '', text, value);
        if (!type) return;
        const isin = type === 'Dividend' ? ISIN_PATTERN.exec(text)?.[0] : undefined;
        batch.cashMovements.push({
            date,
            type,
            amount: value,
            currency,
            description: text || row.transactionType?.text || type,
            ...(isin ? { isin } : {}),
            ...(type === 'Transfer' ? { isInternal: true } : {}),
            sourceKey: `comdirect:${data.depot.defaultSettlementAccountId || ''}:${row.reference || `${date}|${value}|${text}`}`,
            originalData: { source: 'comdirect', category: row.transactionType?.text }
        });
    });

    const positions = data.positions
        .map((position) => ({
            isin: position.instrument?.isin || position.instrument?.wkn || position.wkn || '',
            symbol: position.instrument?.shortName || position.wkn || '',
            quantity: amount(position.quantity)
        }))
        .filter((position) => position.isin);

    return { batch, positions, skipped, warnings };
};
