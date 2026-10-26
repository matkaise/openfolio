import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { de, type Messages } from './messages/de';
import { en } from './messages/en';
import {
    DEFAULT_LANGUAGE,
    LANGUAGE_STORAGE_KEY,
    parseLanguagePreference,
    resolveLanguage,
    type Language,
    type LanguagePreference
} from './language';

export * from './language';
export type { Messages } from './messages/de';

// UI texts live in messages/de.ts (the source) and messages/en.ts (typed against it, so a
// missing or extra key fails the type check). Components read them with useT().

export const MESSAGES: Record<Language, Messages> = { de, en };

interface LanguageState {
    preference: LanguagePreference;
    language: Language;
}

export const languageStore = createStore<LanguageState>(() => ({ preference: 'system', language: DEFAULT_LANGUAGE }));

const browserLanguages = (): readonly string[] => (
    typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
);

const apply = (preference: LanguagePreference) => {
    const language = resolveLanguage(preference, browserLanguages());
    languageStore.setState({ preference, language });
    if (typeof document !== 'undefined') document.documentElement.lang = language;
};

/** Reads the stored preference (client only); called once after mount. */
export const initLanguage = () => {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
        // Storage can be unavailable (private mode): follow the browser
    }
    apply(parseLanguagePreference(stored));
};

/** Re-detects when the browser languages change and the preference is "system". */
export const refreshSystemLanguage = () => {
    if (languageStore.getState().preference === 'system') apply('system');
};

export const setLanguagePreference = (preference: LanguagePreference) => {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
    } catch {
        // Applies for this page even without storage
    }
    apply(preference);
};

export const useLanguage = () => useStore(languageStore, (state) => state.language);
export const useLanguagePreference = () => useStore(languageStore, (state) => state.preference);

/** Texts in the current language; re-renders the caller when the language changes. */
export const useT = (): Messages => MESSAGES[useLanguage()];

/** Texts outside React (services, workflows). Prefer useT() in components. */
export const getT = (): Messages => MESSAGES[languageStore.getState().language];
