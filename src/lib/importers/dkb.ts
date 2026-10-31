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

// Securities documents of DKB (Deutsche Kreditbank AG), one document per file, from the
// folder "Wertpapierdokumente" of the mailbox: "Wertpapier Abrechnung Kauf/Verkauf/Ausgabe
// Investmentfonds/Rücknahme Investmentfonds", redemptions, dividend and income credits,
// "Vorabpauschale Investmentfonds" and the "Halbjahresabrechnung Sparplan" with one line per
// purchase. Amounts print as "Kurswert 1.400,00- EUR", where the sign is optional. Taxes
// are repeated on later pages, so only the rows up to "Ausmachender Betrag" count.
// Format knowledge from Portfolio Performance (DkbPDFExtractor and its test documents,
// commit de1e464); no code taken over. Cost information is not a booking.

const SOURCE = 'DKB';
const NUMBER = String.raw`\d[\d.]*(?:,\d+)?`;
const ISIN = String.raw`[A-Z]{2}[A-Z0-9]{9}\d`;
const DATE = String.raw`\d{2}\.\d{2}\.\d{4}`;

type Row = { label: string; value: number; sign: string; currency: string; at: DocLine };

const ROW = new RegExp(`^(.+?) (${NUMBER}) ?([-+])? ?([A-Z]{3})$`);

/** Amount rows of [from, to): "Provision 7,50- EUR". */
const rowsOf = (lines: DocLine[], from: number, to: number): Row[] => lines.slice(from, to).flatMap((at) => {
    const match = ROW.exec(at.text);
    if (!match) return [];
    const value = parseAmount(match[2], 'de');
    return Number.isFinite(value) ? [{ label: match[1], value, sign: match[3] || '', currency: match[4], at }] : [];
});

const FEE = /^(Provision|Fremde Auslagen|Eigene Spesen|Transaktionsentgelt B.rse|.bertragungs-\/Liefergeb.hr|Handelsentgelt|B.rsenentgelt|Maklercourtage|Handelsplatzentgelt|Abwicklungskosten B.rse|Fremde Abwicklungsgeb.hr)\b/;
const TAX = /^(Kapitalertragsteuer|Solidarit.tszuschlag|Kirchensteuer|(?:\S+ )?Finanztransaktionssteuer)\b/;
const WITHHOLDING = /^Einbehaltene Quellensteuer\b/;

/** A deduction; "+" marks a refund. Without a sign (older documents) the amount is a deduction too. */
const deductions = (rows: Row[], pattern: RegExp) => roundCents(rows
    .filter((row) => pattern.test(row.label))
    .reduce((sum, row) => sum + (row.sign === '+' ? -row.value : row.value), 0));

/** "Stück 29,2893 NAME ISIN (WKN)" and the next line; bonds print a currency instead of "Stück". */
const securityOf = (lines: DocLine[]) => {
    const heading = findLine(lines, /^(?:Nominale )?Wertpapierbezeichnung ISIN \(WKN\)$/);
    if (!heading) return null;
    // The ISIN closes the first line, or a line of its own when the name wraps
    const text = (offset: number) => lines[heading.index + offset]?.text || '';
    const pattern = new RegExp(`^(?:(St.ck|[A-Z]{3}) (${NUMBER}) )?(.*?) ?(${ISIN}) \\(\\w+\\)$`);
    const onOneLine = pattern.exec(text(1));
    const wrapped = onOneLine ? null : pattern.exec(`${text(1)} ${text(2)} ${text(3)}`);
    const first = onOneLine ?? wrapped;
    if (!first) return null;
    const continues = onOneLine && !/^(B.rse|Handels-|Zahlbarkeitstag|R.ckzahlungskurs|Im Rahmen|Handelspartner|Sehr geehrte)/.test(text(2));
    return {
        unit: first[1],
        quantity: first[2] ? parseAmount(first[2], 'de') : Number.NaN,
        isin: first[4],
        name: continues ? `${first[3]} ${text(2)}` : first[3]
    };
};

const rawOf = (document: string, rows: { at: DocLine }[]) => ({ source: 'dkb-pdf', document, lines: rows.map((row) => row.at.text) });

const finalIndex = (lines: DocLine[]) => findLine(lines, /^Ausmachender Betrag\b/)?.index ?? -1;

/**
 * "Steuerliche Ausgleichrechnung" after the settlement: losses of the sale are set against
 * taxes paid earlier, with a booking of its own. Taxes without sign are refunded here.
 */
