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

// Settlement PDFs of ING Deutschland (ING-DiBa AG), one document per file, downloaded from
// the Post-Box: "Wertpapierabrechnung Kauf/Verkauf/Bezug" (also savings plans and
// reinvestment), "Rückzahlung"/"Einlösung", "Dividendengutschrift", "Ertragsgutschrift",
// "Zinsgutschrift", "Vorabpauschale" and the later loss offset "nachträgliche
// Verlustverrechnung". Every amount prints as "Label EUR 1.234,56" on its own line.
// Format knowledge from Portfolio Performance (INGDiBaPDFExtractor and its test documents,
// commit de1e464); no code taken over. ING Spain (ING BANK NV) is a different format. Umlauts
// are wildcards in the patterns: older documents print them with a broken font encoding.

const SOURCE = 'ING';
const NUMBER = String.raw`\d[\d.]*(?:,\d+)?`;
const ISIN_LINE = /^ISIN \(WKN\) ([A-Z]{2}[A-Z0-9]{9}\d) \(\w+\)$/;

type Row = { label: string; currency: string; value: number; at: DocLine };

const MONEY_ROW = new RegExp(`^(.+?) ([A-Z]{3}) (- ?)?(${NUMBER})$`);

/** "Label EUR 1,23" or "Label EUR - 1,23" lines of [from, to). */
const moneyRows = (lines: DocLine[], from: number, to: number): Row[] => lines.slice(from, to).flatMap((at) => {
    const match = MONEY_ROW.exec(at.text);
    if (!match) return [];
    const value = parseAmount(match[4], 'de');
    return Number.isFinite(value) ? [{ label: match[1], currency: match[2], value: match[3] ? -value : value, at }] : [];
});

const FEE = /^(Provision|Handelsplatzgeb.hr|Handelsentgelt|B.rsenentgelt|Variables Transaktionsentgelt|Courtage)$/;
const TAX = /^(Kapitalertrags{1,2}teuer|KapSt anteilig|Solidarit.tszuschlag|Kirchensteuer|Franz\. Transaktionssteuer) /;

const sumOf = (rows: Row[], pattern: RegExp) => roundCents(rows.filter((row) => pattern.test(row.label)).reduce((sum, row) => sum + row.value, 0));

/** "Endbetrag zu Ihren Lasten EUR 533,39" as a cash effect; a plain "Endbetrag" follows the trade's direction. */
const settledTotal = (rows: Row[], direction: number): Row | null => {
    const row = rows.find((candidate) => /^(Endbetrag|Gesamtbetrag)( zu Ihren (Lasten|Gunsten))?$/.test(candidate.label));
    if (!row) return null;
    const size = Math.abs(row.value);
    if (/Lasten/.test(row.label)) return { ...row, value: -size };
    return { ...row, value: /Gunsten/.test(row.label) ? size : direction * size };
};

/** Name after "Wertpapierbezeichnung"; the next line continues it unless a data field follows. */
const securityName = (lines: DocLine[]): string | undefined => {
    const found = findLine(lines, /^Wertpapierbezeichnung (.+)$/);
    if (!found) return undefined;
    const next = lines[found.index + 1]?.text || '';
    return /^(Nominale|Zinstermin|F.lligkeit)\b/.test(next) ? found.match[1] : `${found.match[1]} ${next}`;
};

const rawOf = (document: string, rows: { at: DocLine }[]) => ({ source: 'ing-pdf', document, lines: rows.map((row) => row.at.text) });

