import { columnIndex, decimalSeparatorOf, locateHeader, parseLocaleNumber, readCsv } from './csv';
import { statementEntry, tradeEntry, type StatementType } from './entries';
import { batchPeriod, FileImportError, type FileImporter, type ImportRowNote } from './fileImport';
import { emptyImportBatch } from './importBatch';

// Disnat (Desjardins) account history (account → Historique → Compte → period → export XLSX), saved as
// CSV by the user. French columns from Export-To-Ghostfolio 9e35bd6 (sample, issue #260, PR #270):
//   Date de transaction,Date de règlement,Type de transaction,Classe d'actif,Symbole,Description,Marché,
//   Quantité,Prix,Devise du prix,Commission payée,Montant de l'opération,Devise du compte
// "-" marks an empty cell. Montant de l'opération is the signed cash effect in the account currency.
// Currencies are written "CAN" and "US". Numbers follow the Excel locale of the conversion; dates are ISO.

const SOURCE = 'Disnat';
const REQUIRED = ['Date de règlement', 'Type de transaction', 'Symbole', 'Quantité', 'Prix', 'Commission payée', "Montant de l'opération", 'Devise du compte'];

const ROUND = 1e8;
const round = (value: number) => Math.round(value * ROUND) / ROUND;

const CURRENCIES: Record<string, string> = { CAN: 'CAD', CAD: 'CAD', US: 'USD', USD: 'USD' };

type Kind = 'buy' | 'sell' | 'dividend' | 'withholding' | 'interest' | 'fee' | 'deposit' | 'withdrawal' | 'transfer';

/** Upper case without accents: "DIVIDENDE SOCIÉTÉ FIDUCIE" -> "DIVIDENDE SOCIETE FIDUCIE". */
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/**
 * Types of the sample: ACHAT, VENTE, DIVIDENDE SOCIÉTÉ FIDUCIE, INTÉRÊTS (also VERSEMENT TARDIF), FRAIS
 * with the sales taxes on it (TAXE PRODUITS ET SERVICES, TAXE DE VENTE DU QUÉBEC), COTISATION, RÉSILIATION,
 * TRANSFERT REÇU and the RESP grants (SUBVENTION …, INCITATIF QUÉBÉCOIS). RETENUE (withholding) and RETRAIT
 * from the upstream classification.
 */
const classify = (type: string): Kind | null => {
    const value = plain(type);
    if (value.startsWith('ACHAT')) return 'buy';
    if (value.startsWith('VENTE')) return 'sell';
    if (value.startsWith('DIVIDENDE')) return 'dividend';
    if (value.startsWith('RETENUE')) return 'withholding';
    if (value.startsWith('INTERETS')) return 'interest';
    if (value.startsWith('FRAIS') || value.startsWith('TAXE PRODUITS ET SERVICES') || value.startsWith('TAXE DE VENTE')) return 'fee';
    if (value.startsWith('COTISATION') || value.startsWith('SUBVENTION') || value.startsWith('INCITATIF')) return 'deposit';
    if (value.startsWith('RESILIATION') || value.startsWith('RETRAIT')) return 'withdrawal';
    if (value.startsWith('TRANSFERT')) return 'transfer';
    return null;
};

/** Trades carry "-C" for the Canadian listing, dividends the bare symbol ("CASH-C" / "CASH"). */
const symbolKey = (symbol: string) => symbol.trim().toUpperCase().replace(/-C$/, '');

const toIsoDate = (value: string): string | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date.toISOString().slice(0, 10) : null;
};

const detect = (text: string): string | null => {
    const located = locateHeader(text, REQUIRED, [',', ';']);
    return located ? (located.delimiter === ',' ? 'fr-comma' : 'fr-semicolon') : null;
};