const taxOffset = (lines: DocLine[], end: number, currency: string) => {
    const final = findLine(lines, /^(?:Ausmachender Betrag|Steuerausgleich)\b/, end + 1);
    if (!final) return null;
    const rows = rowsOf(lines, end + 1, final.index + 1);
    const total = rows.find((row) => row.at === lines[final.index]);
    const value = rows.filter((row) => TAX.test(row.label)).reduce((sum, row) => sum + (row.sign === '-' ? -row.value : row.value), 0);
    const valuta = findLine(lines, new RegExp(`mit Valuta (${DATE})`), final.index);
    const date = parseDottedDate(valuta?.match[1] ?? '');
    if (!total || total.currency !== currency || !date || !reconciles([value], total.sign === '-' ? -total.value : total.value)) return 'unreadable' as const;
    return { value: roundCents(value), date, rows };
};

const trade = (lines: DocLine[], title: string, side: 'buy' | 'sell'): DocumentOutcome => {
    const paper = securityOf(lines);
    const end = finalIndex(lines);
    if (!paper || end < 0) return unsupported(title, lines[0]);
    const at = lines[findLine(lines, /ISIN \(WKN\)$/)!.index + 1];
    // Bonds are settled by nominal value with accrued interest; not booked here
    if (!/^St.ck$/.test(paper.unit || '') || !(paper.quantity > 0) || findLine(lines, /^St.ckzinsen\b/)) return unsupported(title, at);
    const rows = rowsOf(lines, 0, end + 1);
    const total = rows.find((row) => row.at === lines[end]);
    const gross = rows.find((row) => /^(Kurswert|R.ckzahlungsbetrag)$/.test(row.label));
    const closing = findLine(lines, new RegExp(`^Schlusstag(?:/-Zeit)? (${DATE})`))
        ?? findLine(lines, new RegExp(`R.ckzahlungsdatum (${DATE})`))
        ?? findLine(lines, new RegExp(`mit Valuta (${DATE})`));
    const date = parseDottedDate(closing?.match[1] ?? '');
    if (!total || !gross || !date || gross.currency !== total.currency) return unsupported(title, at);
    const currency = total.currency;
    const direction = side === 'buy' ? -1 : 1;
    const fee = deductions(rows, FEE);
    const tax = deductions(rows, TAX);
    const signed = total.sign === '-' || (!total.sign && side === 'buy') ? -total.value : total.value;
    if (!reconciles([direction * gross.value, -fee, -tax], signed)) return unsupported(title, total.at);

    const invoice = findLine(lines, /^.*Rechnungsnummer (\S+)$/)?.match[1];
    const order = findLine(lines, /^Auftragsnummer (\S+)$/)?.match[1];
    const fxRate = findLine(lines, new RegExp(`^Devisenkurs \\([A-Z]{3}\\/[A-Z]{3}\\) (${NUMBER})`))?.match[1];
    const key = `dkb:${invoice || `${order || paper.isin}:${date}:${paper.quantity}`}`;
    const raw = rawOf(title, rows.filter((row) => row === gross || row === total || FEE.test(row.label) || TAX.test(row.label)));
    const entries: ImportEntry[] = [tradeEntry({
        source: SOURCE,
        externalId: key,
        orderId: order,
        date,
        side,
        isin: paper.isin,
        name: paper.name,
        quantity: paper.quantity,
        amount: roundCents(direction * gross.value),
        currency,
        fee: fee ? -fee : undefined,
        feeCurrency: currency,
        fxRate: fxRate ? parseAmount(fxRate, 'de') : undefined,
        raw
    })];
    if (tax) {
        entries.push(statementEntry({
            source: SOURCE, externalId: `${key}:tax`, orderId: order, date, type: 'Tax', kind: 'tax', amount: -tax, currency,
            description: 'Steuern', isin: paper.isin, name: paper.name, raw
        }));
    }
    const offset = taxOffset(lines, end, currency);
    if (offset === 'unreadable') return unsupported(title, lines[end]);
    if (offset) {
        entries.push(statementEntry({
            source: SOURCE, externalId: `${key}:tax-offset`, orderId: order, date: offset.date, type: 'Tax', kind: 'tax', amount: offset.value, currency,
            description: 'Steuerausgleich', isin: paper.isin, name: paper.name, raw: rawOf(title, offset.rows)
        }));
    }
    return { kind: 'booked', entries };
};

const INCOME_ROW = /^(Dividendengutschrift|Aussch.ttung|Zinsertrag|Ertrag|Ertragsgutschrift|Zinsen|Gutschrift)\b/;

/** Credit date of the booking text, else the payment date. */
const creditDate = (lines: DocLine[]) => {
    const booked = findLine(lines, new RegExp(`mit (?:Wertstellung|Valuta) (${DATE})`)) ?? findLine(lines, new RegExp(`^Zahlbarkeitstag (${DATE})`));
    return parseDottedDate(booked?.match[1] ?? '');
};

