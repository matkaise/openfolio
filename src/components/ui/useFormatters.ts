"use client";

import { useMemo } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { createFormatters, DEFAULT_NUMBER_LOCALE } from '@/lib/format';

/** Formatters for the project's display currency and number format setting. */
export const useFormatters = () => {
    const { project } = useProject();
    const locale = project?.settings.numberLocale || DEFAULT_NUMBER_LOCALE;
    const currency = project?.settings.baseCurrency || 'EUR';
    return useMemo(() => createFormatters(locale, currency), [locale, currency]);
};
