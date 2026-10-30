import { statementEntry, tradeEntry, type ImportEntry, type StatementType } from '@/lib/importers/entries';

export type CashBalanceImportPoint = {
    date: string; // YYYY-MM-DD
    currency: string;
    balance: number;
    accountKey?: string;
    accountLabel?: string;
};

export type DecimalSeparator = '.' | ',';

/**
 * Detects the decimal separator of a whole file from its numeric cells.
 * Guessing per cell breaks on values like "17,5559" (German, 4 decimals), which looks
 * like a thousands separator. Only unambiguous cells vote; "1,000" or "1.000" do not.
 */
export const detectDecimalSeparator = (cells: string[]): DecimalSeparator => {
    let commaVotes = 0;
    let dotVotes = 0;
    for (const cell of cells) {
        const value = (cell || '').trim().replace(/[’'\s]/g, '');
        if (!/^[-+]?[\d.,]*\d$/.test(value)) continue;
        const lastComma = value.lastIndexOf(',');
        const lastDot = value.lastIndexOf('.');
        if (lastComma >= 0 && lastDot >= 0) {
            if (lastComma > lastDot) commaVotes += 1; else dotVotes += 1;
        } else if (lastComma >= 0 || lastDot >= 0) {
            const separator = lastComma >= 0 ? ',' : '.';
            const groups = value.split(separator);
            const votesForSeparatorAsDecimal = groups.length === 2 && groups[1].length !== 3; // "17,5559", "1.5"
            const votesForSeparatorAsThousands = groups.length > 2; // "1.234.567"
            if (votesForSeparatorAsDecimal) {
                if (separator === ',') commaVotes += 1; else dotVotes += 1;
            } else if (votesForSeparatorAsThousands) {
                if (separator === ',') dotVotes += 1; else commaVotes += 1;
            }
        }
    }
    return commaVotes > dotVotes ? ',' : '.';
};

/** Parses a number using a known decimal separator; the other separator and apostrophes are thousands marks. */
export const parseNumberWithSeparator = (val: string, decimal: DecimalSeparator): number => {
    const raw = (val || '').trim();
    if (!raw) return 0;
    const thousands = decimal === ',' ? '.' : ',';
    const normalized = raw
        .replace(/[’'\s]/g, '')
        .split(thousands).join('')
        .replace(decimal, '.')
        .replace(/[^\d.+-]/g, '');
    return parseFloat(normalized);
};

const collectCells = (rows: string[][], columns: number[]): string[] => (
    rows.slice(1).flatMap((row) => columns.map((index) => row[index] || ''))
);

const parseDate = (dateStr: string): string => {
    // Input: "21-01-2026" (DD-MM-YYYY)
    // Output: "2026-01-21" (ISO)
    if (!dateStr) return new Date().toISOString();
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return new Date().toISOString();
};

/**
 * Stable key of a DEGIRO trade row: order id plus execution time, quantity and price,
 * because one order can be filled in several rows. Raw strings keep it independent of
 * number parsing, so rows imported by older versions (originalData) map to the same key.
 */
export const buildDegiroTradeKey = (row: string[]): string => {
    const orderId = (row[17] || row[16] || '').trim() || 'no-order';
    const part = (index: number) => (row[index] || '').trim();
    return `degiro:${orderId}:${part(0)} ${part(1)}:${part(3)}:${part(6)}@${part(7)}`;
};

/** DEGIRO "Transactions.csv": one entry per fill. Other files give an empty list. */
export const parseDegiroTradesCsv = (text: string): ImportEntry[] => {
    const rows = parseCsvRows(text);
    const entries: ImportEntry[] = [];
    if (!rows.length) return entries;

    // Columns: 0 Datum, 1 Uhrzeit, 2 Produkt, 3 ISIN, 4 Referenzbörse, 5 Ausführungsort, 6 Anzahl,
    // 7 Kurs, 8 Kurswährung, 9 Wert in Lokalwährung, 10 Lokalwährung, 11 Wert <Konto>, 12 Wechselkurs,
    // 13 AutoFX-Gebühr, 14 Transaktionsgebühren, 15 Gesamt <Konto>, 16/17 Order-ID.
    // Fees (13, 14) are in the account currency named in the "Gesamt XXX" header.
    // "Gesamt" = "Wert" + transaction fees; the AutoFX fee is reported on top.
    const header = rows[0].join(',');
    if (!(header.includes('Referenzbörse') && header.includes('Anzahl'))) return entries;

    const decimal = detectDecimalSeparator(collectCells(rows, [6, 7, 9, 11, 12, 13, 14, 15]));
    const num = (value: string) => parseNumberWithSeparator(value, decimal);
    const accountCurrency = /Gesamt\s+([A-Z]{3})/.exec(header)?.[1]
        || /Wert\s+([A-Z]{3})/.exec(header)?.[1];
    const seenKeys = new Map<string, number>();

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 10) continue;

        const quantity = num(row[6]);
        const fxRate = num(row[12]);

        // Order IDs repeat for partial fills, and identical fills can repeat inside one file.
        const baseKey = buildDegiroTradeKey(row);
        const occurrence = (seenKeys.get(baseKey) || 0) + 1;
        seenKeys.set(baseKey, occurrence);

        entries.push(tradeEntry({
            source: 'Flatex',
            externalId: occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey,
            orderId: (row[17] || row[16] || '').trim() || undefined,
            date: parseDate(row[0]),
            side: quantity < 0 ? 'sell' : 'buy',
            isin: row[3],
            name: row[2],
            quantity,
            amount: num(row[9]), // sign from the CSV: negative for buys, positive for sells
            currency: row[8],
            fee: num(row[14]),
            fxFee: num(row[13]),
            feeCurrency: accountCurrency,
            fxRate: Number.isFinite(fxRate) ? fxRate : undefined,
            raw: row
        }));
    }
    // Account.csv rows (dividends, taxes, interest, deposits, ...) come from parseDegiroAccountCsv.
    return entries;
};

export const parseFlatexCashBalancesCsv = (text: string): CashBalanceImportPoint[] => {
    const rows = parseCsvRows(text);
    if (rows.length === 0) return [];

    const header = rows[0].join(',');
    if (!(header.includes('Valutadatum') && header.includes('Beschreibung'))) {
        return [];
    }
    const decimal = detectDecimalSeparator(collectCells(rows, [6, 8, 10]));

    const parseDateOnly = (value: string): string | null => {
        const raw = (value || '').trim();
        if (!raw) return null;

        const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
        if (dmy) {
            return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
        }

        const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (ymd) {
            return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
        }

        return null;
    };

    const parseTimeMinutes = (value: string): number => {
        const raw = (value || '').trim();
        const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
        if (!match) return 0;
        const hh = Number(match[1]);
        const mm = Number(match[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
        return (Math.max(0, Math.min(23, hh)) * 60) + Math.max(0, Math.min(59, mm));
    };

    const normalizeCurrency = (value: string): string => {
        const currency = (value || '').trim().toUpperCase();
        return /^[A-Z]{3}$/.test(currency) ? currency : '';
    };

    const dayEndPoints: Record<string, { balance: number; timeMinutes: number; seq: number }> = {};
    let firstTimestamp: number | null = null;
    let lastTimestamp: number | null = null;

    const buildTimestamp = (row: string[]): number | null => {
        const bookingDate = parseDateOnly(row[0]);
        const valueDate = parseDateOnly(row[2]);
        const date = bookingDate || valueDate;
        if (!date) return null;
        const timeMinutes = parseTimeMinutes(row[1]);
        return Date.parse(`${date}T00:00:00Z`) + (timeMinutes * 60 * 1000);
    };

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const timestamp = buildTimestamp(row);
        if (timestamp !== null) {
            if (firstTimestamp === null) firstTimestamp = timestamp;
            lastTimestamp = timestamp;
        }
    }

    const isReverseChronological = firstTimestamp !== null && lastTimestamp !== null
        ? firstTimestamp >= lastTimestamp
        : true;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 11) continue;

        const bookingDate = parseDateOnly(row[0]);
        const valueDate = parseDateOnly(row[2]);
        const date = valueDate || bookingDate;
        if (!date) continue;

        const currency = normalizeCurrency(row[9] || row[7]);
        if (!currency) continue;

        const balance = parseNumberWithSeparator(row[10] || row[8], decimal);
        if (!Number.isFinite(balance)) continue;

        const timeMinutes = parseTimeMinutes(row[1]);
        const key = `${currency}|${date}`;
        const existing = dayEndPoints[key];
        const shouldReplace = !existing
            || timeMinutes > existing.timeMinutes
            || (
                timeMinutes === existing.timeMinutes
                && (
                    isReverseChronological
                        ? i < existing.seq
                        : i > existing.seq
                )
            );

        if (shouldReplace) {
            dayEndPoints[key] = {
                balance,
                timeMinutes,
                seq: i
            };
        }
    }
    return Object.entries(dayEndPoints)
        .map(([key, point]) => {
            const [currency, date] = key.split('|');
            return {
                date,
                currency,
                balance: point.balance
            };
        })
        .sort((a, b) => {
            if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
            return a.date.localeCompare(b.date);
        });
};

const parseAccountDate = (value: string): string | null => {
    const raw = (value || '').trim();
    if (!raw) return null;

    const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

    return null;
};

const normalizeAccountCurrency = (value: string): string => {
    const currency = (value || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : '';
};

const foldText = (value: string): string => {
    return (value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ã¤|ä/g, 'a')
        .replace(/ã¶|ö/g, 'o')
        .replace(/ã¼|ü/g, 'u')
        .replace(/ãŸ|ß/g, 'ss')
        .replace(/â€™|’/g, "'");
};

/**
 * Classifies a DEGIRO Account.csv description. Order matters: "Dividendensteuer" must be
 * checked before "Dividende", and "Zinsen" (often negative debit interest) is interest.
 * Returns null for trade rows, which come from Transactions.csv. That includes the legs of
 * corporate actions ("Aktiensplit: Verkauf 10 zu je 5 USD", "Fusion: Kauf ..."): Transactions.csv
 * lists them too, without an order id.
 */
export const classifyDegiroAccountDescription = (
    description: string
): { type: StatementType; isInternal?: boolean } | null => {
    const normalized = foldText(description.trim());
    if (!normalized) return null;

    if (normalized.startsWith('kauf ') || normalized.startsWith('verkauf ')) {
        return null;
    }
    if (normalized.includes('wahrungswechsel')) {
        return { type: 'Transfer', isInternal: true };
    }
    if (
        normalized.includes('cash sweep transfer')
        || normalized.includes('uberweisung auf ihr geldkonto')
        || normalized.includes('geldmarktfonds')
        || normalized.includes('reservation ideal')
    ) {
        return { type: 'Transfer', isInternal: true };
    }
    if (/\b(kauf|verkauf)\b.*\bzu je\b/.test(normalized)) {
        return null;
    }
    if (normalized.includes('einzahlung')) {
        return { type: 'Deposit' };
    }
    if (normalized.includes('auszahlung von ihrem geldkonto')) {
        return { type: 'Withdrawal' };
    }
    if (normalized.includes('dividendensteuer') || normalized.includes('steuer')) {
        return { type: 'Tax' };
    }
    if (
        normalized.includes('transaktionsgebuhren')
        || normalized.includes('weitergabegebuhr')
        || normalized.includes('zahlungsgebuhr')
        || normalized.includes('handelsmodalitaten')
        || normalized.startsWith('gebuhr')
    ) {
        return { type: 'Fee' };
    }
    if (normalized.includes('zinsen') || normalized.includes('interest')) {
        return { type: 'Interest' };
    }
    if (normalized.includes('dividende') || normalized.includes('kapitalruckzahlung')) {
        return { type: 'Dividend' };
    }

    return { type: 'Adjustment' };
};

type ParsedAccountRow = {
    date: string;
    time: string;
    description: string;
    isin?: string;
    name?: string;
    amount: number;
    currency: string;
};

const parseAccountRowWith = (row: string[], num: (value: string) => number): ParsedAccountRow | null => {
    if (row.length < 11) return null;

    const description = (row[5] || '').trim();
    const bookingDate = parseAccountDate(row[0]);
    const valueDate = parseAccountDate(row[2]);
    const date = valueDate || bookingDate;
    if (!date) return null;

    const currency = normalizeAccountCurrency(row[7]) || normalizeAccountCurrency(row[9]);
    const shiftedCurrency = normalizeAccountCurrency(row[8]);
    const normalizedCurrency = currency || shiftedCurrency;
    if (!normalizedCurrency) return null;

    let amount = num(row[8]);
    if (!Number.isFinite(amount) || (row[8] || '').trim() === '') {
        // Transfers leave the amount column empty and name it in the text. A price ("Geldmarktfonds
        // Umwandlung: Kauf 0.1 zu je 100 EUR") is no amount: such rows do not change the balance.
        const matches = /\bzu je\b/i.test(description) ? null : description.match(/[-+]?\d[\d'’.,]*/g);
        const fromDescription = matches ? num(matches[matches.length - 1]) : NaN;
        if (Number.isFinite(fromDescription)) {
            amount = fromDescription;
        } else if (shiftedCurrency) {
            amount = num(row[9]);
        }
    }
    if (!Number.isFinite(amount)) return null;

    const isin = (row[4] || '').trim();
    const name = (row[3] || '').trim();
    return {
        date,
        time: row[1] || '',
        description,
        ...(isin ? { isin } : {}),
        ...(name ? { name } : {}),
        amount,
        currency: normalizedCurrency
    };
};

/** DEGIRO "Account.csv": one entry per statement row except trades. Other files give an empty list. */
export const parseDegiroAccountCsv = (text: string): ImportEntry[] => {
    const rows = parseCsvRows(text);
    if (!rows.length) return [];

    const header = rows[0].join(',');
    if (!(header.includes('Valutadatum') && header.includes('Beschreibung'))) return [];
    const decimal = detectDecimalSeparator(collectCells(rows, [6, 8, 10]));
    const num = (value: string) => parseNumberWithSeparator(value, decimal);

    // A cash sweep moves money between DEGIRO and the flatexDEGIRO bank account as a pair of
    // rows: "Degiro Cash Sweep Transfer" with the amount and a text row naming it. The text row
    // "Auszahlung von Ihrem Geldkonto" of such a pair is no withdrawal, the money stays in the account.
    const sweepKey = (row: ParsedAccountRow) => [row.date, row.time, row.currency, Math.abs(row.amount).toFixed(2)].join('|');
    const sweeps = new Set(rows.slice(1)
        .map((row) => parseAccountRowWith(row, num))
        .filter((row): row is ParsedAccountRow => row !== null && foldText(row.description).includes('cash sweep transfer'))
        .map(sweepKey));

    const entries: ImportEntry[] = [];
    const seenKeys = new Map<string, number>();
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const parsed = parseAccountRowWith(row, num);
        if (!parsed) continue;

        const found = classifyDegiroAccountDescription(parsed.description);
        if (!found) continue;
        const classification = found.type === 'Withdrawal' && sweeps.has(sweepKey(parsed))
            ? { type: 'Transfer' as const, isInternal: true }
            : found;

        let amount = parsed.amount;
        if (Math.abs(amount) < 0.0000001) continue;

        // Rows without an amount column carry an unsigned amount in the text
        if (found.type === 'Withdrawal' && amount > 0) amount = -amount;
        if (found.type === 'Deposit' && amount < 0) amount = -amount;

        // Partial fills of one order can produce identical rows; they stay separate bookings
        const orderId = (row[11] || '').trim();
        const baseKey = [parsed.date, parsed.time, parsed.currency, amount.toFixed(8), parsed.description, orderId].join('|');
        const occurrence = (seenKeys.get(baseKey) || 0) + 1;
        seenKeys.set(baseKey, occurrence);
        entries.push(statementEntry({
            source: 'Flatex',
            externalId: occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey,
            orderId: orderId || undefined,
            date: parsed.date,
            type: classification.type,
            amount,
            currency: parsed.currency,
            description: parsed.description,
            isin: parsed.isin,
            name: parsed.name,
            internal: classification.isInternal,
            raw: row
        }));
    }

    return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.externalId || '').localeCompare(b.externalId || ''));
};

// Simple CSV Splitter that handles quoted fields
// e.g. "Mes, XETB",123
const parseCsvLine = (line: string, delimiter = ','): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result.map((cell) => cell.trim());
};