/** Dividends, fund distributions and interest: gross in account currency with its deductions. */
const income = (lines: DocLine[], title: string, interest: boolean): DocumentOutcome => {
    const paper = securityOf(lines);
    const end = finalIndex(lines);
    const date = creditDate(lines);
    if (!paper || end < 0 || !date) return unsupported(title, lines[0]);
    const start = findLine(lines, /^Nominale Wertpapierbezeichnung ISIN \(WKN\)$/)?.index ?? 0;
    const rows = rowsOf(lines, start, end + 1);
    const total = rows.find((row) => row.at === lines[end]);
    if (!total) return unsupported(title, lines[0]);
    const currency = total.currency;
    const grossRows = rows.filter((row) => row.currency === currency && row.sign === '+' && INCOME_ROW.test(row.label));
    const taxes = deductions(rows, TAX);
    const withholding = deductions(rows, WITHHOLDING);
    const fee = deductions(rows, FEE);
    const gross = roundCents(grossRows.reduce((sum, row) => sum + row.value, 0));
    if (!(gross > 0) || !reconciles([gross, -taxes, -withholding, -fee], total.value)) return unsupported(title, total.at);

    const number = findLine(lines, /^.*Abrechnungsnr\. (\S+)$/)?.match[1];
    const key = `dkb:income:${number || `${paper.isin}:${date}:${total.value}`}`;
    const raw = rawOf(title, [...grossRows, total]);
    const entry = (part: string, type: 'Dividend' | 'Interest' | 'Tax' | 'Fee', value: number, description: string, kind?: 'tax') => statementEntry({
        source: SOURCE, externalId: part ? `${key}:${part}` : key, date, type, ...(kind ? { kind } : {}), amount: value,
        currency, description, isin: paper.isin, name: paper.name, raw
    });
    const entries = [entry('', interest ? 'Interest' : 'Dividend', gross, title)];
    if (withholding) entries.push(entry('withholding', 'Tax', -withholding, 'Quellensteuer'));
    if (taxes) entries.push(entry('tax', 'Tax', -taxes, 'Einbehaltene Steuern', 'tax'));
    if (fee) entries.push(entry('fee', 'Fee', -fee, 'Gebühren'));
    return { kind: 'booked', entries };
};

const advanceTax = (lines: DocLine[], title: string): DocumentOutcome => {
    const paper = securityOf(lines);
    const end = finalIndex(lines);
    if (!paper) return unsupported(title, lines[0]);
    // Covered by the allowance: the document ends without a final amount
    if (end < 0) return rowsOf(lines, 0, lines.length).some((row) => TAX.test(row.label)) ? unsupported(title, lines[0]) : ignored(title, lines[0]);
    const rows = rowsOf(lines, 0, end + 1);
    const total = rows.find((row) => row.at === lines[end]);
    const tax = deductions(rows, TAX);
    if (!total || !reconciles([tax], total.value)) return unsupported(title, lines[end]);
    if (tax === 0) return ignored(title, lines[end]);
    const date = creditDate(lines);
    if (!date) return unsupported(title, lines[end]);
    return {
        kind: 'booked',
        entries: [statementEntry({
            source: SOURCE, externalId: `dkb:advance-tax:${paper.isin}:${date}`, date, type: 'Tax', kind: 'tax', amount: -tax, currency: total.currency,
            description: 'Vorabpauschale', isin: paper.isin, name: paper.name, raw: rawOf(title, [total])
        })]
    };
};

const PLAN_ROW = new RegExp(`^(\\S+) (${NUMBER}) (\\S+\\/\\S+) ${NUMBER} ${NUMBER} (${NUMBER}) (${DATE}) (${DATE})\\b`);

/** Half-yearly statement of a savings plan: every line is a purchase with its own order number. */
const savingsPlan = (lines: DocLine[], title: string): DocumentOutcome[] => {
    const paper = securityOf(lines);
    const invested = findLine(lines, new RegExp(`^Im Abrechnungszeitraum angelegter Betrag ([A-Z]{3}) (${NUMBER})$`));
    const plan = lines.flatMap((line) => {
        const match = PLAN_ROW.exec(line.text);
        return match ? [{ line, match }] : [];
    });
    if (!paper || !invested || plan.length === 0) return [unsupported(title, lines[0])];
    const sum = plan.reduce((total, row) => total + parseAmount(row.match[2], 'de'), 0);
    if (plan.some((row) => row.match[1] !== 'Kauf') || !reconciles([sum], parseAmount(invested.match[2], 'de'))) return [unsupported(title, lines[invested.index])];
    const currency = invested.match[1];
    return plan.map(({ line, match }) => {
        const date = parseDottedDate(match[5]);
        const quantity = parseAmount(match[4], 'de');
        if (!date || !(quantity > 0)) return unsupported(title, line);
        return {
            kind: 'booked' as const,
            entries: [tradeEntry({
                source: SOURCE, externalId: `dkb:plan:${match[3]}`, orderId: match[3], date, side: 'buy', savingsPlan: true, isin: paper.isin, name: paper.name,
                quantity, amount: -parseAmount(match[2], 'de'), currency, raw: { source: 'dkb-pdf', document: title, lines: [line.text] }
            })]
        };
    });
};

