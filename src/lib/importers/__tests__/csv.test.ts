import { describe, expect, it } from 'vitest';
import { columnIndex, findHeaderRow, locateHeader, normalizeHeader, parseDotDecimal, parseUsNumber, readCsv } from '../csv';

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

  it('finds delimiter and header row of a converted file', () => {
    expect(locateHeader('\uFEFFTitle\n\nDate;Amount\n01.01.2024;1,5\n', ['date', 'amount'])).toEqual({ delimiter: ';', row: 1, header: ['Date', 'Amount'] });
    expect(locateHeader('Date\tAmount\n', ['Date', 'Amount'])).toEqual({ delimiter: '\t', row: 0, header: ['Date', 'Amount'] });
    expect(locateHeader('Date,Amount\n', ['Date', 'ISIN'])).toBeNull();
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

describe('parseUsNumber', () => {
  it('reads dollar amounts with thousands separators, signs and parentheses', () => {
    expect(parseUsNumber('-$1,259.59')).toBe(-1259.59);
    expect(parseUsNumber('$500135.00')).toBe(500135);
    expect(parseUsNumber('500,135')).toBe(500135);
    expect(parseUsNumber('($0.40)')).toBe(-0.4);
    expect(parseUsNumber('$-3.00')).toBe(-3);
    expect(parseUsNumber('1.6531')).toBe(1.6531);
  });

  it('rejects other formats instead of guessing', () => {
    expect(parseUsNumber('1.259,59')).toBeNaN();
    expect(parseUsNumber('12,34')).toBeNaN();
    expect(parseUsNumber('--1')).toBeNaN();
    expect(parseUsNumber('')).toBeNaN();
  });
});
