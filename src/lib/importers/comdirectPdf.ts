import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { COMDIRECT_PDF_ID } from './comdirectOverlap';
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

// comdirect PDFs from the PostBox, in addition to the REST API (comdirect.ts). The bank
// issues two documents per transaction, as two PDFs or one:
// - the Wertpapierabrechnung with price and fees, up to the amount "vor Steuern";
// - the Steuermitteilung ("Steuerliche Behandlung: ...") with taxes and the amount "nach
//   Steuern", which is what the account is charged. Its text is letter-spaced ("Z u I h r e n").
// Trades therefore come from the Wertpapierabrechnung, their tax from the Steuermitteilung.
// Dividends come only from the Steuermitteilung: unlike the Dividendengutschrift it states
// what reached the account, and booking one document per dividend rules out a double booking.
// A Gutschrift is skipped with a hint, unless it predates the Steuermitteilung (no "vor Steuern").
// A notice of the bank that only announces the settlement is no settlement either.
// Format knowledge from Portfolio Performance (ComdirectPDFExtractor and its test documents,
// commit de1e464); no code taken over.

const SOURCE = 'comdirect';
const NUMBER = String.raw`\d[\d.]*(?:,\d+)?`;
const ISIN = String.raw`[A-Z]{2}[A-Z0-9]{9}\d`;
const DATE = String.raw`\d{2}\.\d{2}\.\d{4}`;

/** A line without blanks, which undoes the letter spacing; "_" fills the columns of sum lines. */
const squeeze = (text: string) => text.replace(/[\s_]+/g, '');

const squeezedLines = (lines: DocLine[]): DocLine[] => lines.map((line) => ({ ...line, text: squeeze(line.text) }));

const rawOf = (document: string, at: DocLine[]) => ({ source: 'comdirect-pdf', document, lines: at.map((line) => line.text) });

// ---------------------------------------------------------------------------
// Wertpapierabrechnung

type Row = { label: string; currency: string; value: number };

const ROW = new RegExp(`^(.+?)\\s*:?\\s+([A-Z]{3})\\s+(${NUMBER})(-)?$`);

/** "Provision : EUR 9,90-": the amount with the trailing minus as sign. */
const rowsOf = (lines: DocLine[]): Row[] => lines.flatMap((line) => {
    const match = ROW.exec(line.text);
    if (!match) return [];
    const value = parseAmount(match[3], 'de');
    return Number.isFinite(value) ? [{ label: match[1], currency: match[2], value: match[4] ? -value : value }] : [];
});

const FEE = /^(?:(?:\d+,\d+% )?Maklercourtage|Provision|Gesamtprovision|B.rsenplatzabh.ng\. Entgelt|Abwickl\.entgelt Clearstream|Umschreibeentgelt|Variable B.rsenspesen|Fremde Spesen|Transaktionssteuer|Handelsplatzentgelt)$/;
const DISCOUNT = /Reduktion Kaufaufschlag$/;

const SETTLED = /^(?:IBAN|Verrechnung .ber Konto|Gutschrift auf Konto).*\bValuta\s+Zu Ihren (Lasten|Gunsten)( vor Steuern)?$/;
const SETTLED_ROW = new RegExp(`(${DATE})\\s+([A-Z]{3})\\s+(${NUMBER})(-)?$`);

/** The booked amount below "Valuta  Zu Ihren Lasten"; its sign comes from the heading. */
const settledAmount = (lines: DocLine[]) => {
    const heading = findLine(lines, SETTLED);
    const row = heading ? SETTLED_ROW.exec(lines[heading.index + 1]?.text || '') : null;
    if (!heading || !row) return null;
    const value = parseAmount(row[3], 'de');
    return {
        value: heading.match[1] === 'Lasten' ? -value : value,
        currency: row[2],
        valuta: parseDottedDate(row[1]),
        beforeTaxes: Boolean(heading.match[2]),
        at: lines[heading.index + 1]
    };
};

