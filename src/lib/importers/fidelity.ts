import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { tradeEntry } from './entries';
import type { PdfFileImporter } from './fileImport';
import {
    documentLines,
    documentResult,
    findLine,
    parseAmount,
    reconciles,
    roundCents,
    unsupported,
    type DocLine,
    type DocumentOutcome
} from './pdfDocument';

// Fidelity confirmations, and only these two families: "Transaction Confirmation" of Fidelity
// Brokerage Services (one block per trade, several in a PDF) and Fidelity Stock Plan Services notes
// ("YOU SOLD", "YOU PURCHASED" for ESPP purchases). This is no general Fidelity import: statements,
// NetBenefits or UK documents are not covered by the source and are reported. All amounts are USD.
// Format knowledge from Portfolio Performance (FidelityInternationalPDFExtractor and its test
// documents, commit de1e464); no code taken over.

const SOURCE = 'Fidelity';
const CURRENCY = 'USD';
const AMOUNT = '\\d[\\d,]*\\.\\d{2}';
const TICKER = /^([A-Z0-9]{1,6}(?:\.[A-Z]{1,4})?)(?: |$)/;

const usDate = (raw: string): string | null => {
    const match = /^(\d{2})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return null;
    const iso = `20${match[3]}-${match[1]}-${match[2]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
};

const amountOf = (lines: DocLine[], pattern: RegExp, from: number, to: number) => {
    const found = findLine(lines, pattern, from, to);
    return found ? parseAmount(found.match[1], 'en') : null;
};

const rawOf = (document: string, reference: string, cusip: string) => ({ source: 'fidelity-pdf', document, reference, cusip });

// ---------------------------------------------------------------------------

/** "Activity Assessmen t  F e e     0.07": the label's letters may be spaced out. */
const activityFee = (lines: DocLine[], from: number, to: number): number => {
    const line = lines.slice(from, to).find((item) => item.text.replace(/\s/g, '').includes('ActivityAssessmentFee'));
    const match = line ? new RegExp(`(${AMOUNT})$`).exec(line.text) : null;
    return match ? parseAmount(match[1], 'en') : 0;
};

const brokerageTrade = (lines: DocLine[], from: number, to: number): DocumentOutcome => {
    const title = 'Transaction Confirmation';
    const head = /^(\S+-\S+) .*?(\d{2}-\d{2}-\d{2}) \d{2}-\d{2}-\d{2} ([A-Z0-9]{9}) (\S+-\S+)$/.exec(lines[from + 1]?.text || '');
    const trade = findLine(lines, new RegExp(`^You (Bought|Sold) (.*?)\\s*Principal Amount\\s+(${AMOUNT})$`), from, to);
    if (!head || !trade) return unsupported(title, lines[from]);
    const label = `${title}: ${trade.match[1]}`;
    const date = usDate(head[2]);
    const sizeLine = lines[trade.index + 1]?.text || '';
    const size = /^(\d[\d,]*(?:\.\d+)?|\.\d+)\b/.exec(sizeLine)?.[1];
    const quantity = size ? parseAmount(size.startsWith('.') ? `0${size}` : size, 'en') : Number.NaN;
    const settled = amountOf(lines, new RegExp(`Settlement Amount\\s+(${AMOUNT})$`), from, to);
    const symbolLine = findLine(lines, /^Symbol:/, from, to);
    const symbol = symbolLine ? TICKER.exec(lines[symbolLine.index + 1]?.text || '')?.[1] : undefined;
    if (!date || !(quantity > 0) || settled === null || !symbol) return unsupported(label, lines[trade.index]);

    const principal = parseAmount(trade.match[3], 'en');
    const fee = activityFee(lines, from, to);
    const side = trade.match[1] === 'Bought' ? 'buy' : 'sell';
    if (!reconciles([principal, side === 'buy' ? fee : -fee], settled)) return unsupported(label, lines[trade.index]);

    const isin = /ISIN #([A-Z]{2}[A-Z0-9]{9}\d)\b/.exec(lines.slice(trade.index, to).map((line) => line.text).join(' '))?.[1];
    const name = trade.match[2].replace(/\s*ISIN #\S+/, '').trim() || symbol;
    return {
        kind: 'booked',
        entries: [tradeEntry({
            source: SOURCE,
            externalId: `fidelity:${head[1]}`,
            orderId: head[4],
            date,
            side,
            isin: isin || symbol, // no ISIN on US securities: symbol, resolved by the next market sync; the CUSIP stays in the raw data
            name,
            quantity,
            amount: side === 'buy' ? -principal : principal,
            currency: CURRENCY,
            fee: fee ? -fee : undefined,
            feeCurrency: CURRENCY,
            raw: rawOf(title, head[1], head[3])
        })]
    };
};

const brokerage = (lines: DocLine[]): DocumentOutcome[] => {
    const starts = lines.map((line, index) => (/^REFERENCE NO\. /.test(line.text) ? index : -1)).filter((index) => index >= 0);
    if (starts.length === 0) return [unsupported('Transaction Confirmation', lines[0])];
    return starts.map((from, position) => brokerageTrade(lines, from, starts[position + 1] ?? lines.length));
};

// ---------------------------------------------------------------------------

const stockPlan = (lines: DocLine[]): DocumentOutcome => {
    const title = 'Stock Plan Services';
    const reference = findLine(lines, /^REF # (\S+-\S+)$/)?.match[1];
    const header = findLine(lines, /^CUSTOMER NO\. /);
    const head = header ? /(\d{2}-\d{2}-\d{2}) \d{2}-\d{2}-\d{2} \S+ ([A-Z0-9]{9})$/.exec(lines[header.index + 1]?.text || '') : null;
    const trade = findLine(lines, /^YOU (PURCHASED|SOLD) ([\d.,]+) AT \$?([\d.,]+)/);
    const symbolLine = findLine(lines, /^SECURITY DESCRIPTION SYMBOL: ([A-Z0-9]{1,6}(?:\.[A-Z]{1,4})?) /);
    if (!reference || !head || !trade || !symbolLine) return unsupported(title, lines[0]);
    const label = `${title}: ${trade.match[1]}`;
    const date = usDate(head[1]);
    const quantity = parseAmount(trade.match[2], 'en');
    const price = parseAmount(trade.match[3], 'en');
    const end = lines.length;
    let amount: number;
    let fee = 0;
    const side = trade.match[1] === 'SOLD' ? 'sell' : 'buy';
    if (side === 'sell') {
        const proceeds = amountOf(lines, new RegExp(`Sale Proceeds\\s+\\$(${AMOUNT})$`), 0, end);
        const net = amountOf(lines, new RegExp(`^Net Cash Proceeds\\S*\\s+-?\\$(${AMOUNT})$`), 0, end);
        fee = amountOf(lines, new RegExp(`^DETAILS: Total Fees\\s+\\$(${AMOUNT})$`), 0, end) ?? 0;
        if (proceeds === null || net === null || !reconciles([proceeds, -fee], net)) return unsupported(label, lines[trade.index]);
        amount = proceeds;
    } else {
        const contributions = amountOf(lines, new RegExp(`^Accumulated Contributions\\S*\\s+\\$(${AMOUNT})$`), 0, end) ?? amountOf(lines, new RegExp(`Accumulated Contributions\\S*\\s+\\$(${AMOUNT})$`), 0, end);
        if (contributions === null || Math.abs(quantity * price - contributions) > 0.01) return unsupported(label, lines[trade.index]);
        amount = -contributions;
    }
    if (!date || !(quantity > 0)) return unsupported(label, lines[trade.index]);
    return {
        kind: 'booked',
        entries: [tradeEntry({
            source: SOURCE,
            externalId: `fidelity:sps:${reference}`,
            orderId: reference,
            date,
            side,
            isin: symbolLine.match[1], // symbol; resolved by the next market sync, the CUSIP stays in the raw data
            name: lines[symbolLine.index + 1]?.text || symbolLine.match[1],
            quantity,
            amount: roundCents(amount),
            currency: CURRENCY,
            fee: fee ? -fee : undefined,
            feeCurrency: CURRENCY,
            raw: rawOf(title, reference, head[2])
        })]
    };
};

const detect = (pdf: PdfDocumentText): string | null => {
    const lines = pdf.pages.flat();
    const stockPlanIssuer = lines.some((line) => /\bFidelity Stock Plan Services\b/i.test(line));
    if (!stockPlanIssuer && !lines.some((line) => /\bFIDELITY BROKERAGE SERVICES LLC\b/.test(line))) return null;
    if (lines.some((line) => /^Transaction Confirmation\b|\bTransaction Confirmation\s+Page \d/.test(line))) return 'confirmation';
    return stockPlanIssuer && lines.some((line) => /^YOU (PURCHASED|SOLD) /.test(line)) ? 'stock-plan' : 'other';
};

const parseDocument = (pdf: PdfDocumentText): DocumentOutcome[] => {
    const lines = documentLines(pdf);
    const variant = detect(pdf);
    if (variant === 'confirmation') return brokerage(lines);
    if (variant === 'stock-plan') return [stockPlan(lines)];
    const title = lines.find((line) => line.text.length > 3) || lines[0];
    return [unsupported(title.text, title)];
};

const parse = (pdf: PdfDocumentText) => documentResult('fidelity', SOURCE, detect(pdf) || 'other', parseDocument(pdf));

export const fidelityFileImporter: PdfFileImporter = {
    id: 'fidelity',
    broker: 'Fidelity (confirmations only)',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: FidelityInternationalPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/FidelityInternationalPDFExtractor.java'
        },
        { label: 'Fidelity: Statements FAQs', url: 'https://www.fidelity.com/trading/account-statement-faqs' },
        { label: 'Fidelity: Stock Plan Services FAQs', url: 'https://www.fidelity.com/stock-plan-services/faqs-your-account' }
    ],
    verified: '2026-10-31',
    detect,
    parse
};