const trade = (lines: DocLine[], title: string, side: 'buy' | 'sell'): DocumentOutcome => {
    const isinLine = findLine(lines, ISIN_LINE);
    if (!isinLine) return unsupported(title, lines[0]);
    const isin = isinLine.match[1];
    const at = lines[isinLine.index];
    // Bonds are settled by nominal value with accrued interest; not booked here
    const pieces = findLine(lines, new RegExp(`^Nominale (?:St.ck (${NUMBER})|(${NUMBER}) St.ck)$`));
    if (!pieces || findLine(lines, /^St.ckzinsen\b/) || findLine(lines, /^Kurs \S+ ?%$/)) return unsupported(title, at);
    const quantity = parseAmount(pieces.match[1] ?? pieces.match[2], 'de');

    const executed = findLine(lines, /^(?:Ausf.hrungstag|Schlusstag)(?: \/ -zeit)? (\d{2}\.\d{2}\.\d{4})(?: um (\d{2}:\d{2}:\d{2}))?/);
    const dueDate = findLine(lines, /^F.lligkeit (\d{2}\.\d{2}\.\d{4})$/);
    const date = parseDottedDate(executed?.match[1] ?? dueDate?.match[1] ?? '');

    const direction = side === 'buy' ? -1 : 1;
    const rows = moneyRows(lines, isinLine.index, lines.length);
    const total = settledTotal(rows, direction);
    const gross = rows.find((row) => row.label === 'Kurswert');
    if (!date || !(quantity > 0) || !total || !gross) return unsupported(title, at);
    const currency = total.currency;

    // A foreign settlement converts everything before the conversion line into one amount
    const conversion = findLine(lines, new RegExp(`^umger\\. zum Devisenkurs ([A-Z]{3}) (${NUMBER}) \\([A-Z]{3} = (${NUMBER})\\)$`));
    const discount = rows.find((row) => row.label === 'Rabatt');
    const inAccount = rows.filter((row) => row.currency === currency);
    if (conversion ? conversion.match[1] !== currency : gross.currency !== currency) return unsupported(title, total.at);
    const value = conversion ? parseAmount(conversion.match[2], 'de') : roundCents(gross.value + (discount?.value ?? 0));
    const fee = sumOf(inAccount, FEE);
    const tax = sumOf(inAccount, TAX);
    if (!reconciles([direction * value, -fee, -tax], total.value)) return unsupported(title, total.at);

    const order = findLine(lines, /^Ordernummer (\S+)$/)?.match[1];
    // A partial execution keeps the order number: the time tells executions apart
    const key = order ? `ing:${order}:${date}:${executed?.match[2] || ''}:${quantity}` : `ing:redemption:${isin}:${date}`;
    const fxRate = conversion ? parseAmount(conversion.match[3], 'de') : undefined;
    const name = securityName(lines);
    const raw = rawOf(title, rows.filter((row) => row !== total).concat(total));
    const entries: ImportEntry[] = [tradeEntry({
        source: SOURCE,
        externalId: key,
        orderId: order,
        date,
        side,
        savingsPlan: /Sparplan/.test(title),
        isin,
        name,
        quantity,
        amount: roundCents(direction * value),
        currency,
        fee: fee ? -fee : undefined,
        feeCurrency: currency,
        fxRate: fxRate && fxRate !== 1 ? fxRate : undefined,
        raw
    })];
    if (tax) {
        entries.push(statementEntry({
            source: SOURCE, externalId: `${key}:tax`, orderId: order, date, type: 'Tax', kind: 'tax', amount: -tax, currency,
            description: 'Steuern', isin, name, raw
        }));
    }
    return { kind: 'booked', entries };
};

const WITHHOLDING = new RegExp(`^QuSt ${NUMBER} ?% (?:\\(([A-Z]{3}) (${NUMBER})\\) )?([A-Z]{3}) (?:- ?)?(${NUMBER})$`);

