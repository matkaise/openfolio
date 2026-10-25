import type { Transaction } from '@/types/domain';

// German display names for types stored in English.

const QUOTE_TYPE_LABELS: Record<string, string> = { Stock: 'Aktie', ETF: 'ETF', Fund: 'Fonds', Crypto: 'Krypto', Bond: 'Anleihe' };

export const quoteTypeLabel = (type: string | undefined): string => (type && QUOTE_TYPE_LABELS[type]) || 'Wertpapier';

const TRANSACTION_TYPE_LABELS: Record<Transaction['type'], string> = {
    Buy: 'Kauf',
    Sparplan_Buy: 'Sparplan',
    Sell: 'Verkauf',
    Dividend: 'Dividende',
    Tax: 'Steuer',
    Fee: 'Gebühr',
    Interest: 'Zinsen',
    Deposit: 'Einzahlung',
    Withdrawal: 'Auszahlung',
    Split: 'Split'
};

export const transactionTypeLabel = (type: string): string => TRANSACTION_TYPE_LABELS[type as Transaction['type']] || type;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    Deposit: 'Einzahlung',
    Withdrawal: 'Auszahlung',
    Dividend: 'Dividende',
    Tax: 'Steuer',
    Fee: 'Gebühr',
    Interest: 'Zinsen',
    Transfer: 'Umbuchung',
    Adjustment: 'Korrektur'
};

export const movementTypeLabel = (type: string): string => MOVEMENT_TYPE_LABELS[type] || type;
