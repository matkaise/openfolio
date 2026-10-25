import React, { useMemo, useState } from 'react';
import { ChevronDown, Coins, Layers, TrendingUp, Wallet } from 'lucide-react';
import { selectCalculationTransactions, calculateProjectHoldings } from '@/lib/portfolioSelectors';
import { calculateClosedPositions } from '@/lib/closedPositions';
import { quoteTypeLabel } from '@/lib/labels';
import { useProjectData } from '@/contexts/ProjectContext';
import { useFormatters } from '@/components/ui/useFormatters';
import { Avatar, CardHeader, EmptyState, GlassCard, Kpi, ListRow, Pill, Segmented, toneOf } from '@/components/ui/primitives';

type SortKey = 'value' | 'performance' | 'name';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'value', label: 'Wert' },
  { value: 'performance', label: 'Rendite' },
  { value: 'name', label: 'Name' }
];

export const PortfolioList = ({ selectedPortfolioIds, onSelectSecurity }: { selectedPortfolioIds: string[], onSelectSecurity: (isin: string, currency?: string) => void }) => {
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
    if (sortKey === 'name') list.sort((a, b) => a.security.name.localeCompare(b.security.name, 'de'));
    return list;
  }, [holdings, sortKey]);

  const realizedTotal = closedPositions.reduce((sum, p) => sum + p.realized, 0);

  return (
    <>
      <div className="ui-kpis is-3">
        <Kpi label="Depotwert" value={formatters.money(totals.value)} sub={`${holdings.length} offene Positionen`} icon={<Wallet size={16} />} tone="accent" />
        <Kpi
          label="Gewinn"
          value={formatters.money(totals.gain, { sign: true })}
          valueTone={toneOf(totals.gain)}
          sub={`${formatters.percent(totals.gainPercent, { sign: true, decimals: 1 })} auf den Einstand`}
          icon={<TrendingUp size={16} />}
          tone="gain"
        />
        <Kpi
          label="Realisiert"
          value={formatters.money(realizedTotal, { sign: true })}
          valueTone={toneOf(realizedTotal)}
          sub={`${closedPositions.length} geschlossene Positionen`}
          icon={<Coins size={16} />}
          tone="amber"
        />
      </div>

      <GlassCard>
        <CardHeader title="Offene Positionen">
          <Segmented options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} ariaLabel="Sortierung" size="sm" />
        </CardHeader>

        {sortedHoldings.length === 0 ? (
          <EmptyState icon={<Layers size={22} />} title="Noch keine Positionen" text="Importiere deine Trades oder erfasse eine Transaktion." />
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
                      <span>{quoteTypeLabel(holding.security.quoteType)} · {formatters.number(holding.quantity, decimals)} Stk.</span>
                      <span>Ø {formatters.moneyIn(holding.averageBuyPriceInOriginalCurrency, holding.currency)} → {formatters.moneyIn(holding.currentPriceInOriginalCurrency, holding.currency)}</span>
                      {unresolved && <Pill tone="down">Ticker fehlt</Pill>}
                      {ignored && <Pill>Ohne Kurse</Pill>}
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
          <span className="ui-card-title">Geschlossene Positionen</span>
          <span className="ui-collapse-meta">
            {closedPositions.length}
            <ChevronDown size={18} className={showClosedPositions ? 'is-open' : ''} />
          </span>
        </button>
        {showClosedPositions && (
          closedPositions.length === 0 ? (
            <EmptyState title="Keine geschlossenen Positionen" text="Sobald du eine Position vollständig verkaufst, erscheint sie hier mit ihrem Ergebnis." />
          ) : (
            <div className="ui-rows" style={{ marginTop: 10 }}>
              {closedPositions.map((pos) => (
                <ListRow
                  key={`${pos.isin}-${pos.currency}`}
                  onClick={() => onSelectSecurity(pos.isin, pos.currency)}
                  leading={<Avatar seed={pos.isin} label={pos.name} size={40} />}
                  title={pos.name}
                  meta={<span>{quoteTypeLabel(pos.quoteType)} · {pos.currency} · letzter Trade {new Date(pos.lastDate).toLocaleDateString('de-DE')}</span>}
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
