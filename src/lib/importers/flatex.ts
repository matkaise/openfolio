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

// flatex settlement PDFs (Germany and Austria), issued by flatex Bank AG, flatexDEGIRO
// Bank AG/SE and, until 2020, FinTech Group Bank AG. One document per file:
// "Wertpapierabrechnung Kauf/Verkauf", "Sammelabrechnung (Wertpapierkauf/-verkauf)" with
// several settlements, "Dividendengutschrift", "Ertragsmitteilung", "Wertpapierabrechnung
// Vorabpauschale" and "Depotservicegebühr". The documents print two columns of
// "Label : value" pairs ("Kurswert : 1.690,00 EUR"; FinTech: "Kurswert EUR 1.050,00"),
// which the PDF extraction joins into one line per baseline.
// Format knowledge from Portfolio Performance (FinTechGroupBankPDFExtractor and its test
// documents, commit 85c2088); no code taken over. Order confirmations are not settlements.

const SOURCE = 'flatex';
const NUMBER = String.raw`-?\d[\d.]*,\d+`;

const escape = (label: string) => label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Value of a "Label : 1,23 EUR" or "Label EUR 1,23" pair anywhere in the lines; label is a regex source. */
const field = (lines: DocLine[], label: string, from = 0, to = lines.length): { value: number; currency: string; at: DocLine } | null => {
    const pattern = new RegExp(`(?:^|\\s)\\**(?:${label})\\s*:?\\s*(?:(${NUMBER})\\s*([A-Z]{3})\\b|([A-Z]{3})\\s+(${NUMBER}))`);
    const found = findLine(lines, pattern, from, to);
    if (!found) return null;
    const [, amountFirst, currencyAfter, currencyFirst, amountAfter] = found.match;
    const value = parseAmount(amountFirst ?? amountAfter, 'de');
    return Number.isFinite(value) ? { value, currency: currencyAfter ?? currencyFirst, at: lines[found.index] } : null;
};

const dateField = (lines: DocLine[], label: string, from = 0, to = lines.length): string | null => {
    const found = findLine(lines, new RegExp(`(?:${label})\\s*:?\\s*(\\d{2}\\.\\d{2}\\.\\d{4})`), from, to);
    return found ? parseDottedDate(found.match[1]) : null;
};

/** "Transaktion-Nr.: 1225591278." — the number may wrap onto the next line. */
const transactionNumber = (lines: DocLine[], from: number, to: number): string | null => {
    const found = findLine(lines, /Transaktion-Nr\.\s*:?\s*(\d+)?/, from, to);
    if (!found) return null;
    return found.match[1] || /^(\d+)/.exec(lines[found.index + 1]?.text || '')?.[1] || null;
};

const SECURITY = /^(.*?)\s*\(([A-Z]{2}[A-Z0-9]{9}\d)\/(\w+)\)$/;

/** Name and ISIN after "Nr.123/1 Kauf"; the name can wrap onto the next line. */
const security = (lines: DocLine[], index: number, rest: string): { name: string; isin: string } | null => {
    const own = SECURITY.exec(rest.trim());
    if (own) return { name: own[1], isin: own[2] };
    const joined = SECURITY.exec(`${rest.trim()} ${lines[index + 1]?.text || ''}`.trim());
    return joined ? { name: joined[1], isin: joined[2] } : null;
};

const amount = (lines: DocLine[], label: string, from: number, to: number) => field(lines, label, from, to)?.value ?? 0;

const rawOf = (variant: string, document: string, lines: DocLine[]) => ({ source: 'flatex-pdf', variant, document, lines: lines.map((line) => line.text) });

// ---------------------------------------------------------------------------

const TRADE_START = /^Nr\.(\d+\/\d+)\s+(Kauf|Verkauf)\s+(.*)$/;

