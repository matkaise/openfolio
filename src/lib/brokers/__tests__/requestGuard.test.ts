import { describe, expect, it } from 'vitest';
import { isCrossSiteRequest, readJsonObject } from '../requestGuard';

const request = (headers: Record<string, string>, url = 'http://127.0.0.1:3100/api/brokers/trading212') => ({
    url,
    headers: new Headers(headers)
});

describe('isCrossSiteRequest (M10)', () => {
    it('accepts the app itself and clients without browser headers', () => {
        expect(isCrossSiteRequest(request({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
        expect(isCrossSiteRequest(request({}))).toBe(false);
        expect(isCrossSiteRequest(request({ origin: 'http://127.0.0.1:3100' }))).toBe(false);
    });

    it('refuses requests from other sites', () => {
        expect(isCrossSiteRequest(request({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
        expect(isCrossSiteRequest(request({ 'sec-fetch-site': 'same-site' }))).toBe(true);
        expect(isCrossSiteRequest(request({ origin: 'https://evil.example' }))).toBe(true);
    });
});

describe('readJsonObject (H15)', () => {
    const body = (text: string) => ({ json: async () => JSON.parse(text) });

    it('returns objects and rejects null, arrays and broken JSON', async () => {
        expect(await readJsonObject(body('{"since":"2024-01-01"}'))).toEqual({ since: '2024-01-01' });
        expect(await readJsonObject(body('null'))).toBeNull();
        expect(await readJsonObject(body('[1]'))).toBeNull();
        expect(await readJsonObject(body('{'))).toBeNull();
    });
});
