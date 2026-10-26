"use client";

import React from 'react';
import { useProjectActions, useProjectStore } from '@/contexts/ProjectContext';
import { NUMBER_LOCALES, type NumberLocale } from '@/lib/format';
import { setLanguagePreference, useLanguagePreference, useT, type LanguagePreference } from '@/lib/i18n';
import { resolveThemePreference, type ThemePreference } from '@/lib/theme';
import type { ProjectSettings } from '@/types/domain';
import { CardHeader, Field, GlassCard, Segmented, SelectInput } from '@/components/ui/primitives';

const THEMES: ThemePreference[] = ['dark', 'light', 'system'];

/** Settings page: appearance (theme, language, number format) and how returns are calculated. */
export const SettingsContent = () => {
    const t = useT();
    const { updateProject } = useProjectActions();
    const settings = useProjectStore((state) => state.project?.settings);
    const languagePreference = useLanguagePreference();
    const set = (patch: Partial<ProjectSettings>) => updateProject((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));

    // Language names stay in their own language, so they can be found in either
    const languageOptions: { value: LanguagePreference; label: string }[] = [
        { value: 'system', label: t.language.system },
        { value: 'de', label: 'Deutsch' },
        { value: 'en', label: 'English' }
    ];

    return (
        <div className="ui-grid-2" style={{ alignItems: 'start' }}>
            <GlassCard>
                <CardHeader title={t.settings.appearance} />
                <div className="ui-stack">
                    <Field group label={t.language.label} hint={t.language.hint}>
                        <Segmented options={languageOptions} value={languagePreference} onChange={setLanguagePreference} ariaLabel={t.language.label} />
                    </Field>
                    <Field group label={t.theme.label} hint={t.theme.hint}>
                        <Segmented
                            options={THEMES.map((value) => ({ value, label: t.theme[value] }))}
                            value={resolveThemePreference(settings)}
                            onChange={(theme) => set({ theme })}
                            ariaLabel={t.theme.label}
                        />
                    </Field>
                    <Field label={t.settings.numberFormat} hint={t.settings.numberFormatHint}>
                        <SelectInput
                            value={settings?.numberLocale || ''}
                            onChange={(e) => set({ numberLocale: (e.target.value || undefined) as NumberLocale | undefined })}
                        >
                            <option value="">{t.settings.numberFormatAuto}</option>
                            {NUMBER_LOCALES.map((locale) => (
                                <option key={locale} value={locale}>{t.numberLocales[locale]}</option>
                            ))}
                        </SelectInput>
                    </Field>
                </div>
            </GlassCard>

            <GlassCard>
                <CardHeader title={t.settings.performance} />
                <div className="ui-stack">
                    <Field group label={t.settings.method} hint={t.settings.methodHint}>
                        <Segmented
                            options={(['MWR', 'TWR'] as const).map((value) => ({ value, label: t.settings.methods[value] }))}
                            value={settings?.performanceMethod || 'MWR'}
                            onChange={(performanceMethod) => set({ performanceMethod })}
                            ariaLabel={t.settings.method}
                        />
                    </Field>
                    <Field group label={t.settings.smoothing} hint={t.settings.smoothingHint}>
                        <Segmented
                            options={(['1d', '7d', '1m'] as const).map((value) => ({ value, label: t.settings.smoothings[value] }))}
                            value={settings?.performanceSmoothing || '1d'}
                            onChange={(performanceSmoothing) => set({ performanceSmoothing })}
                            ariaLabel={t.settings.smoothing}
                        />
                    </Field>
                </div>
            </GlassCard>
        </div>
    );
};
