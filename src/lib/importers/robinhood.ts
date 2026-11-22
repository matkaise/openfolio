import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { statementEntry, tradeEntry } from './entries';
import type { PdfFileImporter } from './fileImport';
import {
    documentLines,
    documentResult,
    findLine,
    ignored,
    parseAmount,
    roundCents,
    unsupported,
    type DocLine,
    type DocumentOutcome
} from './pdfDocument';

// Robinhood monthly account statements (Robinhood Financial LLC / Robinhood Securities, LLC, USD).
// The table "Account Activity" has the columns Description, Symbol, Acct Type, Transaction Date, Qty,
// Price, Debit, Credit, but the text layer does not tell the two amount columns apart: the direction
// follows from the type code, and "Total Funds Paid and Received" must confirm it. A trade carries
// its CUSIP on the next line and its name either in front of the symbol or on the line above.
// Dividends and taxes only name the ticker, so securities are booked under the ticker.
// Format knowledge from Portfolio Performance (RobinhoodPDFExtractor and its test document, commit
// de1e464); no code taken over.

const SOURCE = 'Robinhood';
const CURRENCY = 'USD';
const TICKER = '[A-Z0-9]{1,6}(?:\\.[A-Z]{1,4})?';
const DATE = '(\\d{2})\\/(\\d{2})\\/(\\d{4})';

const TRADE = new RegExp(`^(?:(.*) )?(${TICKER}) Cash (Buy|Sell) ${DATE} ([\\d.,]+) \\$[\\d.,]+ \\$([\\d.,]+)$`);
const INCOME = new RegExp(`(?:^| )(${TICKER}) Cash (CDIV|DTAX) ${DATE} \\$([\\d.,]+)$`);
const CASH = new RegExp(`^(ACH Deposit|ACH Withdrawal|Transfer from .+|Cash back from .+) Cash (ACH|ITRF|XENT_CC) ${DATE} \\$([\\d.,]+)$`);
const INTEREST = new RegExp(`^Interest Payment Sweep INT ${DATE} \\$([\\d.,]+)$`);
/** Any row of the table, also of a type this importer does not know. */
const ROW = new RegExp(`(?:^| )(?:Cash|Margin|Sweep) (\\w+) \\d{2}\\/\\d{2}\\/\\d{4}(?: |$)`);
const AMOUNT_AT_END = /\$([\d.,]+)$/;

const money = (raw: string): number => parseAmount(raw, 'en');
const isoDate = (month: string, day: string, year: string) => `${year}-${month}-${day}`;

type Booked = { outcome: DocumentOutcome; debit: number; credit: number; unknown: number };

const describeNext = (keys: Map<string, number>, key: string) => {
    const count = (keys.get(key) || 0) + 1;
    keys.set(key, count);
    return count === 1 ? key : `${key}#${count}`;
};

const tradeRow = (lines: DocLine[], index: number, match: RegExpExecArray, account: string, keys: Map<string, number>): Booked => {
    const [, ownName, ticker, action, month, day, year, shares, amountText] = match;
    const amount = money(amountText);
    const quantity = money(shares);
    const side = action === 'Buy' ? 'buy' : 'sell';
    const date = isoDate(month, day, year);
    const previous = lines[index - 1]?.text || '';
    const name = ownName || (ROW.test(previous) || /^(CUSIP:|Account Activity|Description |Page \d)/.test(previous) ? undefined : previous);
    // Usually the next line; a page break can put the page footer and table head in between
    const nextRow = lines.findIndex((line, position) => position > index && ROW.test(line.text));
    const cusip = findLine(lines, /^CUSIP: ([A-Z0-9]{9})$/, index + 1, Math.min(index + 6, nextRow < 0 ? lines.length : nextRow))?.match[1];
    return {
        debit: side === 'buy' ? amount : 0,
        credit: side === 'sell' ? amount : 0,
        unknown: 0,
        outcome: {
            kind: 'booked',
            entries: [tradeEntry({
                source: SOURCE,
                externalId: describeNext(keys, `robinhood:${account}:${date}:${side}:${ticker}:${quantity}:${amount}`),
                date,
                side,
                isin: ticker, // ticker; resolved by the next market sync, the CUSIP stays in the raw data
                name,
                quantity,
                amount: side === 'buy' ? -amount : amount,
                currency: CURRENCY,
                raw: { source: 'robinhood-pdf', code: action, cusip }
            })]
        }
    };
};