/** One settlement of a Wertpapierabrechnung or of a Sammelabrechnung, lines [from, to). */
const settlement = (lines: DocLine[], from: number, to: number, variant: string, title: string, headerDate: string | null): DocumentOutcome => {
    const start = TRADE_START.exec(lines[from].text)!;
    const [, order, verb, rest] = start;
    const label = `${title}: ${verb}`;
    const paper = security(lines, from, rest);
    if (!paper) return unsupported(label, lines[from]);
    const executed = findLine(lines, /(?:Ausgeführt|davon ausgef\.)\s*:?\s*(\d[\d.]*(?:,\d+)?)\s+(St\.|[A-Z]{3})/, from, to);
    // Bonds are settled by nominal value with accrued interest; not booked here
    if (!executed || executed.match[2] !== 'St.' || findLine(lines, /\bKurs\s*:?\s*[\d.,]+\s*%/, from, to) || amount(lines, 'Zinsbetrag', from, to)) {
        return unsupported(label, lines[from]);
    }
    const gross = field(lines, 'Kurswert', from, to);
    const total = field(lines, 'Endbetrag', from, to);
    if (!gross || !total || total.currency !== gross.currency) return unsupported(label, lines[from]);
    const currency = gross.currency;
    const fees = ['Provision', 'Eigene Spesen', 'Fremde Spesen'].map((name) => field(lines, escape(name), from, to));
    const tax = field(lines, 'Einbeh\\. ?(?:Steuer|KESt)', from, to);
    if ([...fees, tax].some((item) => item && item.currency !== currency)) return unsupported(label, lines[from]);
    const fee = roundCents(fees.reduce((sum, item) => sum + (item?.value ?? 0), 0));
    const taxValue = tax?.value ?? 0; // negative = refund
    const side = verb === 'Verkauf' ? 'sell' : 'buy';
    const direction = side === 'buy' ? -1 : 1;
    if (!reconciles([direction * gross.value, -fee, -taxValue], total.value)) return unsupported(label, total.at);

    const date = dateField(lines, 'Schlusstag|Handelstag', from, to) || headerDate;
    const quantity = parseAmount(executed.match[1], 'de');
    if (!date || !(quantity > 0)) return unsupported(label, lines[from]);
    const fxLine = findLine(lines, /Devisenkurs\s*:?\s*(\d+,\d+)/, from, to);
    const fxRate = fxLine ? parseAmount(fxLine.match[1], 'de') : undefined;
    const transaction = transactionNumber(lines, from, to);
    const key = `flatex:${order}${transaction ? `:${transaction}` : ''}`;
    const raw = rawOf(variant, title, lines.slice(from, Math.min(to, from + 14)).filter((line) => !/Depot|Konto Nr/.test(line.text)));
    const entries: ImportEntry[] = [tradeEntry({
        source: SOURCE,
        externalId: key,
        orderId: order,
        date,
        side,
        isin: paper.isin,
        name: paper.name,
        quantity,
        amount: roundCents(direction * gross.value),
        currency,
        fee: fee ? -fee : undefined,
        feeCurrency: currency,
        fxRate: fxRate && fxRate !== 1 ? fxRate : undefined,
        raw
    })];
    if (taxValue) {
        entries.push(statementEntry({
            source: SOURCE, externalId: `${key}:tax`, orderId: order, date, type: 'Tax', kind: 'tax', amount: -taxValue, currency,
            description: tax!.at.text.includes('KESt') ? 'KESt' : 'Einbehaltene Steuer', isin: paper.isin, name: paper.name, raw
        }));
    }
    return { kind: 'booked', entries };
};

const trades = (lines: DocLine[], variant: string, title: string): DocumentOutcome[] => {
    const starts = lines.map((line, index) => (TRADE_START.test(line.text) ? index : -1)).filter((index) => index >= 0);
    if (starts.length === 0) return [unsupported(title, lines[0])];
    const headerDate = dateField(lines, 'Schlusstag|Handelstag', 0, starts[0]);
    return starts.map((from, position) => settlement(lines, from, starts[position + 1] ?? lines.length, variant, title, headerDate));
};

