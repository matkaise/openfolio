import type { Messages } from '@/lib/i18n';

// Display names for types stored in English, in the interface language (pass useT()).

export const quoteTypeLabel = (t: Messages, type: string | undefined): string => (type && t.labels.quoteTypes[type]) || t.labels.security;

export const transactionTypeLabel = (t: Messages, type: string): string => (
    (t.labels.transactionTypes as Record<string, string>)[type] || type
);

export const movementTypeLabel = (t: Messages, type: string): string => t.labels.movementTypes[type] || type;
