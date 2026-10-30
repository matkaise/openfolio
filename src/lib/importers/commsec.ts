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

// CommSec confirmation contract notes (Commonwealth Securities Limited, Australian market). One
// note per trade; a PDF may hold several. Two layouts: "COMPANY: NAME", the code on its own line and
// "SECURITY: ORDINARY FULLY PAID", or "COMPANY NAME" and "SECURITY ORDINARY FULLY PAID CODE". There
// is no ISIN, only the ASX code. Dividends, holdings and CommSec International are other documents.
// Format knowledge from Portfolio Performance (CommSecPDFExtractor and its test documents, commit
// de1e464); no code taken over.

const SOURCE = 'CommSec';
const CODE = '[A-Z0-9]{1,6}(?:\\.[A-Z]{1,4})?';

const parseDate = (raw: string): string | null => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (!match) return null;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
};

/** "$1,029.92" after a label; the rest of the line may hold other columns. */
const dollars = (lines: DocLine[], label: string, from: number, to: number) => {
    const found = findLine(lines, new RegExp(`^(?:${label}):? \\p{Sc}([\\d.,]+)(?: |$)`, 'u'), from, to);
    if (!found) return null;
    const value = parseAmount(found.match[1], 'en');
    return Number.isFinite(value) ? { value, at: lines[found.index] } : null;
};

const security = (lines: DocLine[], from: number, to: number): { name: string; code: string } | null => {
    const colon = findLine(lines, /^COMPANY: (.+)$/, from, to);
    if (colon) {
        const code = new RegExp(`^(${CODE})$`).exec(lines[colon.index + 1]?.text || '');
        return code ? { name: colon.match[1], code: code[1] } : null;
    }
    const plain = findLine(lines, /^COMPANY (.+)$/, from, to);
    const paper = findLine(lines, new RegExp(`^SECURITY .+ (${CODE})$`), from, to);
    return plain && paper ? { name: plain.match[1], code: paper.match[1] } : null;
};

const note = (lines: DocLine[], from: number, to: number, verb: string): DocumentOutcome => {
    const label = `Confirmation: ${verb}`;
    const paper = security(lines, from, to);
    const asAt = findLine(lines, /^AS AT DATE: (\d{2}\/\d{2}\/\d{4})\b/, from, to);
    const date = asAt ? parseDate(asAt.match[1]) : null;
    const units = findLine(lines, /^TOTAL UNITS: ([\d,.]+)/, from, to);
    const quantity = units ? parseAmount(units.match[1], 'en') : Number.NaN;
    const confirmation = findLine(lines, /^CONFIRMATION NO: (\S+)/, from, to);
    const considerationLine = findLine(lines, /^CONSIDERATION \(([A-Z]{3})\): \p{Sc}([\d.,]+)/u, from, to);
    if (!paper || !date || !(quantity > 0) || !confirmation || !considerationLine) return unsupported(label, lines[from]);

    const currency = considerationLine.match[1];
    const consideration = parseAmount(considerationLine.match[2], 'en');
    const costs = dollars(lines, 'BROKERAGE & COSTS INCL GST', from, to);
    const application = dollars(lines, 'APPLICATION MONEY', from, to);
    const side = verb === 'BOUGHT' ? 'buy' : 'sell';
    const total = dollars(lines, side === 'buy' ? 'TOTAL COST' : 'NET PROCEEDS', from, to);
    const fee = costs?.value ?? 0;
    if (!total || application?.value || !reconciles([consideration, side === 'buy' ? fee : -fee], total.value)) {
        return unsupported(label, total?.at ?? lines[from]);
    }
    const order = findLine(lines, /^ORDER NO: (\S+)/, from, to)?.match[1];
    return {
        kind: 'booked',
        entries: [tradeEntry({
            source: SOURCE,
            externalId: `commsec:${confirmation.match[1]}`,
            orderId: order,
            date,
            side,
            isin: paper.code, // ASX code; resolved by the next market sync
            name: paper.name,
            quantity,
            amount: roundCents(side === 'buy' ? -consideration : consideration),
            currency,
            fee: fee ? -fee : undefined,
            feeCurrency: currency,
            raw: { source: 'commsec-pdf', lines: [lines[from], lines[considerationLine.index], total.at].map((line) => line.text) }
        })]
    };
};

const parseDocument = (lines: DocLine[]): DocumentOutcome[] => {
    const starts = lines.map((line, index) => (/^WE HAVE (SOLD|BOUGHT)\b/.test(line.text) ? index : -1)).filter((index) => index >= 0);
    if (starts.length === 0) {
        const title = lines.find((line) => /^[A-Z][A-Z ]{5,}$/.test(line.text)) || lines[0];
        return [unsupported(title.text, title)];
    }
    return starts.map((from, position) => {
        const verb = /^WE HAVE (SOLD|BOUGHT)/.exec(lines[from].text)![1];
        return note(lines, from, starts[position + 1] ?? lines.length, verb);
    });
};

const detect = (pdf: PdfDocumentText): string | null => {
    const lines = pdf.pages.flat();
    if (!lines.some((line) => /\bCommonwealth Securities Limited\b/.test(line))) return null;
    return lines.some((line) => /^COMPANY:/.test(line)) || !lines.some((line) => /^COMPANY /.test(line)) ? 'colon' : 'plain';
};

const parse = (pdf: PdfDocumentText) => documentResult('commsec', SOURCE, detect(pdf) || 'colon', parseDocument(documentLines(pdf)));

export const commSecFileImporter: PdfFileImporter = {
    id: 'commsec',
    broker: 'CommSec',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: CommSecPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/CommSecPDFExtractor.java'
        },
        { label: 'CommSec: trade confirmation preferences', url: 'https://www.commsec.com.au/support/help-centre/managing-your-account/Trade_preferences.html' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
