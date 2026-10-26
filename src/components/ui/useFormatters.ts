"use client";

import { useMemo } from 'react';
import { useProjectStore } from '@/contexts/ProjectContext';
import { createFormatters } from '@/lib/format';
import { LANGUAGE_LOCALES, useLanguage } from '@/lib/i18n';

/** Formatters for the interface language, the display currency and the number format setting. */
export const useFormatters = () => {
    const language = useLanguage();
    // Only the two settings: other project changes do not re-render the caller
    const locale = useProjectStore((state) => state.project?.settings.numberLocale) || LANGUAGE_LOCALES[language].number;
    const currency = useProjectStore((state) => state.project?.settings.baseCurrency) || 'EUR';
    const dateLocale = LANGUAGE_LOCALES[language].date;
    return useMemo(() => createFormatters(locale, currency, dateLocale), [locale, currency, dateLocale]);
};
