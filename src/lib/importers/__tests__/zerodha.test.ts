import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/types/domain';
import { FileImportError, isPdfImporter, type FileImporter } from '../fileImport';
import { detectFileImporter, FILE_IMPORTERS, readImportFiles } from '../fileImporters';
import { applyImportBatch } from '../importBatch';
import { zerodhaFileImporter as importer } from '../zerodha';

const csv = readFileSync(path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'zerodha.csv'), 'utf-8');
const header = csv.split('\n')[0];
const target = { id: 'p1', name: 'Zerodha', isNew: true };
const code = (run: () => unknown) => {
    try {
        run();
    } catch (error) {
        return error instanceof FileImportError ? error.code : String(error);
    }
    return null;
};

describe('Zerodha tradebook', () => {
    it('is recognised by exactly one importer, by content', () => {
        expect(detectFileImporter(csv)?.id).toBe('zerodha');
        const matches = FILE_IMPORTERS.filter((item): item is FileImporter => !isPdfImporter(item)).filter((item) => item.detect(csv) !== null);
        expect(matches.map((item) => item.id)).toEqual(['zerodha']);
        expect(importer.detect('symbol,isin\nA,B\n')).toBeNull();
    });

    it('books equity and fund fills in INR and reports derivatives', () => {
        const { batch, report } = importer.parse(csv);
        expect(report).toMatchObject({ importerId: 'zerodha', variant: 'tradebook', rows: 6, ignored: [], period: { from: '2025-04-09', to: '2025-09-10' } });
        expect(report.unsupported).toEqual([{ line: 7, label: 'FO sell' }]);
        expect(batch.entries.map((entry) => [entry.date, entry.kind, entry.isin, entry.quantity, entry.amount, entry.currency])).toEqual([
            ['2025-04-09', 'buy', 'INE000Z01011', 5, -6721, 'INR'],
            ['2025-04-09', 'buy', 'INE000Z01011', 3, -4032.75, 'INR'],
            ['2025-06-04', 'buy', 'INF000Z01019', 110, -11664.4, 'INR'],
            ['2025-09-10', 'sell', 'INE000Z01011', -4, 6000, 'INR'],
            ['2025-08-01', 'buy', 'INF000Z01027', 62.337, -999.95, 'INR']
        ]);
        expect(batch.entries[0]).toMatchObject({ name: 'BEISPIEL', orderId: '1300000000000001', externalId: 'zerodha:NSE:EQ:600000001' });
        expect(batch.entries.every((entry) => entry.fee === undefined)).toBe(true);
    });

    it('books fills of one order and equal fills with their own trade id separately', () => {
        const row = (id: string) => `BEISPIEL,INE000Z01011,2025-04-09,NSE,EQ,EQ,buy,false,1.000000,100.000000,${id},13,2025-04-09T09:37:45`;
        expect(importer.parse([header, row('1'), row('2')].join('\n')).batch.entries.map((entry) => entry.externalId)).toEqual(['zerodha:NSE:EQ:1', 'zerodha:NSE:EQ:2']);
        const withoutId = importer.parse([header, row(''), row('')].join('\n')).batch.entries;
        expect(new Set(withoutId.map((entry) => entry.externalId)).size).toBe(2);
    });

    it('keeps the same trade id on two exchanges apart', () => {
        const row = (exchange: string) => `BEISPIEL,INE000Z01011,2025-04-09,${exchange},EQ,EQ,buy,false,1.000000,100.000000,1,13,2025-04-09T09:37:45`;
        expect(new Set(importer.parse([header, row('NSE'), row('BSE')].join('\n')).batch.entries.map((entry) => entry.externalId)).size).toBe(2);
    });

    it('falls back to the symbol without an ISIN and never invents one', () => {
        const { batch } = importer.parse(`${header}\nBEISPIEL,,2025-04-09,NSE,EQ,EQ,buy,false,1.000000,100.000000,1,13,2025-04-09T09:37:45`);
        expect(batch.entries[0].isin).toBe('BEISPIEL');
    });

    it('accepts F&O files with expiry_date and reports all their rows', () => {
        const { batch, report } = importer.parse(`${header},expiry_date\nNIFTY2560524750PE,,2025-06-02,NSE,FO,,sell,false,150.000000,326.800000,1,15,2025-06-02T09:21:55,2025-06-05`);
        expect(batch.entries).toEqual([]);
        expect(report.unsupported).toEqual([{ line: 2, label: 'FO sell' }]);
    });

    it('reports unknown trade types and rejects broken values', () => {
        expect(importer.parse(`${header}\nA,INE000Z01011,2025-04-09,NSE,EQ,EQ,bonus,false,1.000000,0.000000,1,1,2025-04-09T00:00:00`).report.unsupported).toEqual([{ line: 2, label: 'EQ bonus' }]);
        expect(importer.parse(`${header}\nA,INE000Z01011,2025-04-09,NSE,EQ,EQ,buy,false,1.000000,0.000000,1,1,2025-04-09T00:00:00`).batch.entries).toEqual([]);
        expect(code(() => importer.parse(`${header}\nA,INE000Z01011,09/04/2025,NSE,EQ,EQ,buy,false,1.000000,1.000000,1,1,x`))).toBe('invalidDate');
        expect(code(() => importer.parse(`${header}\nA,INE000Z01011,2025-04-09,NSE,EQ,EQ,buy,false,abc,1.000000,1,1,x`))).toBe('invalidNumber');
        expect(code(() => importer.parse(header))).toBe('noRows');
    });

    it('handles a BOM and CRLF', () => {
        expect(importer.parse(`﻿${csv.replace(/\n/g, '\r\n')}`).batch.entries).toHaveLength(5);
    });

    it('imports overlapping yearly exports without double bookings', () => {
        const [head, ...rows] = csv.trim().split('\n');
        const first = applyImportBatch(createEmptyProject(), readImportFiles([{ name: 'fy1.csv', text: [head, ...rows.slice(0, 3)].join('\n') }]).result.batch, target);
        expect(first.summary).toMatchObject({ addedTransactions: 3, duplicateTransactions: 0 });
        const second = applyImportBatch(first.project, readImportFiles([{ name: 'fy2.csv', text: csv }]).result.batch, { ...target, isNew: false });
        expect(second.summary).toMatchObject({ addedTransactions: 2, duplicateTransactions: 3 });
    });

    it('reads a segment file together with another', () => {
        const { importer: found, result } = readImportFiles([{ name: 'eq.csv', text: csv }, { name: 'mf.csv', text: `${header}\nBEISPIEL FUND,INF000Z01035,2025-08-02,BSE,MF,,buy,false,1.000000,10.000000,900,900,2025-08-02T00:00:00` }]);
        expect(found.id).toBe('zerodha');
        expect(result.batch.entries).toHaveLength(6);
    });
});
