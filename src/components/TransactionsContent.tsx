import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, FileText, Search, X } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { filterTransactionsByPortfolio } from '@/lib/portfolioSelectors';
import { convertCurrency, getCurrencyOptions } from '@/lib/fxUtils';
import { applyManualCashEntryToExplicitHistory } from '@/lib/cashAccountUtils';
import { type DeletedTxEntry, type TransactionLike } from '@/types/portfolioView';
import { type Transaction } from '@/types/domain';
import { Card } from '@/components/ui/Card';

const TransactionEditModal = ({
  isOpen,
  onClose,
  transaction,
  typeOptions,
  currencies,
  onSave,
  onDelete
}: {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionLike | null;
  typeOptions: string[];
  currencies: string[];
  onSave: (updated: TransactionLike) => void;
  onDelete: (target: TransactionLike) => void;
}) => {
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

  if (!isOpen || !transaction) return null;

  const handleSave = () => {
    const parsedShares = shares === '' ? (transaction.shares ?? transaction.quantity ?? undefined) : Number(shares);
    const parsedPrice = pricePerShare === '' ? (transaction.pricePerShare ?? transaction.price ?? undefined) : Number(pricePerShare);

    let finalShares = parsedShares;
    if (parsedShares !== undefined && !Number.isNaN(parsedShares)) {
      if (type === 'Sell') finalShares = -Math.abs(parsedShares);
      else if (type === 'Buy' || type === 'Sparplan_Buy') finalShares = Math.abs(parsedShares);
    }

    let finalAmount = transaction.amount ?? undefined;
    if (parsedPrice !== undefined && !Number.isNaN(parsedPrice) && parsedShares !== undefined && !Number.isNaN(parsedShares)) {
      const rawTotal = Math.abs(parsedShares) * parsedPrice;
      if (type === 'Buy' || type === 'Sparplan_Buy') finalAmount = -Math.abs(rawTotal);
      else if (type === 'Sell' || type === 'Dividend') finalAmount = Math.abs(rawTotal);
      else finalAmount = rawTotal;
    }

    const shareKey = transaction.shares !== undefined ? 'shares' : (transaction.quantity !== undefined ? 'quantity' : 'shares');

    onSave({
      ...transaction,
      type,
      date,
      currency,
      pricePerShare: parsedPrice,
      [shareKey]: finalShares,
      amount: finalAmount
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="md3-card w-full max-w-xl rounded-[28px] p-6 md:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="md3-text-main text-xl font-bold">Transaktion bearbeiten</h3>
            <p className="md3-text-muted mt-1 text-xs">{transaction.name || transaction.isin}</p>
          </div>
          <button type="button" onClick={onClose} className="md3-icon-btn" aria-label="Schliessen">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="md3-text-muted text-xs font-bold uppercase tracking-wider">Typ</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="md3-field w-full px-4 py-3 text-sm outline-none"
            >
              {(typeOptions.length ? typeOptions : ['Buy', 'Sell', 'Dividend', 'Sparplan_Buy']).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="md3-text-muted text-xs font-bold uppercase tracking-wider">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="md3-field w-full px-4 py-3 text-sm outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="md3-text-muted text-xs font-bold uppercase tracking-wider">Stueck</label>
            <input
              type="number"
              step="0.0001"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="md3-field w-full px-4 py-3 text-sm outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="md3-text-muted text-xs font-bold uppercase tracking-wider">Preis pro Stk.</label>
            <input
              type="number"
              step="0.0001"
              value={pricePerShare}
              onChange={(e) => setPricePerShare(e.target.value)}
              className="md3-field w-full px-4 py-3 text-sm outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="md3-text-muted text-xs font-bold uppercase tracking-wider">Betrag</label>
            <div className="md3-field flex w-full items-center px-4 py-3 text-sm font-semibold">
              {(() => {
                const parsedShares = Number(shares);
                const parsedPrice = Number(pricePerShare);
                if (Number.isNaN(parsedShares) || Number.isNaN(parsedPrice)) return '--';
                const rawTotal = Math.abs(parsedShares) * parsedPrice;
                const signed = (type === 'Buy' || type === 'Sparplan_Buy')
                  ? -Math.abs(rawTotal)
                  : (type === 'Sell' || type === 'Dividend')
                    ? Math.abs(rawTotal)
                    : rawTotal;
                return signed.toLocaleString('de-DE', { style: 'currency', currency });
              })()}
            </div>
          </div>

          <div className="space-y-2">
            <label className="md3-text-muted text-xs font-bold uppercase tracking-wider">Waehrung</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="md3-field w-full px-4 py-3 text-sm outline-none"
            >
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (!transaction) return;
              if (window.confirm('Transaktion wirklich loeschen?')) onDelete(transaction);
            }}
            className="md3-negative-soft rounded-2xl px-4 py-2 text-sm font-semibold transition hover:brightness-105"
          >
            Loeschen
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="md3-text-muted rounded-2xl px-4 py-2 text-sm font-semibold transition hover:brightness-95"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="md3-filled-btn px-6 text-sm font-bold"
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="md3-card w-full max-w-2xl rounded-[28px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="md3-text-main text-xl font-bold">Papierkorb</h3>
            <p className="md3-text-muted mt-1 text-xs">{items.length} Eintraege</p>
          </div>
          <button type="button" onClick={onClose} className="md3-icon-btn" aria-label="Schliessen">
            <X size={18} />
          </button>
        </div>

        <div className="custom-scrollbar max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="md3-list-item p-6 text-center text-sm md3-text-muted">Keine geloeschten Transaktionen.</div>
          ) : (
            items.map((entry) => (
              <div key={entry.tx.id} className="md3-list-item flex items-center justify-between gap-4 p-3.5">
                <div className="min-w-0">
                  <div className="md3-text-main truncate text-sm font-medium">{entry.tx.name || entry.tx.isin}</div>
                  <div className="md3-text-muted mt-0.5 text-xs">
                    {new Date(entry.tx.date).toLocaleDateString('de-DE')} - {entry.tx.type}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRestore(entry)}
                    className="md3-chip-tonal rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    Wiederherstellen
                  </button>
                  <button
                    type="button"
                    onClick={() => onPurge(entry)}
                    className="md3-negative-soft rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    Endgueltig loeschen
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const TransactionsContent = ({ selectedPortfolioIds }: { selectedPortfolioIds: string[] }) => {
  const { project, updateProject } = useProject();
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

  const activeFilterCount = (txSearch ? 1 : 0)
    + (txType !== 'Alle' ? 1 : 0)
    + (txDateFrom ? 1 : 0)
    + (txDateTo ? 1 : 0);

  const summary = useMemo(() => {
    const result = {
      count: visibleTransactions.length,
      volume: 0,
      net: 0,
      inflow: 0,
      outflow: 0,
      buyCount: 0,
      sellCount: 0,
      dividendCount: 0,
      feeCount: 0,
      otherCount: 0,
      lastTx: visibleTransactions[0] ?? null
    };

    if (!project) return result;

    visibleTransactions.forEach((t) => {
      const amount = Number(t.amount) || 0;
      const currency = t.currency || baseCurrency;
      const converted = convertCurrency(project.fxData, amount, currency, baseCurrency, t.date);

      result.net += converted;
      result.volume += Math.abs(converted);
      if (converted >= 0) result.inflow += converted;
      else result.outflow += Math.abs(converted);

      switch (t.type) {
        case 'Buy':
        case 'Sparplan_Buy':
          result.buyCount += 1;
          break;
        case 'Sell':
          result.sellCount += 1;
          break;
        case 'Dividend':
          result.dividendCount += 1;
          break;
        case 'Fee':
        case 'Tax':
          result.feeCount += 1;
          break;
        default:
          result.otherCount += 1;
          break;
      }
    });

    return result;
  }, [visibleTransactions, project, baseCurrency]);

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
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== target.id),
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
      ...prev,
      transactions: prev.transactions.some((t) => t.id === entry.tx.id)
        ? prev.transactions
        : [...prev.transactions, entry.tx],
      cashAccounts: prev.transactions.some((t) => t.id === entry.tx.id)
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch">
        <Card className="relative overflow-hidden group md3-card-primary !p-8">
          <div className="absolute top-0 right-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
            <FileText size={120} className="md3-accent" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-3">
              <p className="md3-text-muted text-xs uppercase tracking-wider">Transaktionen</p>
              {activeFilterCount > 0 && (
                <span className="md3-segment rounded-full px-2.5 py-1 text-[10px] font-semibold">
                  Filter aktiv: {activeFilterCount}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="md3-text-main text-4xl font-bold">{summary.count}</span>
              <span className="md3-text-muted text-sm">Eintraege</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="md3-segment rounded-full px-3 py-1 text-[11px] font-semibold">Kaeufe {summary.buyCount}</span>
              <span className="md3-segment rounded-full px-3 py-1 text-[11px] font-semibold">Verkaeufe {summary.sellCount}</span>
              {summary.dividendCount > 0 && (
                <span className="md3-segment rounded-full px-3 py-1 text-[11px] font-semibold">Dividenden {summary.dividendCount}</span>
              )}
              {summary.feeCount > 0 && (
                <span className="md3-segment rounded-full px-3 py-1 text-[11px] font-semibold">Gebuehren {summary.feeCount}</span>
              )}
            </div>
            <div className="mt-5">
              <p className="md3-text-muted text-xs uppercase tracking-wider">Volumen</p>
              <p className="md3-text-main text-lg font-semibold">
                {summary.volume.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
              </p>
            </div>
          </div>
        </Card>

        <Card className="md3-card-secondary !p-7 flex flex-col justify-between">
          <div>
            <p className="md3-text-muted text-xs uppercase tracking-wider">Nettofluss</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${summary.net >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                {summary.net >= 0 ? '+' : ''}{summary.net.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
              </span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4 text-xs">
            <div>
              <p className="md3-text-muted uppercase tracking-wider">Zufluss</p>
              <p className="md3-positive font-semibold flex items-center gap-1">
                <ArrowUpRight size={14} />
                +{summary.inflow.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
              </p>
            </div>
            <div className="text-right">
              <p className="md3-text-muted uppercase tracking-wider">Abfluss</p>
              <p className="md3-negative font-semibold flex items-center justify-end gap-1">
                <ArrowDownRight size={14} />
                -{summary.outflow.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
              </p>
            </div>
          </div>
        </Card>

        <Card className="!p-6 flex flex-col justify-between">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="md3-text-main text-sm font-semibold uppercase tracking-wider">Letzte Transaktion</h3>
            {summary.lastTx && (
              <span className="md3-text-muted text-xs">
                {new Date(summary.lastTx.date).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
          {summary.lastTx ? (
            <div className="md3-list-item flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="md3-text-main truncate text-sm font-semibold">
                  {project?.securities?.[summary.lastTx.isin || '']?.name || summary.lastTx.name || summary.lastTx.isin}
                </p>
                <div className="md3-text-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="md3-segment rounded-md px-2 py-0.5 font-semibold">{summary.lastTx.type}</span>
                  {summary.lastTx.portfolioId && portfolioNameById[summary.lastTx.portfolioId] ? (
                    <span className="md3-chip-tonal rounded-md px-2 py-0.5 font-semibold">{portfolioNameById[summary.lastTx.portfolioId]}</span>
                  ) : null}
                  {(summary.lastTx.shares || summary.lastTx.quantity) ? (
                    <span>{Math.abs(summary.lastTx.shares || summary.lastTx.quantity || 0)} Stk.</span>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold ${summary.lastTx.amount >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                  {summary.lastTx.amount >= 0 ? '+' : '-'}
                  {Math.abs(summary.lastTx.amount || 0).toLocaleString('de-DE', { style: 'currency', currency: summary.lastTx.currency || baseCurrency })}
                </p>
                <p className="md3-text-muted text-xs">
                  {summary.lastTx.currency || baseCurrency}
                </p>
              </div>
            </div>
          ) : (
            <div className="md3-list-item p-6 text-center text-sm md3-text-muted">Keine Transaktionen vorhanden.</div>
          )}
        </Card>
      </div>

      <Card className="w-full !p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="md3-text-main flex items-center gap-2 text-lg font-bold">
              <FileText size={20} className="md3-accent" />
              Transaktionen
            </h2>
            <p className="md3-text-muted mt-1 text-xs">
              {filteredTransactions.length} gesamt {visibleTransactions.length !== filteredTransactions.length ? `- ${visibleTransactions.length} gefiltert` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => setShowDeletedModal(true)}
              className="md3-chip-tonal rounded-xl px-3 py-1.5 text-xs font-semibold"
            >
              Papierkorb ({deletedTxs.length})
            </button>

            <span className="md3-segment rounded-full px-3 py-1.5 text-xs font-semibold">
              {visibleTransactions.length}
              {visibleTransactions.length !== filteredTransactions.length ? ` / ${filteredTransactions.length}` : ''}
              {' '}Eintraege
            </span>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
          <div className="md3-field relative flex-1 min-w-[220px]">
            <Search className="md3-text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={16} />
            <input
              type="text"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder="ISIN, Name oder Typ suchen..."
              className="h-12 w-full border-none bg-transparent pl-9 pr-3 text-sm outline-none"
            />
          </div>

          <div className="md3-field flex items-center gap-2 px-3">
            <span className="md3-text-muted text-xs font-semibold">Typ</span>
            <select
              value={txType}
              onChange={(e) => setTxType(e.target.value)}
              className="h-10 cursor-pointer border-none bg-transparent text-sm font-semibold outline-none"
            >
              {transactionTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="md3-field flex items-center gap-2 px-3">
            <span className="md3-text-muted text-xs font-semibold">Von</span>
            <input
              type="date"
              value={txDateFrom}
              onChange={(e) => setTxDateFrom(e.target.value)}
              className="h-10 border-none bg-transparent text-sm outline-none"
            />
          </div>

          <div className="md3-field flex items-center gap-2 px-3">
            <span className="md3-text-muted text-xs font-semibold">Bis</span>
            <input
              type="date"
              value={txDateTo}
              onChange={(e) => setTxDateTo(e.target.value)}
              className="h-10 border-none bg-transparent text-sm outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setTxSearch('');
              setTxType('Alle');
              setTxDateFrom('');
              setTxDateTo('');
            }}
            className="md3-chip-tonal rounded-2xl px-4 py-2 text-sm font-semibold lg:ml-auto"
          >
            Filter zuruecksetzen
          </button>
        </div>

        <div className="custom-scrollbar max-h-[66vh] space-y-3 overflow-y-auto pr-1">
          {visibleTransactions.length === 0 ? (
            <div className="md3-list-item p-8 text-center text-sm md3-text-muted">Keine Transaktionen vorhanden.</div>
          ) : (
            visibleTransactions.map((tx) => {
              const txAmount = tx.amount || 0;
              const prefix = txAmount > 0 ? '+' : txAmount < 0 ? '-' : '';
              return (
                <div
                  key={tx.id}
                  onClick={() => setEditingTx(tx)}
                  className="md3-list-item flex cursor-pointer items-center justify-between gap-4 p-4"
                >
                  <div className="min-w-0">
                    <p className="md3-text-main truncate text-sm font-semibold">
                      {project?.securities?.[tx.isin || '']?.name || tx.name || tx.isin}
                    </p>
                    <div className="md3-text-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="md3-segment rounded-md px-2 py-0.5 font-semibold">{tx.type}</span>
                      {tx.portfolioId && portfolioNameById[tx.portfolioId] ? (
                        <span className="md3-chip-tonal rounded-md px-2 py-0.5 font-semibold">{portfolioNameById[tx.portfolioId]}</span>
                      ) : null}
                      <span>{new Date(tx.date).toLocaleDateString('de-DE')}</span>
                      {(tx.shares || tx.quantity) ? (
                        <span>{Math.abs(tx.shares || tx.quantity || 0)} Stk.</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-sm font-semibold ${txAmount >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                      {prefix}
                      {Math.abs(txAmount).toLocaleString('de-DE', { style: 'currency', currency: tx.currency || project?.settings.baseCurrency || 'EUR' })}
                    </p>
                    <p className="md3-text-muted text-xs">
                      {tx.currency || project?.settings.baseCurrency || 'EUR'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <TransactionEditModal
        key={editingTx?.id ?? 'edit'}
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        typeOptions={transactionTypes.filter((type) => type !== 'Alle')}
        currencies={currencies}
        onSave={(updated) => {
          if (!updateProject) return;
          updateProject((prev) => {
            const existing = prev.transactions.find((t) => t.id === updated.id);
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
              ...prev,
              transactions: prev.transactions.map((t) => (t.id === updated.id ? updated : t)),
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
        <div className="fixed bottom-6 right-6 z-50">
          <div className="md3-card flex items-center gap-3 rounded-2xl px-4 py-3">
            <div className="md3-text-main text-sm">Transaktion geloescht</div>
            <button
              type="button"
              onClick={() => handleRestoreTransaction(toastEntry)}
              className="md3-chip-tonal rounded-xl px-3 py-1.5 text-xs font-semibold"
            >
              Rueckgaengig
            </button>
            <button
              type="button"
              onClick={() => setShowDeletedModal(true)}
              className="md3-segment rounded-xl px-3 py-1.5 text-xs font-semibold md3-text-main"
            >
              Papierkorb
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
