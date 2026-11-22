import type { PdfDocumentText } from '@/lib/pdf/pdfText';
import { statementEntry, tradeEntry } from './entries';
import { FileImportError, type PdfFileImporter } from './fileImport';
import {
    documentLines,
    documentResult,
    ignored,
    parseAmount,
    reconciles,
    unsupported,
    type DocLine,
    type DocumentOutcome
} from './pdfDocument';

// Wealthsimple performance reports ("2020 Performance Report", "June 2020 Performance Report") of
// managed accounts, issued by Wealthsimple Inc. Each account has pages "<TFSA> activity" with the
// sections below, rows dated "Dec 29" without a year (the year is in the title). Every section but
// Trades ends with "Total - <section>". The Total column of Trades shows the position's view: a
// sale is negative although cash comes in. Amounts are in CAD. Symbols only, no ISIN; some dividends
// name no symbol at all. Format knowledge from Portfolio Performance
// (WealthsimpleInvestmentsIncPDFExtractor and its test documents, commit de1e464); no code taken over.

const SOURCE = 'Wealthsimple';
const CURRENCY = 'CAD';
const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Sept: '09', Oct: '10', Nov: '11', Dec: '12' };
const SECTIONS = ['Contributions and Deposits', 'Trades', 'Canadian and Foreign Dividends', 'Tax', 'Management Fees'];
const DASH = '[–-]';
const DATED = /^([A-Z][a-z]{2,3}) (\d{2})\b/;
const TICKER = '([A-Z0-9.]{1,6})';
const LAST_AMOUNT = /(-?)\$([\d.,]+)$/;

const TRADE = new RegExp(`^\\S+ \\d{2}(?: settled \\S+ \\d{2})? (Bought|Sold) ([\\d.,]+) of ${TICKER}\\s*${DASH}\\s*(.+?) for ([\\d.,]+) ([A-Z]{3}) -?[\\d.,]+ \\$[\\d.,]+ -?\\$([\\d.,]+)$`);
const TRANSFER = /^\S+ \d{2}(?: settled \S+ \d{2})? .*Transfer (In|Out): /;
const DIVIDEND = new RegExp(`^\\S+ \\d{2} ${TICKER}\\s*${DASH}\\s*(.+?): .*\\(record date\\) ([\\d.,]+) shares`);
const WITHHOLDING = new RegExp(`^\\S+ \\d{2} ${TICKER}\\s*${DASH}\\s*(.+?): Non-resident tax withheld at source`);
const FEE = /^\S+ \d{2} (Gross management fee to Wealthsimple|Promotions and discounts applied to Wealthsimple fee|Sales tax on management fee to Wealthsimple)\b/;

const signedAmount = (text: string): number => {
    const match = LAST_AMOUNT.exec(text);
    if (!match) return Number.NaN;
    const value = parseAmount(match[2], 'en');
    return match[1] ? -value : value;
};

type Context = { year: string; account: string; keys: Map<string, number> };

const dateOf = (text: string, year: string): string | null => {
    const match = DATED.exec(text);
    const month = match ? MONTHS[match[1]] : undefined;
    return month ? `${year}-${month}-${match![2]}` : null;
};

const nextKey = (context: Context, key: string) => {
    const full = `wealthsimple:${context.account}:${key}`;
    const count = (context.keys.get(full) || 0) + 1;
    context.keys.set(full, count);
    return count === 1 ? full : `${full}#${count}`;
};

const rowOf = (section: string, line: DocLine, context: Context): DocumentOutcome => {
    const date = dateOf(line.text, context.year);
    const amount = signedAmount(line.text);
    const label = `${section} (${line.text.split(' ').slice(0, 2).join(' ')})`;
    if (!date || !Number.isFinite(amount)) return unsupported(label, line);
    const raw = { source: 'wealthsimple-pdf', section, text: line.text };
    const statement = (key: string, type: 'Deposit' | 'Withdrawal' | 'Dividend' | 'Tax' | 'Fee', description: string, isin?: string, name?: string): DocumentOutcome => ({
        kind: 'booked',
        entries: [statementEntry({ source: SOURCE, externalId: nextKey(context, key), date, type, amount, currency: CURRENCY, description, isin, name, raw })]
    });

    if (section === 'Contributions and Deposits') {
        const transfer = TRANSFER.exec(line.text);
        if (!transfer || (transfer[1] === 'In') !== (amount > 0)) return unsupported(label, line);
        return statement(`${date}:${transfer[1]}:${amount}`, transfer[1] === 'In' ? 'Deposit' : 'Withdrawal', 'Electronic Funds Transfer');
    }
    if (section === 'Trades') {
        const trade = TRADE.exec(line.text);
        if (!trade) return unsupported(label, line);
        const [, action, shares, ticker, name, forAmount, currency, total] = trade;
        const value = parseAmount(forAmount, 'en');
        const side = action === 'Bought' ? 'buy' : 'sell';
        const quantity = parseAmount(shares, 'en');
        if (!(quantity > 0) || !reconciles([value], parseAmount(total, 'en'))) return unsupported(label, line);
        return {
            kind: 'booked',
            entries: [tradeEntry({
                source: SOURCE, externalId: nextKey(context, `${date}:${side}:${ticker}:${quantity}:${value}`), date, side, isin: ticker, name, quantity,
                amount: side === 'buy' ? -value : value, currency, raw
            })]
        };
    }
    if (section === 'Canadian and Foreign Dividends') {
        const dividend = DIVIDEND.exec(line.text);
        if (!dividend) return unsupported('Dividend without symbol', line);
        return statement(`${date}:dividend:${dividend[1]}:${amount}`, 'Dividend', 'Dividend', dividend[1], dividend[2]);
    }
    if (section === 'Tax') {
        const tax = WITHHOLDING.exec(line.text);
        if (!tax) return unsupported(label, line);
        return statement(`${date}:tax:${tax[1]}:${amount}`, 'Tax', 'Non-resident tax withheld at source', tax[1], tax[2]);
    }
    const fee = FEE.exec(line.text);
    if (!fee) return unsupported(label, line);
    return statement(`${date}:fee:${fee[1]}:${amount}`, 'Fee', fee[1]);
};

