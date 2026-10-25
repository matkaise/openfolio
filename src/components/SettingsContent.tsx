"use client";

import React from 'react';
import { useProjectActions, useProjectStore } from '@/contexts/ProjectContext';
import { DEFAULT_NUMBER_LOCALE, NUMBER_LOCALES, type NumberLocale } from '@/lib/format';
import { resolveThemePreference, THEME_LABELS, type ThemePreference } from '@/lib/theme';
import type { ProjectSettings } from '@/types/domain';
import { CardHeader, Field, GlassCard, Segmented, SelectInput } from '@/components/ui/primitives';

const THEME_OPTIONS = (['dark', 'light', 'system'] as ThemePreference[]).map((value) => ({ value, label: THEME_LABELS[value] }));
const METHOD_OPTIONS: { value: 'MWR' | 'TWR'; label: string }[] = [
    { value: 'MWR', label: 'Geldgewichtet (MWR)' },
    { value: 'TWR', label: 'Zeitgewichtet (TWR)' }
];
const SMOOTHING_OPTIONS: { value: '1d' | '7d' | '1m'; label: string }[] = [
    { value: '1d', label: '1 Tag' },
    { value: '7d', label: '7 Tage' },
    { value: '1m', label: '1 Monat' }
];

/** Settings page: appearance (theme, number format) and how returns are calculated. */
export const SettingsContent = () => {
    const { updateProject } = useProjectActions();
    const settings = useProjectStore((state) => state.project?.settings);
    const set = (patch: Partial<ProjectSettings>) => updateProject((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));

    return (
        <div className="ui-grid-2" style={{ alignItems: 'start' }}>
            <GlassCard>
                <CardHeader title="Darstellung" />
                <div className="ui-stack">
                    <Field group label="Design" hint="Dunkel, hell oder wie im Betriebssystem eingestellt.">
                        <Segmented options={THEME_OPTIONS} value={resolveThemePreference(settings)} onChange={(theme) => set({ theme })} ariaLabel="Design" />
                    </Field>
                    <Field label="Zahlenformat" hint="Tausender- und Dezimaltrennzeichen für alle Beträge.">
                        <SelectInput
                            value={settings?.numberLocale || DEFAULT_NUMBER_LOCALE}
                            onChange={(e) => set({ numberLocale: e.target.value as NumberLocale })}
                        >
                            {NUMBER_LOCALES.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </SelectInput>
                    </Field>
                </div>
            </GlassCard>

            <GlassCard>
                <CardHeader title="Performance" />
                <div className="ui-stack">
                    <Field group label="Renditeberechnung" hint="MWR berücksichtigt Ein- und Auszahlungen, TWR zeigt die reine Anlagestrategie ohne Cashflow-Effekte.">
                        <Segmented options={METHOD_OPTIONS} value={settings?.performanceMethod || 'MWR'} onChange={(performanceMethod) => set({ performanceMethod })} ariaLabel="Renditeberechnung" />
                    </Field>
                    <Field group label="Glättung" hint="Glättet nur die Darstellung der Performance-Charts. Kennzahlen bleiben unverändert.">
                        <Segmented options={SMOOTHING_OPTIONS} value={settings?.performanceSmoothing || '1d'} onChange={(performanceSmoothing) => set({ performanceSmoothing })} ariaLabel="Glättung" />
                    </Field>
                </div>
            </GlassCard>
        </div>
    );
};
