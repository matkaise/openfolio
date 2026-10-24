// Money-weighted return (internal rate of return for irregular dates), annualized.

import { isNear } from '../math';

export type CashFlow = { date: string; amount: number }; // investor view: deposit < 0, payout > 0

const DAY_MS = 24 * 60 * 60 * 1000;
const yearsBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS / 365;

/** Annual rate r with sum(amount / (1 + r)^years) = 0, or null if there is none. */
export const xirr = (flows: CashFlow[]): number | null => {
    const relevant = flows.filter((f) => Number.isFinite(f.amount) && f.amount !== 0);
    if (!relevant.some((f) => f.amount < 0) || !relevant.some((f) => f.amount > 0)) return null;

    const start = relevant.reduce((min, f) => (f.date < min ? f.date : min), relevant[0].date);
    const terms = relevant.map((f) => ({ t: yearsBetween(start, f.date), amount: f.amount }));
    const npv = (rate: number) => terms.reduce((sum, { t, amount }) => sum + amount / Math.pow(1 + rate, t), 0);
    const derivative = (rate: number) => terms.reduce((sum, { t, amount }) => sum - (t * amount) / Math.pow(1 + rate, t + 1), 0);

    // Newton from 10 %, falling back to bisection if it leaves the valid range
    let rate = 0.1;
    for (let i = 0; i < 50; i += 1) {
        const value = npv(rate);
        const slope = derivative(rate);
        if (!Number.isFinite(value) || !Number.isFinite(slope) || slope === 0) break;
        const next = rate - value / slope;
        if (!Number.isFinite(next) || next <= -0.9999) break;
        if (isNear(next, rate, 1e-10)) return next;
        rate = next;
    }

    let low = -0.9999;
    let high = 10;
    let fLow = npv(low);
    const fHigh = npv(high);
    if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) return null;
    for (let i = 0; i < 200; i += 1) {
        const mid = (low + high) / 2;
        const fMid = npv(mid);
        if (isNear(fMid, 0, 1e-9) || high - low < 1e-10) return mid;
        if (fLow * fMid < 0) {
            high = mid;
        } else {
            low = mid;
            fLow = fMid;
        }
    }
    return (low + high) / 2;
};

const MIN_DAYS_TO_ANNUALIZE = 30;

/**
 * Annualized money-weighted return of a value history: every change of `invested` is a
 * deposit or withdrawal, the last value is what the investor would get today.
 * Null for histories shorter than a month (annualizing those is misleading).
 */
export const annualizedReturnFromHistory = (
    history: { date: string; value: number; invested: number }[]
): number | null => {
    if (history.length < 2) return null;
    const first = history[0];
    const last = history[history.length - 1];
    if (yearsBetween(first.date, last.date) * 365 < MIN_DAYS_TO_ANNUALIZE) return null;

    const flows: CashFlow[] = [{ date: first.date, amount: -first.invested }];
    for (let i = 1; i < history.length; i += 1) {
        const delta = history[i].invested - history[i - 1].invested;
        if (!isNear(delta, 0, 1e-9)) flows.push({ date: history[i].date, amount: -delta });
    }
    flows.push({ date: last.date, amount: last.value });
    return xirr(flows);
};
