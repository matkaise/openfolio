import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CalendarClock, Coins, FileText, Percent, Receipt, RotateCcw,
  Search, ShoppingCart, Tag, Trash2, TrendingUp, Undo2
} from 'lucide-react';
import { useProjectActions, useProjectData } from '@/contexts/ProjectContext';
import { useNotifications } from '@/components/ui/notifications';
import { useFormatters } from '@/components/ui/useFormatters';
import { Button, CardHeader, EmptyState, Field, GlassCard, IconButton, IconTile, Kpi, ListRow, Pill, Segmented, SelectInput, TextInput, toneOf } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { filterTransactionsByPortfolio } from '@/lib/portfolioSelectors';
import { getCurrencyOptions } from '@/lib/fxUtils';
import { applyManualCashEntryToExplicitHistory } from '@/lib/cashAccountUtils';
import { movementTypeLabel, transactionTypeLabel } from '@/lib/labels';
import { useT } from '@/lib/i18n';
import { summarizeCashMovements, summarizeTransactions } from '@/lib/transactionSummary';
import { type DeletedTxEntry, type TransactionLike } from '@/types/portfolioView';
import { type CashMovement, type Transaction } from '@/types/domain';
import { addTransactions, getCashMovements, getTransactions, hasTransaction, removeTransaction, updateTransaction } from '@/lib/domain/ledger/store';
import { resolveEditedAmount } from '@/lib/transactionEdit';

const EDITABLE_TYPES: Transaction['type'][] = ['Buy', 'Sparplan_Buy', 'Sell', 'Dividend', 'Tax', 'Fee', 'Interest', 'Deposit', 'Withdrawal'];

