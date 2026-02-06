import { type FxData } from '@/types/domain';

const DEFAULT_FALLBACK_RATE = 1;

export const getFxRate = (
  fxData: FxData | null | undefined,
  currency: string,
  date?: string,
  fallbackRate: number = DEFAULT_FALLBACK_RATE
): number => {
  if (!fxData) return fallbackRate;
  if (currency === 'EUR' || currency === fxData.baseCurrency) return 1;

  const history = fxData.rates?.[currency];
  if (!history) return fallbackRate;

  const dates = Object.keys(history).sort();
  if (dates.length === 0) return fallbackRate;

  if (date) {
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i] <= date) {
        return history[dates[i]] || fallbackRate;
      }
    }
    return history[dates[0]] || fallbackRate;
  }

  return history[dates[dates.length - 1]] || fallbackRate;
};

export const convertCurrency = (
  fxData: FxData | null | undefined,
  amount: number,
  from: string,
  to: string,
  date?: string,
  fallbackRate: number = DEFAULT_FALLBACK_RATE
): number => {
  if (from === to) return amount;
  const rateFrom = getFxRate(fxData, from, date, fallbackRate);
  const amountEur = amount / rateFrom;
  if (to === 'EUR') return amountEur;
  const rateTo = getFxRate(fxData, to, date, fallbackRate);
  return amountEur * rateTo;
};

export const getLatestFxRate = (
  fxData: FxData | null | undefined,
  currency: string,
  fallbackRate: number = DEFAULT_FALLBACK_RATE
): number => getFxRate(fxData, currency, undefined, fallbackRate);

export const getCurrencyOptions = (
  fxData: FxData | null | undefined,
  manual: string[] = ['EUR', 'USD', 'CHF', 'GBP']
): string[] => {
  const fromFx = fxData?.rates ? Object.keys(fxData.rates) : [];
  return Array.from(new Set([...manual, ...fromFx])).sort();
};
