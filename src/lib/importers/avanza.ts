import { columnIndex, locateHeader, readCsv } from './csv';
import { statementEntry, tradeEntry, type ImportEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Avanza transaction export (Min ekonomi → Transaktioner → period → Exportera transaktioner), semicolon
// separated, Swedish. Columns from Export-To-Ghostfolio 9e35bd6 (sample, issue #165):
//   Datum;Konto;Typ av transaktion;Värdepapper/beskrivning;Antal;Kurs;Belopp;Transaktionsvaluta;
//   Courtage (SEK);Valutakurs;Instrumentvaluta;ISIN;Resultat
// Belopp is the signed cash effect in the transaction currency, courtage included. Kurs is in the
// instrument currency. Numbers have a decimal comma and no thousands separator; dates are ISO.
// One export holds all accounts of the login; "Konto" names the account of each row.

const SOURCE = 'Avanza';
const REQUIRED = ['Datum', 'Konto', 'Typ av transaktion', 'Värdepapper/beskrivning', 'Antal', 'Kurs', 'Belopp', 'Transaktionsvaluta', 'ISIN'];
const COURTAGE = ['Courtage (SEK)', 'Courtage'];

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

/** GBX (pence) stays apart from GBP; "GBp" is the other spelling of GBX. */
const currencyCode = (value: string) => (value.trim() === 'GBp' ? 'GBX' : value.trim().toUpperCase());

type Kind = 'buy' | 'sell' | 'dividend' | 'withholdingTax' | 'interest' | 'deposit' | 'withdrawal' | 'other';

/** Types of the sample: Köp, Sälj, Utdelning, Utländsk källskatt, Ränta, Insättning, Uttag, Övrigt. */
const classify = (type: string): Kind | null => {
    switch (type.trim().toLowerCase()) {
        case 'köp': return 'buy';
        case 'sälj': return 'sell';
        case 'utdelning': return 'dividend';
        case 'utländsk källskatt': return 'withholdingTax';
        case 'ränta': return 'interest';
        case 'insättning': return 'deposit';
        case 'uttag': return 'withdrawal';
        case 'övrigt': return 'other';
        default: return null;
    }
};

/**
 * "Övrigt" (other) rows by their description (issue #165): Avkastningsskatt is the yield tax of
 * ISK/KF accounts; "Återbetalning … avgift" refunds fund fees. Other "Övrigt" rows (e.g. fund
 * switches with quantity and no amount) are not booked.
 */
const otherKind = (description: string): 'tax' | 'feeRefund' | null => {
    const value = description.trim().toLowerCase();
    if (/^avkastningsskatt\b/.test(value)) return 'tax';
    if (/^återbetalning\b.*avgift/.test(value)) return 'feeRefund';
    return null;
};

/** "-352,033838", "54447,41", "-54400"; a decimal point or thousands separators fail. */
const parseCommaDecimal = (value: string): number => {
    const raw = value.trim();
    if (!raw) return 0;
    return /^[-+]?\d+(,\d+)?$/.test(raw) ? Number(raw.replace(',', '.')) : Number.NaN;
};

const toIsoDate = (value: string): string | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date.toISOString().slice(0, 10) : null;
};

const detect = (text: string): string | null => {
    const located = locateHeader(text, REQUIRED, [';']);
    return located && columnIndex(located.header)(...COURTAGE) >= 0 ? 'sv' : null;
};

