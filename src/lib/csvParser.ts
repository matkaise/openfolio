import { Transaction } from '../types/domain';

export type CashBalanceImportPoint = {
    date: string; // YYYY-MM-DD
    currency: string;
    balance: number;
    accountKey?: string;
    accountLabel?: string;
};

// Helper to parse Floats (handles "1.234,56" vs "1234.56")
// The sample provided shows DOT as decimal separator e.g. "-1.43", "1.0770".
// But German CSVs often use Comma. We will try to detect or strictly follow the sample.
// Sample: "21-01-2026,06:31,...-1.43" -> Dot decimal.
const parseNumber = (val: string): number => {
    if (!val) return 0;
    // Remove currency symbols if attached (though sample splits them)
    const clean = val.replace(/[^\d.-]/g, '');
    return parseFloat(clean);
};

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

export const parseFlatexCsv = (text: string): Transaction[] => {
    const rows = parseCsvRows(text);
    const transactions: Transaction[] = [];
    if (!rows.length) return transactions;

    // Header detection
    const header = rows[0].join(',');

    // Strategy 1: "Transactions.csv" (Trades)
    // Header: Datum,Uhrzeit,Produkt,ISIN,Referenzbörse,Ausführungsort,Anzahl,Kurs,,Wert in Lokalwährung...
    if (header.includes('Referenzbörse') && header.includes('Anzahl')) {
        console.log("Detected Flatex Transactions CSV");
        // Skip header
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < 10) continue;

            // Map columns (Indices based on sample)
            // 0: Datum, 1: Uhrzeit, 2: Produkt, 3: ISIN, 4: Ref, 5: Ausf, 6: Anzahl, 7: Kurs, 8: empty?, 9: WertLocal
            const date = parseDate(row[0]);
            const isin = row[3];
            const name = row[2];
            const quantity = parseNumber(row[6]); // Negative for Sell? Sample: -1359 for Sell (Val positive).
            const price = parseNumber(row[7]);
            const currency = row[8] || 'EUR'; // Col 8 is currency name?
            // Sample: 6: 122, 7: 17.5559, 8: EUR

            // Logic:
            // Quantity > 0 => Buy (Cost negative)
            // Quantity < 0 => Sell (Revenue positive)

            let type: Transaction['type'] = 'Buy';
            if (quantity < 0) {
                type = 'Sell';
            }

            // Amount: "Wert in Lokalwährung" (Col 9?)
            // Sample line 2: 
            // 0: 01-12-2025, 1: 13:43, 2: WISDOM..., 3: GB..., 4: TDG, 5: XGAT, 6: 122, 7: 17.5559, 8: EUR, 9: -2141.82
            const amount = parseNumber(row[9]);

            transactions.push({
                id: crypto.randomUUID(),
                date,
                type,
                isin,
                name,
                shares: Math.abs(quantity),
                amount: amount, // Keep sign from CSV (Negative for Buy, Positive for Sell)
                currency: row[8],
                broker: 'Flatex',
                originalData: row
            });
        }
    }
    // Strategy 2: "Account.csv" (Dividends, Cash)
    // Header: Datum,Uhrze,Valutadatum,Produkt,ISIN,Beschreibung...
    else if (header.includes('Valutadatum') && header.includes('Beschreibung')) {
        console.log("Detected Flatex Account CSV");
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < 6) continue;

            const description = row[5];
            const isin = row[4];

            // Interest
            if (description.includes('Zinsen') || description.includes('Interest')) {
                // Not strictly a transaction for portfolio perf unless we track Cash? 
                // Let's skip for now or add as 'Fee'/'Dividend'?
                // User goal is dividends mostly.
                // Line 5: Zinsen, Line 6: Flatex Interest Income
                // We'll treat Interest as a specialized Dividend? Or just ignore?
                // Use 'Dividend' type for now but name it Interest.
                const amount = parseNumber(row[7] || row[9]); // Col 7 or 9? 
                // Sample line 5: 6: CHF, 7: -287.33 (Amount), 8: CHF (SaldoCcy), 9: Saldo
                // Wait, Sample line 3: "Währungswechsel...", 6: 1.0770 (FX?), 7: EUR (Ccy?), 8: 1.54 (Amount?)

                // Let's look closely at Account.csv Line 10 (Dividend):
                // 30-12-2025,07:38,24-12-2025,ISHARES...,IE00BSKRJZ44,Dividende,,USD,2962.49,USD,2962.49,
                // Col 0: Datum
                // Col 3: Product
                // Col 4: ISIN
                // Col 5: Desc ("Dividende")
                // Col 6: FX (empty)
                // Col 7: Currency (USD)
                // Col 8: Amount (2962.49)

                const type: Transaction['type'] = 'Dividend';
                const date = parseDate(row[0]);

                transactions.push({
                    id: crypto.randomUUID(),
                    date,
                    type,
                    isin,
                    name: row[3] || 'Zinsen',
                    amount: parseNumber(row[8]),
                    currency: row[7],
                    broker: 'Flatex',
                    originalData: row
                });
            }

            // Dividend
            else if (description.includes('Dividende')) {
                const type: Transaction['type'] = 'Dividend';
                const date = parseDate(row[0]);
                const amount = parseNumber(row[8]);
                const currency = row[7];
                const isin = row[4];
                const name = row[3];

                transactions.push({
                    id: crypto.randomUUID(),
                    date,
                    type,
                    isin,
                    name,
                    amount,
                    currency,
                    broker: 'Flatex',
                    originalData: row
                });
            }
        }
    }

    return transactions;
};

export const parseFlatexCashBalancesCsv = (text: string): CashBalanceImportPoint[] => {
    const rows = parseCsvRows(text);
    if (rows.length === 0) return [];

    const header = rows[0].join(',');
    if (!(header.includes('Valutadatum') && header.includes('Beschreibung'))) {
        return [];
    }

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

        const balance = parseNumber(row[10] || row[8]);
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
    return result.map(c => c.trim().replace(/^"|"$/g, ''));
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
