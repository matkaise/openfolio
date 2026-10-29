import { columnIndex, findHeaderRow, locateHeader, parseDotDecimal, readCsvLines } from './csv';
import { statementEntry, tradeEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Directa SIM "Movimenti" export (Libera → Movimenti → period → Excel icon → comma separated file → Estrai),
// Italian. Columns from Export-To-Ghostfolio 9e35bd6 (sample, issues #278, #294, PR #141, #292):
//   Data operazione,Data valuta,Tipo operazione,Ticker,Isin,Protocollo,Descrizione,Quantità,Importo euro,
//   Importo Divisa,Divisa,Riferimento ordine
// Metadata rows ("Conto : …", "Data estrazione : …", period, "Il file include i primi 3000 movimenti") may
// precede the header. "Importo euro" is the signed cash effect in EUR. Numbers have a decimal point,
// dates are DD-MM-YYYY.

const SOURCE = 'Directa';
const CURRENCY = 'EUR';
const REQUIRED = ['Data operazione', 'Data valuta', 'Tipo operazione', 'Isin', 'Quantità', 'Importo euro', 'Divisa'];

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

type Kind = 'buy' | 'sell' | 'dividend' | 'coupon' | 'accrued' | 'withholding' | 'tax' | 'fee' | 'cash';

/**
 * Types of the sample and the upstream classification: Acquisto, Vendita, Provento etf, Dividendi,
 * Cedola obb., Coupon certif., Rit.* (tax withheld on a payout), Ritenuta su plusvalenza (capital gains
 * tax), Ratei (accrued bond interest), Commissioni, Tobin tax, Bollo (stamp duty), Conferimento con
 * bonifico, Bonifico, Prelievo. Financing (Finanziamento) and anything else are not booked.
 */
const classify = (type: string): Kind | null => {
    const value = type.trim().toLowerCase();
    if (value.startsWith('acquisto')) return 'buy';
    if (value.startsWith('vendita')) return 'sell';
    if (value.startsWith('rit.') || value.startsWith('ritenuta su dividend') || value.startsWith('ritenuta su cedol') || value.startsWith('ritenuta su provent')) return 'withholding';
    if (value.startsWith('ritenuta su plusvalenz') || value.startsWith('tobin tax') || value.startsWith('bollo')) return 'tax';
    if (value.startsWith('provento') || value.startsWith('dividend')) return 'dividend';
    if (value.startsWith('cedola') || value.startsWith('coupon')) return 'coupon';
    if (value.startsWith('ratei')) return 'accrued';
    if (value.startsWith('commission')) return 'fee';
    if (value.startsWith('conferimento') || value.startsWith('bonifico') || value.startsWith('prelievo')) return 'cash';
    return null;
};

/** "02-12-2024" -> "2024-12-02". */
const toIsoDate = (value: string): string | null => {
    const match = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(value.trim());
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[1]) ? date.toISOString().slice(0, 10) : null;
};

const detect = (text: string): string | null => (locateHeader(text, REQUIRED, [',']) ? 'movimenti' : null);

const parse = (text: string) => {
    const located = locateHeader(text, REQUIRED, [',']);
    if (!located) throw new FileImportError('unknownFormat');
    const variant = 'movimenti';
    // Metadata rows hold only delimiters in places: read with file line numbers
    const records = readCsvLines(text, ',');
    const headerRow = findHeaderRow(records.map((record) => record.cells), REQUIRED);
    if (headerRow < 0) throw new FileImportError('unknownFormat');
    // Account name from the metadata ("Conto : …"), part of the key so two accounts never merge
    const account = records.slice(0, headerRow).map((record) => /^Conto\s*:\s*(.*)$/i.exec(record.cells[0] || '')?.[1].trim()).find(Boolean) || '';
    const column = columnIndex(located.header);
    const at = {
        date: column('Data operazione'),
        valueDate: column('Data valuta'),
        type: column('Tipo operazione'),
        ticker: column('Ticker'),
        isin: column('Isin'),
        protocol: column('Protocollo'),
        description: column('Descrizione'),
        quantity: column('Quantità'),
        amount: column('Importo euro'),
        foreignAmount: column('Importo Divisa'),
        currency: column('Divisa'),
        order: column('Riferimento ordine')
    };
    const data = records.slice(headerRow + 1);
    if (data.length === 0) throw new FileImportError('noRows');
    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach(({ cells: row, line }) => {
        const cell = (index: number) => (index >= 0 ? row[index] || '' : '');
        const number = (index: number) => {
            const raw = cell(index);
            if (!raw) return 0;
            const value = parseDotDecimal(raw);
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };
        const label = cell(at.type);
        const amount = number(at.amount);
        const quantity = number(at.quantity);
        const isin = cell(at.isin);
        if (!label && !amount && !isin) {
            ignored.push({ line, label }); // empty trailing row of the export
            return;
        }
        const date = toIsoDate(cell(at.date));
        if (!date) throw new FileImportError('invalidDate', line);

        const kind = classify(label);
        if (!kind) {
            (amount === 0 && quantity === 0 ? ignored : unsupported).push({ line, label });
            return;
        }
        const orderId = cell(at.order) || undefined;
        const baseKey = `directa:${[account, cell(at.date), cell(at.valueDate), label, isin, cell(at.protocol), cell(at.quantity), cell(at.amount), orderId].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = {
            source: 'directa-csv',
            variant,
            line,
            account: account || undefined,
            ticker: cell(at.ticker) || undefined,
            valueDate: cell(at.valueDate) || undefined,
            foreignAmount: number(at.foreignAmount) || undefined,
            foreignCurrency: number(at.foreignAmount) ? cell(at.currency) : undefined,
            row
        };
        const name = cell(at.description) || cell(at.ticker) || isin;

        if (kind === 'buy' || kind === 'sell') {
            const size = Math.abs(quantity);
            if (!isin || !size || !amount || (kind === 'buy') !== amount < 0) {
                unsupported.push({ line, label });
                return;
            }
            // Importo euro is the cash effect; costs are not shown apart on the trade row
            batch.entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                orderId,
                date,
                side: kind,
                isin,
                name,
                quantity: size,
                amount: round(amount),
                currency: CURRENCY,
                raw
            }));
            return;
        }
        if (amount === 0) {
            ignored.push({ line, label });
            return;
        }
        // Withheld tax and payouts belong to the position; other taxes and fees to the account
        const position = isin && (kind === 'dividend' || kind === 'coupon' || kind === 'accrued' || kind === 'withholding') ? { isin, name } : {};
        if ((kind === 'dividend' || kind === 'coupon') && (!isin || amount < 0)) {
            unsupported.push({ line, label });
            return;
        }
        const type: StatementType = kind === 'dividend' ? 'Dividend'
            : kind === 'coupon' || kind === 'accrued' ? 'Interest'
                : kind === 'withholding' || kind === 'tax' ? 'Tax'
                    : kind === 'fee' ? 'Fee'
                        : amount > 0 ? 'Deposit' : 'Withdrawal';
        batch.entries.push(statementEntry({
            source: SOURCE,
            externalId: key,
            date,
            type,
            amount: round(amount),
            currency: CURRENCY,
            description: cell(at.description) ? `${label} ${cell(at.description)}` : label,
            raw,
            ...position
        }));
    });

    return {
        batch,
        report: { importerId: 'directa', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const directaFileImporter: FileImporter = {
    id: 'directa',
    broker: 'Directa',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Directa', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#directa' },
        { label: 'Export-To-Ghostfolio issue #278 (file without metadata rows)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/278' },
        { label: 'Export-To-Ghostfolio issue #294 (metadata rows, certificates)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/294' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
