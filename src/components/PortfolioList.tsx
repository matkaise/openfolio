import React, { useMemo, useState } from 'react';
import { ChevronRight, Wallet } from 'lucide-react';
import { filterTransactionsByPortfolio, calculateProjectHoldings } from '@/lib/portfolioSelectors';
import { convertCurrency } from '@/lib/fxUtils';
import { useProject } from '@/contexts/ProjectContext';
import { type TransactionLike } from '@/types/portfolioView';

export const PortfolioList = ({ selectedPortfolioIds, onSelectSecurity }: { selectedPortfolioIds: string[], onSelectSecurity: (isin: string) => void }) => {
  const { project } = useProject();
  const [showClosedPositions, setShowClosedPositions] = useState(false);

  // Filter transactions based on selected Portfolio
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

    const txByIsin: Record<string, TransactionLike[]> = {};
    filteredTransactions.forEach(t => {
      if (!t.isin) return;
      if (!['Buy', 'Sell', 'Sparplan_Buy'].includes(t.type)) return;
      if (!txByIsin[t.isin]) txByIsin[t.isin] = [];
      txByIsin[t.isin].push(t);
    });

    const results = Object.keys(txByIsin).map(isin => {
      const txs = txByIsin[isin].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let qty = 0;
      let realized = 0;
      let lastDate = '';

      txs.forEach(t => {
        const shares = Math.abs(t.shares || t.quantity || 0);
        if (t.type === 'Buy' || t.type === 'Sparplan_Buy') qty += shares;
        if (t.type === 'Sell') qty -= shares;

        const signedAmount = (t.amount < 0 ? -1 : 1) * Math.abs(t.amount || 0);
        realized += convertCurrency(project.fxData, signedAmount, t.currency || baseCurrency, baseCurrency, t.date);
        if (!lastDate || new Date(t.date) > new Date(lastDate)) lastDate = t.date;
      });

      return { isin, qty, realized, lastDate };
    });

    return results
      .filter(r => Math.abs(r.qty) < 0.0001)
      .map(r => {
        const sec = project.securities?.[r.isin];
        return {
          isin: r.isin,
          name: sec?.name || r.isin,
          quoteType: sec?.quoteType || 'Aktie',
          realized: r.realized,
          lastDate: r.lastDate
        };
      })
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [project, filteredTransactions]);

  return (
    <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Wallet size={20} className="text-emerald-500" />
          Wertpapiere
        </h2>
        <div className="text-sm text-slate-400">
          {holdings.length} Positionen
        </div>
      </div>

      <div className="space-y-3">
        {holdings.length === 0 ? (
          <div className="text-slate-400 text-sm p-8 text-center bg-slate-800/20 rounded-xl">Keine Positionen vorhanden. Importiere deine Trades!</div>
        ) : (
          holdings.map((stock) => (
            <div key={stock.security.isin} onClick={() => onSelectSecurity(stock.security.isin)} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between hover:bg-slate-800/80 transition cursor-pointer">
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs bg-slate-700`}>
                  {stock.security.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-medium text-white">{stock.security.name}</h4>
                  <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                    <span className="bg-slate-700 px-1.5 rounded">{stock.security.quoteType || 'Aktie'}</span>
                    <span>{stock.quantity} Stk.</span>
                    <span className="text-slate-500">•</span>
                    <span>Ø {stock.averageBuyPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                    <span className="text-slate-500">•</span>
                    <span>Aktuell: {stock.currentPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="font-medium text-white">{stock.value.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
                <div className="flex flex-col items-end">
                  <p className={`text-xs ${(stock.totalReturn) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {stock.totalReturn > 0 ? '+' : ''}{stock.totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                  </p>
                  <p className={`text-xs ${(stock.totalReturnPercent) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {stock.totalReturnPercent > 0 ? '+' : ''}{stock.totalReturnPercent.toLocaleString('de-DE', { maximumFractionDigits: 2 })}%
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-700/50">
        <button
          onClick={() => setShowClosedPositions(v => !v)}
          className="w-full flex items-center justify-between text-sm text-slate-300 hover:text-white transition-colors"
        >
          <span>Geschlossene Positionen ({closedPositions.length})</span>
          <ChevronRight size={16} className={`transition-transform ${showClosedPositions ? 'rotate-90' : ''}`} />
        </button>
        {showClosedPositions && (
          <div className="mt-4 space-y-3">
            {closedPositions.length === 0 ? (
              <div className="text-slate-500 text-sm text-center py-6 bg-slate-800/20 rounded-xl">Keine geschlossenen Positionen.</div>
            ) : (
              closedPositions.map(pos => (
                <div key={pos.isin} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{pos.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      <span className="bg-slate-700 px-1.5 rounded">{pos.quoteType}</span>
                      <span className="text-slate-500"> â€¢ </span>
                      <span>Letzter Trade: {new Date(pos.lastDate).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${pos.realized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pos.realized >= 0 ? '+' : ''}{pos.realized.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};


