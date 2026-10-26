import type { CashBalanceImportPoint } from '@/lib/csvParser';
import { statementEntry, tradeEntry, type ImportEntry, type StatementType } from './entries';
import { getT } from '@/lib/i18n';

// Generic CSV import (any broker or bank): split the file, guess the column mapping and
// build transactions or cash balances/movements from a mapping the user confirmed.
// Pure functions; the import dialog only holds the state.

export type CsvImportMode = 'security' | 'cash';
export type CsvDateFormat = 'auto' | 'ymd' | 'dmy' | 'mdy';

export type CsvMapping = {
    date?: string;
    identifier?: string;
    shares?: string;
    price?: string;
    currency?: string;
    amount?: string;
    balance?: string;
    description?: string;
    type?: string;
};

export interface GenericCsvInput {
    headers: string[];
    rows: string[][];
    mapping: CsvMapping;
    dateFormat: CsvDateFormat;
    defaultCurrency: string;
}

const detectDelimiter = (line: string) => {
    const candidates = [',', ';', '\t'];
    let best = ',';
    let bestCount = 0;
    candidates.forEach((delim) => {
        const count = line.split(delim).length - 1;
        if (count > bestCount) {
            bestCount = count;
            best = delim;
        }
    });
    return best;
};

const parseCsvLineWithDelimiter = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
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
    // Enclosing quotes are already consumed above; escaped quotes inside a cell stay
    return result.map((c) => c.trim());
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

const normalizeHeaderName = (value: string) => {
    return value
        .toLowerCase()
        .replace(/\u00c3\u00a4/g, 'a')
        .replace(/\u00c3\u00b6/g, 'o')
        .replace(/\u00c3\u00bc/g, 'u')
        .replace(/\u00c3\u009f/g, 'ss')
        .replace(/\u00c3\u0084/g, 'a')
        .replace(/\u00c3\u0096/g, 'o')
        .replace(/\u00c3\u009c/g, 'u')
        .replace(/\u00c4/g, 'a')
        .replace(/\u00d6/g, 'o')
        .replace(/\u00dc/g, 'u')
        .replace(/\u00e4/g, 'a')
        .replace(/\u00f6/g, 'o')
        .replace(/\u00fc/g, 'u')
        .replace(/\u00df/g, 'ss')
        .replace(/[^a-z0-9]+/g, '');
};

const detectDateFormatFromColumn = (rows: string[][], columnIdx: number): CsvDateFormat => {
    if (columnIdx < 0) return 'auto';
    const sample = rows.slice(0, 25);
    let ymd = 0;
    let dmy = 0;
    let mdy = 0;

    sample.forEach((row) => {
        const raw = (row[columnIdx] ?? '').trim();
        if (!raw) return;
        if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(raw)) {
            ymd += 1;
            return;
        }
        const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
        if (!match) return;
        const dayOrMonth = Number(match[1]);
        const monthOrDay = Number(match[2]);
        if (dayOrMonth > 12 && monthOrDay <= 12) {
            dmy += 1;
        } else if (monthOrDay > 12 && dayOrMonth <= 12) {
            mdy += 1;
        } else {
            dmy += 1;
        }
    });

    if (ymd >= dmy && ymd >= mdy && ymd > 0) return 'ymd';
    if (dmy >= mdy && dmy > 0) return 'dmy';
    if (mdy > 0) return 'mdy';
    return 'auto';
};

const pickBestHeaderIndex = (
    headers: string[],
    scorer: (normalized: string) => number,
    used: Set<number>
) => {
    let bestIdx = -1;
    let bestScore = 0;
    headers.forEach((header, idx) => {
        if (used.has(idx)) return;
        const normalized = normalizeHeaderName(header);
        if (!normalized) return;
        const score = scorer(normalized);
        if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
        }
    });
    return bestIdx;
};

const detectCurrencyColumn = (headers: string[], rows: string[][], used: Set<number>) => {
    const sample = rows.slice(0, 25);
    const maxColumns = Math.max(headers.length, ...sample.map((row) => row.length));
    let bestIdx = -1;
    let bestCount = 0;

    for (let idx = 0; idx < maxColumns; idx += 1) {
        if (used.has(idx)) continue;
        let count = 0;
        sample.forEach((row) => {
            const value = (row[idx] ?? '').trim().toUpperCase();
            if (/^[A-Z]{3}$/.test(value)) {
                count += 1;
            }
        });
        if (count > bestCount) {
            bestCount = count;
            bestIdx = idx;
        }
    }

    if (bestIdx >= 0 && bestCount >= Math.max(2, Math.floor(sample.length * 0.4))) {
        return bestIdx;
    }
    return -1;
};

