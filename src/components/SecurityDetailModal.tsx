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

const RANGES = ['1M', '6M', '1J', '3J', '5J', 'MAX'];

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
            .filter(tx => tx.isin === security.isin && (tx.type === 'Buy' || tx.type === 'Sell'))
            .filter(tx => (normalizedCurrencyFilter ? (tx.currency || '').trim().toUpperCase() === normalizedCurrencyFilter : true))
            .map(tx => ({
                date: tx.date.split('T')[0],
                label: tx.type === 'Buy' ? t.security.buy : t.security.sell,
                color: tx.type === 'Buy' ? 'var(--gain)' : 'var(--loss)',
                type: tx.type as 'Buy' | 'Sell'
            }));
    }, [transactions, security.isin, normalizedCurrencyFilter, t]);

    const latestPrice = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
    const startPrice = chartData.length > 0 ? chartData[0].value : 0;
    const change = latestPrice - startPrice;
    const changePercent = startPrice > 0 ? (change / startPrice) * 100 : 0;
    const isPositive = change >= 0;
    const money = (value: number) => formatters.moneyIn(value, security.currency);
    const ratio = (value: number | undefined) => (value === undefined || !Number.isFinite(value) ? '–' : formatters.number(value, 2));
    const billions = (value: number | undefined) => (value ? `${t.units.billions(formatters.number(value / 1e9, 2))} ${security.currency}` : '–');

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            size="xl"
            title={security.name}
            subtitle={[quoteTypeLabel(t, security.quoteType), security.symbol, security.isin, normalizedCurrencyFilter ? t.security.tradesIn(normalizedCurrencyFilter) : null].filter(Boolean).join(' · ')}
            icon={<Avatar seed={security.isin} label={security.name} size={44} />}
        >
            <div className="ui-price-head">
                <span className="ui-price-value">{money(latestPrice)}</span>
                <Pill tone={toneOf(change)}>
                    {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {formatters.moneyIn(change, security.currency, { sign: true })} · {formatters.percent(changePercent, { sign: true })}
                </Pill>
                <span className="ui-price-range">
                    <Segmented options={RANGES.map((value) => ({ value, label: t.ranges.short[value] }))} value={timeRange} onChange={setTimeRange} ariaLabel={t.ranges.label} size="sm" />
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
                        <span><i style={{ background: 'var(--gain)' }} /> {t.security.buy}</span>
                        <span><i style={{ background: 'var(--loss)' }} /> {t.security.sell}</span>
                    </div>
                )}
            </div>

            <div className="ui-info-grid">
                <section className="ui-info-card">
                    <h3 className="ui-info-title">{t.security.profile}</h3>
                    <dl className="ui-dl">
                        <dt>{t.security.country}</dt><dd>{security.country || '–'}</dd>
                        <dt>{t.security.sector}</dt><dd>{security.sector || '–'}</dd>
                        <dt>{t.security.industry}</dt><dd title={security.industry}>{security.industry || '–'}</dd>
                        <dt>{t.security.marketCap}</dt><dd>{billions(security.marketCap)}</dd>
                    </dl>
                </section>

                <section className="ui-info-card">
                    <h3 className="ui-info-title">{t.security.keyFigures}</h3>
                    <div className="ui-metric-grid">
                        <div><span className="ui-label">{t.security.pe}</span><span className="ui-metric">{ratio(security.trailingPE)}</span></div>
                        <div><span className="ui-label">{t.security.forwardPe}</span><span className="ui-metric">{ratio(security.forwardPE)}</span></div>
                        <div><span className="ui-label">{t.security.eps}</span><span className="ui-metric">{ratio(security.epsTrailingTwelveMonths)}</span></div>
                        <div><span className="ui-label">{t.security.revenue}</span><span className="ui-metric">{security.totalRevenue ? t.units.billions(formatters.number(security.totalRevenue / 1e9, 2)) : '–'}</span></div>
                    </div>
                </section>

                <section className="ui-info-card is-wide">
                    <h3 className="ui-info-title">{t.security.dividends}</h3>
                    <div className="ui-metric-grid is-3">
                        <div><span className="ui-label">{t.security.dividendYield}</span><span className="ui-metric is-up">{formatters.percent((security.dividendYield || 0) * 100)}</span></div>
                        <div><span className="ui-label">{t.security.annualForecast}</span><span className="ui-metric">{security.annualDividendRate ? money(security.annualDividendRate) : '–'}</span></div>
                        <div><span className="ui-label">{t.security.nextExDate}</span><span className="ui-metric">{security.upcomingDividends?.[0]?.exDate ? formatters.date(security.upcomingDividends[0].exDate) : '–'}</span></div>
                    </div>
                    {security.dividendHistory && security.dividendHistory.length > 0 && (
                        <div className="ui-chips">
                            {security.dividendHistory.slice(-5).reverse().map((div) => (
                                <span key={div.date} className="ui-chip-stat">
                                    <span className="ui-sub">{formatters.date(div.date)}</span>
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