/** Name and ISIN from the two lines below "Wertpapier-Bezeichnung  WPKNR/ISIN". */
const tradeSecurity = (lines: DocLine[]) => {
    const heading = findLine(lines, /^Wertpapier-Bezeichnung\s+WPKNR\/ISIN/);
    if (!heading) return null;
    const first = /^(.*\S)\s+\w{6}$/.exec(lines[heading.index + 1]?.text || '');
    const second = new RegExp(`^(.*?)\\s*(${ISIN})$`).exec(lines[heading.index + 2]?.text || '');
    return second ? { isin: second[2], name: [first?.[1], second[1]].filter(Boolean).join(' ') } : null;
};

const trade = (lines: DocLine[], from: number, to: number, title: string, side: 'buy' | 'sell'): DocumentOutcome => {
    const part = lines.slice(from, to);
    const at = lines[from];
    const paper = tradeSecurity(part);
    const total = settledAmount(part);
    const dateLine = findLine(part, new RegExp(`Gesch.ftstag\\s*:\\s*(${DATE})`));
    const date = parseDottedDate(dateLine?.match[1] ?? '');
    // Bonds are quoted by nominal value in percent; the summary line wins over partial executions
    const pieces = findLine(part, new RegExp(`^(?:Summe\\s+)?St\\.\\s+(${NUMBER})\\b`));
    const quantity = pieces ? parseAmount(pieces.match[1], 'de') : Number.NaN;
    if (!paper || !total || !date || !(quantity > 0) || findLine(part, /^St.ckzinsen|Zinsvaluta/)) return unsupported(title, at);

    const rows = rowsOf(part);
    const currency = total.currency;
    const direction = side === 'buy' ? -1 : 1;
    const gross = rows.find((row) => /^(?:Gesamtk|K)urswert$/.test(row.label));
    const summary = findLine(part, new RegExp(`^Summe\\s+St\\.\\s+${NUMBER}\\s+[A-Z]{3}\\s+${NUMBER}\\s+([A-Z]{3})\\s+(${NUMBER})$`));
    const grossValue = gross ?? (summary ? { currency: summary.match[1], value: parseAmount(summary.match[2], 'de') } : null);
    // Fixed-price fund sales print only unit price and rate; the booked amount must follow from them
    const fixedPrice = findLine(part, new RegExp(`^St\\.\\s+${NUMBER}\\s+[A-Z]{3}\\s+(${NUMBER})$`));
    const plainRate = findLine(part, new RegExp(`^Umrechn(?:ung|\\.) zum Dev(?:isenkurs|\\. kurs) (${NUMBER})(?: vom ${DATE})?$`));
    if (!grossValue && fixedPrice && plainRate) {
        const expected = quantity * parseAmount(fixedPrice.match[1], 'de') / parseAmount(plainRate.match[1], 'de');
        if (Math.abs(expected - Math.abs(total.value)) > 0.02) return unsupported(title, total.at);
    } else if (!grossValue) {
        return unsupported(title, at);
    }

    // A foreign settlement converts the amount with all costs in that currency into the account currency
    const conversion = findLine(part, new RegExp(`^Umrechn(?:ung|\\.) zum Dev(?:isenkurs|\\. kurs) (${NUMBER})(?: vom ${DATE})? : ([A-Z]{3}) (${NUMBER})(-)?$`));
    const inAccount = rows.filter((row) => row.currency === currency);
    const fee = roundCents(inAccount.filter((row) => FEE.test(row.label)).reduce((sum, row) => sum + Math.abs(row.value), 0));
    const discount = rows.find((row) => DISCOUNT.test(row.label) && row.currency === currency);
    if (conversion ? conversion.match[2] !== currency : grossValue && grossValue.currency !== currency) return unsupported(title, at);
    const value = (() => {
        if (conversion) return parseAmount(conversion.match[3], 'de') * (conversion.match[4] ? -1 : 1);
        return grossValue ? roundCents(grossValue.value + (discount?.value ?? 0)) : Math.abs(total.value);
    })();
    if (!(value > 0) || !reconciles([direction * value, -fee], total.value)) return unsupported(title, total.at);

    const invoice = findLine(part, /Rechnungsnummer\s*:\s*(\S+)/)?.match[1];
    const order = findLine(part, /Ordernummer\s*:\s*(\S+)/)?.match[1];
    const rate = conversion?.match[1] ?? plainRate?.match[1];
    const fxRate = rate ? parseAmount(rate, 'de') : undefined;
    const entries: ImportEntry[] = [tradeEntry({
        source: SOURCE,
        externalId: `${COMDIRECT_PDF_ID}${invoice || `${paper.isin}:${date}:${quantity}`}`,
        orderId: order,
        date,
        side,
        isin: paper.isin,
        name: paper.name,
        quantity,
        amount: roundCents(direction * value),
        currency,
        fee: fee ? -fee : undefined,
        feeCurrency: currency,
        fxRate: fxRate && fxRate !== 1 ? fxRate : undefined,
        raw: rawOf(title, part.filter((line) => ROW.test(line.text) && line !== total.at))
    })];
    return { kind: 'booked', entries };
};