const parse = (text: string) => {
    const variant = detect(text);
    const located = locateHeader(text, REQUIRED, [',', ';']);
    if (!variant || !located) throw new FileImportError('unknownFormat');
    const rows = readCsv(text, located.delimiter);
    const column = columnIndex(located.header);
    const at = {
        tradeDate: column('Date de transaction'),
        settlement: column('Date de règlement'),
        type: column('Type de transaction'),
        assetClass: column("Classe d'actif"),
        symbol: column('Symbole'),
        description: column('Description'),
        market: column('Marché'),
        quantity: column('Quantité'),
        price: column('Prix'),
        priceCurrency: column('Devise du prix'),
        commission: column('Commission payée'),
        amount: column("Montant de l'opération"),
        accountCurrency: column('Devise du compte')
    };
    const data = rows.slice(located.row + 1);
    if (data.length === 0) throw new FileImportError('noRows');
    const lineOf = (offset: number) => located.row + offset + 2;
    const cellOf = (row: string[], index: number) => {
        const value = index >= 0 ? (row[index] || '').trim() : '';
        return value === '-' ? '' : value;
    };

    const decimal = decimalSeparatorOf(data.flatMap((row, offset) => [at.quantity, at.price, at.commission, at.amount]
        .map((index) => ({ raw: cellOf(row, index), line: lineOf(offset) }))));
    if (!('separator' in decimal)) throw new FileImportError('invalidNumber', decimal.line);

    const batch = emptyImportBatch(SOURCE);
    const ignored: ImportRowNote[] = [];
    const unsupported: ImportRowNote[] = [];
    const seen = new Map<string, number>();

    data.forEach((row, offset) => {
        const line = lineOf(offset);
        const cell = (index: number) => cellOf(row, index);
        const number = (index: number) => {
            const raw = cell(index);
            if (!raw) return 0;
            const value = parseLocaleNumber(raw, decimal.separator);
            if (!Number.isFinite(value)) throw new FileImportError('invalidNumber', line);
            return value;
        };
        const label = cell(at.type);
        const date = toIsoDate(cell(at.tradeDate) || cell(at.settlement));
        if (!date) throw new FileImportError('invalidDate', line);
        const amount = number(at.amount);
        const quantity = number(at.quantity);
        const price = number(at.price);
        const commission = Math.abs(number(at.commission));
        const symbol = symbolKey(cell(at.symbol));
        const currency = CURRENCIES[cell(at.accountCurrency).toUpperCase()] || '';
        const priceCurrency = CURRENCIES[cell(at.priceCurrency).toUpperCase()] || cell(at.priceCurrency).toUpperCase();

        const kind = classify(label);
        // Transfers of securities have a symbol or quantity; transfers of cash are deposits or withdrawals
        if (!kind || (kind === 'transfer' && (symbol || quantity))) {
            (amount === 0 && quantity === 0 ? ignored : unsupported).push({ line, label });
            return;
        }
        if (!currency) {
            (amount === 0 ? ignored : unsupported).push({ line, label });
            return;
        }

        const baseKey = `disnat:${[cell(at.tradeDate), cell(at.settlement), label, cell(at.symbol), cell(at.description), cell(at.quantity), cell(at.amount), currency].join('|')}`;
        const occurrence = (seen.get(baseKey) || 0) + 1;
        seen.set(baseKey, occurrence);
        const key = occurrence > 1 ? `${baseKey}#${occurrence}` : baseKey;
        const raw = {
            source: 'disnat-csv',
            variant,
            line,
            symbol: cell(at.symbol) || undefined,
            market: cell(at.market) || undefined,
            assetClass: cell(at.assetClass) || undefined,
            priceCurrency: priceCurrency || undefined,
            settlementDate: cell(at.settlement) || undefined,
            row
        };
        const name = cell(at.description) || symbol;

        if (kind === 'buy' || kind === 'sell') {
            const size = Math.abs(quantity);
            const stock = plain(cell(at.assetClass)) === 'ACTIONS';
            if (!symbol || !size || !amount || !stock || (kind === 'buy') !== amount < 0) {
                unsupported.push({ line, label });
                return;
            }
            // The commission is split off only where quantity × price plus commission explains the amount
            const gross = round(size * price);
            const fits = priceCurrency === currency && Math.abs(Math.abs(amount) - (kind === 'buy' ? gross + commission : gross - commission)) < 0.015;
            const fee = fits ? commission : 0;
            batch.entries.push(tradeEntry({
                source: SOURCE,
                externalId: key,
                date,
                side: kind,
                isin: symbol, // Disnat symbol; resolved to a security by the market sync
                name,
                quantity: size,
                amount: round(amount + fee), // the amount is net of the commission on both sides
                currency,
                fee: fee ? -fee : undefined,
                feeCurrency: currency,
                raw: { ...raw, pricePerShare: price || undefined, commission: commission || undefined }
            }));
            return;
        }
        if (amount === 0) {
            ignored.push({ line, label });
            return;
        }
        if (kind === 'dividend' && (!symbol || amount < 0)) {
            unsupported.push({ line, label });
            return;
        }
        const position = symbol && (kind === 'dividend' || kind === 'withholding') ? { isin: symbol, name } : {};
        const type: StatementType = kind === 'dividend' ? 'Dividend'
            : kind === 'withholding' ? 'Tax'
                : kind === 'interest' ? 'Interest'
                    : kind === 'fee' ? 'Fee'
                        : amount > 0 ? 'Deposit' : 'Withdrawal';
        batch.entries.push(statementEntry({
            source: SOURCE,
            externalId: key,
            date,
            type,
            amount: round(amount), // dividends as credited
            currency,
            description: cell(at.description) ? `${label} ${cell(at.description)}` : label,
            raw,
            ...position
        }));
    });

    return {
        batch,
        report: { importerId: 'disnat', variant, period: batchPeriod(batch), rows: data.length, ignored, unsupported }
    };
};

export const disnatFileImporter: FileImporter = {
    id: 'disnat',
    broker: 'Disnat',
    formats: ['CSV'],
    accept: '.csv',
    sources: [
        { label: 'Export-To-Ghostfolio: Disnat', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#disnat' },
        { label: 'Export-To-Ghostfolio issue #260 (sample, export path)', url: 'https://github.com/dickwolff/Export-To-Ghostfolio/issues/260' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