const detectNameHeaderIndex = (headers: string[], used: Set<number>) => {
    let bestIdx = -1;
    let bestScore = 0;
    headers.forEach((header, idx) => {
        if (used.has(idx)) return;
        const normalized = normalizeHeaderName(header);
        if (!normalized || normalized.startsWith('spalte')) return;
        let score = 0;
        if (normalized.includes('produkt')) score += 10;
        if (normalized.includes('name') || normalized.includes('bezeichnung')) score += 8;
        if (normalized.includes('wertpapier') || normalized.includes('security')) score += 6;
        if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
        }
    });
    return bestIdx;
};

export const guessCsvMapping = (headers: string[], rows: string[][], mode: CsvImportMode): { mapping: CsvMapping; dateFormat: CsvDateFormat } => {
    const mapping: CsvMapping = {};
    const used = new Set<number>();

    const assign = (key: keyof CsvMapping, idx: number) => {
        if (idx >= 0 && idx < headers.length && !used.has(idx)) {
            mapping[key] = headers[idx];
            used.add(idx);
        }
    };

    const scoreDate = (normalized: string) => (normalized.includes('datum') || normalized.includes('date') ? 10 : 0);
    const scoreCurrency = (normalized: string) => {
        if (normalized.includes('waehrung') || normalized.includes('wahrung')) return 10;
        if (normalized.includes('currency') || normalized.includes('ccy')) return 8;
        return 0;
    };

    if (mode === 'cash') {
        const scoreAmount = (normalized: string) => {
            if (normalized.includes('betrag')) return 10;
            if (normalized.includes('anderung') || normalized.includes('aenderung')) return 9;
            if (normalized.includes('amount') || normalized.includes('change') || normalized.includes('delta')) return 8;
            return 0;
        };
        const scoreBalance = (normalized: string) => {
            if (normalized.includes('saldo')) return 10;
            if (normalized.includes('balance') || normalized.includes('kontostand') || normalized.includes('bestand')) return 8;
            return 0;
        };
        const scoreDescription = (normalized: string) => {
            if (normalized.includes('beschreibung') || normalized.includes('verwendungszweck')) return 10;
            if (normalized.includes('text') || normalized.includes('desc') || normalized.includes('buchung')) return 8;
            return 0;
        };
        const scoreType = (normalized: string) => {
            if (normalized.includes('typ') || normalized.includes('type') || normalized.includes('art')) return 10;
            if (normalized.includes('kategorie') || normalized.includes('category')) return 8;
            return 0;
        };

        assign('date', pickBestHeaderIndex(headers, scoreDate, used));
        assign('amount', pickBestHeaderIndex(headers, scoreAmount, used));
        assign('balance', pickBestHeaderIndex(headers, scoreBalance, used));
        const currencyIdx = pickBestHeaderIndex(headers, scoreCurrency, used);
        if (currencyIdx >= 0) {
            assign('currency', currencyIdx);
        } else {
            const detectedCurrencyIdx = detectCurrencyColumn(headers, rows, used);
            assign('currency', detectedCurrencyIdx);
        }
        assign('description', pickBestHeaderIndex(headers, scoreDescription, used));
        assign('type', pickBestHeaderIndex(headers, scoreType, used));
    } else {
        const scoreIdentifier = (normalized: string) => {
            if (normalized.includes('isin')) return 12;
            if (normalized.includes('wkn')) return 10;
            if (normalized.includes('ticker') || normalized.includes('symbol')) return 9;
            return 0;
        };
        const scoreShares = (normalized: string) => {
            if (normalized.includes('anzahl')) return 10;
            if (normalized.includes('shares') || normalized.includes('quantity') || normalized.includes('qty')) return 8;
            return 0;
        };
        const scorePrice = (normalized: string) => {
            if (normalized.includes('kurs')) return 10;
            if (normalized.includes('price') || normalized.includes('preis')) return 8;
            return 0;
        };

        assign('date', pickBestHeaderIndex(headers, scoreDate, used));
        assign('identifier', pickBestHeaderIndex(headers, scoreIdentifier, used));
        assign('shares', pickBestHeaderIndex(headers, scoreShares, used));
        assign('price', pickBestHeaderIndex(headers, scorePrice, used));
        const currencyIdx = pickBestHeaderIndex(headers, scoreCurrency, used);
        if (currencyIdx >= 0) {
            assign('currency', currencyIdx);
        } else {
            const detectedCurrencyIdx = detectCurrencyColumn(headers, rows, used);
            assign('currency', detectedCurrencyIdx);
        }
    }

    const dateHeader = mapping.date ? headers.indexOf(mapping.date) : -1;
    const dateFormat = detectDateFormatFromColumn(rows, dateHeader);

    return { mapping, dateFormat };
};

