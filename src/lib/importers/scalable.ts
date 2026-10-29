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
    type DecimalStyle,
    type DocLine,
    type DocumentOutcome
} from './pdfDocument';

// Scalable Capital settlement PDFs, one document per file, in two generations:
// - `de` / `en`: documents of Scalable Capital GmbH / Scalable Capital Bank GmbH (own
//   custody since the end of 2024): "Wertpapierabrechnung" / "Contract note",
//   "Dividende" / "Dividend", "Vorabpauschale", "Steuerneuberechnung".
// - `baader`: the earlier documents issued by Baader Bank for Scalable clients (broker
//   and wealth management, until 2024): "Wertpapierabrechnung: Kauf/Verkauf",
//   "Fondsausschüttung", "Dividendenabrechnung", "Ausschüttung", "Dividende".
// Format knowledge from Portfolio Performance (ScalableCapitalPDFExtractor and
// BaaderBankPDFExtractor with their test documents, commit 85c2088); no code taken over.
// Every booked document must add up: gross ± fees ± taxes = the amount it settles.

const SOURCE = 'Scalable Capital';
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const AMOUNT = String.raw`[+-]?\d[\d.,]*`;

type Kind = 'fee' | 'tax' | 'withholding';

/** Booking lines between the security and the total; anything not listed here stops the import of the document. */
const ITEM_KINDS: [RegExp, Kind][] = [
    [/^(Ordergebühren|Order fees|Fremdkostenzuschlag|Third[- ]party costs)$/i, 'fee'],
    [/^(Ausländische Quellensteuer|Quellensteuer|Withholding tax|Foreign withholding tax|[A-Z]{2}-Quellensteuer)$/i, 'withholding'],
    [/^(Steuern|Taxes|Kapitalertrags?steuer|Solidaritätszuschlag|Kirchensteuer|Finanztransaktionssteuer|Financial transaction taxes?|Capital gains tax|Solidarity surcharge|Church tax|Verrechnung anrechenbarer Quellensteuer)$/i, 'tax']
];
const itemKind = (label: string): Kind | null => ITEM_KINDS.find(([pattern]) => pattern.test(label))?.[1] ?? null;

interface Item {
    label: string;
    kind: Kind;
    cash: number; // signed effect on the account
    line: string;
}

/**
 * Reads booking lines ("Ordergebühren +0,99 EUR") from `from` up to the total line.
 * `direction` turns the printed sign into the cash effect: -1 where the total is a debit.
 */
const readItems = (
    lines: DocLine[],
    from: number,
    to: number,
    style: DecimalStyle,
    currency: string,
    direction: 1 | -1,
    pattern = new RegExp(`^(.+?) (${AMOUNT}) ([A-Z]{3})$`)
): { items: Item[] } | { problem: string; at: DocLine } => {
    const items: Item[] = [];
    for (let index = from; index < to; index += 1) {
        const match = pattern.exec(lines[index].text);
        if (!match) continue;
        const [, label, raw, itemCurrency] = match;
        const kind = itemKind(label);
        const value = parseAmount(raw, style);
        if (!kind || !Number.isFinite(value) || itemCurrency !== currency) return { problem: label, at: lines[index] };
        items.push({ label, kind, cash: direction * value, line: lines[index].text });
    }
    return { items };
};

const sum = (items: Item[], kind: Kind) => roundCents(items.filter((item) => item.kind === kind).reduce((total, item) => total + item.cash, 0));
const labels = (items: Item[], kind: Kind) => items.filter((item) => item.kind === kind).map((item) => item.label).join(', ');

// ---------------------------------------------------------------------------
// Scalable Capital documents (de, en)

