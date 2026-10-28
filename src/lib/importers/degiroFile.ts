import { batchPeriod, type FileImporter } from './fileImport';
import { parseDegiroFiles } from './importBatch';

// DEGIRO (flatexDEGIRO) CSV exports in German: Transactions.csv (trades) and Account.csv
// (account statement with dividends, taxes, fees, deposits and balances). The parsing
// itself lives in csvParser.ts; this wraps it as a file importer.

const firstLine = (text: string) => text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';

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
        const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
        return {
            batch,
            report: {
                importerId: 'degiro',
                variant: degiroFileImporter.detect(text) || 'unknown',
                period: batchPeriod(batch),
                rows: Math.max(0, lines - 1),
                ignored: [],
                unsupported: []
            }
        };
    }
};
