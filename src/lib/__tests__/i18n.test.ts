import { describe, expect, it } from 'vitest';
import {
    detectLanguage,
    getT,
    LANGUAGE_BOOT_SCRIPT,
    languageStore,
    MESSAGES,
    parseLanguagePreference,
    resolveLanguage
} from '../i18n';

describe('detectLanguage', () => {
    it('takes the first supported browser language', () => {
        expect(detectLanguage(['de-CH', 'en'])).toBe('de');
        expect(detectLanguage(['en-US', 'de'])).toBe('en');
        expect(detectLanguage(['fr-FR', 'de-DE'])).toBe('de');
    });

    it('falls back to English for languages Openfolio does not speak', () => {
        expect(detectLanguage(['fr-FR', 'it'])).toBe('en');
        expect(detectLanguage([])).toBe('en');
        expect(detectLanguage(undefined)).toBe('en');
    });
});

describe('language preference', () => {
    it('follows the browser on "system" and otherwise uses the choice', () => {
        expect(resolveLanguage('system', ['de-AT'])).toBe('de');
        expect(resolveLanguage('en', ['de-AT'])).toBe('en');
        expect(resolveLanguage('de', ['en-GB'])).toBe('de');
    });

    it('treats unknown stored values as "system"', () => {
        expect(parseLanguagePreference('en')).toBe('en');
        expect(parseLanguagePreference('fr')).toBe('system');
        expect(parseLanguagePreference(null)).toBe('system');
    });

    it('starts in German until the client applies the detected language', () => {
        expect(languageStore.getState().language).toBe('de');
        expect(getT().common.cancel).toBe('Abbrechen');
    });
});

/** Key paths with the kind of value ("string" or "function/<arity>"). */
const shape = (value: unknown, path = ''): string[] => {
    if (typeof value === 'function') return [`${path}:function/${value.length}`];
    if (typeof value === 'string') return [`${path}:string`];
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().flatMap((key) => shape((value as Record<string, unknown>)[key], `${path}.${key}`));
    }
    return [`${path}:${typeof value}`];
};

const strings = (value: unknown, path = ''): [string, string][] => {
    if (typeof value === 'string') return [[path, value]];
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, child]) => strings(child, `${path}.${key}`));
    }
    return [];
};

describe('messages', () => {
    it('has the same keys and parameters in English and German', () => {
        expect(shape(MESSAGES.en)).toEqual(shape(MESSAGES.de));
    });

    it('has no empty texts', () => {
        for (const language of ['de', 'en'] as const) {
            const empty = strings(MESSAGES[language]).filter(([, text]) => text.trim() === '');
            expect(empty, language).toEqual([]);
        }
    });
});

describe('language boot script', () => {
    const run = (stored: string | null, languages: string[]) => {
        const attributes = new Map<string, string>();
        const root = {
            lang: '',
            setAttribute: (name: string, value: string) => attributes.set(name, value),
            removeAttribute: (name: string) => attributes.delete(name)
        };
        const fakeWindow = {
            document: { documentElement: root },
            navigator: { languages, language: languages[0] },
            localStorage: { getItem: () => stored },
            setTimeout: () => 0
        };
        new Function('document', 'navigator', 'localStorage', 'setTimeout', LANGUAGE_BOOT_SCRIPT)(
            fakeWindow.document, fakeWindow.navigator, fakeWindow.localStorage, fakeWindow.setTimeout
        );
        return { lang: root.lang, pending: attributes.has('data-i18n-pending') };
    };

    it('detects like detectLanguage and hides the page only when it will switch to English', () => {
        expect(run(null, ['de-DE'])).toEqual({ lang: 'de', pending: false });
        expect(run(null, ['fr-FR', 'en-US'])).toEqual({ lang: 'en', pending: true });
        expect(run(null, ['fr-FR'])).toEqual({ lang: 'en', pending: true });
    });

    it('prefers the stored choice', () => {
        expect(run('de', ['en-US'])).toEqual({ lang: 'de', pending: false });
        expect(run('en', ['de-DE'])).toEqual({ lang: 'en', pending: true });
        expect(run('system', ['de-DE'])).toEqual({ lang: 'de', pending: false });
    });
});