const LANGUAGE = {
    de: {
        style: 'de' as DecimalStyle,
        trade: /^(Kauf|Verkauf) (.+) ([\d.,]+) Stk\. ([\d.,]+) ([A-Z]{3}) ([\d.,]+) ([A-Z]{3})$/,
        sell: 'Verkauf',
        execution: /^Ausführung (\d{2}\.\d{2}\.\d{4}) [\d:]+ Geschäft (\S+)$/,
        order: /^Typ \S+ Order (\S+)$/,
        savingsPlan: /^für Sparplanausführung$/,
        total: /^(Total|Gutschrift|Belastung|Gesamtbetrag) ([\d.,]+) ([A-Z]{3})$/,
        dividendTitle: /^Dividende$/,
        security: /^Berechtigtes ?Wertpapier (.+)$/,
        payment: /^(\d{2}\.\d{2}\.\d{4}) (\d{2}\.\d{2}\.\d{4}) (Gutschrift|Belastung) ([\d.,]+) ([A-Z]{3}) ([\d.,]+) ([\d.,]+) ([A-Z]{3})$/,
        advanceTax: /^(\d{2}\.\d{2}\.\d{4}) (\d{2}\.\d{2}\.\d{4}) Steuerabbuchung ([\d.,]+) ([A-Z]{3}) ([\d.,]+) ([A-Z]{3})$/
    },
    en: {
        style: 'en' as DecimalStyle,
        trade: /^(Buy|Sell) (.+) ([\d.,]+) pc\. ([\d.,]+) ([A-Z]{3}) ([\d.,]+) ([A-Z]{3})$/,
        sell: 'Sell',
        execution: /^Execution (\d{2}\.\d{2}\.\d{4}) [\d:]+ Exchange ID (\S+)$/,
        order: /^Type \S+ Order ID (\S+)$/,
        savingsPlan: /^for savings plan (order|execution)$/,
        total: /^(Total|Debit|Credit) ([\d.,]+) ([A-Z]{3})$/,
        dividendTitle: /^Dividend$/,
        security: /^Entitled security (.+)$/,
        payment: /^(\d{2}\.\d{2}\.\d{4}) (\d{2}\.\d{2}\.\d{4}) (Credit|Debit) ([\d.,]+) ([A-Z]{3}) ([\d.,]+) ([\d.,]+) ([A-Z]{3})$/,
        advanceTax: /^(\d{2}\.\d{2}\.\d{4}) (\d{2}\.\d{2}\.\d{4}) Tax deduction ([\d.,]+) ([A-Z]{3}) ([\d.,]+) ([A-Z]{3})$/
    }
};
type Language = typeof LANGUAGE.de;

/** Lines that only carry booking data, kept with the entry; no addresses or account numbers. */
const rawOf = (variant: string, document: string, lines: string[]) => ({ source: 'scalable-pdf', variant, document, lines });

const scalableTrade = (lines: DocLine[], lang: Language, variant: string, title: string): DocumentOutcome => {
    const trade = findLine(lines, lang.trade);
    if (!trade) return unsupported(title, lines[0]);
    const [, verb, name, rawQuantity, rawPrice, priceCurrency, rawGross, currency] = trade.match;
    const isinLine = lines[trade.index + 1]?.text || '';
    const total = findLine(lines, lang.total, trade.index + 2);
    const execution = findLine(lines, lang.execution);
    const quantity = parseAmount(rawQuantity, lang.style);
    const gross = parseAmount(rawGross, lang.style);
    const date = execution ? parseDottedDate(execution.match[1]) : null;
    if (!ISIN.test(isinLine) || !total || !date || !(quantity > 0) || !Number.isFinite(gross) || total.match[3] !== currency) {
        return unsupported(title, lines[trade.index]);
    }
    const side = verb === lang.sell ? 'sell' : 'buy';
    const direction = side === 'buy' ? -1 : 1;
    const read = readItems(lines, trade.index + 2, total.index, lang.style, currency, direction);
    if ('problem' in read) return unsupported(`${title}: ${read.problem}`, read.at);
    const settled = direction * parseAmount(total.match[2], lang.style);
    if (!reconciles([direction * gross, ...read.items.map((item) => item.cash)], settled)) return unsupported(title, lines[total.index]);

    const order = findLine(lines, lang.order)?.match[1];
    const key = `scalable:${order || ''}:${execution!.match[2]}`;
    const raw = rawOf(variant, title, [lines[trade.index].text, isinLine, ...read.items.map((item) => item.line), lines[total.index].text]);
    const isin = isinLine;
    const fee = sum(read.items, 'fee');
    const tax = roundCents(sum(read.items, 'tax') + sum(read.items, 'withholding'));
    const entries: ImportEntry[] = [tradeEntry({
        source: SOURCE,
        externalId: key,
        orderId: order,
        date,
        side,
        savingsPlan: findLine(lines, lang.savingsPlan) ? true : undefined,
        isin,
        name,
        quantity,
        amount: roundCents(direction * gross),
        currency,
        fee: fee || undefined,
        feeCurrency: currency,
        raw: { ...raw, price: parseAmount(rawPrice, lang.style), priceCurrency }
    })];
    if (tax) {
        entries.push(statementEntry({
            source: SOURCE, externalId: `${key}:tax`, orderId: order, date, type: 'Tax', kind: 'tax', amount: tax, currency,
            description: [labels(read.items, 'tax'), labels(read.items, 'withholding')].filter(Boolean).join(', '), isin, name, raw
        }));
    }
    return { kind: 'booked', entries };
};