type IconTone = 'accent' | 'gain' | 'loss' | 'teal' | 'amber' | 'neutral';
const TYPE_ICONS: Record<string, { icon: React.ReactNode; tone: IconTone }> = {
  Buy: { icon: <ShoppingCart size={17} />, tone: 'accent' },
  Sparplan_Buy: { icon: <CalendarClock size={17} />, tone: 'accent' },
  Sell: { icon: <Tag size={17} />, tone: 'gain' },
  Dividend: { icon: <Coins size={17} />, tone: 'gain' },
  Interest: { icon: <Percent size={17} />, tone: 'teal' },
  Deposit: { icon: <ArrowDownToLine size={17} />, tone: 'teal' },
  Withdrawal: { icon: <ArrowUpFromLine size={17} />, tone: 'amber' },
  Tax: { icon: <Receipt size={17} />, tone: 'loss' },
  Fee: { icon: <Receipt size={17} />, tone: 'loss' },
  Transfer: { icon: <ArrowLeftRight size={17} />, tone: 'neutral' },
  Adjustment: { icon: <ArrowLeftRight size={17} />, tone: 'neutral' }
};
const typeIcon = (type: string) => {
  const entry = TYPE_ICONS[type] ?? { icon: <FileText size={17} />, tone: 'neutral' as const };
  return <IconTile tone={entry.tone} size={40}>{entry.icon}</IconTile>;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const monthLabel = (date: string) => new Date(`${date.slice(0, 7)}-01T00:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Rows grouped under month headers; the list is already sorted newest first. */
function groupByMonth<T extends { date: string }>(items: T[]): { month: string; items: T[] }[] {
  const groups: { month: string; items: T[] }[] = [];
  items.forEach((item) => {
    const month = item.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(item);
    else groups.push({ month, items: [item] });
  });
  return groups;
}

const TransactionEditModal = ({
  transaction,
  currencies,
  onClose,
  onSave,
  onDelete
}: {
  transaction: TransactionLike | null;
  currencies: string[];
  onClose: () => void;
  onSave: (updated: TransactionLike) => void;
  onDelete: (target: TransactionLike) => void;
}) => {
  const t = useT();
  const { confirm } = useNotifications();
  const formatters = useFormatters();
  const [type, setType] = useState(() => transaction?.type || 'Buy');
  const [date, setDate] = useState(() => transaction?.date || new Date().toISOString().split('T')[0]);
  const [shares, setShares] = useState(() => {
    const rawShares = transaction?.shares ?? transaction?.quantity;
    return rawShares !== undefined && rawShares !== null ? Math.abs(rawShares).toString() : '';
  });
  const [pricePerShare, setPricePerShare] = useState(() => {
    const rawPrice = transaction?.pricePerShare ?? transaction?.price;
    return rawPrice !== undefined && rawPrice !== null ? Number(rawPrice).toString() : '';
  });
  const [currency, setCurrency] = useState(() => transaction?.currency || 'EUR');

  if (!transaction) return null;
  const isTrade = type === 'Buy' || type === 'Sell' || type === 'Sparplan_Buy';
  const amount = resolveEditedAmount({ type, shares, pricePerShare, storedAmount: transaction.amount });

  const handleSave = () => {
    const parsedShares = shares === '' ? (transaction.shares ?? transaction.quantity ?? undefined) : Number(shares);
    const parsedPrice = pricePerShare === '' ? (transaction.pricePerShare ?? transaction.price ?? undefined) : Number(pricePerShare);

    let finalShares = parsedShares;
    if (parsedShares !== undefined && !Number.isNaN(parsedShares)) {
      if (type === 'Sell') finalShares = -Math.abs(parsedShares);
      else if (type === 'Buy' || type === 'Sparplan_Buy') finalShares = Math.abs(parsedShares);
    }
    const shareKey = transaction.shares !== undefined ? 'shares' : (transaction.quantity !== undefined ? 'quantity' : 'shares');

    onSave({
      ...transaction,
      type,
      date,
      currency,
      pricePerShare: parsedPrice,
      [shareKey]: finalShares,
      amount
    });
  };

  const handleDelete = () => {
    void confirm({
      title: 'Buchung löschen?',
      message: 'Sie landet im Papierkorb und lässt sich bis zum Schließen des Projekts wiederherstellen.',
      confirmLabel: 'Löschen',
      tone: 'danger'
    }).then((ok) => {
      if (ok) onDelete(transaction);
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Buchung bearbeiten"
      subtitle={transaction.name || transaction.isin || transactionTypeLabel(t, transaction.type)}
      icon={TYPE_ICONS[type]?.icon}
      footer={(
        <>
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={handleDelete} className="ui-foot-start">Löschen</Button>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={handleSave}>Speichern</Button>
        </>
      )}
    >
      <div className="ui-grid-2">
        <Field label="Art">
          <SelectInput value={type} onChange={(e) => setType(e.target.value as Transaction['type'])}>
            {EDITABLE_TYPES.map((type) => <option key={type} value={type}>{transactionTypeLabel(t, type)}</option>)}
          </SelectInput>
        </Field>
        <Field label="Datum">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {isTrade && (
          <>
            <Field label="Stück">
              <TextInput type="number" step="0.0001" inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value)} />
            </Field>
            <Field label="Preis pro Stück">
              <TextInput type="number" step="0.0001" inputMode="decimal" value={pricePerShare} onChange={(e) => setPricePerShare(e.target.value)} placeholder="unverändert" />
            </Field>
          </>
        )}
        <Field label="Währung">
          <SelectInput value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </SelectInput>
        </Field>
        <Field label="Betrag" hint={isTrade ? 'Aus Stück × Preis; ohne Preis bleibt der gespeicherte Betrag.' : undefined}>
          <div className={`ui-input ui-input-static is-${toneOf(amount)}`}>{formatters.moneyIn(amount, currency, { sign: true })}</div>
        </Field>
      </div>
    </Modal>
  );
};

const DeletedTransactionsModal = ({
  isOpen,
  onClose,
  items,
  onRestore,
  onPurge
}: {
  isOpen: boolean;
  onClose: () => void;
  items: DeletedTxEntry[];
  onRestore: (entry: DeletedTxEntry) => void;
  onPurge: (entry: DeletedTxEntry) => void;
}) => {
  const t = useT();
  return (
  <Modal open={isOpen} onClose={onClose} size="lg" title="Papierkorb" subtitle={`${items.length} ${items.length === 1 ? 'Buchung' : 'Buchungen'}, bis zum Schließen des Projekts wiederherstellbar`} icon={<Trash2 size={20} />}>
    {items.length === 0 ? (
      <EmptyState icon={<Trash2 size={22} />} title="Der Papierkorb ist leer" text="Gelöschte Buchungen erscheinen hier und lassen sich wiederherstellen." />
    ) : (
      <div className="ui-rows">
        {items.map((entry) => (
          <ListRow
            key={entry.tx.id}
            leading={typeIcon(entry.tx.type)}
            title={entry.tx.name || entry.tx.isin || transactionTypeLabel(t, entry.tx.type)}
            meta={<span>{transactionTypeLabel(t, entry.tx.type)} · {dayLabel(entry.tx.date)}</span>}
            trailing={(
              <span className="ui-row-actions">
                <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => onRestore(entry)}>Wiederherstellen</Button>
                <IconButton label="Endgültig entfernen" className="is-danger" onClick={() => onPurge(entry)}><Trash2 size={15} /></IconButton>
              </span>
            )}
          />
        ))}
      </div>
    )}
  </Modal>
  );
};

export const TransactionsContent = ({ selectedPortfolioIds }: { selectedPortfolioIds: string[] }) => {
  const t = useT();
  const project = useProjectData();
  const { updateProject } = useProjectActions();
  const [activeTab, setActiveTab] = useState<'transactions' | 'cash'>('transactions');
  const [txSearch, setTxSearch] = useState('');
  const [txType, setTxType] = useState('Alle');
  const [txDateFrom, setTxDateFrom] = useState('');
  const [txDateTo, setTxDateTo] = useState('');
  const [editingTx, setEditingTx] = useState<TransactionLike | null>(null);
  const [deletedTxs, setDeletedTxs] = useState<DeletedTxEntry[]>([]);
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [toastEntry, setToastEntry] = useState<DeletedTxEntry | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseCurrency = project?.settings.baseCurrency || 'EUR';

  const filteredTransactions = useMemo(() => (
    filterTransactionsByPortfolio(project, selectedPortfolioIds)
  ), [project, selectedPortfolioIds]);

  const filteredCashMovements = useMemo(() => {
    const movements = getCashMovements(project);
    if (selectedPortfolioIds.length === 0) return movements;
    return movements.filter((entry) => entry.portfolioId && selectedPortfolioIds.includes(entry.portfolioId));
  }, [project, selectedPortfolioIds]);

  const transactionTypes = useMemo(() => {
    const types = new Set<string>();
    filteredTransactions.forEach((t) => {
      if (t.type) types.add(t.type);
    });
    return ['Alle', ...Array.from(types).sort()];
  }, [filteredTransactions]);

  const currencies = useMemo(() => getCurrencyOptions(project?.fxData), [project?.fxData]);

  const portfolioNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (project?.portfolios || []).forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [project?.portfolios]);

  const visibleTransactions = useMemo(() => {
    const query = txSearch.trim().toLowerCase();
    const fromDate = txDateFrom ? new Date(`${txDateFrom}T00:00:00`) : null;
    const toDate = txDateTo ? new Date(`${txDateTo}T23:59:59`) : null;

    return filteredTransactions
      .filter((t) => txType === 'Alle' || t.type === txType)
      .filter((t) => {
        if (!fromDate && !toDate) return true;
        const d = new Date(`${t.date}T00:00:00`);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      })
      .filter((t) => {
        if (!query) return true;
        const hay = `${t.name || ''} ${t.isin || ''} ${t.type || ''} ${t.broker || ''}`;
        return hay.toLowerCase().includes(query);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredTransactions, txType, txSearch, txDateFrom, txDateTo]);

  const visibleCashMovements = useMemo(() => {
    const query = txSearch.trim().toLowerCase();
    const fromDate = txDateFrom ? new Date(`${txDateFrom}T00:00:00`) : null;
    const toDate = txDateTo ? new Date(`${txDateTo}T23:59:59`) : null;

    return filteredCashMovements
      .filter((entry) => {
        if (!fromDate && !toDate) return true;
        const d = new Date(`${entry.date}T00:00:00`);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      })
      .filter((entry) => {
        if (!query) return true;
        const hay = `${entry.description || ''} ${entry.type} ${entry.currency}`;
        return hay.toLowerCase().includes(query);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredCashMovements, txSearch, txDateFrom, txDateTo]);

  const cashMovementSummary = useMemo(() => (
    project ? summarizeCashMovements(visibleCashMovements, project.fxData, baseCurrency) : { count: 0, internalCount: 0, externalCount: 0, net: 0 }
  ), [visibleCashMovements, project, baseCurrency]);

  const activeFilterCount = (txSearch ? 1 : 0)
    + (txType !== 'Alle' ? 1 : 0)
    + (txDateFrom ? 1 : 0)
    + (txDateTo ? 1 : 0);

  const summary = useMemo(() => (
    project ? summarizeTransactions(visibleTransactions, project.fxData, baseCurrency) : null
  ), [visibleTransactions, project, baseCurrency]);
  const lastTx = visibleTransactions[0] ?? null;

  useEffect(() => {
    if (!toastEntry) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastEntry(null), 6000);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [toastEntry]);

  const handleDeleteTransaction = (target: TransactionLike) => {
    if (!updateProject) return;

    updateProject((prev) => ({
      ...removeTransaction(prev, target.id),
      cashAccounts: applyManualCashEntryToExplicitHistory(
        prev.cashAccounts,
        target.portfolioId,
        target as Transaction,
        {
          multiplier: -1,
          portfolioName: target.portfolioId ? portfolioNameById[target.portfolioId] : undefined
        }
      ),
      modified: new Date().toISOString()
    }));

    const entry = { tx: target, deletedAt: new Date().toISOString() };
    setDeletedTxs((prev) => [entry, ...prev.filter((e) => e.tx.id !== target.id)]);
    setToastEntry(entry);
  };

  const handleRestoreTransaction = (entry: DeletedTxEntry) => {
    if (!updateProject) return;

    updateProject((prev) => ({
      ...(hasTransaction(prev, entry.tx.id) ? prev : addTransactions(prev, [entry.tx as Transaction])),
      cashAccounts: hasTransaction(prev, entry.tx.id)
        ? prev.cashAccounts
        : applyManualCashEntryToExplicitHistory(
          prev.cashAccounts,
          entry.tx.portfolioId,
          entry.tx as Transaction,
          {
            multiplier: 1,
            portfolioName: entry.tx.portfolioId ? portfolioNameById[entry.tx.portfolioId] : undefined
          }
        ),
      modified: new Date().toISOString()
    }));

    setDeletedTxs((prev) => prev.filter((e) => e.tx.id !== entry.tx.id));
    setToastEntry(null);
  };

  const formatters = useFormatters();
  const resetFilters = () => {
    setTxSearch('');
    setTxType('Alle');
    setTxDateFrom('');
    setTxDateTo('');
  };
  const nameOf = (tx: TransactionLike) => project?.securities?.[tx.isin || '']?.name || tx.name || tx.isin || transactionTypeLabel(t, tx.type);
  const amountText = (amount: number, currency: string | undefined) => formatters.moneyIn(amount, currency || baseCurrency, { sign: true });
  const isTransactions = activeTab === 'transactions';
  const shownCount = isTransactions ? visibleTransactions.length : visibleCashMovements.length;
  const totalCount = isTransactions ? filteredTransactions.length : filteredCashMovements.length;

  return (
    <>
      <div className="ui-kpis">
        <Kpi
          label="Buchungen"
          value={formatters.number(summary?.count ?? 0)}
          sub={summary ? [plural(summary.buyCount, 'Kauf', 'Käufe'), plural(summary.sellCount, 'Verkauf', 'Verkäufe'), plural(summary.dividendCount, 'Dividende', 'Dividenden')].join(' · ') : undefined}
          icon={<FileText size={16} />}
          tone="accent"
        />
        <Kpi
          label="Nettofluss"
          value={formatters.money(summary?.net ?? 0, { sign: true })}
          valueTone={toneOf(summary?.net ?? 0)}
          sub={summary ? `Zufluss ${formatters.money(summary.inflow)} · Abfluss ${formatters.money(summary.outflow)}` : undefined}
          icon={<TrendingUp size={16} />}
          tone="gain"
        />
        <Kpi label="Volumen" value={formatters.money(summary?.volume ?? 0)} sub="Summe aller Beträge" icon={<ArrowLeftRight size={16} />} tone="teal" />
        <Kpi
          label="Letzte Buchung"
          value={lastTx ? dayLabel(lastTx.date) : '–'}
          sub={lastTx ? `${transactionTypeLabel(t, lastTx.type)} · ${amountText(lastTx.amount || 0, lastTx.currency)}` : 'Noch keine Buchungen'}
          icon={<CalendarClock size={16} />}
          tone="amber"
        />
      </div>

      <GlassCard>
        <CardHeader title={isTransactions ? 'Buchungen' : 'Kontobewegungen'}>
          <div className="ui-head-actions">
            <Segmented
              options={[{ value: 'transactions', label: 'Buchungen' }, { value: 'cash', label: 'Konto' }]}
              value={activeTab}
              onChange={setActiveTab}
              ariaLabel="Ansicht"
              size="sm"
            />
            {isTransactions && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setShowDeletedModal(true)}>
                Papierkorb{deletedTxs.length > 0 ? ` (${deletedTxs.length})` : ''}
              </Button>
            )}
          </div>
        </CardHeader>

        <div className="ui-filters">
          <label className="ui-search-input">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder={isTransactions ? 'Name, ISIN oder Art suchen' : 'Beschreibung, Art oder Währung suchen'}
              aria-label="Suchen"
            />
          </label>
          {isTransactions && (
            <SelectInput aria-label="Art" value={txType} onChange={(e) => setTxType(e.target.value)} className="ui-input-compact">
              {transactionTypes.map((type) => <option key={type} value={type}>{type === 'Alle' ? 'Alle Arten' : transactionTypeLabel(t, type)}</option>)}
            </SelectInput>
          )}
          <label className="ui-date-filter"><span>Von</span><input type="date" value={txDateFrom} onChange={(e) => setTxDateFrom(e.target.value)} /></label>
          <label className="ui-date-filter"><span>Bis</span><input type="date" value={txDateTo} onChange={(e) => setTxDateTo(e.target.value)} /></label>
          {activeFilterCount > 0 && (
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={resetFilters}>Filter zurücksetzen</Button>
          )}
        </div>

        <div className="ui-list-meta">
          <span>{shownCount === totalCount ? `${totalCount} Einträge` : `${shownCount} von ${totalCount} Einträgen`}</span>
          {!isTransactions && (
            <span className="ui-row-sub">
              <Pill>{cashMovementSummary.externalCount} extern</Pill>
              <Pill>{cashMovementSummary.internalCount} intern</Pill>
              <Pill tone={toneOf(cashMovementSummary.net)}>Netto {formatters.money(cashMovementSummary.net, { sign: true })}</Pill>
            </span>
          )}
        </div>

        <div className="ui-scroll" style={{ maxHeight: '68vh' }}>
          {isTransactions ? (
            visibleTransactions.length === 0 ? (
              <EmptyState icon={<FileText size={22} />} title={activeFilterCount > 0 ? 'Keine Treffer' : 'Noch keine Buchungen'} text={activeFilterCount > 0 ? 'Passe die Filter an oder setze sie zurück.' : 'Importiere eine Datei oder erfasse eine Transaktion.'} />
            ) : (
              groupByMonth(visibleTransactions).map((group) => (
                <section key={group.month} className="ui-group">
                  <h3 className="ui-group-title">{monthLabel(group.month)}</h3>
                  <div className="ui-rows">
                    {group.items.map((tx) => {
                      const amount = tx.amount || 0;
                      const depot = tx.portfolioId ? portfolioNameById[tx.portfolioId] : undefined;
                      return (
                        <ListRow
                          key={tx.id}
                          onClick={() => setEditingTx(tx)}
                          leading={typeIcon(tx.type)}
                          title={nameOf(tx)}
                          meta={(
                            <>
                              {nameOf(tx) !== transactionTypeLabel(t, tx.type) && <span>{transactionTypeLabel(t, tx.type)}</span>}
                              <span>{dayLabel(tx.date)}</span>
                              {tx.shares ? <span>{formatters.number(Math.abs(tx.shares), Math.abs(tx.shares) % 1 === 0 ? 0 : 3)} Stk.</span> : null}
                              {depot && (project?.portfolios.length ?? 0) > 1 && <Pill>{depot}</Pill>}
                            </>
                          )}
                          trailing={<span className={`ui-row-value is-${toneOf(amount)}`}>{amountText(amount, tx.currency)}</span>}
                        />
                      );
                    })}
                  </div>
                </section>
              ))
            )
          ) : (
            visibleCashMovements.length === 0 ? (
              <EmptyState title={activeFilterCount > 0 ? 'Keine Treffer' : 'Keine Kontobewegungen'} text={activeFilterCount > 0 ? 'Passe die Filter an oder setze sie zurück.' : 'Kontobewegungen kommen aus Kontoauszügen und Broker-Importen.'} />
            ) : (
              groupByMonth(visibleCashMovements).map((group) => (
                <section key={group.month} className="ui-group">
                  <h3 className="ui-group-title">{monthLabel(group.month)}</h3>
                  <div className="ui-rows">
                    {group.items.map((entry: CashMovement) => {
                      const amount = entry.amount || 0;
                      return (
                        <ListRow
                          key={entry.id}
                          leading={typeIcon(entry.type)}
                          title={entry.description || movementTypeLabel(t, entry.type)}
                          meta={(
                            <>
                              {entry.description && <span>{movementTypeLabel(t, entry.type)}</span>}
                              <span>{dayLabel(entry.date)}</span>
                              {entry.isInternal && <Pill>intern</Pill>}
                            </>
                          )}
                          trailing={<span className={`ui-row-value is-${toneOf(amount)}`}>{amountText(amount, entry.currency)}</span>}
                        />
                      );
                    })}
                  </div>
                </section>
              ))
            )
          )}
        </div>
      </GlassCard>

      <TransactionEditModal
        key={editingTx?.id ?? 'edit'}
        transaction={editingTx}
        currencies={currencies}
        onClose={() => setEditingTx(null)}
        onSave={(updated) => {
          if (!updateProject) return;
          updateProject((prev) => {
            const existing = getTransactions(prev).find((t) => t.id === updated.id);
            let nextCashAccounts = prev.cashAccounts;

            if (existing) {
              nextCashAccounts = applyManualCashEntryToExplicitHistory(
                nextCashAccounts,
                existing.portfolioId,
                existing,
                {
                  multiplier: -1,
                  portfolioName: existing.portfolioId ? portfolioNameById[existing.portfolioId] : undefined
                }
              );
            }

            nextCashAccounts = applyManualCashEntryToExplicitHistory(
              nextCashAccounts,
              updated.portfolioId,
              updated as Transaction,
              {
                multiplier: 1,
                portfolioName: updated.portfolioId ? portfolioNameById[updated.portfolioId] : undefined
              }
            );

            return {
              ...updateTransaction(prev, updated as Transaction),
              cashAccounts: nextCashAccounts,
              modified: new Date().toISOString()
            };
          });
          setEditingTx(null);
        }}
        onDelete={(target) => {
          handleDeleteTransaction(target);
          setEditingTx(null);
        }}
      />

      <DeletedTransactionsModal
        isOpen={showDeletedModal}
        onClose={() => setShowDeletedModal(false)}
        items={deletedTxs}
        onRestore={handleRestoreTransaction}
        onPurge={(entry) => {
          setDeletedTxs((prev) => prev.filter((e) => e.tx.id !== entry.tx.id));
        }}
      />

      {toastEntry ? (
        <div className="ui-toasts" role="status">
          <div className="ui-toast glass">
            <span className="ui-toast-icon"><Trash2 size={18} /></span>
            <span className="ui-toast-text">
              <span className="ui-toast-title">Buchung gelöscht</span>
              <span className="ui-toast-message">Im Papierkorb bis zum Schließen des Projekts.</span>
            </span>
            <Button size="sm" variant="tonal" icon={<Undo2 size={14} />} onClick={() => handleRestoreTransaction(toastEntry)}>Rückgängig</Button>
          </div>
        </div>
      ) : null}
    </>
  );
};
