import { z } from 'zod';
import { getT } from '@/lib/i18n';

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

/** Short description of the first problems, e.g. "transactions.1.amount: Zahl erwartet". */
export const describeIssues = (error: z.ZodError, limit = 3): string => {
    const t = getT().services.schema;
    const lines = error.issues.slice(0, limit).map((issue) => {
        const path = issue.path.join('.') || t.root;
        if (issue.code === 'invalid_type') {
            const expected = t.types[issue.expected] ?? issue.expected;
            return issue.received === 'undefined' ? t.missing(path, expected) : t.expected(path, expected);
        }
        if (issue.code === 'invalid_enum_value') return t.unknownValue(path);
        return t.invalid(path);
    });
    const more = error.issues.length > limit ? t.more(error.issues.length - limit) : '';
    return lines.join('; ') + more;
};
