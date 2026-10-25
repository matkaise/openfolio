import { type Currency, type ProjectSettings } from '@/types/domain';

type WealthGoalSource = {
    amount?: number;
    currency?: Currency;
};

const isValidGoalAmount = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
);

export const resolveWealthGoalSource = (settings?: ProjectSettings | null): WealthGoalSource => {
    if (!settings || !isValidGoalAmount(settings.wealthGoal)) return {};
    const currency = settings.wealthGoalCurrency?.trim() || settings.baseCurrency;
    return { amount: settings.wealthGoal, currency };
};

/** Pins the goal's currency, e.g. before the display currency changes. */
export const normalizeWealthGoalSettings = (settings: ProjectSettings): ProjectSettings => {
    const source = resolveWealthGoalSource(settings);
    return { ...settings, wealthGoal: source.amount, wealthGoalCurrency: source.currency };
};