/** Dividendengutschrift / Ertragsmitteilung: payout in the security's currency, credited in the account currency. */
const dividend = (lines: DocLine[], variant: string, title: string): DocumentOutcome => {
    const head = findLine(lines, /^Nr\.(\d+)\s+(.*)$/);
    const paper = head ? security(lines, head.index, head.match[2]) : null;
    const total = field(lines, 'Endbetrag');
    const gross = field(lines, 'Brutto(?:dividende|ausschüttung|ertrag)');
    const accumulated = field(lines, 'Bruttothesaurierung');
    const tax = field(lines, 'Einbeh\\. ?(?:Steuer|KESt)');
    const date = dateField(lines, 'Valuta') || dateField(lines, 'Zahlungstag|Zuflusstag');
    if (!head || !paper || !total || !date) return unsupported(title, lines[0]);
    const taxValue = tax?.value ?? 0;
    if (tax && tax.currency !== total.currency) return unsupported(title, tax.at);
    const key = `flatex:income:${head.match[1]}:${transactionNumber(lines, head.index, lines.length) || date}`;
    const raw = rawOf(variant, title, lines.slice(head.index, head.index + 12).filter((line) => !/Konto Nr|Depot/.test(line.text)));
    const entry = (part: string, type: 'Dividend' | 'Tax' | 'Fee', value: number, description: string, kind?: 'tax') => statementEntry({
        source: SOURCE, externalId: part ? `${key}:${part}` : key, date, type, ...(kind ? { kind } : {}), amount: value,
        currency: total.currency, description, isin: paper.isin, name: paper.name, raw
    });

    // Accumulating fund: no payout, only the tax on the deemed distribution
    if (!gross && accumulated) {
        if (!reconciles([-taxValue], total.value)) return unsupported(title, total.at);
        return taxValue ? { kind: 'booked', entries: [entry('', 'Tax', -taxValue, title, 'tax')] } : ignored(title, total.at);
    }
    if (!gross || gross.value <= 0) return unsupported(title, lines[head.index]);

    // Withholding tax and fees in the security's currency are converted with the stated rate
    const fxLine = findLine(lines, /Devisenkurs\s*:?\s*(\d+,\d+)/);
    const fx = gross.currency === total.currency ? 1 : (fxLine ? parseAmount(fxLine.match[1], 'de') : Number.NaN);
    if (!(fx > 0)) return unsupported(title, lines[head.index]);
    const inAccount = (item: { value: number; currency: string } | null) => {
        if (!item) return 0;
        if (item.currency === total.currency) return item.value;
        return item.currency === gross.currency ? roundCents(item.value / fx) : Number.NaN;
    };
    const withholding = inAccount(field(lines, 'Gez\\. Quellenst\\.'));
    const fee = inAccount(field(lines, 'Gesamtgebühr'));
    if (!Number.isFinite(withholding) || !Number.isFinite(fee)) return unsupported(title, lines[head.index]);
    // Gross in account currency as the rest of the credit, checked against the converted gross
    const grossInAccount = roundCents(total.value + withholding + fee + taxValue);
    if (Math.abs(grossInAccount - gross.value / fx) > 0.02) return unsupported(title, total.at);

    const entries = [entry('', 'Dividend', grossInAccount, title)];
    if (withholding) entries.push(entry('withholding', 'Tax', -withholding, 'Quellensteuer'));
    if (taxValue) entries.push(entry('tax', 'Tax', -taxValue, 'Einbehaltene Steuer'));
    if (fee) entries.push(entry('fee', 'Fee', -fee, 'Gebühren'));
    return { kind: 'booked', entries };
};

const advanceTax = (lines: DocLine[], variant: string, title: string): DocumentOutcome => {
    const fund = findLine(lines, /^(.+?)\s+([A-Z]{2}[A-Z0-9]{9}\d)\/\w+$/);
    const tax = field(lines, 'Einbeh\\. ?(?:Steuer|KESt)');
    const date = dateField(lines, 'Buchungsdatum') || dateField(lines, 'Zuflussdatum');
    if (!fund || !tax || !date) return unsupported(title, lines[0]);
    if (tax.value === 0) return ignored(title, tax.at); // covered by the allowance
    return {
        kind: 'booked',
        entries: [statementEntry({
            source: SOURCE, externalId: `flatex:advance-tax:${fund.match[2]}:${date}:${transactionNumber(lines, 0, lines.length) || ''}`,
            date, type: 'Tax', kind: 'tax', amount: -tax.value, currency: tax.currency, description: 'Vorabpauschale',
            isin: fund.match[2], name: fund.match[1], raw: rawOf(variant, title, [tax.at])
        })]
    };
};

/** Fee of the foreign custodian, charged per position ("in Höhe von 0.18 EUR"). */
const custodyFee = (lines: DocLine[], variant: string, title: string, isin: string): DocumentOutcome => {
    const amountLine = findLine(lines, /in Höhe von (\d+(?:[.,]\d+)?) ([A-Z]{3})/);
    const valuta = findLine(lines, /per Valuta (\d{2}\.\d{2}\.\d{4})/);
    const date = valuta ? parseDottedDate(valuta.match[1]) : null;
    const value = amountLine ? Number(amountLine.match[1].replace(',', '.')) : Number.NaN;
    if (!amountLine || !date || !Number.isFinite(value)) return unsupported(title, lines[0]);
    const name = findLine(lines, new RegExp(`^\\w+\\s+${isin}\\s+(.+?)\\s+[\\d.,]+$`))?.match[1];
    return {
        kind: 'booked',
        entries: [statementEntry({
            source: SOURCE, externalId: `flatex:custody-fee:${isin}:${valuta!.match[1]}:${amountLine.match[1]}`, date, type: 'Fee',
            amount: -value, currency: amountLine.match[2], description: 'Depotservicegebühr', isin, name,
            raw: rawOf(variant, title, [lines[amountLine.index]])
        })]
    };
};