const TRADE_TITLE = /^(?:Wertpapier Abrechnung (Kauf|Kauf Direkthandel|Ausgabe|Ausgabe Investmentfonds|Verkauf|Verkauf Direkthandel|Verkauf aus Kapitalma.nahme|R.cknahme Investmentfonds)|(Gesamtk.ndigung|Teilr.ckzahlung mit Nennwert.nderung|Teilliquidation mit Nennwertreduzierung|Einl.sung bei Gesamtf.lligkeit))$/;
const INCOME_TITLE = /^(Dividendengutschrift|Zinsgutschrift|Gutschrift von Investmentertr.gen|Aussch.ttung aus Genussschein|Aussch.ttung Investmentfonds|Ertragsgutschrift nach . 27 KStG)$/;
const CANCELLED = /^(Storno zur|Stornorechnung|Stornierung)\b/;
const SKIPPED = /^((?:Ex-ante |Ex-Ante-|Ex-ante-)?(?:Kosten.*information|Kostensimulation|Kostenausweis)|Kosten und Nebenkosten|(?:Auftrags|Order|Änderungs|Streichungs)bestätigung|Basisinformationsblatt|Mitteilung .*Basisinformationsblatt).*/;
const OTHER = /^(Depotbuchung - \S+|Kapitalr.ckzahlung$|Kreditkartenabrechnung\b.*|Depotauszug\b.*|Depotaufstellung\b.*|Kontoauszug\b.*|Jahressteuerbescheinigung(?! folgt).*|Rechnungsabschluss\b.*)/;

const parseDocument = (lines: DocLine[]): DocumentOutcome[] => {
    const statement = findLine(lines, /^Kontoauszug\b.*/);
    if (statement) return [unsupported(statement.match[0], lines[statement.index])];
    const cancelled = findLine(lines, CANCELLED);
    const tradeTitle = findLine(lines, TRADE_TITLE);
    const incomeTitle = findLine(lines, INCOME_TITLE);
    const title = tradeTitle?.match[0] || incomeTitle?.match[0];
    if (cancelled) return [unsupported(`Storno ${title || ''}`.trim(), lines[cancelled.index])];
    if (tradeTitle) {
        const sell = Boolean(tradeTitle.match[2]) || /Verkauf|R.cknahme/.test(tradeTitle.match[0]);
        return [trade(lines, tradeTitle.match[0], sell ? 'sell' : 'buy')];
    }
    if (incomeTitle) return [income(lines, incomeTitle.match[0], incomeTitle.match[0] === 'Zinsgutschrift')];
    if (findLine(lines, /^Vorabpauschale Investmentfonds$/)) return [advanceTax(lines, 'Vorabpauschale Investmentfonds')];
    if (findLine(lines, /^Halbjahresabrechnung Sparplan$/)) return savingsPlan(lines, 'Halbjahresabrechnung Sparplan');
    const other = findLine(lines, OTHER);
    if (other) return [unsupported(other.match[1], lines[other.index])];
    const skipped = findLine(lines, SKIPPED);
    if (skipped) return [ignored(lines[skipped.index].text, lines[skipped.index])];
    const first = lines.find((line) => line.text.length > 3 && !/^10919 Berlin/.test(line.text));
    return [unsupported(first?.text || '?', first)];
};

const ISSUER = /Deutsche Kreditbank|\bDKB AG\b|^DKB\b|BYLADEM1001|^10919 Berlin\b/i;

const detect = (pdf: PdfDocumentText): string | null => (
    pdf.pages.slice(0, 2).flat().some((line) => ISSUER.test(line)) ? 'dkb' : null
);

const parse = (pdf: PdfDocumentText) => documentResult('dkb', SOURCE, 'dkb', parseDocument(documentLines(pdf)));

export const dkbFileImporter: PdfFileImporter = {
    id: 'dkb',
    broker: 'DKB',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: DkbPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/DkbPDFExtractor.java'
        },
        { label: 'Parqet: DKB PDF-Import', url: 'https://faq.parqet.com/de/articles/871913-dkb-pdf-import' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
