import type { CashMovement, ProjectData, Transaction } from '@/types/domain';

// The only place that reads or writes the stored bookings of a project. Components and
// services go through these functions, so the storage model (today: transactions and
// cash movements, next: one ledger) can change in one place. All writes are pure.
// Not yet routed through here: applyImportBatch (merge with dedupe) and the file format.

type Bookings = Pick<ProjectData, 'transactions' | 'cashMovements'>;

/** Bookings entered or imported as transactions (trades, manual dividends, ...). */
export const getTransactions = (project: Bookings | null | undefined): Transaction[] => project?.transactions ?? [];

/** Imported account statement rows. */
export const getCashMovements = (project: Bookings | null | undefined): CashMovement[] => project?.cashMovements ?? [];

export const addTransactions = <P extends Bookings>(project: P, transactions: Transaction[]): P => (
    transactions.length === 0 ? project : { ...project, transactions: [...getTransactions(project), ...transactions] }
);

/** Replaces the transaction with the same id; unknown ids are ignored. */
export const updateTransaction = <P extends Bookings>(project: P, updated: Transaction): P => {
    const current = getTransactions(project);
    if (!current.some((tx) => tx.id === updated.id)) return project;
    return { ...project, transactions: current.map((tx) => (tx.id === updated.id ? updated : tx)) };
};

export const removeTransaction = <P extends Bookings>(project: P, id: string): P => {
    const current = getTransactions(project);
    const next = current.filter((tx) => tx.id !== id);
    return next.length === current.length ? project : { ...project, transactions: next };
};

export const hasTransaction = (project: Bookings | null | undefined, id: string): boolean => (
    getTransactions(project).some((tx) => tx.id === id)
);

/** Keeps the transactions for which `keep` returns true. */
export const filterTransactions = <P extends Bookings>(project: P, keep: (tx: Transaction) => boolean): P => {
    const current = getTransactions(project);
    const next = current.filter(keep);
    return next.length === current.length ? project : { ...project, transactions: next };
};

/** Removes every booking of a portfolio (when the portfolio is deleted). */
export const removePortfolioBookings = <P extends Bookings>(project: P, portfolioId: string): P => ({
    ...project,
    transactions: getTransactions(project).filter((tx) => tx.portfolioId !== portfolioId),
    cashMovements: getCashMovements(project).filter((movement) => movement.portfolioId !== portfolioId)
});

/** Portfolio ids referenced by any booking, in first-seen order. */
export const bookingPortfolioIds = (project: Bookings | null | undefined): string[] => {
    const ids: string[] = [];
    const add = (id?: string) => {
        if (id && !ids.includes(id)) ids.push(id);
    };
    getTransactions(project).forEach((tx) => add(tx.portfolioId));
    getCashMovements(project).forEach((movement) => add(movement.portfolioId));
    return ids;
};