const rowOf = (lines: DocLine[], index: number, account: string, keys: Map<string, number>): Booked | null => {
    const line = lines[index];
    const trade = TRADE.exec(line.text);
    if (trade) return tradeRow(lines, index, trade, account, keys);

    const income = INCOME.exec(line.text);
    if (income) {
        const [, ticker, code, month, day, year, amountText] = income;
        const amount = money(amountText);
        const date = isoDate(month, day, year);
        const isDividend = code === 'CDIV';
        return {
            debit: isDividend ? 0 : amount,
            credit: isDividend ? amount : 0,
            unknown: 0,
            outcome: {
                kind: 'booked',
                entries: [statementEntry({
                    source: SOURCE, externalId: describeNext(keys, `robinhood:${account}:${date}:${code}:${ticker}:${amount}`), date, type: isDividend ? 'Dividend' : 'Tax',
                    amount: isDividend ? amount : -amount, currency: CURRENCY, description: isDividend ? 'Cash dividend' : 'Foreign tax withholding', isin: ticker, raw: { source: 'robinhood-pdf', code }
                })]
            }
        };
    }

    const cash = CASH.exec(line.text);
    if (cash) {
        const [, description, code, month, day, year, amountText] = cash;
        const amount = money(amountText);
        const date = isoDate(month, day, year);
        const outgoing = description === 'ACH Withdrawal' || (code === 'ITRF' && description.startsWith('Transfer from Brokerage '));
        return {
            debit: outgoing ? amount : 0,
            credit: outgoing ? 0 : amount,
            unknown: 0,
            outcome: {
                kind: 'booked',
                entries: [statementEntry({
                    source: SOURCE, externalId: describeNext(keys, `robinhood:${account}:${date}:${code}:${amount}`), date, type: outgoing ? 'Withdrawal' : 'Deposit',
                    amount: outgoing ? -amount : amount, currency: CURRENCY, description, raw: { source: 'robinhood-pdf', code }
                })]
            }
        };
    }

    const interest = INTEREST.exec(line.text);
    if (interest) {
        const [, month, day, year, amountText] = interest;
        const amount = money(amountText);
        const date = isoDate(month, day, year);
        return {
            debit: 0,
            credit: amount,
            unknown: 0,
            outcome: {
                kind: 'booked',
                entries: [statementEntry({
                    source: SOURCE, externalId: describeNext(keys, `robinhood:${account}:${date}:INT:${amount}`), date, type: 'Interest', amount, currency: CURRENCY,
                    description: 'Interest Payment Sweep', raw: { source: 'robinhood-pdf', code: 'INT' }
                })]
            }
        };
    }

    const other = ROW.exec(line.text);
    if (other) return { debit: 0, credit: 0, unknown: money(AMOUNT_AT_END.exec(line.text)?.[1] || '0'), outcome: unsupported(`Account Activity: ${other[1]}`, line) };
    return null;
};

const statement = (lines: DocLine[]): DocumentOutcome[] => {
    const activity = findLine(lines, /^Account Activity$/);
    if (!activity) return [ignored('Account statement', lines[0])];
    const total = findLine(lines, /^Total Funds Paid and Received \$([\d.,]+) \$([\d.,]+)$/, activity.index);
    if (!total) return [unsupported('Account Activity', lines[activity.index])];

    const account = findLine(lines, /Account #: ?(\d+)/)?.match[1] || 'unknown';
    const keys = new Map<string, number>();
    const rows = lines.slice(activity.index, total.index).flatMap((_, offset) => {
        const row = rowOf(lines, activity.index + offset, account, keys);
        return row ? [row] : [];
    });
    const sum = (part: 'debit' | 'credit' | 'unknown') => rows.reduce((value, row) => value + row[part], 0);
    const [debits, credits] = [money(total.match[1]), money(total.match[2])];
    const open = roundCents(debits - sum('debit')) + roundCents(credits - sum('credit'));
    // What the known rows leave open must be exactly the amounts of the rows that were not booked
    if (roundCents(debits - sum('debit')) < 0 || roundCents(credits - sum('credit')) < 0 || roundCents(open) !== roundCents(sum('unknown'))) {
        return [unsupported('Account Activity', lines[total.index])];
    }
    const pending = lines.slice(total.index).filter((line) => /\bCash (Buy|Sell) \d{2}\//.test(line.text)).map((line) => ignored('Trade pending settlement', line));
    return [...rows.map((row) => row.outcome), ...pending];
};

const parseDocument = (pdf: PdfDocumentText): DocumentOutcome[] => {
    const lines = documentLines(pdf);
    if (detect(pdf) === 'statement') return statement(lines);
    const title = lines.find((line) => line.text.length > 3) || lines[0];
    return [unsupported(title.text, title)];
};

const detect = (pdf: PdfDocumentText): string | null => {
    const lines = pdf.pages.flat();
    if (!lines.some((line) => /\bRobinhood (?:Financial|Securities),? LLC\b|help@robinhood\.com/.test(line))) return null;
    return lines.some((line) => /^Account (?:Activity|Summary)\b/.test(line)) ? 'statement' : 'other';
};

const parse = (pdf: PdfDocumentText) => documentResult('robinhood', SOURCE, detect(pdf) || 'other', parseDocument(pdf));

export const robinhoodFileImporter: PdfFileImporter = {
    id: 'robinhood',
    broker: 'Robinhood',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: RobinhoodPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/RobinhoodPDFExtractor.java'
        },
        { label: 'Robinhood: Finding your account documents', url: 'https://robinhood.com/us/en/support/articles/finding-your-account-documents/' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
