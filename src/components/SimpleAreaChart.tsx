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

export const SimpleAreaChart = ({
    data,
    color = "#10b981",
    height = 300,
    showAxes = false,
    timeRange = '1M',
    currency = 'USD',
    isPercentage = false,
    tooltipLabel,
    markers = []
}: {
    data: any[],
    color?: string,
    height?: number,
    showAxes?: boolean,
    timeRange?: string,
    currency?: string,
    isPercentage?: boolean,
    tooltipLabel?: string,
    markers?: { date: string, label?: string, color?: string, type?: 'Buy' | 'Sell' }[]
}) => {
    if (!data || data.length === 0) {
        return (
            <div className={`w-full flex items-center justify-center text-slate-500 text-sm`} style={{ height }}>
                Keine Daten verfügbar
            </div>
        );
    }

    // Calculate min/max for Y axis
    const prices = data.map(d => d.value);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        if (['3J', '5J', 'MAX'].includes(timeRange)) {
            return d.getFullYear().toString();
        }
        return `${d.getDate()}.${d.getMonth() + 1}.`;
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
                <AreaChart data={data} margin={{ top: 10, right: showAxes ? 20 : 0, bottom: showAxes ? 5 : 0, left: showAxes ? 0 : 0 }}>
                    <defs>
                        <linearGradient id={`colorGradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="splitStroke" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#10b981" stopOpacity={1} />
                            <stop offset={off} stopColor="#f43f5e" stopOpacity={1} />
                        </linearGradient>
                        <linearGradient id="splitFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset={off} stopColor="#f43f5e" stopOpacity={0.3} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        hide={!showAxes}
                        tickFormatter={formatDate}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        minTickGap={80}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                    />
                    <YAxis
                        domain={isPercentage ? ['auto', 'auto'] : [minPrice - padding, maxPrice + padding]}
                        hide={!showAxes}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickFormatter={formatYAxis}
                        axisLine={false}
                        tickLine={false}
                        width={65}
                        tickCount={isPercentage ? 7 : 6}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '12px' }}
                        itemStyle={{ color: isPercentage ? (Number(data[0]?.value) > 0 ? '#10b981' : '#f43f5e') : color }} // Simplification for tooltip dot
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(value: any) => [
                            isPercentage ? `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%` : `${Number(value).toFixed(2)}`,
                            isPercentage ? (tooltipLabel || 'Performance') : (tooltipLabel || 'Kurs')
                        ]}
                        labelFormatter={(label) => {
                            const d = new Date(label);
                            return d.toLocaleDateString();
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={isPercentage ? "url(#splitStroke)" : color}
                        strokeWidth={2}
                        fill={isPercentage ? "url(#splitFill)" : `url(#colorGradient-${color})`}
                    />
                    {markers.map((m, i) => (
                        <ReferenceDot
                            key={i}
                            x={m.date}
                            y={data.find(d => d.date === m.date)?.value}
                            r={4}
                            fill={m.color || '#10b981'}
                            stroke="#fff"
                            strokeWidth={2}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