const scalableDividend = (lines: DocLine[], lang: Language, variant: string, title: string): DocumentOutcome => {
    const security = findLine(lines, lang.security);
    const isinLine = security ? findLine(lines, /^ISIN ([A-Z]{2}[A-Z0-9]{9}\d)$/, security.index) : null;
    const payment = findLine(lines, lang.payment);
    if (!security || !isinLine || !payment) return unsupported(title, lines[0]);
    // A debit reverses an earlier payout (reclassification); not booked here
    if (/Belastung|Debit/.test(payment.match[3])) return unsupported(title, lines[payment.index]);
    const currency = payment.match[8];
    const total = findLine(lines, lang.total, payment.index + 1);
    const gross = parseAmount(payment.match[7], lang.style);
    const date = parseDottedDate(payment.match[2]);
    if (!total || !date || !Number.isFinite(gross) || total.match[3] !== currency) return unsupported(title, lines[payment.index]);
    const read = readItems(lines, payment.index + 1, total.index, lang.style, currency, 1);
    if ('problem' in read) return unsupported(`${title}: ${read.problem}`, read.at);
    if (read.items.some((item) => item.kind === 'fee') || !reconciles([gross, ...read.items.map((item) => item.cash)], parseAmount(total.match[2], lang.style))) {
        return unsupported(title, lines[total.index]);
    }
    const isin = isinLine.match[1];
    const name = security.match[1];
    const key = `scalable:dividend:${isin}:${payment.match[1]}:${payment.match[2]}:${payment.match[7]}`;
    const raw = rawOf(variant, title, [lines[payment.index].text, ...read.items.map((item) => item.line), lines[total.index].text]);
    const entry = (part: string, type: 'Dividend' | 'Tax', amount: number, description: string) => statementEntry({
        source: SOURCE, externalId: part ? `${key}:${part}` : key, date, type, amount, currency, description, isin, name, raw
    });
    const entries = [entry('', 'Dividend', roundCents(gross), title)];
    const withholding = sum(read.items, 'withholding');
    const tax = sum(read.items, 'tax');
    if (withholding) entries.push(entry('withholding', 'Tax', withholding, labels(read.items, 'withholding')));
    if (tax) entries.push(entry('tax', 'Tax', tax, labels(read.items, 'tax')));
    return { kind: 'booked', entries };
};

/** Tax on the Vorabpauschale (advance lump sum of funds), charged once a year. */
const scalableAdvanceTax = (lines: DocLine[], lang: Language, variant: string, title: string): DocumentOutcome => {
    const fund = findLine(lines, /^(?:für|for) (.+) \(([A-Z]{2}[A-Z0-9]{9}\d)\)$/);
    const booking = findLine(lines, lang.advanceTax);
    if (!fund || !booking) return unsupported(title, lines[0]);
    const tax = parseAmount(booking.match[5], lang.style);
    const date = parseDottedDate(booking.match[1]);
    if (!date || !Number.isFinite(tax)) return unsupported(title, lines[booking.index]);
    if (tax === 0) return ignored(title, lines[booking.index]); // covered by the allowance
    const isin = fund.match[2];
    return {
        kind: 'booked',
        entries: [statementEntry({
            source: SOURCE, externalId: `scalable:advance-tax:${isin}:${booking.match[1]}`, date, type: 'Tax', kind: 'tax',
            amount: -tax, currency: booking.match[6], description: title, isin, name: fund.match[1],
            raw: rawOf(variant, title, [lines[booking.index].text])
        })]
    };
};

