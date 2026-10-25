"use client";

import { useMemo } from 'react';
import { useProjectStore } from '@/contexts/ProjectContext';
import { createFormatters, DEFAULT_NUMBER_LOCALE } from '@/lib/format';

/** Formatters for the project's display currency and number format setting. */
export const useFormatters = () => {
    // Only the two settings: other project changes do not re-render the caller
    const locale = useProjectStore((state) => state.project?.settings.numberLocale) || DEFAULT_NUMBER_LOCALE;
    const currency = useProjectStore((state) => state.project?.settings.baseCurrency) || 'EUR';
    return useMemo(() => createFormatters(locale, currency), [locale, currency]);
};
