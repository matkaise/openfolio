import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { statementEntry, tradeEntry, type ImportEntry } from './entries';
import type { PdfFileImporter } from './fileImport';
import {
    documentLines,
    documentResult,
    findLine,
    ignored,
    parseAmount,
    parseDottedDate,
    reconciles,
    roundCents,
    unsupported,
    type DocLine,
    type DocumentOutcome
} from './pdfDocument';

// Consorsbank PDFs (BNP Paribas, until 2014 Cortal Consors), one document per file, from
// the OnlineArchiv: "ORDERABRECHNUNG"/"WERTPAPIERABRECHNUNG" with a line "KAUF AM ... NR.
// 123.001", "Einlösung", dividend, income and interest credits and "Vorabpauschale". Three
// generations print amounts differently ("Kurswert EUR 1,00", "Kurswert 1,00 EUR", "abzgl.
// Provision 1,00 EUR"), older credits are upper case, and in some documents an amount
// stands on the line above its label. Older documents only state the WKN: an ISIN is
// never made up, so such trades are reported and such income is booked by name.
// Format knowledge from Portfolio Performance (ConsorsbankPDFExtractor and its test
// documents, commit de1e464); no code taken over. Order confirmations are not settlements.

const SOURCE = 'Consorsbank';
const NUMBER = String.raw`\d[\d.]*(?:,\d+)?`;
const ISIN = String.raw`[A-Z]{2}[A-Z0-9]{9}\d`;
const DATE = String.raw`\d{2}\.\d{2}\.\d{4}`;

type Row = { label: string; currency: string; value: number; at: DocLine };

const ROW = new RegExp(`^(?:abzgl\\. )?(.+?) (?:([A-Z]{3}) (${NUMBER})|(${NUMBER}) ([A-Z]{3}))$`);
const BARE_AMOUNT = new RegExp(`^(${NUMBER}) ([A-Z]{3})$`);

/** Amount rows; an amount alone on a line belongs to the label on the next line. */
const rowsOf = (lines: DocLine[]): Row[] => lines.flatMap((at, index) => {
    const own = ROW.exec(at.text);
    const previous = BARE_AMOUNT.exec(lines[index - 1]?.text || '');
    const match = own ?? (previous && !BARE_AMOUNT.test(at.text) ? ROW.exec(`${at.text} ${previous[0]}`) : null);
    if (!match) return [];
    const value = parseAmount(match[3] ?? match[4], 'de');
    return Number.isFinite(value) ? [{ label: match[1].toLowerCase(), currency: match[2] ?? match[5], value, at }] : [];
});

const FEE = /^(?:provision|grundgeb(?:ü|ue)hr|b(?:ö|oe)rsenplatzgeb(?:ü|ue)hr|courtage|maklercourtage|handelsentgelt|handelsplatzkosten|transaktionsentgelt|fremde spesen|eig\. ?spesen|xetra-entgelt|consorsbank ausgabegeb.hr)\b/;
const TAX = /^(?:kapitalertrags?steuer|kapst(?! ?-)|solidarit.tszuschlag|solz|kirchensteuer|kist|(?:\S+ )?finanztransaktionssteuer)\b/;
const TOTAL = /^(?:wert \d{2}\.\d{2}\.\d{4}|zu(?:lasten|gunsten) konto-nr\..*|netto zu(?:lasten|gunsten) iban.*)$/;

const sumOf = (rows: Row[], pattern: RegExp) => roundCents(rows.filter((row) => pattern.test(row.label)).reduce((sum, row) => sum + row.value, 0));

/** The rows of the settlement: the second page repeats taxes for information. */
const settlementRows = (lines: DocLine[]) => {
    const rows = rowsOf(lines);
    const last = rows.findIndex((row) => TOTAL.test(row.label));
    if (last >= 0) {
        // A foreign fund purchase states the booked amount only in the conversion after "Wert"
        const converted = rows[last + 1]?.label.startsWith('umger. zum devisenkurs') ? rows[last + 1] : null;
        return { rows: rows.slice(0, last + (converted ? 2 : 1)), total: converted ?? rows[last] };
    }
    // Old credits end with the converted amount and a date without an amount
    const dated = findLine(lines, new RegExp(`^WERT ${DATE}$`));
    const before = dated ? rows.filter((row) => row.at.page < lines[dated.index].page || (row.at.page === lines[dated.index].page && row.at.line < lines[dated.index].line)) : [];
    return { rows: before, total: before[before.length - 1] ?? null };
};