/** Recalculation of taxes (refund or charge) after a change of tax data. */
const scalableTaxAdjustment = (lines: DocLine[], variant: string, title: string): DocumentOutcome => {
    const amount = findLine(lines, /^(Gutschrift|Belastung) ([\d.,]+) ([A-Z]{3})$/);
    const booked = findLine(lines, /^Der Betrag wurde am (\d{2}\.\d{2}\.\d{4})/);
    const date = booked ? parseDottedDate(booked.match[1]) : null;
    const value = amount ? parseAmount(amount.match[2], 'de') : Number.NaN;
    if (!amount || !date || !Number.isFinite(value)) return unsupported(title, lines[0]);
    const signed = amount.match[1] === 'Gutschrift' ? value : -value;
    return {
        kind: 'booked',
        entries: [statementEntry({
            source: SOURCE, externalId: `scalable:tax-adjustment:${booked!.match[1]}:${signed}`, date, type: 'Tax', kind: 'tax',
            amount: signed, currency: amount.match[3], description: title, raw: rawOf(variant, title, [lines[amount.index].text])
        })]
    };
};

/** Documents without a booking of their own (the cash account statement repeats settlements). */
const NOT_BOOKED: [RegExp, 'ignored' | 'unsupported'][] = [
    [/^(Verrechnungskonto|Cash Account Statement|Kontoauszug|Account statement)$/i, 'unsupported'], // deposits, withdrawals, interest
    [/^(Rechnungsabschluss|Zinszahlung|Kapitalrückzahlung|Reklassifizierung einer Ausschüttung|Laufzeitende|Knock Out)$/i, 'unsupported'],
    [/^(Kosteninformation|Costs information|Ex-ante|Auftragsbestätigung|Orderbestätigung|Order confirmation|Depotauszug|Jahressteuerbescheinigung|Steuerbescheinigung)/i, 'ignored']
];

const TITLES = /^(Wertpapierabrechnung|Contract note|Dividende|Dividend|Vorabpauschale|Preliminary lump sum|Steuerneuberechnung|Verrechnungskonto|Cash Account Statement|Kontoauszug|Account statement|Rechnungsabschluss|Zinszahlung|Kapitalrückzahlung|Reklassifizierung einer Ausschüttung|Kosteninformation|Costs information|Auftragsbestätigung|Orderbestätigung|Order confirmation|Depotauszug|Jahressteuerbescheinigung|Steuerbescheinigung)\b/i;

const parseScalable = (lines: DocLine[], variant: 'de' | 'en'): DocumentOutcome => {
    const lang = LANGUAGE[variant];
    const titleLine = findLine(lines, TITLES);
    const title = titleLine?.match[0].trim() || lines[0]?.text || '?';
    if (!titleLine) return unsupported(title, lines[0]);
    if (/^(Wertpapierabrechnung|Contract note)$/i.test(titleLine.match[0]) && findLine(lines, lang.trade)) return scalableTrade(lines, lang, variant, title);
    if (lang.dividendTitle.test(lines[titleLine.index].text)) return scalableDividend(lines, lang, variant, title);
    if (/^(Vorabpauschale|Preliminary lump sum)$/i.test(lines[titleLine.index].text)) return scalableAdvanceTax(lines, lang, variant, title);
    if (/^Steuerneuberechnung$/.test(lines[titleLine.index].text)) return scalableTaxAdjustment(lines, variant, title);
    const known = NOT_BOOKED.find(([pattern]) => pattern.test(lines[titleLine.index].text));
    return known?.[1] === 'ignored' ? ignored(title, lines[titleLine.index]) : unsupported(lines[titleLine.index].text, lines[titleLine.index]);
};

// ---------------------------------------------------------------------------
// Baader Bank documents for Scalable clients (until 2024)

const BAADER_ITEM = /^(.+?) ([A-Z]{3}) (\d[\d.]*,\d+)( -)?$/;

const baaderKind = (label: string): Kind | 'gross' | null => {
    if (/^(Kurswert|Bruttobetrag)$/.test(label)) return 'gross';
    if (/quellensteuer/i.test(label)) return 'withholding';
    if (/^(Kapitalertragsteuer|Solidaritätszuschlag|Kirchensteuer|Finanztransaktionssteuer)$/.test(label)) return 'tax';
    if (/^(Provision|Börsengebühr|Handelsentgelt|Transaktionsentgelt|Fremde Spesen|Fremdspesen|Maklercourtage|Kurswert-Provision|Gebühr)/i.test(label)) return 'fee';
    return null;
};

