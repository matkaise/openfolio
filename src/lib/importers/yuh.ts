import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { statementEntry, tradeEntry, type ImportEntry } from './entries';
import type { PdfFileImporter } from './fileImport';
import {
    documentLines,
    documentResult,
    findLine,
    parseDottedDate,
    reconciles,
    roundCents,
    unsupported,
    type DocLine,
    type DocumentOutcome
} from './pdfDocument';

// Yuh transaction notifications ("TRANSAKTIONSBELEG" / "TRANSACTION NOTIFICATION"), issued by
// Swissquote Bank for Yuh Accounts: one PDF per activity, numbers with apostrophes (1'000.00).
// Buy/sell and deposits/withdrawals exist in German and, for trades, in English; dividends,
// capital gains and the interest statement in German. Other languages are reported.
// Format knowledge from Portfolio Performance (SwissquotePDFExtractor and its Yuh test documents,
// commit de1e464); no code taken over. Swissquote PDFs without the Yuh footer are not read here.

const SOURCE = 'Yuh';
const ISIN = '[A-Z]{2}[A-Z0-9]{9}\\d';
const NUMBER = "\\d[\\d'’]*(?:\\.\\d+)?";

const parseNumber = (raw: string): number => {
    const value = raw.replace(/['’]/g, '');
    return /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
};

const money = (lines: DocLine[], label: string) => {
    const found = findLine(lines, new RegExp(`^(?:${label}) ([A-Z]{3}) (${NUMBER})$`));
    return found ? { currency: found.match[1], value: parseNumber(found.match[2]), at: lines[found.index] } : null;
};

/** Sum of "Label CUR 1.00" lines; an amount in another currency makes it NaN, so it cannot reconcile. */
const sumMoney = (lines: DocLine[], labels: string[], currency: string): number => labels.reduce((sum, label) => {
    const item = money(lines, label);
    if (!item) return sum;
    return item.currency === currency ? sum + item.value : Number.NaN;
}, 0);

const rawOf = (document: string, lines: DocLine[]) => ({ source: 'yuh-pdf', document, lines: lines.map((line) => line.text) });

const security = (lines: DocLine[]): { name: string; isin: string; at: DocLine } | null => {
    const found = findLine(lines, new RegExp(`^(.*?) ISIN: (${ISIN})`));
    return found ? { name: found.match[1].trim(), isin: found.match[2], at: lines[found.index] } : null;
};

// ---------------------------------------------------------------------------

const FEES = ['Kommission Swissquote Bank AG', 'Kommission', 'Börsengebühren', 'Commission', 'Our commission', 'Stock exchange fee'];
const STAMP_DUTY = ['Abgabe \\(Eidg\\. Stempelsteuer\\)', 'Tax \\(Federal stamp duty\\)'];

const trade = (lines: DocLine[], title: string, verb: string, reference: string): DocumentOutcome => {
    const at = lines.find((line) => line.text.startsWith(title));
    const paper = security(lines);
    const side = /^(Kauf|Buy)/.test(verb) ? 'buy' : 'sell';
    const orderDate = findLine(lines, /(?:Kaufauftrag|Verkaufsauftrag|(?:buy|sell) order) (?:vom|of) (\d{2}\.\d{2}\.\d{4})/);
    const date = orderDate ? parseDottedDate(orderDate.match[1]) : null;
    const settled = money(lines, 'Zu Ihren Lasten|Zu Ihren Gunsten|To your debit|To your credit|Total belastet|Total gutgeschrieben');
    const total = money(lines, 'Total');
    if (!paper || !date || !settled || !total) return unsupported(title, at);

    const fills = lines.flatMap((line) => {
        const match = new RegExp(`^(${NUMBER}) (${NUMBER}) ([A-Z]{3}) (${NUMBER})$`).exec(line.text);
        return match ? [{ quantity: parseNumber(match[1]), currency: match[3], value: parseNumber(match[4]) }] : [];
    });
    const quantity = fills.reduce((sum, fill) => sum + fill.quantity, 0);
    if (!(quantity > 0) || fills.some((fill) => fill.currency !== total.currency) || !reconciles(fills.map((fill) => fill.value), total.value)) {
        return unsupported(title, total.at);
    }

    // Traded in another currency: the settled gross follows the exchange rate as a line of its own
    let gross = total.value;
    const rate = findLine(lines, /^Wechselkurs \d/);
    if (total.currency !== settled.currency) {
        const converted = rate ? findLine(lines, new RegExp(`^(?:Total )?${settled.currency} (${NUMBER})$`), rate.index) : null;
        if (!converted) return unsupported(title, total.at);
        gross = parseNumber(converted.match[1]);
    }
    const currency = settled.currency;
    const fee = sumMoney(lines, FEES, currency);
    const tax = sumMoney(lines, STAMP_DUTY, currency);
    const credit = findLine(lines, new RegExp(`^.*Trading Credit (${NUMBER})$`));
    const creditValue = credit ? parseNumber(credit.match[1]) : 0; // commission paid with Yuh's trading credit
    const direction = side === 'buy' ? 1 : -1;
    if (!reconciles([gross, direction * fee, direction * tax, -direction * creditValue], settled.value)) return unsupported(title, settled.at);

    const netFee = roundCents(fee - creditValue);
    const key = `yuh:${reference}`;
    const raw = rawOf(title, [paper.at, total.at, settled.at]);
    const entries: ImportEntry[] = [tradeEntry({
        source: SOURCE,
        externalId: key,
        orderId: reference,
        date,
        side,
        isin: paper.isin,
        name: paper.name,
        quantity,
        amount: roundCents(-direction * gross),
        currency,
        fee: netFee ? -netFee : undefined,
        feeCurrency: currency,
        fxRate: total.currency !== currency ? total.value / gross : undefined,
        raw
    })];
    if (tax) {
        entries.push(statementEntry({
            source: SOURCE, externalId: `${key}:tax`, orderId: reference, date, type: 'Tax', kind: 'tax', amount: -tax, currency,
            description: 'Eidg. Stempelsteuer', isin: paper.isin, name: paper.name, raw
        }));
    }
    return { kind: 'booked', entries };
};

/** "Betrag USD 28.10 CHF 25.28": the last amount is what the account was credited in. */
const settledMoney = (line: string) => {
    const match = new RegExp(`([A-Z]{3}) (${NUMBER})(?: ([A-Z]{3}) (${NUMBER}))?$`).exec(line);
    if (!match) return null;
    return match[3] ? { currency: match[3], value: parseNumber(match[4]) } : { currency: match[1], value: parseNumber(match[2]) };
};

const WITHHELD = /^(Quellensteuer|Verrechnungssteuer|Zusätzlicher Steuerrückbehalt) /;

const income = (lines: DocLine[], title: string, kind: string, reference: string): DocumentOutcome => {
    const at = lines.find((line) => line.text.startsWith(title));
    const paper = security(lines);
    const valuta = findLine(lines, /^Valutadatum (\d{2}\.\d{2}\.\d{4})$/);
    const date = valuta ? parseDottedDate(valuta.match[1]) : null;
    const gross = findLine(lines, /^Betrag [A-Z]{3} /);
    const total = findLine(lines, /^Total [A-Z]{3} /);
    const grossValue = gross ? settledMoney(lines[gross.index].text) : null;
    const totalValue = total ? settledMoney(lines[total.index].text) : null;
    if (!paper || !date || !grossValue || !totalValue || grossValue.currency !== totalValue.currency) return unsupported(title, at);
    const { currency } = totalValue;
    const taxes = lines.filter((line) => WITHHELD.test(line.text)).map((line) => ({ line, value: settledMoney(line.text) }));
    if (taxes.some((tax) => tax.value?.currency !== currency)) return unsupported(title, at);
    const withheld = taxes.map((tax) => tax.value!.value);
    if (!reconciles([grossValue.value, ...withheld.map((value) => -value)], totalValue.value)) return unsupported(title, lines[total!.index]);

    const key = `yuh:${reference}`;
    const raw = rawOf(title, [paper.at, lines[gross!.index], ...taxes.map((tax) => tax.line), lines[total!.index]]);
    const entries = [
        statementEntry({ source: SOURCE, externalId: key, orderId: reference, date, type: 'Dividend', amount: grossValue.value, currency, description: kind, isin: paper.isin, name: paper.name, raw }),
        ...taxes.map((tax, index) => statementEntry({
            source: SOURCE, externalId: `${key}:tax:${index}`, orderId: reference, date, type: 'Tax', amount: -tax.value!.value, currency,
            description: WITHHELD.exec(tax.line.text)![1], isin: paper.isin, name: paper.name, raw
        }))
    ];
    return { kind: 'booked', entries };
};

const payment = (lines: DocLine[], title: string, direction: string, reference: string): DocumentOutcome => {
    const at = lines.find((line) => line.text.startsWith(title));
    const valuta = findLine(lines, /^Valutadatum (\d{2}\.\d{2}\.\d{4})$/);
    const date = valuta ? parseDottedDate(valuta.match[1]) : null;
    const total = money(lines, 'Total');
    if (!date || !total) return unsupported(title, at);
    const incoming = direction === 'Gutschrift';
    return {
        kind: 'booked',
        entries: [statementEntry({
            source: SOURCE, externalId: `yuh:${reference}`, orderId: reference, date, type: incoming ? 'Deposit' : 'Withdrawal',
            amount: incoming ? total.value : -total.value, currency: total.currency, description: title, raw: rawOf(title, [total.at])
        })]
    };
};

/** Zinsabrechnung: one table per currency, "30.12.2022 1.36 0.00 1.36 0.00 1.36" (optional rate and CHF total). */
const interest = (lines: DocLine[], title: string): DocumentOutcome[] => {
    const tables = lines.map((line, index) => (/^IBAN : .* W.hrung : [A-Z]{3}$/.test(line.text) ? index : -1)).filter((index) => index >= 0);
    if (tables.length === 0) return [unsupported(title, lines[0])];
    return tables.flatMap((from, position): DocumentOutcome[] => {
        const to = tables[position + 1] ?? lines.length;
        const currency = lines[from].text.slice(-3);
        const rows = lines.slice(from, to).flatMap((line) => {
            const match = new RegExp(`^(\\d{2}\\.\\d{2}\\.\\d{4}) (${NUMBER}) (${NUMBER}) (${NUMBER}) (${NUMBER}) (${NUMBER})(?: ${NUMBER} ${NUMBER})?$`).exec(line.text);
            return match ? [{ line, date: parseDottedDate(match[1]), credit: parseNumber(match[4]), tax: parseNumber(match[5]), total: parseNumber(match[6]) }] : [];
        });
        if (rows.length === 0) return [unsupported(title, lines[from])];
        return rows.flatMap((row): DocumentOutcome[] => {
            if (!row.date || !reconciles([row.credit, -row.tax], row.total)) return [unsupported(title, row.line)];
            if (row.credit === 0) return [];
            const key = `yuh:interest:${currency}:${row.date}`;
            const raw = rawOf(title, [row.line]);
            const entries = [statementEntry({ source: SOURCE, externalId: key, date: row.date, type: 'Interest', amount: row.credit, currency, description: title, raw })];
            if (row.tax) entries.push(statementEntry({ source: SOURCE, externalId: `${key}:tax`, date: row.date, type: 'Tax', amount: -row.tax, currency, description: 'Verrechnungssteuer', raw }));
            return [{ kind: 'booked', entries }];
        });
    });
};

const parseDocument = (lines: DocLine[]): DocumentOutcome[] => {
    const statement = findLine(lines, /^Zinsabrechnung vom /);
    if (statement) return interest(lines, 'Zinsabrechnung');

    const titled = findLine(lines, /^(.+?)\s*(?:Unsere Referenz|Our reference): ?(\d+)\s*$/);
    if (!titled) {
        const fallback = lines.find((line) => /^[A-ZÄÖÜ ]{8,}$/.test(line.text)) || lines[0];
        return [unsupported(fallback.text, fallback)];
    }
    const title = titled.match[1].replace(/\s*\*$/, '').trim();
    const reference = titled.match[2];
    const tradeTitle = /^(?:(?:B.rsen|Derivate)transaktion: |Stock-Exchange Transaction: )?(Kauf|Verkauf|Sell|Buy)$/.exec(title);
    if (tradeTitle) return [trade(lines, title, tradeTitle[1], reference)];
    if (/^(Dividende|Kapitalgewinn)$/.test(title)) return [income(lines, title, title, reference)];
    const transfer = /^Zahlungsverkehr - (Gutschrift|Belastung)$/.exec(title);
    if (transfer) return [payment(lines, title, transfer[1], reference)];
    return [unsupported(title, lines[titled.index])];
};

const detect = (pdf: PdfDocumentText): string | null => {
    const lines = pdf.pages.flat();
    if (!lines.some((line) => /\bSwissquote Bank\b/.test(line)) || !lines.some((line) => /\bYuh\b/.test(line))) return null;
    return lines.some((line) => /\bOur reference:|TRANSACTION NOTIFICATION/.test(line)) ? 'en' : 'de';
};

const parse = (pdf: PdfDocumentText) => documentResult('yuh', SOURCE, detect(pdf) || 'de', parseDocument(documentLines(pdf)));

export const yuhFileImporter: PdfFileImporter = {
    id: 'yuh',
    broker: 'Yuh',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: SwissquotePDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/SwissquotePDFExtractor.java'
        },
        { label: 'Parqet: Yuh PDF-Import', url: 'https://faq.parqet.com/de/articles/871931-yuh-pdf-import' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
