import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { parseUsNumber } from './csv';
import { statementEntry, tradeEntry } from './entries';
import type { PdfFileImporter } from './fileImport';
import {
    documentLines,
    documentResult,
    findLine,
    ignored,
    reconciles,
    roundCents,
    unsupported,
    type DocLine,
    type DocumentOutcome
} from './pdfDocument';

// Questrade monthly account statements ("ACCOUNT STATEMENT", section "04. ACTIVITY DETAILS") and the
// "TRADE CONFIRMATION REPORT". The statement lists one table per activity between an opening and a
// closing balance, with the columns Qty | Price Gross Com Net (CAD) | Price Gross Com Net (USD); a
// cell without value prints "-". Trades in the table are dated MM-DD-YYYY, the confirmation report
// prints DD-MM-YY. Symbols of Canadian listings start with a dot. There is no ISIN, only the symbol.
// Format knowledge from Portfolio Performance (QuestradeGroupPDFExtractor and its test documents,
// commit de1e464); no code taken over.

const SOURCE = 'Questrade';
const ROW = /^(\d{2})-(\d{2})-(\d{4}) \d{2}-\d{2}-\d{4}\s*(.*)$/;
const CELL = /^(-|\(?\d[\d,]*(?:\.\d+)?\)?)$/;
const SYMBOL = '\\.?([A-Z0-9]{1,6}(?:\\.[A-Z]{1,4})?)';

const cell = (token: string): number | null => (token === '-' ? null : parseUsNumber(token));

/** The nine table cells at the end of a line, or null. */
const cells = (text: string): (number | null)[] | null => {
    const tokens = text.split(' ').slice(-9);
    return tokens.length === 9 && tokens.every((token) => CELL.test(token)) ? tokens.map(cell) : null;
};

type Money = { currency: 'CAD' | 'USD'; price: number | null; gross: number | null; commission: number | null; net: number };

/** The filled currency group of a row; a row with both is not understood. */
const moneyOf = (row: (number | null)[]): Money | null => {
    const [, cadPrice, cadGross, cadCommission, cadNet, usdPrice, usdGross, usdCommission, usdNet] = row;
    if ((cadNet === null) === (usdNet === null)) return null;
    return cadNet !== null
        ? { currency: 'CAD', price: cadPrice, gross: cadGross, commission: cadCommission, net: cadNet }
        : { currency: 'USD', price: usdPrice, gross: usdGross, commission: usdCommission, net: usdNet! };
};

class Keys {
    private readonly seen = new Map<string, number>();

    /** Key from the booking's content; the same trade in a statement and a report gets the same key, repeats in a document a counter. */
    next(key: string): string {
        const count = (this.seen.get(key) || 0) + 1;
        this.seen.set(key, count);
        return count === 1 ? key : `${key}#${count}`;
    }
}

const tradeOutcome = (input: {
    keys: Keys; account: string; date: string; side: 'buy' | 'sell'; symbol: string; name?: string; quantity: number; gross: number; fee: number; net: number;
    currency: string; orderId?: string; label: string; at: DocLine; raw: unknown;
}): DocumentOutcome => {
    const { date, side, symbol, quantity, gross, fee, net, currency } = input;
    if (!(quantity > 0) || Math.sign(gross) !== (side === 'buy' ? -1 : 1) || !reconciles([gross, -fee], net)) return unsupported(input.label, input.at);
    return {
        kind: 'booked',
        entries: [tradeEntry({
            source: SOURCE,
            externalId: input.keys.next(`questrade:${input.account}:${date}:${side}:${symbol}:${quantity}:${net}`),
            orderId: input.orderId,
            date,
            side,
            isin: symbol, // symbol; resolved by the next market sync
            name: input.name,
            quantity,
            amount: gross,
            currency,
            fee: fee ? -fee : undefined,
            feeCurrency: currency,
            raw: input.raw
        })]
    };
};

const nameOf = (text: string): string | undefined => {
    const name = text.replace(/\|/g, ' ').replace(/\s+/g, ' ').replace(/\b(?:ETF )?UNITS?$/, '').trim();
    return name || undefined;
};

