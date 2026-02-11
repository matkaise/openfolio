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
    const parseDateOnlyUTC = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

    if (!data || data.length === 0) {
        return (
            <div className={`w-full flex items-center justify-center md3-text-muted text-sm`} style={{ height }}>
                Keine Daten verfügbar
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
    const axisTickColor = '#8d9199'; // Approximation of --md3-outline or on-surface-variant

    const formatDate = (dateStr: string) => {
        const d = parseDateOnlyUTC(dateStr);
        if (['3J', '5J', 'MAX'].includes(timeRange)) {
            return d.getUTCFullYear().toString();
        }
        return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
    };

    const formatYAxis = (val: number) => {
        if (isPercentage) {
            return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
        }
        const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
        if (val >= 1000) return `${currencySymbol}${Math.round(val)}`;
        if (val >= 10) return `${currencySymbol}${val.toFixed(0)}`;
        return `${currencySymbol}${val.toFixed(2)}`;
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
                            <stop offset={off} stopColor="#18a957" stopOpacity={1} />
                            <stop offset={off} stopColor="#c73a59" stopOpacity={1} />
                        </linearGradient>
                        <linearGradient id="splitFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#18a957" stopOpacity={0.3} />
                            <stop offset={off} stopColor="#c73a59" stopOpacity={0.3} />
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
                        width={62}
                        tickCount={isPercentage ? 7 : 6}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'var(--md3-surface-container-high)',
                            border: 'none',
                            borderRadius: '16px',
                            fontSize: '12px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                        }}
                        itemStyle={{ color: isPercentage ? (Number(data[0]?.value) > 0 ? '#18a957' : '#c73a59') : color }}
                        labelStyle={{ color: 'var(--md3-on-surface-variant)' }}
                        formatter={(value: number | string) => [
                            isPercentage ? `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%` : `${Number(value).toFixed(2)}`,
                            isPercentage ? (tooltipLabel || 'Performance') : (tooltipLabel || 'Kurs')
                        ]}
                        labelFormatter={(label: string) => {
                            const d = parseDateOnlyUTC(label);
                            return d.toLocaleDateString('de-DE', { timeZone: 'UTC' });
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
                        const y = data.find(d => d.date === m.date)?.value;
                        if (y === undefined) return null;
                        return (
                            <ReferenceDot
                                key={i}
                                x={m.date}
                                y={y}
                                r={4}
                                fill={m.color || '#18a957'}
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
