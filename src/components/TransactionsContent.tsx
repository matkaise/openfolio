import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search, X } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { filterTransactionsByPortfolio } from '@/lib/portfolioSelectors';
import { getCurrencyOptions } from '@/lib/fxUtils';
import { type DeletedTxEntry, type TransactionLike } from '@/types/portfolioView';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">Transaktion bearbeiten</h3>
            <p className="text-xs text-slate-400 mt-1">{transaction.name || transaction.isin}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="text-slate-400 hover:text-white" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Typ</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {(typeOptions.length ? typeOptions : ['Buy', 'Sell', 'Dividend', 'Sparplan_Buy']).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Stück</label>
            <input
              type="number"
              step="0.0001"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Preis pro Stk.</label>
            <input
              type="number"
              step="0.0001"
              value={pricePerShare}
              onChange={(e) => setPricePerShare(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Betrag</label>
            <div className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200">
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
            <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Währung</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {currencies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-between items-center gap-3">
          <button
            onClick={() => {
              if (!transaction) return;
              if (window.confirm('Transaktion wirklich loeschen?')) {
                onDelete(transaction);
              }
            }}
            className="px-4 py-2 text-rose-300 hover:text-white hover:bg-rose-500/10 rounded-lg transition font-medium border border-rose-500/30"
          >
            Loeschen
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition font-medium">Abbrechen</button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <style>{`
        .deleted-modal-scroll::-webkit-scrollbar { width: 8px; }
        .deleted-modal-scroll::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.35);
          border-radius: 999px;
        }
        .deleted-modal-scroll::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.55);
          border-radius: 999px;
          border: 2px solid rgba(15, 23, 42, 0.35);
        }
        .deleted-modal-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(203, 213, 225, 0.75);
        }
      `}</style>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">Papierkorb</h3>
            <p className="text-xs text-slate-400 mt-1">{items.length} Eintraege</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="text-slate-400 hover:text-white" />
          </button>
        </div>

        <div
          className="deleted-modal-scroll max-h-[60vh] overflow-y-auto divide-y divide-slate-800 pr-2 -mr-2 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.5)_rgba(15,23,42,0.3)]"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {items.length === 0 ? (
            <div className="text-slate-400 text-sm p-6 text-center">Keine geloeschten Transaktionen.</div>
          ) : (
            items.map(entry => (
              <div key={entry.tx.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">{entry.tx.name || entry.tx.isin}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(entry.tx.date).toLocaleDateString('de-DE')} - {entry.tx.type}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onRestore(entry)}
                    className="px-3 py-1.5 text-xs bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 rounded-lg hover:bg-emerald-500/30 transition"
                  >
                    Wiederherstellen
                  </button>
                  <button
                    onClick={() => onPurge(entry)}
                    className="px-3 py-1.5 text-xs bg-rose-500/10 text-rose-200 border border-rose-500/30 rounded-lg hover:bg-rose-500/20 transition"
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

  const filteredTransactions = useMemo(() => {
    return filterTransactionsByPortfolio(project, selectedPortfolioIds);
  }, [project, selectedPortfolioIds]);

  const transactionTypes = useMemo(() => {
    const types = new Set<string>();
    filteredTransactions.forEach(t => {
      if (t.type) types.add(t.type);
    });
    return ['Alle', ...Array.from(types).sort()];
  }, [filteredTransactions]);

  const currencies = useMemo(() => {
    return getCurrencyOptions(project?.fxData);
  }, [project?.fxData]);

  const portfolioNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (project?.portfolios || []).forEach(p => {
      map[p.id] = p.name;
    });
    return map;
  }, [project?.portfolios]);

  const visibleTransactions = useMemo(() => {
    const query = txSearch.trim().toLowerCase();
    const fromDate = txDateFrom ? new Date(`${txDateFrom}T00:00:00`) : null;
    const toDate = txDateTo ? new Date(`${txDateTo}T23:59:59`) : null;
    return filteredTransactions
      .filter(t => txType === 'Alle' || t.type === txType)
      .filter(t => {
        if (!fromDate && !toDate) return true;
        const d = new Date(`${t.date}T00:00:00`);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      })
      .filter(t => {
        if (!query) return true;
        const hay = (t.name || '') + ' ' + (t.isin || '') + ' ' + (t.type || '') + ' ' + (t.broker || '');
        return hay.toLowerCase().includes(query);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredTransactions, txType, txSearch, txDateFrom, txDateTo]);

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
    updateProject(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== target.id),
      modified: new Date().toISOString()
    }));
    const entry = { tx: target, deletedAt: new Date().toISOString() };
    setDeletedTxs(prev => [entry, ...prev.filter(e => e.tx.id !== target.id)]);
    setToastEntry(entry);
  };

  const handleRestoreTransaction = (entry: DeletedTxEntry) => {
    if (!updateProject) return;
    updateProject(prev => ({
      ...prev,
      transactions: prev.transactions.some(t => t.id === entry.tx.id)
        ? prev.transactions
        : [...prev.transactions, entry.tx],
      modified: new Date().toISOString()
    }));
    setDeletedTxs(prev => prev.filter(e => e.tx.id !== entry.tx.id));
    setToastEntry(null);
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FileText size={20} className="text-emerald-500" />
          Transaktionen
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDeletedModal(true)}
            className="text-xs bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white hover:bg-slate-700/70 transition-colors rounded-lg py-1.5 px-3"
          >
            Papierkorb ({deletedTxs.length})
          </button>
          <div className="text-sm text-slate-400">
            {visibleTransactions.length}{visibleTransactions.length !== filteredTransactions.length ? ' / ' + filteredTransactions.length : ''} Eintraege
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            value={txSearch}
            onChange={(e) => setTxSearch(e.target.value)}
            placeholder="ISIN, Name oder Typ suchen..."
            className="w-full bg-slate-800 border border-slate-700/60 rounded-xl py-2 pl-9 pr-3 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Typ</span>
          <select
            value={txType}
            onChange={(e) => setTxType(e.target.value)}
            className="bg-slate-800 border border-slate-700/60 rounded-lg py-2 px-3 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            {transactionTypes.map(type => (
              <option key={type} value={type} className="bg-slate-800">{type}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Von</span>
          <input
            type="date"
            value={txDateFrom}
            onChange={(e) => setTxDateFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700/60 rounded-lg py-2 px-3 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Bis</span>
          <input
            type="date"
            value={txDateTo}
            onChange={(e) => setTxDateTo(e.target.value)}
            className="bg-slate-800 border border-slate-700/60 rounded-lg py-2 px-3 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        <button
          onClick={() => {
            setTxSearch('');
            setTxType('Alle');
            setTxDateFrom('');
            setTxDateTo('');
          }}
          className="md:ml-auto bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-700/70 transition-colors rounded-lg py-2 px-3 text-sm"
        >
          Filter zurücksetzen
        </button>
      </div>

      <div className="space-y-3">
        {visibleTransactions.length === 0 ? (
          <div className="text-slate-400 text-sm p-8 text-center bg-slate-800/20 rounded-xl">Keine Transaktionen vorhanden.</div>
        ) : (
          visibleTransactions.map(tx => (
            <div
              key={tx.id}
              onClick={() => setEditingTx(tx)}
              className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between hover:bg-slate-800/70 transition cursor-pointer"
            >
              <div>
                <div className="text-sm font-medium text-white">{project?.securities?.[tx.isin || '']?.name || tx.name || tx.isin}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  <span className="bg-slate-700 px-1.5 rounded">{tx.type}</span>
                  {tx.portfolioId && portfolioNameById[tx.portfolioId] ? (
                    <>
                      <span className="text-slate-500"> - </span>
                      <span className="bg-slate-700/70 text-slate-200 px-1.5 rounded">
                        {portfolioNameById[tx.portfolioId]}
                      </span>
                    </>
                  ) : null}
                  <span className="text-slate-500"> - </span>
                  <span>{new Date(tx.date).toLocaleDateString('de-DE')}</span>
                  {tx.shares || tx.quantity ? (
                    <>
                      <span className="text-slate-500"> - </span>
                      <span>{Math.abs(tx.shares || tx.quantity || 0)} Stk.</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <div className={'text-sm font-medium ' + ((tx.amount || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {(tx.amount || 0) >= 0 ? '+' : ''}{Math.abs(tx.amount || 0).toLocaleString('de-DE', { style: 'currency', currency: tx.currency || project?.settings.baseCurrency || 'EUR' })}
                </div>
                <div className="text-xs text-slate-500">
                  {tx.currency || project?.settings.baseCurrency || 'EUR'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <TransactionEditModal
        key={editingTx?.id ?? 'edit'}
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        typeOptions={transactionTypes.filter(type => type !== 'Alle')}
        currencies={currencies}
        onSave={(updated) => {
          if (!updateProject) return;
          updateProject(prev => ({
            ...prev,
            transactions: prev.transactions.map(t => t.id === updated.id ? updated : t),
            modified: new Date().toISOString()
          }));
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
          setDeletedTxs(prev => prev.filter(e => e.tx.id !== entry.tx.id));
        }}
      />

      {toastEntry ? (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 shadow-2xl rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="text-sm text-slate-200">
            Transaktion geloescht
          </div>
          <button
            onClick={() => handleRestoreTransaction(toastEntry)}
            className="text-xs px-3 py-1.5 bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 rounded-lg hover:bg-emerald-500/30 transition"
          >
            Rueckgaengig
          </button>
          <button
            onClick={() => setShowDeletedModal(true)}
            className="text-xs px-3 py-1.5 bg-slate-800 text-slate-200 border border-slate-700/60 rounded-lg hover:bg-slate-700/70 transition"
          >
            Papierkorb
          </button>
        </div>
      ) : null}
    </div>
  );
};