const BAADER_TITLE = /^(Wertpapierabrechnung: (Kauf|Verkauf)|Transaction Statement: (Purchase|Sale)|Fondsausschüttung|Dividendenabrechnung|Ausschüttung|Dividende|Dividend|Ertragsthesaurierung|Vorabpauschale|Advance Lump Sum|Perioden-Kontoauszug|Tageskontoauszug|Steuerausgleichsrechnung|Zinsabrechnung|Einbuchung|Depoteinlieferung|Kapitalerhöhung|Fusion|Split|Rechnung)\b(.*)$/;

const parseBaader = (lines: DocLine[]): DocumentOutcome => {
    const variant = 'baader';
    const titleLine = findLine(lines, BAADER_TITLE);
    if (!titleLine) return unsupported(lines[0]?.text || '?', lines[0]);
    const title = titleLine.match[0].replace(/\s+(KOPIE|COPY)$/, '');
    const head = titleLine.match[1];
    const isTrade = /^Wertpapierabrechnung: (Kauf|Verkauf)$/.test(head);
    const isDividend = /^(Fondsausschüttung|Dividendenabrechnung|Ausschüttung|Dividende)$/.test(head);
    // Account statements, accumulations, advance tax, corporate actions and fee invoices of the
    // wealth management: financial effect, not booked from this generation
    if (!isTrade && !isDividend) return unsupported(title, lines[titleLine.index]);
    if (/STORNO/.test(titleLine.match[0])) return unsupported(title, lines[titleLine.index]);

    const isinLine = findLine(lines, /^Nominale ISIN: ([A-Z]{2}[A-Z0-9]{9}\d) WKN: \S+/, titleLine.index);
    const position = isinLine ? findLine(lines, /^STK ([\d.,]+) (.+?) ([A-Z]{3}) [\d.,]+( p\.STK)?$/, isinLine.index + 1, isinLine.index + 3) : null;
    const settlement = findLine(lines, /^Zu (Lasten|Gunsten) Konto .*Valuta: (\d{2}\.\d{2}\.\d{4}) ([A-Z]{3}) (\d[\d.]*,\d+)$/, titleLine.index);
    const reference = findLine(lines, /^(?:.* )?Vorgangs-Nr\.: (\S+)/);
    if (!isinLine || !position || !settlement || !reference) return unsupported(title, lines[titleLine.index]);

    const currency = settlement.match[3];
    const credit = settlement.match[1] === 'Gunsten';
    const settled = (credit ? 1 : -1) * parseAmount(settlement.match[4], 'de');
    const start = findLine(lines, /^(Kurswert|Bruttobetrag) /, position.index, settlement.index);
    if (!start) return unsupported(title, lines[settlement.index]);
    // Credits (sale, payout): amounts marked "-" are deducted. Debits (buy): plain amounts add to the debit.
    let gross = Number.NaN;
    const items: Item[] = [];
    for (let index = start.index; index < settlement.index; index += 1) {
        const match = BAADER_ITEM.exec(lines[index].text);
        if (!match || match[2] !== currency) {
            // a gross amount in the security's currency next to the one in account currency
            if (match && match[1] === 'Bruttobetrag') continue;
            if (match) return unsupported(`${title}: ${match[1]}`, lines[index]);
            continue;
        }
        const kind = baaderKind(match[1]);
        const value = parseAmount(match[3], 'de');
        if (!kind) return unsupported(`${title}: ${match[1]}`, lines[index]);
        if (kind === 'gross') {
            gross = value;
            continue;
        }
        const deducted = Boolean(match[4]);
        const cash = credit ? (deducted ? -value : value) : (deducted ? value : -value);
        items.push({ label: match[1], kind, cash, line: lines[index].text });
    }
    if (!Number.isFinite(gross) || !reconciles([(credit ? 1 : -1) * gross, ...items.map((item) => item.cash)], settled)) {
        return unsupported(title, lines[settlement.index]);
    }

    const isin = isinLine.match[1];
    const quantity = parseAmount(position.match[1], 'de');
    const name = position.match[2];
    const key = `scalable-baader:${reference.match[1]}`;
    const raw = rawOf(variant, title, [lines[position.index].text, ...items.map((item) => item.line), `${settlement.match[1]} ${settlement.match[3]} ${settlement.match[4]}`]);
    const tax = roundCents(sum(items, 'tax') + sum(items, 'withholding'));

    if (isTrade) {
        const side = head.endsWith('Verkauf') ? 'sell' : 'buy';
        if ((side === 'sell') !== credit) return unsupported(title, lines[settlement.index]);
        const tradeDay = findLine(lines, /^Handelsdatum Handelsuhrzeit$/);
        const tradeDate = (tradeDay && /^(\d{2}\.\d{2}\.\d{4}) /.exec(lines[tradeDay.index + 1]?.text || ''))
            || findLine(lines, /^STK\s+[\d.,]+ [A-Z]{3} [\d.,]+ .* (\d{2}\.\d{2}\.\d{4}) [\d:]+$/)?.match
            || findLine(lines, /^Auftragsdatum: (\d{2}\.\d{2}\.\d{4})/)?.match;
        const date = tradeDate ? parseDottedDate(tradeDate[1]) : null;
        if (!date || !(quantity > 0)) return unsupported(title, lines[titleLine.index]);
        const fee = sum(items, 'fee');
        const entries: ImportEntry[] = [tradeEntry({
            source: SOURCE, externalId: key, date, side,
            savingsPlan: findLine(lines, /Sparplan/) ? true : undefined,
            isin, name, quantity, amount: roundCents((credit ? 1 : -1) * gross), currency,
            fee: fee || undefined, feeCurrency: currency, raw
        })];
        if (tax) {
            entries.push(statementEntry({
                source: SOURCE, externalId: `${key}:tax`, date, type: 'Tax', kind: 'tax', amount: tax, currency,
                description: [labels(items, 'tax'), labels(items, 'withholding')].filter(Boolean).join(', '), isin, name, raw
            }));
        }
        return { kind: 'booked', entries };
    }

    if (!credit || items.some((item) => item.kind === 'fee')) return unsupported(title, lines[settlement.index]);
    const date = parseDottedDate(settlement.match[2]);
    if (!date) return unsupported(title, lines[settlement.index]);
    const entry = (part: string, type: 'Dividend' | 'Tax', amount: number, description: string) => statementEntry({
        source: SOURCE, externalId: part ? `${key}:${part}` : key, date, type, amount, currency, description, isin, name, raw
    });
    const entries = [entry('', 'Dividend', roundCents(gross), title)];
    const withholding = sum(items, 'withholding');
    const domestic = sum(items, 'tax');
    if (withholding) entries.push(entry('withholding', 'Tax', withholding, labels(items, 'withholding')));
    if (domestic) entries.push(entry('tax', 'Tax', domestic, labels(items, 'tax')));
    return { kind: 'booked', entries };
};