// ---------------------------------------------------------------------------
// Steuermitteilung

const moneyOf = (squeezed: DocLine[], label: string) => {
    const found = findLine(squeezed, new RegExp(`^(?:${label}):?([A-Z]{3})(-?)(${NUMBER})$`));
    if (!found) return null;
    const value = parseAmount(found.match[3], 'de');
    return Number.isFinite(value) ? { value: found.match[2] ? -value : value, currency: found.match[1], at: squeezed[found.index] } : null;
};

const dividendKinds = /^(?:Ausl.ndische|Inl.ndische) (?:Dividende|Investment-Aussch.ttung)/;
const tradeKinds = /^(?:Wertpapierkauf|Wertpapierverkauf|Verkauf Investmentfonds)/;

/** One Steuermitteilung, lines [from, to). A notice that settles a trade only adds its tax. */
const taxNotice = (lines: DocLine[], from: number, to: number, kind: string): DocumentOutcome => {
    const part = lines.slice(from, to);
    const squeezed = squeezedLines(part);
    const title = `Steuerliche Behandlung: ${kind}`;
    const at = lines[from];
    const paper = new RegExp(`WKN\\/ISIN:\\w+\\/(${ISIN})`).exec(squeezed.map((line) => line.text).join(' '));
    const named = /^Stk\.\s+-?[\d.,]+\s+(.*?)\s*,\s*WKN/.exec(part.find((line) => /^Stk\./.test(line.text))?.text || '');
    const before = moneyOf(squeezed, 'ZuIhren(?:Gunsten|Lasten)vorSteuern');
    const after = moneyOf(squeezed, 'ZuIhren(?:Gunsten|Lasten)nachSteuern');
    const taxes = moneyOf(squeezed, 'abgef.hrteSteuern|erstatteteSteuern');
    const valuta = findLine(squeezed, new RegExp(`mitValuta(${DATE})`));
    const date = parseDottedDate(valuta?.match[1] ?? '');
    const taxOnly = tradeKinds.test(kind) || /^Vorabpauschale/.test(kind);
    if (!paper || !before || !after || !taxes || before.currency !== after.currency) return unsupported(title, at);
    if (!reconciles([before.value, taxes.value], after.value)) return unsupported(title, at);
    if (taxOnly && taxes.value === 0) return ignored(title, at);
    if (!date) return unsupported(title, at);
    const isin = paper[1];
    const name = named?.[1];
    const currency = after.currency;
    const reference = findLine(squeezed, /^(?:.*)Referenz-Nummer:(\w+)$/)?.match[1];
    const key = `${COMDIRECT_PDF_ID}${reference || `${isin}:${date}`}`;
    const raw = rawOf(title, squeezed.filter((line) => /Steuern|ISIN/.test(line.text)));
    const entry = (part_: string, type: 'Dividend' | 'Tax', value: number, description: string, kind_?: 'tax') => statementEntry({
        source: SOURCE, externalId: part_ ? `${key}:${part_}` : key, date, type, ...(kind_ ? { kind: kind_ } : {}), amount: value,
        currency, description, isin, name, raw
    });

    if (taxOnly) return { kind: 'booked', entries: [entry('tax', 'Tax', taxes.value, tradeKinds.test(kind) ? 'Steuern' : 'Vorabpauschale', 'tax')] };
    if (!dividendKinds.test(kind) || before.value <= 0) return unsupported(title, at);

    // The amount before taxes is net of foreign withholding tax; its credited part makes the gross
    const credited = findLine(squeezed, new RegExp(`angerechneteausl.ndischeQuellensteuer:([A-Z]{3})(${NUMBER})`));
    const withholding = credited && credited.match[1] === currency ? parseAmount(credited.match[2], 'de') : 0;
    const dividend = entry('', 'Dividend', roundCents(before.value + withholding), title.replace('Steuerliche Behandlung: ', ''));
    const entries: ImportEntry[] = [{ ...dividend, raw: { ...raw, net: after.value } }];
    if (withholding) entries.push(entry('withholding', 'Tax', -withholding, 'Quellensteuer'));
    if (taxes.value) entries.push(entry('tax', 'Tax', taxes.value, 'Steuern', 'tax'));
    return { kind: 'booked', entries };
};