/** Name and ISIN below the heading "... WKN ISIN"; the WKN alone in older documents. */
const securityOf = (lines: DocLine[]) => {
    const heading = findLine(lines, /^(?:Bezeichnung|Wertpapier|Wertpapierbezeichnung) WKN ISIN$/);
    const row = heading ? new RegExp(`^(.*?) (\\w{6}) (${ISIN})$`).exec(lines[heading.index + 1]?.text || '') : null;
    if (row) return { name: row[1], isin: row[3], wkn: row[2] };
    const old = findLine(lines, /\bWKN: ?(\w{6})\b/);
    if (!old) return null;
    const name = lines[old.index + 1]?.text;
    return { name: name && !ROW.test(name) ? name : undefined, isin: undefined, wkn: old.match[1] };
};

const rawOf = (document: string, rows: Row[]) => ({ source: 'consorsbank-pdf', document, lines: rows.map((row) => row.at.text.replace(/(Konto-Nr\.|IBAN) .*?(\S+ [A-Z]{3})$/, '$1 $2')) });

const signedTotal = (total: Row, direction: number) => {
    if (/zulasten/.test(total.label)) return -total.value;
    return /zugunsten/.test(total.label) ? total.value : direction * total.value;
};

const trade = (lines: DocLine[], title: string, side: 'buy' | 'sell', date: string | null, order: string | undefined, savingsPlan: boolean): DocumentOutcome => {
    const paper = securityOf(lines);
    const pieces = findLine(lines, new RegExp(`^(?:ST|Stück) (${NUMBER})\\b`));
    const quantity = pieces ? parseAmount(pieces.match[1], 'de') : Number.NaN;
    // Bonds are quoted by nominal value with accrued interest; not booked here
    const { rows, total } = settlementRows(lines);
    if (!paper?.isin || !date || !(quantity > 0) || !total || rows.some((row) => /^st.ckzinsen/.test(row.label))) return unsupported(title, lines[0]);
    const currency = total.currency;
    const direction = side === 'buy' ? -1 : 1;
    const inAccount = rows.filter((row) => row.currency === currency);
    // Foreign settlements: the first amount in account currency covers the costs in that currency
    const gross = inAccount.find((row) => /^(?:kurswert|brutto) in [a-z]{3}$|^umger\. zum devisenkurs/.test(row.label))
        ?? inAccount.find((row) => /^(?:kurswert|brutto|nettoinventarwert)$/.test(row.label))
        ?? inAccount.find((row) => row.label === 'zwischensumme');
    if (!gross) return unsupported(title, total.at);
    const fee = sumOf(inAccount, FEE);
    const tax = sumOf(inAccount, TAX);
    const settled = signedTotal(total, direction);
    if (!reconciles([direction * gross.value, -fee, -tax], settled)) return unsupported(title, total.at);

    const key = `consorsbank:${order || `${paper.isin}:${date}:${quantity}`}`;
    const rate = findLine(lines, new RegExp(`^(?:Devisenkurs|umger\\. zum Devisenkurs [A-Z]{3}) (${NUMBER})`))?.match[1];
    const raw = rawOf(title, [gross, ...inAccount.filter((row) => FEE.test(row.label) || TAX.test(row.label))]);
    const entries: ImportEntry[] = [tradeEntry({
        source: SOURCE,
        externalId: key,
        orderId: order,
        date,
        side,
        savingsPlan,
        isin: paper.isin,
        name: paper.name,
        quantity,
        amount: roundCents(direction * gross.value),
        currency,
        fee: fee ? -fee : undefined,
        feeCurrency: currency,
        fxRate: rate ? parseAmount(rate, 'de') : undefined,
        raw
    })];
    if (tax) {
        entries.push(statementEntry({
            source: SOURCE, externalId: `${key}:tax`, orderId: order, date, type: 'Tax', kind: 'tax', amount: -tax, currency,
            description: 'Steuern', isin: paper.isin, name: paper.name, raw
        }));
    }
    return { kind: 'booked', entries };
};

/** Withholding tax in account currency; old credits print both currencies on one line. */
const withholdingOf = (lines: DocLine[], rows: Row[], currency: string, fx: number): number => {
    const both = findLine(lines, new RegExp(`^QUST .*?([A-Z]{3}) (${NUMBER}) ([A-Z]{3}) (${NUMBER})$`));
    if (both) {
        if (both.match[1] === currency) return parseAmount(both.match[2], 'de');
        if (both.match[3] === currency) return parseAmount(both.match[4], 'de');
        return Number.NaN;
    }
    const taxRows = rows.filter((row) => /^(?:quellensteuer|qust)\b/.test(row.label));
    const converted = taxRows.find((row) => row.label.startsWith('quellensteuer in') && row.currency === currency);
    if (converted) return converted.value;
    if (taxRows.length === 0) return 0;
    const [first] = taxRows;
    return first.currency === currency ? first.value : roundCents(first.value / fx);
};