/** One row of a transactions table, with the line that holds its cells and the text before them. */
const statementRow = (lines: DocLine[], index: number, cellLine: number, numbers: (number | null)[], account: string, keys: Keys): DocumentOutcome => {
    const start = ROW.exec(lines[index].text)!;
    const date = `${start[3]}-${start[1]}-${start[2]}`;
    const text = [start[4], ...lines.slice(index + 1, cellLine + 1).map((line) => line.text)].join(' ').split(' ').slice(0, -9).join(' ').replace(/\s+/g, ' ').trim();
    const money = moneyOf(numbers);
    const label = /^[A-Za-z]+/.exec(text)?.[0] || 'Transaction';
    if (!money) return unsupported(label, lines[index]);
    const raw = { source: 'questrade-pdf', document: 'statement', text: text.replace(/\b\d{8,}\b/g, '') };

    const trade = new RegExp(`^(Buy|Sell) ${SYMBOL}\\b(.*?)\\|?\\s*WE ACTED AS AGENT`).exec(text);
    if (trade) {
        const quantity = Math.abs(numbers[0] ?? Number.NaN);
        if (money.gross === null) return unsupported(label, lines[index]);
        const own = nameOf(trade[3]);
        const previous = lines[index - 1]?.text || '';
        const name = own ?? (cells(previous) || ROW.test(previous) ? undefined : nameOf(previous));
        return tradeOutcome({
            keys, account, date, side: trade[1] === 'Buy' ? 'buy' : 'sell', symbol: trade[2], name, quantity, gross: money.gross, fee: Math.abs(money.commission ?? 0),
            net: money.net, currency: money.currency, label, at: lines[index], raw
        });
    }
    const distribution = new RegExp(`^${SYMBOL} UNITS?[ |]DIST\\b`).exec(text);
    if (distribution) {
        return {
            kind: 'booked',
            entries: [statementEntry({
                source: SOURCE, externalId: keys.next(`questrade:${account}:${date}:dividend:${distribution[1]}:${money.net}`), date, type: 'Dividend', amount: money.net, currency: money.currency,
                description: 'Distribution', isin: distribution[1], raw
            })]
        };
    }
    if (/^Contribution\b/.test(text)) {
        return {
            kind: 'booked',
            entries: [statementEntry({
                source: SOURCE, externalId: keys.next(`questrade:${account}:${date}:contribution:${money.net}`), date, type: 'Deposit', amount: money.net, currency: money.currency, description: 'Contribution', raw
            })]
        };
    }
    return unsupported(label, lines[index]);
};

/** Opening balance + rows = closing balance per currency, or the table is not understood. */
const table = (lines: DocLine[], from: number, to: number, account: string, keys: Keys): DocumentOutcome[] => {
    const opening = cells(lines[from].text)!;
    const closing = cells(lines[to].text)!;
    const rows = lines.map((line, index) => (index > from && index < to && ROW.test(line.text) ? index : -1)).filter((index) => index >= 0);
    const found = rows.map((index, position) => {
        const end = rows[position + 1] ?? to;
        for (let cellLine = index; cellLine < end; cellLine += 1) {
            const numbers = cells(lines[cellLine].text);
            if (numbers) return { index, cellLine, numbers };
        }
        return { index, cellLine: index, numbers: null };
    });
    const sum = (column: number) => found.map((row) => row.numbers?.[column] ?? 0);
    const unreadable = found.find((row) => !row.numbers);
    if (unreadable || !reconciles([opening[4] ?? 0, ...sum(4)], closing[4] ?? 0) || !reconciles([opening[8] ?? 0, ...sum(8)], closing[8] ?? 0)) {
        return [unsupported('Transactions', unreadable ? lines[unreadable.index] : lines[to])];
    }
    return found.map((row) => statementRow(lines, row.index, row.cellLine, row.numbers!, account, keys));
};

const statement = (lines: DocLine[], account: string): DocumentOutcome[] => {
    const keys = new Keys();
    const heading = findLine(lines, /^Transactions$/);
    if (!heading) return [unsupported('Account statement', lines[0])];
    const outcomes: DocumentOutcome[] = [];
    let opening = -1;
    lines.forEach((line, index) => {
        if (index <= heading.index) return;
        if (/^Opening balance /.test(line.text) && cells(line.text)) opening = index;
        else if (/^Closing balance /.test(line.text) && cells(line.text) && opening >= 0) {
            outcomes.push(...table(lines, opening, index, account, keys));
            opening = -1;
        }
    });
    if (opening >= 0) outcomes.push(unsupported('Transactions', lines[opening]));
    // Trades that settle after month end are listed again in the next statement's transactions
    const unsettled = findLine(lines, /TRADES TO SETTLE AFTER/, heading.index);
    if (unsettled) lines.slice(unsettled.index).filter((line) => ROW.test(line.text)).forEach((line) => outcomes.push(ignored('Trade to settle after month end', line)));
    return outcomes.length ? outcomes : [ignored('Account statement', lines[heading.index])];
};

// ---------------------------------------------------------------------------

