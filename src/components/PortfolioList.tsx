import React, { useMemo, useState } from 'react';
import { ChevronRight, Wallet } from 'lucide-react';
import { filterTransactionsByPortfolio, calculateProjectHoldings } from '@/lib/portfolioSelectors';
import { convertCurrency } from '@/lib/fxUtils';
import { useProject } from '@/contexts/ProjectContext';
import { type TransactionLike } from '@/types/portfolioView';
import { Card } from '@/components/ui/Card';

export const PortfolioList = ({ selectedPortfolioIds, onSelectSecurity }: { selectedPortfolioIds: string[], onSelectSecurity: (isin: string, currency?: string) => void }) => {
  const { project } = useProject();
  const [showClosedPositions, setShowClosedPositions] = useState(false);

  const filteredTransactions = useMemo(() => (
    filterTransactionsByPortfolio(project, selectedPortfolioIds)
  ), [project, selectedPortfolioIds]);

  const { holdings } = useMemo(() => {
    if (!project) return { holdings: [] };
    return calculateProjectHoldings(project, filteredTransactions);
  }, [project, filteredTransactions]);

  const closedPositions = useMemo(() => {
    if (!project) return [];

    const baseCurrency = project.settings.baseCurrency || 'EUR';

    const normalizeCurrency = (value: string | undefined) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : baseCurrency;
    };

    const txByKey: Record<string, { isin: string; currency: string; txs: TransactionLike[] }> = {};
    filteredTransactions.forEach((t) => {
      if (!t.isin) return;
      if (!['Buy', 'Sell', 'Sparplan_Buy'].includes(t.type)) return;
      const currency = normalizeCurrency(t.currency);
      const key = `${t.isin}__${currency}`;
      if (!txByKey[key]) txByKey[key] = { isin: t.isin, currency, txs: [] };
      txByKey[key].txs.push(t);
    });

    const results = Object.values(txByKey).map(({ isin, currency, txs }) => {
      const sortedTxs = txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let qty = 0;
      let realized = 0;
      let lastDate = '';

      sortedTxs.forEach((t) => {
        const shares = Math.abs(t.shares || t.quantity || 0);
        if (t.type === 'Buy' || t.type === 'Sparplan_Buy') qty += shares;
        if (t.type === 'Sell') qty -= shares;

        const signedAmount = (t.amount < 0 ? -1 : 1) * Math.abs(t.amount || 0);
        realized += convertCurrency(project.fxData, signedAmount, t.currency || baseCurrency, baseCurrency, t.date);
        if (!lastDate || new Date(t.date) > new Date(lastDate)) lastDate = t.date;
      });

      return { isin, currency, qty, realized, lastDate };
    });

    return results
      .filter((r) => Math.abs(r.qty) < 0.0001)
      .map((r) => {
        const sec = project.securities?.[r.isin];
        return {
          isin: r.isin,
          currency: r.currency,
          name: sec?.name || r.isin,
          quoteType: sec?.quoteType || 'Aktie',
          realized: r.realized,
          lastDate: r.lastDate
        };
      })
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [project, filteredTransactions]);

  return (
    <Card className="w-full !p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="md3-text-main flex items-center gap-2 text-lg font-bold">
          <Wallet size={20} className="md3-accent" />
          Wertpapiere
        </h2>
        <div className="text-sm text-slate-400">
          {holdings.length} Positionen
        </div>
      </div>

      <div className="space-y-3">
        {holdings.length === 0 ? (
          <div className="md3-list-item p-8 text-center text-sm text-slate-400">Keine Positionen vorhanden. Importiere deine Trades.</div>
        ) : (
          holdings.map((stock) => (
            (() => {
              const meta = project?.securities?.[stock.security.isin];
              let statusLabel = 'Ticker ok';
              let statusClass = 'md3-positive-soft text-xs px-2 py-0.5 rounded-full';

              if (meta?.ignoreMarketData || meta?.symbolStatus === 'ignored') {
                statusLabel = 'Ignoriert';
                statusClass = 'md3-chip-tonal text-xs px-2 py-0.5 rounded-full';
              } else if (meta?.symbolStatus === 'unresolved') {
                statusLabel = 'Ticker fehlt';
                statusClass = 'md3-negative-soft text-xs px-2 py-0.5 rounded-full';
              }

              return (
            <div key={`${stock.security.isin}-${stock.currency}`} onClick={() => onSelectSecurity(stock.security.isin, stock.currency)} className="md3-list-item flex cursor-pointer items-center justify-between p-4">
              <div className="flex items-center space-x-4">
                <div className="md3-chip-tonal flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold">
                  {stock.security.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="md3-text-main font-medium">{stock.security.name}</h4>
                  <div className="mt-0.5 flex items-center space-x-2 text-xs text-slate-400">
                      <span className="md3-chip-tonal rounded px-1.5">{stock.security.quoteType || 'Aktie'}</span>
                      <span className="md3-chip-tonal rounded px-1.5">{stock.currency}</span>
                      <span className={statusClass}>{statusLabel}</span>
                      <span>{stock.quantity} Stk.</span>
                    <span className="text-slate-500">|</span>
                    <span>Avg {stock.averageBuyPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                    <span className="text-slate-500">|</span>
                    <span>Aktuell: {stock.currentPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="md3-text-main font-medium">{stock.value.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
                <div className="flex flex-col items-end">
                  <p className={`text-xs ${stock.totalReturn >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                    {stock.totalReturn > 0 ? '+' : ''}{stock.totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                  </p>
                  <p className={`text-xs ${stock.totalReturnPercent >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                    {stock.totalReturnPercent > 0 ? '+' : ''}{stock.totalReturnPercent.toLocaleString('de-DE', { maximumFractionDigits: 2 })}%
                  </p>
                </div>
              </div>
            </div>
              );
            })()
          ))
        )}
      </div>

      <div className="mt-6 border-t border-slate-700/50 pt-6">
        <button
          onClick={() => setShowClosedPositions((v) => !v)}
          className="flex w-full items-center justify-between text-sm text-slate-300 transition-colors hover:text-white"
        >
          <span>Geschlossene Positionen ({closedPositions.length})</span>
          <ChevronRight size={16} className={`transition-transform ${showClosedPositions ? 'rotate-90' : ''}`} />
        </button>
        {showClosedPositions && (
          <div className="mt-4 space-y-3">
            {closedPositions.length === 0 ? (
              <div className="md3-list-item py-6 text-center text-sm text-slate-500">Keine geschlossenen Positionen.</div>
            ) : (
              closedPositions.map((pos) => (
                <div
                  key={`${pos.isin}-${pos.currency}`}
                  onClick={() => onSelectSecurity(pos.isin, pos.currency)}
                  className="md3-list-item flex cursor-pointer items-center justify-between p-4"
                >
                  <div>
                    <div className="md3-text-main text-sm font-medium">{pos.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      <span className="md3-chip-tonal rounded px-1.5">{pos.quoteType}</span>
                      <span className="md3-chip-tonal rounded px-1.5 ml-1">{pos.currency}</span>
                      <span className="text-slate-500"> | </span>
                      <span>Letzter Trade: {new Date(pos.lastDate).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${pos.realized >= 0 ? 'md3-positive' : 'md3-negative'}`}>
                    {pos.realized >= 0 ? '+' : ''}{pos.realized.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
