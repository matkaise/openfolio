import { readDegiroAccountCsv, readDegiroTradesCsv, type DegiroRowNote } from '@/lib/csvParser';
import { batchPeriod, type FileImporter, type FileImportResult, type ImportRowNote } from './fileImport';
import { parseDegiroFiles } from './importBatch';

// DEGIRO (flatexDEGIRO) CSV exports in German: Transactions.csv (trades) and Account.csv
// (account statement with dividends, taxes, fees, deposits and balances). The parsing
// itself lives in csvParser.ts; this wraps it as a file importer.

const firstLine = (text: string) => text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';

/** Trade rows of Account.csv travel in the ignored list until all files are read. */
type PendingNote = ImportRowNote & Pick<DegiroRowNote, 'trade'>;

const toNote = ({ line, label, trade }: DegiroRowNote): PendingNote => ({ line, label, ...(trade ? { trade } : {}) });

/**
 * Trade rows of Account.csv are booked from Transactions.csv. A row whose trade is not there
 * (Account.csv imported alone, a shorter period, a trade the export leaves out) has a cash and
 * position effect that is missing from the import, so it is reported as not imported.
 */
const finishReport = (result: FileImportResult): FileImportResult => {
    const trades = result.batch.entries.filter((entry) => entry.kind === 'buy' || entry.kind === 'sell');
    const orders = new Set(trades.map((entry) => entry.orderId).filter(Boolean));
    const legs = new Set(trades.filter((entry) => !entry.orderId).map((entry) => entry.isin));
    const ignored: ImportRowNote[] = [];
    const missing: ImportRowNote[] = [];
    (result.report.ignored as PendingNote[]).forEach(({ trade, ...note }) => {
        if (!trade) ignored.push(note);
        else if (!(trade.orderId ? orders.has(trade.orderId) : legs.has(trade.isin))) missing.push(note);
    });
    return { ...result, report: { ...result.report, ignored, unsupported: [...result.report.unsupported, ...missing] } };
};

export const degiroFileImporter: FileImporter = {
    id: 'degiro',
    broker: 'DEGIRO',
    formats: ['CSV'],
    accept: '.csv',
    multiple: true,
    sources: [{ label: 'Export-To-Ghostfolio: DEGIRO', url: 'https://github.com/dickwolff/Export-To-Ghostfolio#degiro' }],
    verified: '2026-10-28',
    detect: (text) => {
        const header = firstLine(text);
        if (header.includes('Referenzbörse') && header.includes('Anzahl')) return 'transactions';
        if (header.includes('Valutadatum') && header.includes('Beschreibung')) return 'account';
        return null;
    },
    parse: (text) => {
        const batch = parseDegiroFiles([text]);
        const variant = degiroFileImporter.detect(text) || 'unknown';
        const { rows, notes } = variant === 'transactions' ? readDegiroTradesCsv(text) : readDegiroAccountCsv(text);
        return {
            batch,
            report: {
                importerId: 'degiro',
                variant,
                period: batchPeriod(batch),
                rows,
                ignored: notes.filter((note) => note.status === 'ignored').map(toNote),
                unsupported: notes.filter((note) => note.status === 'unsupported').map(toNote)
            }
        };
    },
    finish: finishReport
};