/** Dividendengutschrift, Ertragsgutschrift, Zinsgutschrift and Vorabpauschale. */
const income = (lines: DocLine[], title: string): DocumentOutcome => {
    const isinLine = findLine(lines, ISIN_LINE);
    const valuta = findLine(lines, /^Valuta (\d{2}\.\d{2}\.\d{4})$/) ?? findLine(lines, /^Zahltag (\d{2}\.\d{2}\.\d{4})$/);
    const date = parseDottedDate(valuta?.match[1] ?? '');
    if (!isinLine || !date) return unsupported(title, lines[0]);
    const isin = isinLine.match[1];
    const rows = moneyRows(lines, isinLine.index, lines.length);
    const total = settledTotal(rows, 1);
    if (!total) return unsupported(title, lines[isinLine.index]);
    const currency = total.currency;
    const inAccount = rows.filter((row) => row.currency === currency);
    const taxes = sumOf(inAccount, TAX);
    const fee = sumOf(inAccount, FEE);
    const name = securityName(lines);
    const raw = rawOf(title, rows.filter((row) => row !== total).concat(total));
    const key = `ing:income:${isin}:${date}:${total.value}`;
    const entry = (part: string, type: 'Dividend' | 'Interest' | 'Tax' | 'Fee', value: number, description: string, kind?: 'tax') => statementEntry({
        source: SOURCE, externalId: part ? `${key}:${part}` : key, date, type, ...(kind ? { kind } : {}), amount: value,
        currency, description, isin, name, raw
    });

    // Accumulating fund or advance lump sum: no payout, only the tax
    const gross = rows.find((row) => row.label === 'Brutto');
    if (!gross) {
        if (!reconciles([-taxes], total.value)) return unsupported(title, total.at);
        return taxes ? { kind: 'booked', entries: [entry('', 'Tax', -taxes, title, 'tax')] } : ignored(title, total.at);
    }
    if (gross.value <= 0) return unsupported(title, gross.at);

    const conversion = findLine(lines, new RegExp(`^Umg\\. z\\. Dev\\.-Kurs \\((${NUMBER})\\) ([A-Z]{3}) (${NUMBER})$`));
    const fx = gross.currency === currency ? 1 : (conversion && conversion.match[2] === currency ? parseAmount(conversion.match[1], 'de') : Number.NaN);
    if (!(fx > 0)) return unsupported(title, gross.at);
    const withholdingLine = findLine(lines, WITHHOLDING, isinLine.index);
    const withholding = (() => {
        if (!withholdingLine) return 0;
        const [, inner, innerValue, outer, outerValue] = withholdingLine.match;
        if (inner === currency) return parseAmount(innerValue, 'de');
        if (outer === currency) return parseAmount(outerValue, 'de');
        return outer === gross.currency ? roundCents(parseAmount(outerValue, 'de') / fx) : Number.NaN;
    })();
    if (!Number.isFinite(withholding)) return unsupported(title, gross.at);
    // Gross in account currency as the rest of the credit, checked against the converted gross
    const grossInAccount = roundCents(total.value + withholding + taxes + fee);
    if (Math.abs(grossInAccount - gross.value / fx) > 0.02) return unsupported(title, total.at);

    const entries = [title === 'Zinsgutschrift' ? entry('', 'Interest', grossInAccount, title) : entry('', 'Dividend', grossInAccount, title)];
    if (withholding) entries.push(entry('withholding', 'Tax', -withholding, 'Quellensteuer'));
    if (taxes) entries.push(entry('tax', 'Tax', -taxes, 'Einbehaltene Steuern', 'tax'));
    if (fee) entries.push(entry('fee', 'Fee', -fee, 'Gebühren'));
    return { kind: 'booked', entries };
};

/** Later offset of losses: the tax difference booked to the reference account ("-" = charge). */
const lossOffset = (lines: DocLine[], title: string): DocumentOutcome => {
    const result = findLine(lines, new RegExp(`^Erstattung\\/Belastung\\(-\\) (-?${NUMBER})$`));
    const valuta = findLine(lines, /Steuerausgleich buchen wir mit Valuta (\d{2}\.\d{2}\.\d{4})/);
    const date = parseDottedDate(valuta?.match[1] ?? '');
    const run = findLine(lines, /^Verlustverrechnung vom: (\d{2}\.\d{2}\.\d{4} \/ \d+)$/)?.match[1];
    const value = result ? parseAmount(result.match[1], 'de') : Number.NaN;
    if (!result || !Number.isFinite(value)) return unsupported(title, lines[0]);
    if (value === 0) return ignored(title, lines[result.index]);
    if (!date) return unsupported(title, lines[result.index]);
    return {
        kind: 'booked',
        entries: [statementEntry({
            source: SOURCE, externalId: `ing:loss-offset:${run || date}`, date, type: 'Tax', kind: 'tax', amount: value, currency: 'EUR',
            description: 'Nachträgliche Verlustverrechnung', raw: { source: 'ing-pdf', document: title, lines: [lines[result.index].text] }
        })]
    };
};

