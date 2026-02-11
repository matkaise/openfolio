import { type CashAccount, type Transaction } from '@/types/domain';

const CASH_MOVEMENT_TYPES: Transaction['type'][] = ['Deposit', 'Withdrawal', 'Dividend', 'Tax', 'Fee'];

const isCashMovementType = (type: Transaction['type']) => CASH_MOVEMENT_TYPES.includes(type);

const isManualCashEntry = (tx: Pick<Transaction, 'originalData'>) => {
  if (!tx.originalData) return false;
  const data = tx.originalData as { manualCashEntry?: boolean } | null;
  return !!data?.manualCashEntry;
};

type CashHistoryOptions = {
  multiplier?: 1 | -1;
  portfolioName?: string;
};

export const applyManualCashEntryToExplicitHistory = (
  cashAccounts: CashAccount[] | undefined,
  portfolioId: string | undefined,
  tx: Transaction,
  options: CashHistoryOptions = {}
): CashAccount[] | undefined => {
  if (!portfolioId) return cashAccounts;
  if (!isManualCashEntry(tx) || !isCashMovementType(tx.type)) return cashAccounts;

  const multiplier = options.multiplier ?? 1;
  const delta = (tx.amount || 0) * multiplier;
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0000001) return cashAccounts;
  if (!tx.currency) return cashAccounts;

  const existing = cashAccounts || [];
  const nextAccounts = [...existing];
  const accountIndex = nextAccounts.findIndex(
    (account) => account.portfolioId === portfolioId && account.currency === tx.currency
  );

  if (accountIndex === -1) {
    if (multiplier < 0) return cashAccounts;
    nextAccounts.push({
      id: crypto.randomUUID(),
      name: `${options.portfolioName || 'Depot'} ${tx.currency} Konto`,
      portfolioId,
      currency: tx.currency,
      balanceHistory: {
        [tx.date]: delta
      }
    });
    return nextAccounts;
  }

  const account = nextAccounts[accountIndex];
  const balanceHistory = { ...(account.balanceHistory || {}) };
  const allDates = Object.keys(balanceHistory).sort();

  if (allDates.length === 0) {
    balanceHistory[tx.date] = delta;
  } else {
    let baseline = 0;
    for (const d of allDates) {
      if (d <= tx.date) {
        baseline = balanceHistory[d] || 0;
      } else {
        break;
      }
    }

    if (balanceHistory[tx.date] === undefined) {
      balanceHistory[tx.date] = baseline;
    }

    Object.keys(balanceHistory)
      .filter((d) => d >= tx.date)
      .forEach((d) => {
        balanceHistory[d] = (balanceHistory[d] || 0) + delta;
      });
  }

  const hasNonZero = Object.values(balanceHistory).some((value) => Math.abs(value) > 0.0000001);

  nextAccounts[accountIndex] = {
    ...account,
    balanceHistory: hasNonZero ? balanceHistory : {}
  };

  return nextAccounts;
};
