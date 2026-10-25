import type { CashMovement, LedgerEntry, ProjectData, Transaction } from '@/types/domain';
import { entryFromTransaction, entryToCashMovement, entryToTransaction, getProjectLedger, sortLedger } from './ledger';

// The only place that reads or writes the stored bookings (the ledger). Components and
// services use the transaction and statement views below. All writes are pure.

type WithLedger = Pick<ProjectData, 'ledger'>;

export const getLedger = (project: WithLedger | null | undefined): LedgerEntry[] => getProjectLedger(project);

const withLedger = <P extends WithLedger>(project: P, ledger: LedgerEntry[]): P => ({ ...project, ledger });

const transactionViewCache = new WeakMap<LedgerEntry[], Transaction[]>();
const movementViewCache = new WeakMap<LedgerEntry[], CashMovement[]>();

/** Every booking that is a transaction (trades, income, taxes, fees, deposits); internal moves are left out. */
export const getTransactions = (project: WithLedger | null | undefined): Transaction[] => {
    const ledger = getLedger(project);
    let view = transactionViewCache.get(ledger);
    if (!view) {
        view = ledger.filter((entry) => !entry.internal).map(entryToTransaction).filter((tx): tx is Transaction => tx !== null);
        transactionViewCache.set(ledger, view);
    }
    return view;
};

/** Statement view: every cash booking except trades, including internal moves (FX legs, sweeps). */
export const getCashMovements = (project: WithLedger | null | undefined): CashMovement[] => {
    const ledger = getLedger(project);
    let view = movementViewCache.get(ledger);
    if (!view) {
        view = ledger.map(entryToCashMovement).filter((movement): movement is CashMovement => movement !== null);
        movementViewCache.set(ledger, view);
    }
    return view;
};

export const addEntries = <P extends WithLedger>(project: P, entries: LedgerEntry[]): P => (
    entries.length === 0 ? project : withLedger(project, sortLedger([...getLedger(project), ...entries]))
);

export const addTransactions = <P extends WithLedger>(project: P, transactions: Transaction[]): P => (
    addEntries(project, transactions.map(entryFromTransaction))
);

/**
 * Applies an edited transaction to its entry. Fields the form does not show (source row,
 * order id, description) stay, and so does a withholding tax when the type is still "Tax".
 */
export const updateTransaction = <P extends WithLedger>(project: P, updated: Transaction): P => {
    const ledger = getLedger(project);
    const index = ledger.findIndex((entry) => entry.id === updated.id);
    if (index < 0) return project;
    const existing = ledger[index];
    const edited = entryFromTransaction(updated);
    const keepKind = existing.kind === 'withholding_tax' && edited.kind === 'tax';
    const next: LedgerEntry = {
        ...existing,
        ...edited,
        ...(keepKind ? { kind: existing.kind } : {}),
        ...(edited.raw === undefined && existing.raw !== undefined ? { raw: existing.raw } : {})
    };
    if (!edited.savingsPlan) delete next.savingsPlan;
    const copy = [...ledger];
    copy[index] = next;
    return withLedger(project, sortLedger(copy));
};

export const removeEntry = <P extends WithLedger>(project: P, id: string): P => {
    const ledger = getLedger(project);
    const next = ledger.filter((entry) => entry.id !== id);
    return next.length === ledger.length ? project : withLedger(project, next);
};

export const removeTransaction = removeEntry;

export const hasTransaction = (project: WithLedger | null | undefined, id: string): boolean => (
    getLedger(project).some((entry) => entry.id === id)
);

/** Removes every booking of a portfolio (when the portfolio is deleted). */
export const removePortfolioBookings = <P extends WithLedger>(project: P, portfolioId: string): P => (
    withLedger(project, getLedger(project).filter((entry) => entry.portfolioId !== portfolioId))
);

/** Portfolio ids referenced by any booking, in first-seen order. */
export const bookingPortfolioIds = (project: WithLedger | null | undefined): string[] => {
    const ids: string[] = [];
    getLedger(project).forEach((entry) => {
        if (entry.portfolioId && !ids.includes(entry.portfolioId)) ids.push(entry.portfolioId);
    });
    return ids;
};