export const parseGenericCsv = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const delimiter = detectDelimiter(lines[0]);
    const headers = parseCsvLineWithDelimiter(lines[0], delimiter).map((h, index) => {
        const trimmed = h.trim();
        return trimmed.length > 0 ? trimmed : `Spalte ${index + 1}`;
    });
    const parsedRows = lines.slice(1).map((line) => parseCsvLineWithDelimiter(line, delimiter));
    const rows = mergeSparseContinuationRows([headers, ...parsedRows]).slice(1);
    return { headers, rows };
};

const parseNumberFlexible = (value: string): number => {
    if (!value) return 0;
    let cleaned = value.replace(/[^\d,.-]/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
    } else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(',', '.');
    }
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
};

const parseNumberStrict = (value: string): number => {
    const raw = (value ?? '').trim();
    if (!raw) return Number.NaN;

    let cleaned = raw.replace(/[^\d,.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') {
        return Number.NaN;
    }

    if (cleaned.includes(',') && cleaned.includes('.')) {
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
    } else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(',', '.');
    }

    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const parseDateValue = (value: string, format: CsvDateFormat): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const tryYmd = (val: string) => {
        const match = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(val);
        if (!match) return null;
        const [, y, m, d] = match;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };
    const tryDmy = (val: string) => {
        const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(val);
        if (!match) return null;
        const [, d, m, y] = match;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };
    const tryMdy = (val: string) => {
        const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(val);
        if (!match) return null;
        const [, m, d, y] = match;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };

    if (format === 'ymd') return tryYmd(trimmed);
    if (format === 'dmy') return tryDmy(trimmed);
    if (format === 'mdy') return tryMdy(trimmed);

    return tryYmd(trimmed) || tryDmy(trimmed) || tryMdy(trimmed);
};

export const buildGenericTransactions = (input: GenericCsvInput): { entries: ImportEntry[]; errors: string[] } => {
    const { headers, rows, mapping, dateFormat, defaultCurrency } = input;
    const errors: string[] = [];
    if (!headers.length || !rows.length) {
        errors.push(getT().services.csv.noData);
        return { entries: [], errors };
    }

    if (!mapping.date || !mapping.identifier || !mapping.shares || !mapping.price) {
        errors.push(getT().services.csv.mapSecurities);
        return { entries: [], errors };
    }

    const dateIdx = headers.indexOf(mapping.date);
    const identifierIdx = headers.indexOf(mapping.identifier);
    const sharesIdx = headers.indexOf(mapping.shares);
    const priceIdx = mapping.price ? headers.indexOf(mapping.price) : -1;
    const currencyIdx = mapping.currency ? headers.indexOf(mapping.currency) : -1;
    const usedIdx = new Set<number>([dateIdx, identifierIdx, sharesIdx, priceIdx, currencyIdx].filter((v) => v >= 0));
    const nameIdx = detectNameHeaderIndex(headers, usedIdx);

    const entries: ImportEntry[] = [];

    rows.forEach((row, index) => {
        const dateRaw = row[dateIdx] ?? '';
        const identifierRaw = row[identifierIdx] ?? '';
        const sharesRaw = row[sharesIdx] ?? '';

        const dateValue = parseDateValue(dateRaw, dateFormat);
        const identifierValue = identifierRaw.trim().toUpperCase();
        const sharesValue = parseNumberFlexible(sharesRaw);
        if (!identifierValue || !dateValue || !sharesValue) {
            errors.push(getT().services.csv.missingFields(index + 2));
            return;
        }

        const currencyValue = currencyIdx >= 0 ? (row[currencyIdx] ?? '').trim().toUpperCase() : defaultCurrency;
        const nameValue = nameIdx >= 0 ? (row[nameIdx] ?? '').trim() : '';
        const priceRaw = priceIdx >= 0 ? (row[priceIdx] ?? '').toString().trim() : '';
        const priceValue = priceIdx >= 0 ? parseNumberFlexible(row[priceIdx] ?? '') : 0;
        const isSell = sharesValue < 0;
        const absShares = Math.abs(sharesValue);
        if (!absShares) {
            errors.push(getT().services.csv.invalidPriceOrShares(index + 2));
            return;
        }

        const hasExplicitPrice = priceRaw.length > 0;
        if (!hasExplicitPrice) {
            errors.push(getT().services.csv.invalidPriceOrShares(index + 2));
            return;
        }

        const signedAmount = isSell ? absShares * (priceValue || 0) : -(absShares * priceValue);

        // No id in a generic file: applyImportBatch dedupes by content
        entries.push(tradeEntry({
            source: 'CSV',
            date: dateValue,
            side: isSell ? 'sell' : 'buy',
            isin: identifierValue,
            name: nameValue || identifierValue,
            quantity: absShares,
            amount: signedAmount,
            currency: currencyValue || defaultCurrency,
            raw: { pricePerShare: priceValue, csvRow: row }
        }));
    });

    return { entries, errors };
};

