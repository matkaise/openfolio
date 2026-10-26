"use client";

import { useEffect } from 'react';
import { initLanguage, refreshSystemLanguage } from '@/lib/i18n';

/**
 * Applies the stored or detected language after hydration (the server renders German) and
 * shows the page again if the boot script hid it for the switch.
 */
export const LanguageSync = () => {
    useEffect(() => {
        initLanguage();
        // After the re-render in the new language has been committed
        const frame = requestAnimationFrame(() => document.documentElement.removeAttribute('data-i18n-pending'));
        window.addEventListener('languagechange', refreshSystemLanguage);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('languagechange', refreshSystemLanguage);
        };
    }, []);
    return null;
};
