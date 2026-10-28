import { describe, expect, it } from 'vitest';
import { columnIndex, findHeaderRow, normalizeHeader, parseDotDecimal, readCsv } from '../csv';

describe('readCsv', () => {
  it('drops the BOM, reads CRLF and LF and skips empty lines', () => {
    expect(readCsv('﻿a;b\r\n1;2\r\n\r\n3;4\n', ';')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('keeps delimiters, escaped quotes and line breaks inside quoted cells', () => {
    const rows = readCsv('Name,Note\n"ACME, Inc.","He said ""hi""\nsecond line"\n', ',');
    expect(rows).toEqual([['Name', 'Note'], ['ACME, Inc.', 'He said "hi"\nsecond line']]);
  });

  it('keeps a legitimate trailing quote inside a cell', () => {
    expect(readCsv('a\n"12"" screen"\n', ',')).toEqual([['a'], ['12" screen']]);
  });
});

describe('header helpers', () => {
  it('normalizes case, accents and punctuation', () => {
    expect(normalizeHeader('Stückpreis')).toBe('stuckpreis');
    expect(normalizeHeader('Order #')).toBe('order');
  });

  it('finds the header row below metadata lines', () => {
    const rows = [['Account', '123'], ['Period', '2024'], ['Date', 'Amount', 'Currency'], ['01-01-2024', '1', 'EUR']];
    expect(findHeaderRow(rows, ['date', 'AMOUNT'])).toBe(2);
    expect(findHeaderRow(rows, ['date', 'ISIN'])).toBe(-1);
  });

  it('looks up columns by any alias', () => {
    const column = columnIndex(['Datum', 'Stückpreis', 'Währung']);
    expect(column('Unit price', 'Stückpreis')).toBe(1);
    expect(column('Currency', 'Währung')).toBe(2);
    expect(column('ISIN')).toBe(-1);
  });
});

describe('parseDotDecimal', () => {
  it('reads plain numbers with a dot as decimal separator', () => {
    expect(parseDotDecimal('-1234.50')).toBe(-1234.5);
    expect(parseDotDecimal('7')).toBe(7);
  });

  it('rejects other number formats instead of guessing', () => {
    expect(parseDotDecimal('1,5')).toBeNaN();
    expect(parseDotDecimal("1'234.50")).toBeNaN();
    expect(parseDotDecimal('')).toBeNaN();
  });
});
