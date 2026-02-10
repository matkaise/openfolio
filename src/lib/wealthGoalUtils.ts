import { type Currency, type ProjectData, type ProjectSettings } from '@/types/domain';

type WealthGoalSource = {
    amount?: number;
    currency?: Currency;
};

const isValidGoalAmount = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
);

export const resolveWealthGoalSource = (settings?: ProjectSettings | null): WealthGoalSource => {
    if (!settings) return {};

    const legacyEntries = Object.entries(settings.wealthGoals || {})
        .filter(([, amount]) => isValidGoalAmount(amount));

    const explicitCurrency = (
        typeof settings.wealthGoalCurrency === 'string' && settings.wealthGoalCurrency.trim().length > 0
            ? settings.wealthGoalCurrency
            : undefined
    );

    if (isValidGoalAmount(settings.wealthGoal)) {
        if (explicitCurrency) {
            return { amount: settings.wealthGoal, currency: explicitCurrency };
        }

        const matchedLegacyEntry = legacyEntries.find(([, amount]) => Math.abs(amount - settings.wealthGoal) < 0.5);
        return {
            amount: settings.wealthGoal,
            currency: matchedLegacyEntry?.[0] || settings.baseCurrency
        };
    }

    if (legacyEntries.length > 0) {
        const byBaseCurrency = legacyEntries.find(([currency]) => currency === settings.baseCurrency);
        const [currency, amount] = byBaseCurrency || legacyEntries[0];
        return { amount, currency };
    }

    return {};
};

export const normalizeWealthGoalSettings = (settings: ProjectSettings): ProjectSettings => {
    const source = resolveWealthGoalSource(settings);
    const withoutLegacyGoals: ProjectSettings = { ...settings };
    delete withoutLegacyGoals.wealthGoals;

    return {
        ...withoutLegacyGoals,
        wealthGoal: source.amount,
        wealthGoalCurrency: source.currency
    };
};

export const normalizeProjectWealthGoal = (project: ProjectData): ProjectData => ({
    ...project,
    settings: normalizeWealthGoalSettings(project.settings)
});