// ---------------------------------------------------------------------------

const detect = (pdf: PdfDocumentText): string | null => {
    const text = pdf.pages.slice(0, 2).flat();
    const scalable = text.some((line) => /Scalable Capital/.test(line));
    if (!scalable) return null;
    if (text.some((line) => /Baader Bank/.test(line))) return 'baader';
    if (!text.some((line) => /^Scalable Capital (Bank )?GmbH\b/.test(line) || /\bScalable Capital (Bank )?GmbH •/.test(line))) return null;
    return text.some((line) => /\b(Page|Date) \d/.test(line) || /^(Contract note|Dividend|Germany)\b/.test(line)) ? 'en' : 'de';
};

const parse = (pdf: PdfDocumentText) => {
    const variant = detect(pdf) || 'de';
    const lines = documentLines(pdf);
    const outcome = variant === 'baader' ? parseBaader(lines) : parseScalable(lines, variant as 'de' | 'en');
    return documentResult('scalable', SOURCE, variant, outcome);
};

export const scalableFileImporter: PdfFileImporter = {
    id: 'scalable',
    broker: 'Scalable Capital',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: ScalableCapitalPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/85c2088f28dfb26e711edf20494dca3e64ae9858/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/ScalableCapitalPDFExtractor.java'
        },
        {
            label: 'Portfolio Performance: BaaderBankPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/85c2088f28dfb26e711edf20494dca3e64ae9858/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/BaaderBankPDFExtractor.java'
        },
        { label: 'Parqet: Scalable Capital PDF/CSV-Import', url: 'https://faq.parqet.com/de/articles/651200-scalable-capital-pdf-csv-import' }
    ],
    verified: '2026-10-29',
    detect,
    parse
};
