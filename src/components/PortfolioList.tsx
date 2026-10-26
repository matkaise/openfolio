import React, { useMemo, useState } from 'react';
import { ChevronDown, Coins, Layers, TrendingUp, Wallet } from 'lucide-react';
import { selectCalculationTransactions, calculateProjectHoldings } from '@/lib/portfolioSelectors';
import { calculateClosedPositions } from '@/lib/closedPositions';
import { quoteTypeLabel } from '@/lib/labels';
import { useLanguage, useT } from '@/lib/i18n';
import { useProjectData } from '@/contexts/ProjectContext';
import { useFormatters } from '@/components/ui/useFormatters';
import { Avatar, CardHeader, EmptyState, GlassCard, Kpi, ListRow, Pill, Segmented, toneOf } from '@/components/ui/primitives';

type SortKey = 'value' | 'performance' | 'name';


export const PortfolioList = ({ selectedPortfolioIds, onSelectSecurity }: { selectedPortfolioIds: string[], onSelectSecurity: (isin: string, currency?: string) => void }) => {
  const t = useT();
  const language = useLanguage();
  const project = useProjectData();
  const formatters = useFormatters();
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [showClosedPositions, setShowClosedPositions] = useState(false);

  const filteredTransactions = useMemo(() => (
    selectCalculationTransactions(project, selectedPortfolioIds)
  ), [project, selectedPortfolioIds]);

  const { holdings } = useMemo(() => {
    if (!project) return { holdings: [] };
    return calculateProjectHoldings(project, filteredTransactions);
  }, [project, filteredTransactions]);

  const closedPositions = useMemo(() => (
    project ? calculateClosedPositions(project, filteredTransactions) : []
  ), [project, filteredTransactions]);

  const totals = useMemo(() => {
    const value = holdings.reduce((sum, h) => sum + h.value, 0);
    const gain = holdings.reduce((sum, h) => sum + h.totalReturn, 0);
    const invested = value - gain;
    return { value, gain, gainPercent: invested > 0 ? (gain / invested) * 100 : 0 };
  }, [holdings]);

  const sortedHoldings = useMemo(() => {
    const list = [...holdings];
    if (sortKey === 'value') list.sort((a, b) => b.value - a.value);
    if (sortKey === 'performance') list.sort((a, b) => b.totalReturnPercent - a.totalReturnPercent);
    if (sortKey === 'name') list.sort((a, b) => a.security.name.localeCompare(b.security.name, language));
    return list;
  }, [holdings, sortKey, language]);

  const realizedTotal = closedPositions.reduce((sum, p) => sum + p.realized, 0);

  return (
    <>
      <div className="ui-kpis is-3">
        <Kpi label={t.positions.value} value={formatters.money(totals.value)} sub={t.positions.openCount(holdings.length)} icon={<Wallet size={16} />} tone="accent" />
        <Kpi
          label={t.positions.gain}
          value={formatters.money(totals.gain, { sign: true })}
          valueTone={toneOf(totals.gain)}
          sub={t.positions.onCost(formatters.percent(totals.gainPercent, { sign: true, decimals: 1 }))}
          icon={<TrendingUp size={16} />}
          tone="gain"
        />
        <Kpi
          label={t.positions.realized}
          value={formatters.money(realizedTotal, { sign: true })}
          valueTone={toneOf(realizedTotal)}
          sub={t.positions.closedCount(closedPositions.length)}
          icon={<Coins size={16} />}
          tone="amber"
        />
      </div>

      <GlassCard>
        <CardHeader title={t.positions.open}>
          <Segmented
            options={[
              { value: 'value' as SortKey, label: t.positions.sortValue },
              { value: 'performance' as SortKey, label: t.positions.sortReturn },
              { value: 'name' as SortKey, label: t.positions.sortName }
            ]}
            value={sortKey}
            onChange={setSortKey}
            ariaLabel={t.positions.sort}
            size="sm"
          />
        </CardHeader>

        {sortedHoldings.length === 0 ? (
          <EmptyState icon={<Layers size={22} />} title={t.positions.emptyTitle} text={t.positions.emptyText} />
        ) : (
          <div className="ui-rows">
            {sortedHoldings.map((holding) => {
              const meta = project?.securities?.[holding.security.isin];
              const unresolved = meta?.symbolStatus === 'unresolved';
              const ignored = meta?.ignoreMarketData || meta?.symbolStatus === 'ignored';
              const weight = totals.value > 0 ? (holding.value / totals.value) * 100 : 0;
              const decimals = holding.quantity % 1 === 0 ? 0 : 3;
              return (
                <ListRow
                  key={`${holding.security.isin}-${holding.currency}`}
                  onClick={() => onSelectSecurity(holding.security.isin, holding.currency)}
                  leading={<Avatar seed={holding.security.isin} label={holding.security.name} />}
                  title={holding.security.name}
                  meta={(
                    <>
                      <span>{quoteTypeLabel(t, holding.security.quoteType)} · {t.units.shares(formatters.number(holding.quantity, decimals))}</span>
                      <span>Ø {formatters.moneyIn(holding.averageBuyPriceInOriginalCurrency, holding.currency)} → {formatters.moneyIn(holding.currentPriceInOriginalCurrency, holding.currency)}</span>
                      {unresolved && <Pill tone="down">{t.positions.missingTicker}</Pill>}
                      {ignored && <Pill>{t.positions.noPrices}</Pill>}
                    </>
                  )}
                  trailing={(
                    <>
                      <span className="ui-row-value">{formatters.money(holding.value)}</span>
                      <span className="ui-row-sub">
                        <span className="app-hide-mobile">{formatters.percent(weight, { decimals: 1 })} · </span>
                        <Pill tone={toneOf(holding.totalReturn)} title={formatters.money(holding.totalReturn, { sign: true })}>
                          {formatters.percent(holding.totalReturnPercent, { sign: true, decimals: 1 })}
                        </Pill>
                      </span>
                    </>
                  )}
                />
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <button
          type="button"
          className="ui-collapse"
          onClick={() => setShowClosedPositions((v) => !v)}
          aria-expanded={showClosedPositions}
        >
          <span className="ui-card-title">{t.positions.closed}</span>
          <span className="ui-collapse-meta">
            {closedPositions.length}
            <ChevronDown size={18} className={showClosedPositions ? 'is-open' : ''} />
          </span>
        </button>
        {showClosedPositions && (
          closedPositions.length === 0 ? (
            <EmptyState title={t.positions.closedEmptyTitle} text={t.positions.closedEmptyText} />
          ) : (
            <div className="ui-rows" style={{ marginTop: 10 }}>
              {closedPositions.map((pos) => (
                <ListRow
                  key={`${pos.isin}-${pos.currency}`}
                  onClick={() => onSelectSecurity(pos.isin, pos.currency)}
                  leading={<Avatar seed={pos.isin} label={pos.name} size={40} />}
                  title={pos.name}
                  meta={<span>{quoteTypeLabel(t, pos.quoteType)} · {pos.currency} · {t.positions.lastTrade(formatters.date(pos.lastDate))}</span>}
                  trailing={<Pill tone={toneOf(pos.realized)}>{formatters.money(pos.realized, { sign: true })}</Pill>}
                />
              ))}
            </div>
          )
        )}
      </GlassCard>
    </>
  );
};