// ---------------------------------------------------------------------------
// Dividend credits

/** Before 2009 there is no Steuermitteilung: the credit itself states the taxes and the final amount. */
const finalCredit = (lines: DocLine[], title: string): DocumentOutcome => {
    const at = lines[0];
    const total = settledAmount(lines);
    const start = findLine(lines, /^Abrechnung (?:Dividenden|Ertrags|Zins)gutschrift$/);
    const paper = new RegExp(`(${ISIN})$`).exec(squeezedLines(lines).map((line) => line.text).find((text) => new RegExp(`^STK.*${ISIN}$`).test(text)) || '');
    if (!total || !total.valuta || !start || !paper) return unsupported(title, at);
    const part = lines.slice(start.index, lines.indexOf(total.at));
    const gross = /^Bruttobetrag:\s+([A-Z]{3})\s+([\d.,]+)$/.exec(part[1]?.text || '');
    if (!gross || gross[1] !== total.currency) return unsupported(title, at);
    const grossValue = parseAmount(gross[2], 'de');
    const deduction = (pattern: RegExp) => roundCents(part
        .filter((line) => pattern.test(line.text))
        .reduce((sum, line) => sum + parseAmount(/([\d.,]+)\s*-$/.exec(line.text)?.[1] ?? '', 'de'), 0));
    const withholding = deduction(/Quellensteuer/);
    const taxes = deduction(/Kapitalertragsteuer|Solidarit.tszuschl/);
    if (!reconciles([grossValue, -withholding, -taxes], total.value)) return unsupported(title, total.at);
    const key = `${COMDIRECT_PDF_ID}income:${paper[1]}:${total.valuta}:${total.value}`;
    const entry = (part_: string, type: 'Dividend' | 'Tax', value: number, description: string, kind?: 'tax') => statementEntry({
        source: SOURCE, externalId: part_ ? `${key}:${part_}` : key, date: total.valuta!, type, ...(kind ? { kind } : {}), amount: value,
        currency: total.currency, description, isin: paper[1], raw: rawOf(title, part)
    });
    const dividend = entry('', 'Dividend', grossValue, title);
    const entries: ImportEntry[] = [{ ...dividend, raw: { ...rawOf(title, part), net: total.value } }];
    if (withholding) entries.push(entry('withholding', 'Tax', -withholding, 'Quellensteuer'));
    if (taxes) entries.push(entry('tax', 'Tax', -taxes, 'Steuern', 'tax'));
    return { kind: 'booked', entries };
};

const credit = (lines: DocLine[], titleLine: DocLine): DocumentOutcome => {
    const title = titleLine.text;
    if (/KEINEBARAUSSCH.TTUNG/.test(squeezedLines(lines).map((line) => line.text).join(' '))) return ignored(title, titleLine);
    return settledAmount(lines)?.beforeTaxes ? ignored(`${title} (gebucht wird die Steuermitteilung)`, titleLine) : finalCredit(lines, title);
};

