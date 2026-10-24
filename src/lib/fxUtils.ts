import { type FxData } from '@/types/domain';
import { getFxTable } from '@/lib/domain/fx/rates';

/**
 * Converts with the domain FX table. A missing rate converts to 0 instead of a silent 1:1;
 * the app shows a "Kurs fehlt" notice for such currencies (see findMissingFxCurrencies).
 */
export const convertCurrency = (
  fxData: FxData | null | undefined,
  amount: number,
  from: string,
  to: string,
  date?: string
): number => {
  return getFxTable(fxData?.rates).convert(amount, from, to, date) ?? 0;
};

export const getCurrencyOptions = (
  fxData: FxData | null | undefined,
  manual: string[] = ['EUR', 'USD', 'CHF', 'GBP']
): string[] => {
  const fromFx = fxData?.rates ? Object.keys(fxData.rates) : [];
  return Array.from(new Set([...manual, ...fromFx])).sort();
};