/** Credits and the advance lump sum. Without a gross amount only the tax is booked. */
const income = (lines: DocLine[], title: string, interest: boolean): DocumentOutcome => {
    const paper = securityOf(lines);
    const valuta = findLine(lines, new RegExp(`^(?:Valuta|WERT|Wert) (${DATE})`)) ?? findLine(lines, new RegExp(`Valuta (${DATE})`));
    const date = parseDottedDate(valuta?.match[1] ?? '');
    const { rows, total } = settlementRows(lines);
    if (!paper) return unsupported(title, lines[0]);
    // The allowance covers an advance lump sum of nothing: the document has no final amount
    if (!total) return title === 'Vorabpauschale' && !rows.some((row) => TAX.test(row.label)) ? ignored(title, lines[0]) : unsupported(title, lines[0]);
    const currency = total.currency;
    const inAccount = rows.filter((row) => row.currency === currency);
    const taxes = sumOf(inAccount, TAX);
    const settled = findLine(lines, /^ZU LASTEN KONTO/) ? -total.value : signedTotal(total, 1);
    const brutto = rows.find((row) => /^brutto(?: in [a-z]{3})?$/.test(row.label) && row.currency !== currency) ?? rows.find((row) => /^brutto(?: in [a-z]{3})?$/.test(row.label));
    const key = `consorsbank:income:${paper.isin || paper.wkn}:${date}:${settled}`;
    const raw = rawOf(title, brutto ? [brutto, total] : [total]);
    const entry = (part: string, type: 'Dividend' | 'Interest' | 'Tax' | 'Fee', value: number, description: string, kind?: 'tax') => statementEntry({
        source: SOURCE, externalId: part ? `${key}:${part}` : key, date: date!, type, ...(kind ? { kind } : {}), amount: value,
        currency, description, isin: paper.isin, name: paper.name, raw: { ...raw, wkn: paper.wkn }
    });

    if (!brutto || brutto.value === 0) {
        if (!reconciles([-taxes], settled)) return unsupported(title, total.at);
        if (taxes === 0) return ignored(title, total.at);
        return date ? { kind: 'booked', entries: [entry('', 'Tax', -taxes, title, 'tax')] } : unsupported(title, total.at);
    }
    if (!date) return unsupported(title, total.at);
    const rate = findLine(lines, new RegExp(`^Devisenkurs (${NUMBER})`)) ?? findLine(lines, new RegExp(`^UMGER\\.ZUM DEV\\.-KURS (${NUMBER})`));
    const fx = brutto.currency === currency ? 1 : (rate ? parseAmount(rate.match[1], 'de') : Number.NaN);
    if (!(fx > 0)) return unsupported(title, total.at);
    const withholding = withholdingOf(lines, rows, currency, fx);
    if (!Number.isFinite(withholding)) return unsupported(title, total.at);
    const fee = roundCents(sumOf(inAccount, FEE) + sumOf(rows.filter((row) => row.currency === brutto.currency && row.currency !== currency), FEE) / fx);
    // Gross in account currency as the rest of the credit, checked against the converted gross
    const gross = roundCents(settled + withholding + taxes + fee);
    if (Math.abs(gross - brutto.value / fx) > 0.02) return unsupported(title, total.at);
    const entries = [entry('', interest ? 'Interest' : 'Dividend', gross, title)];
    if (withholding) entries.push(entry('withholding', 'Tax', -withholding, 'Quellensteuer'));
    if (taxes) entries.push(entry('tax', 'Tax', -taxes, 'Einbehaltene Steuern', 'tax'));
    if (fee) entries.push(entry('fee', 'Fee', -fee, 'Gebühren'));
    return { kind: 'booked', entries };
};

/** Later offset of losses: the tax difference booked to the account ("-" = charge). */
const lossOffset = (lines: DocLine[], title: string): DocumentOutcome => {
    // The amount closes the block below its heading, with a trailing minus for a charge
    const heading = findLine(lines, /^\s*Erstattung\/Belastung \(-\) von Steuern/);
    const result = heading ? findLine(lines, new RegExp(`^\\s*(${NUMBER})(-)?\\s*$`), heading.index) : null;
    const valuta = findLine(lines, new RegExp(`(?:Wertstellung|Valuta) (${DATE})`));
    const date = parseDottedDate(valuta?.match[1] ?? '');
    const value = result ? parseAmount(result.match[1], 'de') * (result.match[2] ? -1 : 1) : Number.NaN;
    if (!result || !Number.isFinite(value)) return unsupported(title, lines[0]);
    if (value === 0) return ignored(title, lines[result.index]);
    if (!date) return unsupported(title, lines[result.index]);
    return {
        kind: 'booked',
        entries: [statementEntry({
            source: SOURCE, externalId: `consorsbank:loss-offset:${date}:${value}`, date, type: 'Tax', kind: 'tax', amount: value, currency: 'EUR',
            description: title, raw: { source: 'consorsbank-pdf', document: title, lines: [lines[result.index].text] }
        })]
    };
};