// ---------------------------------------------------------------------------

const TRADE_TITLE = /^(?:\* ?)?(Wertpapierkauf|Wertpapierverkauf)\b/;
const CONFIRMATION = /^Entsprechend Ihrem Auftrag haben wir f.r Sie folgendes Gesch.ft ausgef.hrt/;
const TAX_TITLE = /^SteuerlicheBehandlung:(.+?)(?:Nr\.\w*)?vom\d{2}\.\d{2}\.\d{4}/;
const CREDIT_TITLE = /^(Dividendengutschrift|Ertragsgutschrift|Zinsgutschrift|Ertragsthesaurierung)\b/;
const OTHER_TITLE = /^(Wertpapierumtausch\b|Finanzreport\b.*|Abrechnung Verwahrentgelt\b|Kontoauszug\b.*|Depotauszug\b.*|Jahressteuerbescheinigung(?! folgt).*)/;
const SKIPPED_TITLE = /^(?:Ex-ante-|Ex-Ante-)?(?:Kosteninformation|Kostenausweis|(?:Auftrags|Order|Änderungs|Streichungs)bestätigung)\b.*/;

/** Readable kind of a notice from its squeezed title: "AusländischeDividende" → "Ausländische Dividende". */
const spaced = (kind: string) => kind.replace(/([a-zäöüß])([A-Z])/g, '$1 $2');

const parseDocument = (lines: DocLine[]): DocumentOutcome[] => {
    const squeezed = squeezedLines(lines);
    const notices = squeezed.flatMap((line, index) => {
        const match = TAX_TITLE.exec(line.text);
        return match ? [{ index, kind: spaced(match[1]) }] : [];
    });
    const firstNotice = notices[0]?.index ?? lines.length;
    const outcomes: DocumentOutcome[] = notices.map((notice, position) => (
        taxNotice(lines, notice.index, notices[position + 1]?.index ?? lines.length, notice.kind)
    ));

    const settlementLines = lines.slice(0, firstNotice);
    // Announces the settlement that follows ("Die Abrechnung lassen wir ... folgen")
    if (findLine(settlementLines, CONFIRMATION)) return [ignored('Ausführungsbestätigung', settlementLines[0])];
    const tradeTitle = findLine(settlementLines, TRADE_TITLE);
    if (tradeTitle) {
        const title = tradeTitle.match[1];
        outcomes.unshift(trade(settlementLines, tradeTitle.index, settlementLines.length, title, title === 'Wertpapierkauf' ? 'buy' : 'sell'));
        return outcomes;
    }
    const creditTitle = findLine(settlementLines, CREDIT_TITLE);
    if (creditTitle) {
        outcomes.unshift(credit(settlementLines, settlementLines[creditTitle.index]));
        return outcomes;
    }
    if (notices.length > 0) return outcomes;
    const other = findLine(lines, OTHER_TITLE);
    if (other) return [unsupported(other.match[1].trim(), lines[other.index])];
    const skipped = findLine(lines, SKIPPED_TITLE);
    if (skipped) return [ignored(lines[skipped.index].text, lines[skipped.index])];
    const first = lines.find((line) => line.text.length > 3);
    return [unsupported(first?.text || '?', first)];
};

const detect = (pdf: PdfDocumentText): string | null => (
    pdf.pages.slice(0, 2).flat().some((line) => /comdirect/i.test(squeeze(line))) ? 'comdirect' : null
);

const parse = (pdf: PdfDocumentText) => documentResult('comdirect', SOURCE, 'comdirect', parseDocument(documentLines(pdf)));

export const comdirectFileImporter: PdfFileImporter = {
    id: 'comdirect',
    broker: 'comdirect',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: ComdirectPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/ComdirectPDFExtractor.java'
        },
        { label: 'Parqet: comdirect PDF-Import', url: 'https://faq.parqet.com/de/articles/651189-comdirect-pdf-import' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