const parse = (text: string) => {
    const variant = detect(text);
    const located = locateHeader(text, REQUIRED, [';']);
    if (!variant || !located) throw new FileImportError('unknownFormat');
    const rows = readCsv(text, ';');
    const column = columnIndex(located.header);
    const at = {
        date: column('Datum'),
        account: column('Konto'),
        type: column('Typ av transaktion'),
        description: column('Värdepapper/beskrivning'),
        quantity: column('Antal'),
        price: column('Kurs'),
        amount: column('Belopp'),
        currency: column('Transaktionsvaluta'),
        courtage: column(...COURTAGE),
        rate: column('Valutakurs'),
        instrumentCurrency: column('Instrumentvaluta'),
        isin: column('ISIN'),
        result: column('Resultat')
    };
    const data = rows.slice(located.row + 1);
    if (data.length === 0) throw new FileImportError('noRows');
    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach((row, offset) => {
        const line = located.row + offset + 2;
        const cell = (index: number) => (index >= 0 ? row[index] || '' : '');
        const number = (index: number) => {
            const value = parseCommaDecimal(cell(index));
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };
        const label = cell(at.type);
        const date = toIsoDate(cell(at.date));
        if (!date) throw new FileImportError('invalidDate', line);
        const amount = number(at.amount);
        const quantity = number(at.quantity);
        const courtage = number(at.courtage);
        const price = number(at.price);
        const description = cell(at.description);
        const isin = cell(at.isin);
        const currency = currencyCode(cell(at.currency));
        const account = cell(at.account);

        const kind = classify(label);
        const other = kind === 'other' ? otherKind(description) : null;
        if (!kind || (kind === 'other' && !other)) {
            // Unknown types and other rows: reported when they move cash or a position
            (amount === 0 && quantity === 0 && !isin ? ignored : unsupported).push({ line, label: description ? `${label}: ${description}` : label });
            return;
        }
        if (!currency) {
            unsupported.push({ line, label });
            return;
        }

        const baseKey = `avanza:${[cell(at.date), account, label, description, cell(at.quantity), cell(at.price), cell(at.amount), currency, isin].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = {
            source: 'avanza-csv',
            variant,
            line,
            account: account || undefined,
            instrumentCurrency: cell(at.instrumentCurrency) ? currencyCode(cell(at.instrumentCurrency)) : undefined,
            exchangeRate: cell(at.rate) || undefined,
            result: cell(at.result) || undefined,
            row
        };
        const entries: ImportEntry[] = [];
        const statement = (type: StatementType, extra: Partial<Parameters<typeof statementEntry>[0]> = {}) => {
            entries.push(statementEntry({
                source: SOURCE,
                externalId: key,
                date,
                type,
                amount: round(amount),
                currency,
                description: description || label,
                raw,
                ...extra
            }));
        };

        if (kind === 'buy' || kind === 'sell') {
            const size = Math.abs(quantity);
            if (!isin || !size || !amount || (kind === 'buy') !== amount < 0) {
                unsupported.push({ line, label });
                return;
            }
            // Courtage is in SEK; it is split off only when the cash amount is in SEK as well
            const fee = currency === 'SEK' ? Math.abs(courtage) : 0;
            batch.entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                date,
                side: kind,
                isin,
                name: description || isin,
                quantity: size,
                amount: round(amount + fee),
                currency,
                fee: fee ? -fee : undefined,
                feeCurrency: currency,
                raw: { ...raw, pricePerShare: Math.abs(price) || undefined, courtage: courtage || undefined }
            }));
            return;
        }
        if (amount === 0) {
            ignored.push({ line, label });
            return;
        }
        const security = isin ? { isin, name: kind === 'dividend' ? description || isin : undefined } : {};
        if (kind === 'dividend') {
            if (!isin || amount < 0) {
                unsupported.push({ line, label });
                return;
            }
            statement('Dividend', security); // as credited; foreign withholding tax is a row of its own
        } else if (kind === 'withholdingTax') {
            statement('Tax', { ...security, description: description || label });
        } else if (kind === 'interest') {
            statement('Interest');
        } else if (kind === 'deposit' || kind === 'withdrawal') {
            statement(amount > 0 ? 'Deposit' : 'Withdrawal');
        } else {
            statement(other === 'tax' ? 'Tax' : 'Fee');
        }
        batch.entries.push(...entries);
    });

    return {
        batch,
        report: { importerId: 'avanza', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const avanzaFileImporter: FileImporter = {
    id: 'avanza',
    broker: 'Avanza',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Avanza', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#avanza' },
        { label: 'Export-To-Ghostfolio issue #165 (types, export path)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/165' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
