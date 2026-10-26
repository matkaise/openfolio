import React, { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Avatar, Pill, Segmented, toneOf } from './ui/primitives';
import { useFormatters } from './ui/useFormatters';
import { quoteTypeLabel } from '@/lib/labels';
import { useT } from '@/lib/i18n';
import { SimpleAreaChart } from './SimpleAreaChart';
import { Security, Transaction } from '@/types/domain';
import { getRangeStartDate, toDateKeyLocal } from '@/lib/dateUtils';

const RANGE_OPTIONS = ['1M', '6M', '1J', '3J', '5J', 'MAX'].map((value) => ({ value, label: value }));

interface SecurityDetailModalProps {
    isOpen: boolean;
  onClose: () => void;
  security: Security;
  transactions: Transaction[];
  currencyFilter?: string;
}

export const SecurityDetailModal = ({ isOpen, onClose, security, transactions, currencyFilter }: SecurityDetailModalProps) => {
  const t = useT();
    const [timeRange, setTimeRange] = useState('1J');
    const normalizedCurrencyFilter = currencyFilter?.trim().toUpperCase();

    const formatters = useFormatters();

    // Prepare Chart Data
    const chartData = useMemo(() => {
        if (!security.priceHistory) return [];
        const sortedDates = Object.keys(security.priceHistory).sort();

        // Filter by time range (simplified logic)
        const cutoffDate = getRangeStartDate(timeRange, new Date());
        const cutoffKey = cutoffDate ? toDateKeyLocal(cutoffDate) : '';

        return sortedDates
            .filter(d => d >= cutoffKey)
            .map(date => ({
                date,
                value: security.priceHistory![date]
            }));
    }, [security.priceHistory, timeRange]);

    // Prepare Markers
    const markers = useMemo(() => {
        return transactions
            .filter(t => t.isin === security.isin && (t.type === 'Buy' || t.type === 'Sell'))
            .filter(t => (normalizedCurrencyFilter ? (t.currency || '').trim().toUpperCase() === normalizedCurrencyFilter : true))
            .map(t => ({
                date: t.date.split('T')[0],
                label: t.type === 'Buy' ? 'Kauf' : 'Verkauf',
                color: t.type === 'Buy' ? 'var(--gain)' : 'var(--loss)',
                type: t.type as 'Buy' | 'Sell'
            }));
    }, [transactions, security.isin, normalizedCurrencyFilter]);

    const latestPrice = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
    const startPrice = chartData.length > 0 ? chartData[0].value : 0;
    const change = latestPrice - startPrice;
    const changePercent = startPrice > 0 ? (change / startPrice) * 100 : 0;
    const isPositive = change >= 0;
    const money = (value: number) => formatters.moneyIn(value, security.currency);
    const ratio = (value: number | undefined) => (value === undefined || !Number.isFinite(value) ? '–' : formatters.number(value, 2));
    const billions = (value: number | undefined) => (value ? `${formatters.number(value / 1e9, 2)} Mrd. ${security.currency}` : '–');

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            size="xl"
            title={security.name}
            subtitle={[quoteTypeLabel(t, security.quoteType), security.symbol, security.isin, normalizedCurrencyFilter ? `Trades in ${normalizedCurrencyFilter}` : null].filter(Boolean).join(' · ')}
            icon={<Avatar seed={security.isin} label={security.name} size={44} />}
        >
            <div className="ui-price-head">
                <span className="ui-price-value">{money(latestPrice)}</span>
                <Pill tone={toneOf(change)}>
                    {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {formatters.moneyIn(change, security.currency, { sign: true })} · {formatters.percent(changePercent, { sign: true })}
                </Pill>
                <span className="ui-price-range">
                    <Segmented options={RANGE_OPTIONS} value={timeRange} onChange={setTimeRange} ariaLabel="Zeitraum" size="sm" />
                </span>
            </div>

            <div>
                <SimpleAreaChart
                    data={chartData}
                    currency={security.currency}
                    timeRange={timeRange}
                    color={isPositive ? 'var(--gain)' : 'var(--loss)'}
                    showAxes={true}
                    markers={markers}
                />
                {markers.length > 0 && (
                    <div className="ui-legend">
                        <span><i style={{ background: 'var(--gain)' }} /> Kauf</span>
                        <span><i style={{ background: 'var(--loss)' }} /> Verkauf</span>
                    </div>
                )}
            </div>

            <div className="ui-info-grid">
                <section className="ui-info-card">
                    <h3 className="ui-info-title">Profil</h3>
                    <dl className="ui-dl">
                        <dt>Land</dt><dd>{security.country || '–'}</dd>
                        <dt>Sektor</dt><dd>{security.sector || '–'}</dd>
                        <dt>Branche</dt><dd title={security.industry}>{security.industry || '–'}</dd>
                        <dt>Marktkapitalisierung</dt><dd>{billions(security.marketCap)}</dd>
                    </dl>
                </section>

                <section className="ui-info-card">
                    <h3 className="ui-info-title">Kennzahlen</h3>
                    <div className="ui-metric-grid">
                        <div><span className="ui-label">KGV</span><span className="ui-metric">{ratio(security.trailingPE)}</span></div>
                        <div><span className="ui-label">KGV erwartet</span><span className="ui-metric">{ratio(security.forwardPE)}</span></div>
                        <div><span className="ui-label">Gewinn je Aktie</span><span className="ui-metric">{ratio(security.epsTrailingTwelveMonths)}</span></div>
                        <div><span className="ui-label">Umsatz</span><span className="ui-metric">{security.totalRevenue ? `${formatters.number(security.totalRevenue / 1e9, 2)} Mrd.` : '–'}</span></div>
                    </div>
                </section>

                <section className="ui-info-card is-wide">
                    <h3 className="ui-info-title">Dividenden</h3>
                    <div className="ui-metric-grid is-3">
                        <div><span className="ui-label">Dividendenrendite</span><span className="ui-metric is-up">{formatters.percent((security.dividendYield || 0) * 100)}</span></div>
                        <div><span className="ui-label">Jährlich (Prognose)</span><span className="ui-metric">{security.annualDividendRate ? money(security.annualDividendRate) : '–'}</span></div>
                        <div><span className="ui-label">Nächster Ex-Tag</span><span className="ui-metric">{security.upcomingDividends?.[0]?.exDate || '–'}</span></div>
                    </div>
                    {security.dividendHistory && security.dividendHistory.length > 0 && (
                        <div className="ui-chips">
                            {security.dividendHistory.slice(-5).reverse().map((div) => (
                                <span key={div.date} className="ui-chip-stat">
                                    <span className="ui-sub">{div.date}</span>
                                    <strong>{money(div.amount)}</strong>
                                </span>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </Modal>
    );
};