const parseCsvRows = (text: string, delimiter = ','): string[][] => {
    const rawLines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const parsedRows = rawLines.map((line) => parseCsvLine(line, delimiter));
    return mergeSparseContinuationRows(parsedRows);
};

const mergeSparseContinuationRows = (rows: string[][]): string[][] => {
    if (rows.length <= 2) return rows;

    const width = rows[0].length;
    const normalizeRow = (row: string[]) => {
        const normalized = row.slice(0, width);
        while (normalized.length < width) normalized.push('');
        return normalized;
    };

    const shouldMerge = (row: string[]) => {
        if ((row[0] || '').trim() !== '') return false;
        const nonEmptyCells = row.reduce((count, cell) => count + ((cell || '').trim().length > 0 ? 1 : 0), 0);
        return nonEmptyCells > 0 && nonEmptyCells <= 2;
    };

    const merged = [normalizeRow(rows[0])];

    for (let i = 1; i < rows.length; i += 1) {
        const row = normalizeRow(rows[i]);
        const previous = merged[merged.length - 1];

        if (!shouldMerge(row) || !previous || (previous[0] || '').trim() === '') {
            merged.push(row);
            continue;
        }

        for (let idx = 0; idx < width; idx += 1) {
            const value = (row[idx] || '').trim();
            if (!value) continue;
            const existing = previous[idx] || '';
            if (!existing) {
                previous[idx] = value;
            } else if (existing.endsWith('-') || value.startsWith('-')) {
                previous[idx] = `${existing}${value}`;
            } else {
                previous[idx] = `${existing} ${value}`.trim();
            }
        }
    }

    return merged;
};