const CANCELLED = /^\*\*\* ?Storno ?\*\*\*$|^Sie erhalten eine neue Abrechnung\.$/;
const TRADE_TITLE = /^(?:Wertpapierabrechnung (?:Kauf|Bezug|Verkauf|Verk\. Teil-\/Bezugsr\.)(?: .*)?|R.ckzahlung|Einl.sung)$/;
const INCOME_TITLE = /^(Dividendengutschrift|Ertragsgutschrift|Zinsgutschrift)\b|^Vorabpauschale$/;
const LOSS_OFFSET_TITLE = /^(?:Verlustverrechnung \/ )?[Nn]achtr.gliche Verlustverrechnung/;
const OTHER_TITLE = /^(Wertpapierabrechnung zum steuerrelevanten Umtausch|Umtausch (?:Eingang|Ausgang)|.bertrag (?:Eingang|Ausgang)|Kontoauszug\b.*|Depotauszug\b.*|Jahressteuerbescheinigung(?! folgt).*|Steuerbescheinigung\b.*)/;
const SKIPPED_TITLE = /^(?:Ex-ante-|Ex-Ante-)?(?:Kosteninformation|Kostenausweis|(?:Auftrags|Order|Änderungs|Streichungs)bestätigung)\b.*/;

/** Title of a document this importer does not know: the line after the address block. */
const fallbackTitle = (lines: DocLine[]) => {
    const postcode = findLine(lines, /^\d{5} \S/);
    return (postcode ? lines[postcode.index + 1] : lines[0]) ?? lines[0];
};

const parseDocument = (lines: DocLine[]): DocumentOutcome => {
    const titleLine = findLine(lines, new RegExp([TRADE_TITLE, INCOME_TITLE, LOSS_OFFSET_TITLE, OTHER_TITLE, SKIPPED_TITLE].map((pattern) => pattern.source).join('|')));
    if (!titleLine) {
        const line = fallbackTitle(lines);
        return unsupported(line?.text || '?', line);
    }
    const at = lines[titleLine.index];
    const title = at.text;
    if (SKIPPED_TITLE.test(title)) return ignored(title, at);
    if (LOSS_OFFSET_TITLE.test(title)) return lossOffset(lines, 'Nachträgliche Verlustverrechnung');
    if (OTHER_TITLE.test(title)) return unsupported(title, at);
    if (findLine(lines, CANCELLED)) return unsupported(`Storno ${title}`, at);
    if (TRADE_TITLE.test(title)) return trade(lines, title, /Verk|R.ckzahlung|Einl.sung/.test(title) ? 'sell' : 'buy');
    return income(lines, /^\w+/.exec(title)![0]);
};

const detect = (pdf: PdfDocumentText): string | null => (
    pdf.pages.slice(0, 2).flat().some((line) => /\bING-DiBa AG\b/.test(line)) ? 'ing' : null
);

const parse = (pdf: PdfDocumentText) => documentResult('ing', SOURCE, 'ing', parseDocument(documentLines(pdf)));

export const ingFileImporter: PdfFileImporter = {
    id: 'ing',
    broker: 'ING Deutschland',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: INGDiBaPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/INGDiBaPDFExtractor.java'
        },
        { label: 'Parqet: ING PDF-Import', url: 'https://faq.parqet.com/de/articles/651196-ing-pdf-import' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