const TRADE_LINE = new RegExp(`^\\s*(KAUF|VERKAUF|BEZUG|Kauf|Verkauf|VERK\\. TEIL-\\/BEZUGSR\\.)(?: \\S+)?\\s+AM\\s+(${DATE})\\b(?:.*NR\\.\\s*(\\S+))?`);
const INCOME_TITLE = /^\s*(DIVIDENDENGUTSCHRIFT|ERTRAGSGUTSCHRIFT|ZINSGUTSCHRIFT|ERTRAGSTHESAURIERUNG|Dividendengutschrift|Ertragsgutschrift|Zinsgutschrift|Ertragsthesaurierung|Vorabpauschale)(?: \/ (Neuabrechnung))?\s*$/;
const CANCELLED = /^\s*(STORNO|Storno)\b/;
const OTHER = /^\s*(UEBERTRAG (?:EINGANG|AUSGANG)|UMTAUSCH (?:EINGANG|AUSGANG)|Wir haben f.r Sie am \S+ folgende Anschaffungsdaten|Kontoauszug\b.*|Kontoabschluss\b.*|Depotauszug\b.*|Jahressteuerbescheinigung(?! folgt).*)/i;
const SKIPPED = /^\s*((?:Ex-ante-|Ex-Ante-)?(?:Kosteninformation|Kostenausweis)|Orderbest.tigung|Auftragsbest.tigung|Ausf.hrungsbest.tigung|.nderungsbest.tigung|Streichungsbest.tigung|Zahlungsauftrag|Zinsinformation).*/i;

const parseDocument = (lines: DocLine[]): DocumentOutcome => {
    const other = findLine(lines, OTHER);
    const statement = findLine(lines, /^Kontotyp (?:Verrechnungskonto|Tagesgeldkonto)/);
    if (statement) return unsupported('Kontoauszug', lines[statement.index]);
    const offset = findLine(lines, /^\s*Nachtr.gliche Verlustverrechnung/i);
    if (offset) return lossOffset(lines, 'Nachträgliche Verlustverrechnung');
    const cancelled = findLine(lines, CANCELLED);
    const tradeLine = findLine(lines, TRADE_LINE);
    const incomeTitle = findLine(lines, INCOME_TITLE);
    const redemption = findLine(lines, /^Einl.sung$/);
    const title = tradeLine ? tradeLine.match[1] : incomeTitle?.match[1];
    if (cancelled) return unsupported(`Storno ${title || ''}`.trim(), lines[cancelled.index]);
    if (tradeLine) {
        const [, verb, date, order] = tradeLine.match;
        const side = /verk/i.test(verb) ? 'sell' : 'buy';
        return trade(lines, verb, side, parseDottedDate(date), order, /SPARPLAN/.test(lines[tradeLine.index].text));
    }
    if (redemption) {
        const closing = findLine(lines, new RegExp(`Schlusstag (${DATE})`));
        return trade(lines, 'Einlösung', 'sell', parseDottedDate(closing?.match[1] ?? ''), undefined, false);
    }
    if (incomeTitle) {
        const name = incomeTitle.match[1];
        // Goes with a cancellation of the first credit, which may already be imported
        if (incomeTitle.match[2]) return unsupported(`${name} / Neuabrechnung`, lines[incomeTitle.index]);
        return income(lines, name, /^zins/i.test(name));
    }
    if (other) return unsupported(other.match[1].trim(), lines[other.index]);
    const skipped = findLine(lines, SKIPPED);
    if (skipped) return ignored(lines[skipped.index].text.trim(), lines[skipped.index]);
    const first = lines.find((line) => line.text.length > 3);
    return unsupported(first?.text || '?', first);
};

const ISSUER = /\bConsorsbank\b|\bCortal Consors\b|POSTFACH 17 43/i;

const detect = (pdf: PdfDocumentText): string | null => (
    pdf.pages.slice(0, 2).flat().some((line) => ISSUER.test(line)) ? 'consorsbank' : null
);

const parse = (pdf: PdfDocumentText) => documentResult('consorsbank', SOURCE, 'consorsbank', parseDocument(documentLines(pdf)));

export const consorsbankFileImporter: PdfFileImporter = {
    id: 'consorsbank',
    broker: 'Consorsbank',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: ConsorsbankPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/ConsorsbankPDFExtractor.java'
        },
        { label: 'Parqet: Consorsbank PDF-Import', url: 'https://faq.parqet.com/de/articles/871911-consorsbank-pdf-import' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
