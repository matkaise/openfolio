import { z } from 'zod';

/** JSON turns NaN into null; treat null like a missing optional value. */
export const optionalNumber = z.preprocess((value) => (value === null ? undefined : value), z.number().finite().optional());
export const optionalString = z.preprocess((value) => (value === null ? undefined : value), z.string().optional());

/**
 * { 'YYYY-MM-DD': number } maps (prices, splits, FX rates) can hold many thousands of points,
 * so they are cleaned in one loop instead of a schema per entry. Invalid points are dropped:
 * one bad price must not make a whole project unreadable.
 */
export const numberRecord = z
    .record(z.unknown())
    .transform((value) => {
        const clean: Record<string, number> = {};
        for (const key in value) {
            const point = value[key];
            if (typeof point === 'number' && Number.isFinite(point)) clean[key] = point;
        }
        return clean;
    });

const TYPE_NAMES: Record<string, string> = {
    string: 'Text',
    number: 'Zahl',
    boolean: 'Ja/Nein',
    object: 'Objekt',
    array: 'Liste'
};

/** Short German description of the first problems, e.g. "transactions.1.amount: Zahl erwartet". */
export const describeIssues = (error: z.ZodError, limit = 3): string => {
    const lines = error.issues.slice(0, limit).map((issue) => {
        const path = issue.path.join('.') || '(Wurzel)';
        if (issue.code === 'invalid_type') {
            const expected = TYPE_NAMES[issue.expected] ?? issue.expected;
            return issue.received === 'undefined' ? `${path}: fehlt (${expected} erwartet)` : `${path}: ${expected} erwartet`;
        }
        if (issue.code === 'invalid_enum_value') return `${path}: unbekannter Wert`;
        return `${path}: ungültig`;
    });
    const more = error.issues.length > limit ? ` (+${error.issues.length - limit} weitere)` : '';
    return lines.join('; ') + more;
};
