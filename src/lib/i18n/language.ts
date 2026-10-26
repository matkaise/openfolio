// Interface language: German or English. "system" follows the browser languages; the
// choice is a per-browser preference (like the theme), so the launcher already uses it.

export type Language = 'de' | 'en';
export type LanguagePreference = Language | 'system';

export const LANGUAGES: Language[] = ['de', 'en'];
export const LANGUAGE_STORAGE_KEY = 'openfolio-language';
/** Server render and tests; the client switches to the detected language after mount. */
export const DEFAULT_LANGUAGE: Language = 'de';
/** For browser languages Openfolio does not speak. */
export const FALLBACK_LANGUAGE: Language = 'en';

const isLanguage = (value: unknown): value is Language => value === 'de' || value === 'en';

/** First supported language in the browser's preference list, e.g. ["fr-FR", "de-CH"] → "de". */
export const detectLanguage = (browserLanguages: readonly string[] | undefined | null): Language => {
    for (const tag of browserLanguages ?? []) {
        const primary = (tag || '').slice(0, 2).toLowerCase();
        if (isLanguage(primary)) return primary;
    }
    return FALLBACK_LANGUAGE;
};

export const parseLanguagePreference = (stored: unknown): LanguagePreference => (
    isLanguage(stored) || stored === 'system' ? stored : 'system'
);

export const resolveLanguage = (preference: LanguagePreference, browserLanguages: readonly string[] | undefined | null): Language => (
    preference === 'system' ? detectLanguage(browserLanguages) : preference
);

/** Locale for dates and, unless the project sets a number format, for amounts. */
export const LANGUAGE_LOCALES: Record<Language, { date: string; number: 'de-DE' | 'en-US' }> = {
    de: { date: 'de-DE', number: 'de-DE' },
    en: { date: 'en-GB', number: 'en-US' }
};

/**
 * Runs before first paint (inline in <head>): sets <html lang> and, when the page will switch
 * from the server-rendered German to English, hides it until the switch (no flash of German).
 * Mirrors detectLanguage; the timeout shows the page even if the app script fails.
 */
export const LANGUAGE_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,p=null;try{p=localStorage.getItem('${LANGUAGE_STORAGE_KEY}');}catch(e){}var l=(p==='de'||p==='en')?p:null;if(!l){var ls=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];for(var i=0;i<ls.length;i++){var c=String(ls[i]||'').slice(0,2).toLowerCase();if(c==='de'||c==='en'){l=c;break;}}}l=l||'${FALLBACK_LANGUAGE}';d.lang=l;if(l!=='${DEFAULT_LANGUAGE}'){d.setAttribute('data-i18n-pending','');setTimeout(function(){d.removeAttribute('data-i18n-pending');},3000);}}catch(e){}})();`;