/** The account of each activity page, from "TFSA - HQ1234" above "TFSA activity". */
const accountsOf = (lines: DocLine[]): string[] => {
    const accounts = lines.flatMap((line, index) => {
        const match = /^(.+) activity$/.exec(line.text);
        if (!match) return [];
        const above = lines[index - 1]?.text || '';
        return [above.startsWith(`${match[1]} - `) ? above : match[1]];
    });
    return Array.from(new Set(accounts));
};

const report = (lines: DocLine[]): DocumentOutcome[] => {
    const year = lines.map((line) => /(\d{4}) Performance Report/.exec(line.text)?.[1]).find(Boolean);
    const accounts = accountsOf(lines);
    if (!year) return [unsupported('Performance Report', lines[0])];
    if (accounts.length > 1) throw new FileImportError('severalAccounts');
    if (accounts.length === 0) return [ignored('Performance Report', lines[0])];

    const context: Context = { year, account: accounts[0].replace(/\s+/g, ' '), keys: new Map() };
    const outcomes: DocumentOutcome[] = [];
    let section: string | null = null;
    let sum: number[] = [];
    let held: DocumentOutcome[] = [];
    const flush = () => {
        outcomes.push(...held);
        held = [];
        sum = [];
    };
    lines.slice(lines.findIndex((line) => / activity$/.test(line.text))).forEach((line) => {
        if (/^Glossary/.test(line.text)) section = null;
        const heading = SECTIONS.find((name) => line.text === name || line.text.startsWith(`${name} `));
        if (heading && !/\$/.test(line.text)) {
            flush();
            section = heading;
            return;
        }
        const total = /^Total - (.+?) (-?\$[\d.,]+)$/.exec(line.text);
        if (total) {
            if (section && total[1].startsWith(section)) {
                if (reconciles(sum, signedAmount(total[2]))) flush();
                else {
                    outcomes.push(unsupported(`${section}: total`, line));
                    held = [];
                    sum = [];
                }
            }
            section = null;
            return;
        }
        if (!DATED.test(line.text) || !MONTHS[DATED.exec(line.text)![1]]) return;
        if (!section) {
            outcomes.push(unsupported('Activity', line));
            return;
        }
        sum.push(signedAmount(line.text));
        held.push(rowOf(section, line, context));
    });
    flush();
    return outcomes;
};

const detect = (pdf: PdfDocumentText): string | null => {
    const lines = pdf.pages.flat();
    if (!lines.some((line) => /\bWealthsimple (?:Investments )?Inc\./.test(line))) return null;
    return lines.some((line) => /Performance Report/.test(line)) ? 'performance-report' : 'other';
};

const parseDocument = (pdf: PdfDocumentText): DocumentOutcome[] => {
    const lines = documentLines(pdf);
    if (detect(pdf) === 'performance-report') return report(lines);
    const title = lines.find((line) => line.text.length > 3) || lines[0];
    return [unsupported(title.text, title)];
};

const parse = (pdf: PdfDocumentText) => documentResult('wealthsimple', SOURCE, detect(pdf) || 'other', parseDocument(pdf));

export const wealthsimpleFileImporter: PdfFileImporter = {
    id: 'wealthsimple',
    broker: 'Wealthsimple',
    formats: ['PDF'],
    accept: '.pdf',
    multiple: true,
    input: 'pdf',
    sources: [
        {
            label: 'Portfolio Performance: WealthsimpleInvestmentsIncPDFExtractor',
            url: 'https://github.com/portfolio-performance/portfolio/blob/de1e4645b68b76f33b577a187295c4f4304d0204/name.abuchen.portfolio/src/name/abuchen/portfolio/datatransfer/pdf/WealthsimpleInvestmentsIncPDFExtractor.java'
        },
        { label: 'Wealthsimple: Find your monthly statements', url: 'https://help.wealthsimple.com/hc/en-ca/articles/360056580894-Find-your-monthly-statements' }
    ],
    verified: '2026-10-30',
    detect,
    parse
};