export const buildGenericCashBalances = (input: GenericCsvInput): { cashPoints: CashBalanceImportPoint[]; entries: ImportEntry[]; errors: string[]; processedRows: number } => {
    const { headers, rows, mapping, dateFormat, defaultCurrency } = input;
    const errors: string[] = [];
    let processedRows = 0;
    if (!headers.length || !rows.length) {
        errors.push(getT().services.csv.noData);
        return { cashPoints: [], entries: [], errors, processedRows };
    }

    if (!mapping.date || (!mapping.amount && !mapping.balance)) {
        errors.push(getT().services.csv.mapCash);
        return { cashPoints: [], entries: [], errors, processedRows };
    }

    const dateIdx = headers.indexOf(mapping.date);
    const amountIdx = mapping.amount ? headers.indexOf(mapping.amount) : -1;
    let balanceIdx = mapping.balance ? headers.indexOf(mapping.balance) : -1;
    let currencyIdx = mapping.currency ? headers.indexOf(mapping.currency) : -1;

    const normalizeCurrency = (value: string) => {
        const trimmed = value.trim().toUpperCase();
        return /^[A-Z]{3}$/.test(trimmed) ? trimmed : '';
    };

    const parseTimeToMinutes = (value: string): number => {
        const raw = (value ?? '').trim();
        const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
        if (!match) return 0;
        const hh = Number(match[1]);
        const mm = Number(match[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
        return (Math.max(0, Math.min(23, hh)) * 60) + Math.max(0, Math.min(59, mm));
    };

    const findHeaderIndex = (predicate: (normalized: string) => boolean) => {
        for (let idx = 0; idx < headers.length; idx += 1) {
            if (idx === dateIdx || idx === amountIdx || idx === balanceIdx || idx === currencyIdx) continue;
            const normalized = normalizeHeaderName(headers[idx] || '');
            if (predicate(normalized)) return idx;
        }
        return -1;
    };

    const sampleRows = rows.slice(0, 200);
    const getNumericRatio = (columnIdx: number) => {
        if (columnIdx < 0) return 0;
        let nonEmpty = 0;
        let valid = 0;
        sampleRows.forEach((row) => {
            const raw = (row[columnIdx] ?? '').trim();
            if (!raw) return;
            nonEmpty += 1;
            if (Number.isFinite(parseNumberStrict(raw))) {
                valid += 1;
            }
        });
        if (nonEmpty === 0) return 0;
        return valid / nonEmpty;
    };

    const getCurrencyRatio = (columnIdx: number) => {
        if (columnIdx < 0) return 0;
        let nonEmpty = 0;
        let valid = 0;
        sampleRows.forEach((row) => {
            const raw = (row[columnIdx] ?? '').trim();
            if (!raw) return;
            nonEmpty += 1;
            if (/^[A-Z]{3}$/.test(raw.toUpperCase())) {
                valid += 1;
            }
        });
        if (nonEmpty === 0) return 0;
        return valid / nonEmpty;
    };

    const resolveLikelyBalanceColumn = (candidateIdx: number) => {
        if (candidateIdx < 0) return candidateIdx;
        const normalized = normalizeHeaderName(headers[candidateIdx] || '');
        const currentRatio = getNumericRatio(candidateIdx);
        const rightIdx = candidateIdx + 1 < headers.length ? candidateIdx + 1 : -1;
        const rightRatio = rightIdx >= 0 ? getNumericRatio(rightIdx) : 0;

        // Degiro Account.csv labels "Saldo" on a currency column, while the numeric
        // balance is usually in the next unnamed column.
        if (normalized.includes('saldo') && currentRatio < 0.3 && rightRatio > 0.75) {
            return rightIdx;
        }

        return candidateIdx;
    };

    // If a balance-like column exists, prefer it over amount-based reconstruction.
    if (balanceIdx < 0) {
        const guessedBalanceIdx = findHeaderIndex((normalized) =>
            normalized.includes('saldo')
            || normalized.includes('balance')
            || normalized.includes('kontostand')
            || normalized.includes('bestand')
        );

        if (guessedBalanceIdx >= 0) {
            const resolvedIdx = resolveLikelyBalanceColumn(guessedBalanceIdx);
            const numericRatio = getNumericRatio(resolvedIdx);
            if (numericRatio >= 0.6) {
                balanceIdx = resolvedIdx;
            }
        }
    } else {
        balanceIdx = resolveLikelyBalanceColumn(balanceIdx);
    }

    const currentCurrencyRatio = getCurrencyRatio(currencyIdx);
    const candidateCurrencyColumns = headers
        .map((_, idx) => ({
            idx,
            ratio: getCurrencyRatio(idx)
        }))
        .filter(({ idx, ratio }) =>
            idx !== dateIdx
            && idx !== amountIdx
            && idx !== balanceIdx
            && ratio >= 0.6
        )
        .sort((a, b) => b.ratio - a.ratio);

    if (currencyIdx < 0 || currentCurrencyRatio < 0.5) {
        let bestIdx = currencyIdx;
        let bestRatio = currentCurrencyRatio;
        for (let idx = 0; idx < headers.length; idx += 1) {
            if (idx === dateIdx || idx === amountIdx || idx === balanceIdx) continue;
            const ratio = getCurrencyRatio(idx);
            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestIdx = idx;
            }
        }
        if (bestIdx >= 0 && bestRatio >= 0.6) {
            currencyIdx = bestIdx;
        }
    }
    const primaryCurrencyRatio = getCurrencyRatio(currencyIdx);
    const currencyFallbackIndices = candidateCurrencyColumns.map((entry) => entry.idx);
    const hasReliableCurrencyColumn = primaryCurrencyRatio >= 0.5 || currencyFallbackIndices.length > 0;
    const shouldUseDefaultCurrencyFallback = !hasReliableCurrencyColumn;
    const resolveCurrencyValue = (row: string[]): string => {
        if (currencyIdx >= 0) {
            const primary = normalizeCurrency(row[currencyIdx] ?? '');
            if (primary) return primary;
        }

        for (const idx of currencyFallbackIndices) {
            if (idx === currencyIdx) continue;
            const fallback = normalizeCurrency(row[idx] ?? '');
            if (fallback) return fallback;
        }

        return shouldUseDefaultCurrencyFallback ? defaultCurrency : '';
    };

    const valueDateIdx = findHeaderIndex((normalized) =>
        normalized.includes('valutadatum')
        || normalized.includes('valuedate')
        || normalized.includes('settlementdate')
    );
    const timeIdx = findHeaderIndex((normalized) =>
        normalized.includes('uhr')
        || normalized.includes('zeit')
        || normalized === 'time'
        || normalized.includes('buchungszeit')
    );

    const descriptionIdx = mapping.description
        ? headers.indexOf(mapping.description)
        : findHeaderIndex((normalized) =>
            normalized.includes('beschreibung')
            || normalized.includes('description')
            || normalized.includes('buchung')
            || normalized.includes('verwendungszweck')
            || normalized.includes('text')
        );
    const typeIdx = mapping.type
        ? headers.indexOf(mapping.type)
        : findHeaderIndex((normalized) =>
            normalized.includes('typ')
            || normalized.includes('type')
            || normalized.includes('art')
            || normalized.includes('kategorie')
            || normalized.includes('category')
        );
    const orderIdIdx = findHeaderIndex((normalized) =>
        normalized.includes('order')
        || normalized.includes('referenz')
        || normalized.includes('reference')
        || normalized === 'id'
    );

    const parseEffectiveDate = (row: string[]): string | null => {
        const primaryDate = parseDateValue(row[dateIdx] ?? '', dateFormat);
        const valueDate = valueDateIdx >= 0 ? parseDateValue(row[valueDateIdx] ?? '', dateFormat) : null;
        return valueDate || primaryDate;
    };

    const foldMovementText = (value: string) => {
        return (value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u00df/g, 'ss')
            .replace(/\u2019/g, "'")
            .replace(/\u00e2\u20ac\u2122/g, "'");
    };

    const resolveTypeFromToken = (token: string): StatementType | null => {
        if (!token) return null;
        if (token.includes('deposit') || token.includes('einzahlung')) return 'Deposit';
        if (token.includes('withdrawal') || token.includes('auszahlung')) return 'Withdrawal';
        if (token.includes('dividend') || token.includes('dividende')) return 'Dividend';
        if (token.includes('interest') || token.includes('zinsen')) return 'Interest';
        if (token.includes('tax') || token.includes('steuer')) return 'Tax';
        if (token.includes('fee') || token.includes('gebuhr') || token.includes('kommission') || token.includes('commission') || token.includes('cost')) return 'Fee';
        if (token.includes('transfer') || token.includes('uberweisung') || token.includes('wahrungswechsel')) return 'Transfer';
        if (token.includes('adjust') || token.includes('korrektur') || token.includes('anpass')) return 'Adjustment';
        return null;
    };

    const classifyMovement = (
        descriptionRaw: string,
        typeRaw: string,
        amount: number
    ): { type: StatementType; isInternal?: boolean } | null => {
        const description = foldMovementText(descriptionRaw);
        const explicitType = foldMovementText(typeRaw);
        const combined = `${explicitType} ${description}`.trim();
        if (!combined) {
            if (amount > 0) return { type: 'Deposit' };
            if (amount < 0) return { type: 'Withdrawal' };
            return null;
        }

        if (
            combined.startsWith('kauf ')
            || combined.startsWith('verkauf ')
            || combined.includes(' kauf ')
            || combined.includes(' verkauf ')
            || combined.startsWith('buy ')
            || combined.startsWith('sell ')
        ) {
            return null;
        }

        const internalHint =
            combined.includes('wahrungswechsel')
            || combined.includes('cash sweep transfer')
            || combined.includes('uberweisung auf ihr geldkonto')
            || combined.includes('internal transfer')
            || combined.includes('reservation ideal');

        if (internalHint) {
            return { type: 'Transfer', isInternal: true };
        }

        const explicit = resolveTypeFromToken(explicitType);
        if (explicit) {
            return explicit === 'Transfer'
                ? { type: explicit, isInternal: internalHint }
                : { type: explicit };
        }

        const inferred = resolveTypeFromToken(description);
        if (inferred) {
            return inferred === 'Transfer'
                ? { type: inferred, isInternal: internalHint }
                : { type: inferred };
        }

        return { type: 'Adjustment' };
    };

    const entries: ImportEntry[] = [];
    if (amountIdx >= 0) {
        rows.forEach((row) => {
            const dateValue = parseEffectiveDate(row);
            if (!dateValue) return;

            const currencyValue = resolveCurrencyValue(row);
            if (!currencyValue) return;

            const amountRaw = row[amountIdx] ?? '';
            const amountValue = parseNumberStrict(amountRaw);
            if (!Number.isFinite(amountValue) || Math.abs(amountValue) < 0.0000001) return;

            const description = descriptionIdx >= 0 ? (row[descriptionIdx] ?? '').trim() : '';
            const rawType = typeIdx >= 0 ? (row[typeIdx] ?? '').trim() : '';
            const classification = classifyMovement(description, rawType, amountValue);
            if (!classification) return;

            let normalizedAmount = amountValue;
            if (classification.type === 'Withdrawal' && normalizedAmount > 0) normalizedAmount = -normalizedAmount;
            if (classification.type === 'Deposit' && normalizedAmount < 0) normalizedAmount = Math.abs(normalizedAmount);
            if ((classification.type === 'Tax' || classification.type === 'Fee') && normalizedAmount > 0) normalizedAmount = -normalizedAmount;

            const orderRef = orderIdIdx >= 0 ? (row[orderIdIdx] ?? '').trim() : '';
            const timeRaw = timeIdx >= 0 ? (row[timeIdx] ?? '').trim() : '';
            const sourceParts = [
                dateValue,
                timeRaw,
                currencyValue,
                normalizedAmount.toFixed(8),
                description || rawType || classification.type,
                orderRef,
                row.join('|')
            ];

            entries.push(statementEntry({
                source: 'CSV',
                externalId: sourceParts.join('|'),
                date: dateValue,
                type: classification.type,
                amount: normalizedAmount,
                currency: currencyValue,
                description: description || rawType || classification.type,
                internal: classification.isInternal,
                raw: row
            }));
        });
    }

    entries.sort((a, b) => a.date.localeCompare(b.date) || (a.externalId || '').localeCompare(b.externalId || ''));

    let firstTimestamp: number | null = null;
    let lastTimestamp: number | null = null;
    rows.forEach((row) => {
        const dateValue = parseEffectiveDate(row);
        if (!dateValue) return;
        const timeMinutes = timeIdx >= 0 ? parseTimeToMinutes(row[timeIdx] ?? '') : 0;
        const timestamp = Date.parse(`${dateValue}T00:00:00Z`) + (timeMinutes * 60 * 1000);
        if (!Number.isFinite(timestamp)) return;
        if (firstTimestamp === null) firstTimestamp = timestamp;
        lastTimestamp = timestamp;
    });
    const isReverseChronological = firstTimestamp !== null && lastTimestamp !== null
        ? firstTimestamp >= lastTimestamp
        : true;

    if (balanceIdx >= 0) {
        const pointMap = new Map<string, { point: CashBalanceImportPoint; timeMinutes: number; rowIndex: number }>();
        rows.forEach((row, index) => {
            const dateValue = parseEffectiveDate(row);
            if (!dateValue) {
                errors.push(getT().services.csv.invalidDate(index + 2));
                return;
            }
            const currencyValue = resolveCurrencyValue(row);
            if (!currencyValue) {
                errors.push(getT().services.csv.invalidCurrency(index + 2));
                return;
            }
            const balanceRaw = row[balanceIdx] ?? '';
            const balanceValue = parseNumberStrict(balanceRaw);
            if (!Number.isFinite(balanceValue)) {
                errors.push(getT().services.csv.invalidBalance(index + 2));
                return;
            }
            processedRows += 1;
            const key = `${currencyValue}|${dateValue}`;
            const timeMinutes = timeIdx >= 0 ? parseTimeToMinutes(row[timeIdx] ?? '') : 0;
            const existing = pointMap.get(key);
            const shouldReplace = !existing
                || timeMinutes > existing.timeMinutes
                || (
                    timeMinutes === existing.timeMinutes
                    && (
                        isReverseChronological
                            ? index < existing.rowIndex
                            : index > existing.rowIndex
                    )
                );
            if (!shouldReplace) return;

            pointMap.set(key, {
                point: {
                    date: dateValue,
                    currency: currencyValue,
                    balance: balanceValue
                },
                timeMinutes,
                rowIndex: index
            });
        });

        const cashPoints = Array.from(pointMap.values()).map((item) => item.point).sort((a, b) => {
            if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
            return a.date.localeCompare(b.date);
        });
        return { cashPoints, entries, errors, processedRows };
    }

    const grouped: Record<string, Record<string, number>> = {};
    rows.forEach((row, index) => {
        if (amountIdx < 0) return;
        const dateValue = parseEffectiveDate(row);
        if (!dateValue) {
            errors.push(getT().services.csv.invalidDate(index + 2));
            return;
        }
        const currencyValue = resolveCurrencyValue(row);
        if (!currencyValue) {
            errors.push(getT().services.csv.invalidCurrency(index + 2));
            return;
        }
        const amountRaw = row[amountIdx] ?? '';
        const amountValue = parseNumberStrict(amountRaw);
        if (!Number.isFinite(amountValue)) {
            errors.push(getT().services.csv.invalidAmount(index + 2));
            return;
        }

        processedRows += 1;
        if (!grouped[currencyValue]) grouped[currencyValue] = {};
        grouped[currencyValue][dateValue] = (grouped[currencyValue][dateValue] || 0) + amountValue;
    });

    const cashPoints: CashBalanceImportPoint[] = [];
    Object.entries(grouped).forEach(([currency, byDate]) => {
        let running = 0;
        Object.keys(byDate).sort().forEach(date => {
            running += byDate[date] || 0;
            cashPoints.push({
                date,
                currency,
                balance: running
            });
        });
    });

    return { cashPoints, entries, errors, processedRows };
};