const TITLE = /^(Stornierung |Storno )?(Wertpapierabrechnung (?:Kauf|Verkauf)(?: Fonds(?:\/Zertifikate)?)?|Sammelabrechnung \(Wertpapierkauf\/-verkauf\)|Sammelabrechnung \(Kauf\/-verkauf Kryptowerte\)|Sammelabrechnung - Devisengeschäfte -|Dividendengutschrift(?: für (?:in|aus)ländische Wertpapiere)?|Ertragsmitteilung - .+|Wertpapierabrechnung Vorabpauschale|Depotservicegebühr ([A-Z]{2}[A-Z0-9]{9}\d)|Kontoauszug|Rechnungsabschluss|Stockdividende|Gutschrifts- ?\/ ?Belastungsanzeige|Depotausgang|Depoteingang|Bestandsausbuchung|Spitzenregulierung|Kapitalerhöhung|Kapitalherabsetzung|Fusion|Wertpapiertausch|Stamp Duty aus Dividenden-Reinvestment|Auftragsbestätigung|Orderbestätigung|Ordereingangsbestätigung|Streichungsbestätigung|Änderungsbestätigung|Kosteninformation|Ex-ante-Kosteninformation)(?![\wäöüß])/;

const parseDocument = (lines: DocLine[], variant: string): DocumentOutcome[] => {
    const titleLine = findLine(lines, TITLE);
    if (!titleLine) return [unsupported(lines.find((line) => line.text.length > 3)?.text || '?', lines[0])];
    const at = lines[titleLine.index];
    const [, cancel, kindOfDocument, custodyIsin] = titleLine.match;
    const title = `${cancel || ''}${kindOfDocument}`;
    if (cancel) return [unsupported(title, at)];
    if (/^(Wertpapierabrechnung (Kauf|Verkauf)|Sammelabrechnung \(Wertpapierkauf)/.test(kindOfDocument)) return trades(lines, variant, title);
    if (/^(Dividendengutschrift|Ertragsmitteilung)/.test(kindOfDocument)) return [dividend(lines, variant, title)];
    if (kindOfDocument === 'Wertpapierabrechnung Vorabpauschale') return [advanceTax(lines, variant, title)];
    if (custodyIsin) return [custodyFee(lines, variant, 'Depotservicegebühr', custodyIsin)];
    if (/bestätigung|Kosteninformation/.test(kindOfDocument)) return [ignored(title, at)];
    return [unsupported(title, at)];
};

const ISSUERS = /\b(flatex Bank AG|(?:ﬂ|fl)atexDEGIRO Bank (?:AG|SE)|FinTech Group Bank AG)\b/;

const detect = (pdf: PdfDocumentText): string | null => {
    const lines = pdf.pages.slice(0, 2).flat();
    const issuer = lines.map((line) => ISSUERS.exec(line)?.[1]).find(Boolean);
    if (!issuer) return null;
    // DEGIRO documents of the same bank have their own format
    if (lines.some((line) => /\bDEGIRO B\.V\.|Dutch Branch|degiro\.(nl|de|com)\b/i.test(line))) return null;
    return issuer === 'FinTech Group Bank AG' ? 'fintech' : 'flatex';
};

const parse = (pdf: PdfDocumentText) => {
    const variant = detect(pdf) || 'flatex';
    return documentResult('flatex', SOURCE, variant, parseDocument(documentLines(pdf), variant));
};

export const flatexFileImporter: PdfFileImporter = {
    id: 'flatex',
    broker: 'flatex',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: FinTechGroupBankPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/85c2088f28dfb26e711edf20494dca3e64ae9858/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/FinTechGroupBankPDFExtractor.java'
        },
        { label: 'Parqet: flatex PDF-Import', url: 'https://faq.parqet.com/de/articles/871917-flatex-pdf-import' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
