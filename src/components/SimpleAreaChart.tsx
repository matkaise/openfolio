"use client";

import React from 'react';
import {
    AreaChart,
    Area,
    ResponsiveContainer,
    XAxis,
    YAxis,
    ReferenceDot,
    Tooltip
} from 'recharts';
import { parseDateOnlyUTC } from '@/lib/dateUtils';
import { useT } from '@/lib/i18n';
import { useFormatters } from '@/components/ui/useFormatters';

type ChartPoint = { date: string; value: number };

export const SimpleAreaChart = ({
    data,
    color = "var(--md3-primary)",
    height = 300,
    showAxes = false,
    timeRange = '1M',
    currency = 'USD',
    isPercentage = false,
    tooltipLabel,
    markers = []
}: {
    data: ChartPoint[],
    color?: string,
    height?: number | string,
    showAxes?: boolean,
    timeRange?: string,
    currency?: string,
    isPercentage?: boolean,
    tooltipLabel?: string,
    markers?: { date: string, label?: string, color?: string, type?: 'Buy' | 'Sell' }[]
}) => {
    const gradientId = `colorGradient-${React.useId().replace(/:/g, '')}`;
    const t = useT();
    const formatters = useFormatters();

    if (!data || data.length === 0) {
        return (
            <div className={`w-full flex items-center justify-center md3-text-muted text-sm`} style={{ height }}>
                {t.charts.noData}
            </div>
        );
    }

    // Calculate min/max for Y axis
    const prices = data.map(d => d.value);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange > 0 ? priceRange * 0.05 : Math.max(Math.abs(maxPrice) * 0.02, 1);

    // Use CSS variable for axis tick color if possible, strictly referencing globals.css tokens
    const axisTickColor = 'var(--text3)';

    const formatDate = (dateStr: string) => {
        const d = parseDateOnlyUTC(dateStr);
        if (['3J', '5J', 'MAX'].includes(timeRange)) {
            return d.getUTCFullYear().toString();
        }
        return formatters.date(d, { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
    };

    const formatYAxis = (val: number) => {
        if (isPercentage) {
            return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
        }

        let formattedVal = val.toString();
        let suffix = '';

        if (Math.abs(val) >= 1_000_000) {
            formattedVal = (val / 1_000_000).toFixed(1);
            suffix = 'M';
        } else if (Math.abs(val) >= 1_000) {
            formattedVal = (val / 1_000).toFixed(1);
            suffix = 'k';
        } else {
            formattedVal = val.toFixed(0);
        }

        // Add ' as thousand separator if needed (e.g., if > 1000 without k abbreviation, though handled above)
        // Just in case we format normally, here's how to enforce ' separator:
        // formattedVal = formattedVal.replace(/\B(?=(\d{3})+(?!\d))/g, "'");

        const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
        return `${formattedVal}${suffix} ${currencySymbol}`;
    };

    // Calculate Zero Offset for split coloring
    const gradientOffset = () => {
        const dataMax = Math.max(...prices);
        const dataMin = Math.min(...prices);

        if (dataMax <= 0) return 0;
        if (dataMin >= 0) return 1;

        return dataMax / (dataMax - dataMin);
    };

    const off = gradientOffset();

    return (
        <div className="w-full" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 6, right: showAxes ? 16 : 0, bottom: showAxes ? 0 : 0, left: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="splitStroke" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="var(--gain)" stopOpacity={1} />
                            <stop offset={off} stopColor="var(--loss)" stopOpacity={1} />
                        </linearGradient>
                        <linearGradient id="splitFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="var(--gain)" stopOpacity={0.3} />
                            <stop offset={off} stopColor="var(--loss)" stopOpacity={0.3} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        hide={!showAxes}
                        tickFormatter={formatDate}
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        minTickGap={80}
                        axisLine={false}
                        tickLine={false}
                        dy={6}
                    />
                    <YAxis
                        domain={isPercentage ? ['auto', 'auto'] : [minPrice - padding, maxPrice + padding]}
                        hide={!showAxes}
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        tickFormatter={formatYAxis}
                        axisLine={false}
                        tickLine={false}
                        width={isPercentage ? 50 : 80}
                        tickCount={isPercentage ? 7 : 6}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'var(--md3-surface-container-high)',
                            border: 'none',
                            borderRadius: '16px',
                            fontSize: '12px',
                            boxShadow: 'var(--shadow)'
                        }}
                        itemStyle={{ color: isPercentage ? (Number(data[0]?.value) > 0 ? 'var(--gain)' : 'var(--loss)') : color }}
                        labelStyle={{ color: 'var(--md3-on-surface-variant)' }}
                        formatter={(value: number | string | undefined) => {
                            if (value === undefined) return ['', ''];
                            return [
                                isPercentage ? formatters.percent(Number(value), { sign: true }) : formatters.number(Number(value), 2),
                                isPercentage ? (tooltipLabel || t.charts.performance) : (tooltipLabel || t.charts.price)
                            ];
                        }}
                        labelFormatter={(label: unknown) => {
                            if (!label) return '';
                            const d = parseDateOnlyUTC(String(label));
                            return formatters.date(d, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={isPercentage ? "url(#splitStroke)" : color}
                        strokeWidth={2}
                        fill={isPercentage ? "url(#splitFill)" : `url(#${gradientId})`}
                    />
                    {markers.map((m, i) => {
                        const direct = data.find(d => d.date === m.date);
                        let point = direct;

                        if (!point && data.length > 0) {
                            const targetTime = parseDateOnlyUTC(m.date).getTime();
                            let closest = data[0];
                            let closestDiff = Math.abs(parseDateOnlyUTC(closest.date).getTime() - targetTime);
                            for (let idx = 1; idx < data.length; idx++) {
                                const candidate = data[idx];
                                const diff = Math.abs(parseDateOnlyUTC(candidate.date).getTime() - targetTime);
                                if (diff < closestDiff) {
                                    closest = candidate;
                                    closestDiff = diff;
                                }
                            }
                            point = closest;
                        }

                        if (!point) return null;
                        return (
                            <ReferenceDot
                                key={i}
                                x={point.date}
                                y={point.value}
                                r={4}
                                fill={m.color || 'var(--gain)'}
                                stroke="#fff"
                                strokeWidth={2}
                            />
                        );
                    })}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
