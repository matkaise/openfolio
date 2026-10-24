import type { ProjectSettings } from '@/types/domain';

export type ThemePreference = 'dark' | 'light' | 'system';

export const THEME_STORAGE_KEY = 'openfolio-theme';

/** Older project files stored a boolean dark mode; no setting at all means "follow the system". */
export const resolveThemePreference = (settings?: Pick<ProjectSettings, 'theme' | 'isDarkMode'> | null): ThemePreference => {
    if (settings?.theme === 'dark' || settings?.theme === 'light' || settings?.theme === 'system') return settings.theme;
    if (settings?.isDarkMode === true) return 'dark';
    if (settings?.isDarkMode === false) return 'light';
    return 'system';
};

/** Sets <html data-theme>; "system" removes it so prefers-color-scheme applies. */
export const applyThemePreference = (preference: ThemePreference) => {
    const root = document.documentElement;
    if (preference === 'system') {
        delete root.dataset.theme;
    } else {
        root.dataset.theme = preference;
    }
    try {
        // Per-browser convenience: the launcher (no project open yet) starts in the last theme.
        localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
        // Storage can be unavailable (private mode); the theme still applies for this page.
    }
};

/** Runs before first paint (inline in <head>) to avoid a flash in the wrong theme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export const NEXT_THEME: Record<ThemePreference, ThemePreference> = { dark: 'light', light: 'system', system: 'dark' };
export const THEME_LABELS: Record<ThemePreference, string> = { dark: 'Dunkel', light: 'Hell', system: 'System' };
