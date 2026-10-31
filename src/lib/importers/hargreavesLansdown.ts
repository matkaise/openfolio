import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { statementEntry, tradeEntry, type ImportEntry } from './entries';
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

// Hargreaves Lansdown contract notes. One PDF per deal. The security block prints the ISIN (shares
// and ETFs with "STOCK CODE: HMWO"), the issuer and a line "quantity, rest of the name, price,
// consideration". The price is in pence for shares and ETFs, so only the consideration in pounds is
// used. Some notes space their letters out ("** SOL D**"), so labels are matched without blanks.
// Format knowledge from Portfolio Performance (HargreavesLansdownPlcExtractor and its test documents,
// commit de1e464); no code taken over.

const SOURCE = 'Hargreaves Lansdown';
const CURRENCY = 'GBP'; // the notes print no currency for the consideration

const stripBlanks = (value: string) => value.replace(/\s+/g, '');

const parseDate = (raw: string): string | null => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(stripBlanks(raw));
    if (!match) return null;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
};

const COST_LINE = /^(.+?) (\d[\d,]*\.\d{2})$/;
/** Lines of a UK share deal; a label not named here means the note holds something unknown. */
const TAXES = /^(stamp duty|ptm levy)/i;

const contractNote = (lines: DocLine[]): DocumentOutcome => {
    const title = 'Contract Note';
    const at = lines.find((line) => /Contract Note/.test(line.text));
    const instruction = findLine(lines, /^We have today on your instructions\s+\*\*(.+?)\*\*/);
    const verb = instruction ? stripBlanks(instruction.match[1]) : '';
    const paperLine = findLine(lines, /^([A-Z]{2}[A-Z0-9]{9}\d)(?: STOCK CODE: ([A-Z0-9.]+?)\.?)?$/);
    const dated = findLine(lines, /^Date ([\d\s/]+?)\s+Time\s+(\d{2}:\d{2}).*Contract Note No\. (\S+)$/);
    const settlement = findLine(lines, /Settlement Date: (\d{2}\/\d{2}\/\d{4}) (\d[\d,]*\.\d{2})$/);
    if ((verb !== 'BOUGHT' && verb !== 'SOLD') || !paperLine || !dated || !settlement) return unsupported(title, at);
    const deal = paperLine.index + 2 < lines.length
        ? /^(\d[\d,]*(?:\.\d+)?) (.+) (\d[\d,]*(?:\.\d+)?) (\d[\d,]*\.\d{2})$/.exec(lines[paperLine.index + 2].text)
        : null;
    const date = parseDate(dated.match[1]);
    if (!deal || !date) return unsupported(title, lines[paperLine.index]);

    const quantity = parseAmount(deal[1], 'en');
    const consideration = parseAmount(deal[4], 'en');
    const total = parseAmount(settlement.match[2], 'en');
    const costs = lines.slice(paperLine.index + 3, settlement.index).flatMap((line) => {
        const match = COST_LINE.exec(line.text);
        return match ? [{ line, label: match[1], value: parseAmount(match[2], 'en') }] : [];
    });
    const side = verb === 'BOUGHT' ? 'buy' : 'sell';
    const direction = side === 'buy' ? 1 : -1;
    const fee = costs.filter((cost) => cost.label === 'Commission').reduce((sum, cost) => sum + cost.value, 0);
    const taxes = costs.filter((cost) => TAXES.test(cost.label));
    if (costs.some((cost) => cost.label !== 'Commission' && !TAXES.test(cost.label))) return unsupported(title, costs.find((cost) => cost.label !== 'Commission' && !TAXES.test(cost.label))!.line);
    if (!(quantity > 0) || !reconciles([consideration, direction * fee, ...taxes.map((tax) => direction * tax.value)], total)) {
        return unsupported(title, lines[settlement.index]);
    }

    const noteNumber = dated.match[3];
    const key = `hl:${noteNumber}`;
    const name = `${lines[paperLine.index + 1].text} ${deal[2]}`.trim();
    const isin = paperLine.match[1];
    const raw = { source: 'hl-pdf', lines: [lines[paperLine.index], lines[paperLine.index + 2], lines[settlement.index]].map((line) => line.text), stockCode: paperLine.match[2], settlementDate: parseDate(settlement.match[1]) };
    const entries: ImportEntry[] = [tradeEntry({
        source: SOURCE,
        externalId: key,
        orderId: noteNumber,
        date,
        side,
        isin,
        name,
        quantity,
        amount: roundCents(-direction * consideration),
        currency: CURRENCY,
        fee: fee ? -roundCents(fee) : undefined,
        feeCurrency: CURRENCY,
        raw
    })];
    taxes.forEach((tax, index) => entries.push(statementEntry({
        source: SOURCE, externalId: `${key}:tax:${index}`, orderId: noteNumber, date, type: 'Tax', kind: 'tax', amount: -tax.value, currency: CURRENCY,
        description: tax.label, isin, name, raw
    })));
    return { kind: 'booked', entries };
};

const parseDocument = (lines: DocLine[]): DocumentOutcome => {
    if (lines.some((line) => /Contract Note\b/.test(line.text) && !/Contract Note No\./.test(line.text))) return contractNote(lines);
    const title = lines.find((line) => line.text.length > 3) || lines[0];
    return unsupported(title.text, title);
};

const detect = (pdf: PdfDocumentText): string | null => (
    pdf.pages.flat().some((line) => /\bHargreaves Lansdown Asset Management Limited\b/.test(line)) ? 'contract-note' : null
);

const parse = (pdf: PdfDocumentText) => documentResult('hargreaveslansdown', SOURCE, 'contract-note', parseDocument(documentLines(pdf)));

export const hargreavesLansdownFileImporter: PdfFileImporter = {
    id: 'hargreaveslansdown',
    broker: 'Hargreaves Lansdown',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: HargreavesLansdownPlcExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/HargreavesLansdownPlcExtractor.java'
        },
        { label: 'HL: Service terms reference guide', url: 'https://www.hl.co.uk/terms-and-conditions/hl-service-terms-and-conditions-reference-guide' },
        { label: 'Sharesight: Hargreaves Lansdown', url: 'https://www.sharesight.com/partners/hargreaves-lansdown/' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