const TRADE_ROW = /^(\d{2})-(\d{2})-(\d{2}) \d{2}-\d{2}-\d{2} ([A-Z0-9]+) (Buy|Sell)\b/;
const FILL = new RegExp(`^(\\d{2})-(\\d{2})-(\\d{2}) \\d{2}-\\d{2}-\\d{2} ([A-Z0-9]+) (Buy|Sell) ([\\d.,]+)\\s+${SYMBOL}\\s+.*?(\\S+) (\\S+) (\\S+) (\\S+) (\\S+)$`);

/** One table of the report: "Net amount (CAD)" in its head, rows, and a "Totals" row. */
const confirmation = (lines: DocLine[], account: string): DocumentOutcome[] => {
    const keys = new Keys();
    const outcomes: DocumentOutcome[] = [];
    let currency: string | null = null;
    let nets: number[] = [];
    const accepted: { index: number; outcome: DocumentOutcome }[] = [];
    const close = (at: DocLine, total: number) => {
        if (reconciles(nets, total)) accepted.forEach((item) => outcomes.push(item.outcome));
        else outcomes.push(unsupported('Trade confirmation report: totals', at));
        accepted.length = 0;
        nets = [];
    };
    lines.forEach((line, index) => {
        const head = /Net amount \(([A-Z]{3})\)/.exec(line.text);
        if (head) currency = head[1];
        const totals = /^Totals (\S+) \S+ \S+ \S+ (\S+)$/.exec(line.text);
        if (totals) close(line, parseUsNumber(totals[2]));
        if (!TRADE_ROW.test(line.text)) return;
        const fill = FILL.exec(line.text);
        const label = `Trade confirmation: ${TRADE_ROW.exec(line.text)![5]}`;
        if (!fill || !currency) {
            nets.push(parseUsNumber(line.text.split(' ').pop()!));
            accepted.push({ index, outcome: unsupported(label, line) });
            return;
        }
        const [, day, month, year, tradeNumber, action, quantity, symbol, gross, commission, secFee, interest, net] = fill;
        const money = [gross, commission, secFee, interest, net].map(parseUsNumber);
        nets.push(money[4]);
        if (money.some(Number.isNaN) || money[3] !== 0) {
            accepted.push({ index, outcome: unsupported(label, line) });
            return;
        }
        const description = findLine(lines, /^Description (.*?)(?:, AVG PRICE - ASK.*)?\s*$/, index + 1, index + 6)?.match;
        accepted.push({
            index,
            outcome: tradeOutcome({
                keys, account, date: `20${year}-${month}-${day}`, side: action === 'Buy' ? 'buy' : 'sell', symbol, name: description?.[1] || undefined,
                quantity: parseUsNumber(quantity), gross: money[0], fee: roundCents(Math.abs(money[1]) + Math.abs(money[2])), net: money[4], currency, orderId: tradeNumber, label, at: line,
                raw: { source: 'questrade-pdf', document: 'trade-confirmation', trade: tradeNumber }
            })
        });
    });
    if (accepted.length) accepted.forEach((item) => outcomes.push(unsupported('Trade confirmation report: totals', lines[item.index])));
    return outcomes.length ? outcomes : [ignored('Trade confirmation report', lines[0])];
};

const parseDocument = (pdf: PdfDocumentText): DocumentOutcome[] => {
    const lines = documentLines(pdf);
    const account = findLine(lines, /Account #: *(\d+)/)?.match[1] || 'unknown';
    const kind = detect(pdf);
    if (kind === 'statement') return statement(lines, account);
    if (kind === 'trade-confirmation') return confirmation(lines, account);
    const title = lines.find((line) => line.text.length > 3) || lines[0];
    return [unsupported(title.text, title)];
};

const detect = (pdf: PdfDocumentText): string | null => {
    const lines = pdf.pages.flat();
    if (!lines.some((line) => /\bQuestrade, Inc\./.test(line))) return null;
    if (lines.some((line) => /^TRADE CONFIRMATION REPORT$/.test(line))) return 'trade-confirmation';
    return lines.some((line) => /^ACCOUNT STATEMENT$/.test(line)) ? 'statement' : 'other';
};

const parse = (pdf: PdfDocumentText) => documentResult('questrade', SOURCE, detect(pdf) || 'other', parseDocument(pdf));

export const questradeFileImporter: PdfFileImporter = {
    id: 'questrade',
    broker: 'Questrade',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: QuestradeGroupPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/QuestradeGroupPDFExtractor.java'
        },
        { label: 'Questrade: Introduction to your account', url: 'https://www.questrade.com/learning/using-questrade/introduction-to-your-account' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
