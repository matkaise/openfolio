"use client";

import React, { useId, useSyncExternalStore } from 'react';
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Formatters } from '@/lib/format';
import { parseDateOnlyUTC } from '@/lib/dateUtils';
import { useT } from '@/lib/i18n';

type Point = { date: string; value: number; invested?: number };

const subscribeReducedMotion = (callback: () => void) => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
};
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const formatTick = (formatters: Formatters, date: string, spanDays: number) => {
    const d = parseDateOnlyUTC(date);
    if (spanDays > 3 * 365) return String(d.getUTCFullYear());
    if (spanDays > 62) return formatters.date(d, { month: 'short', timeZone: 'UTC' }).replace('.', '');
    return formatters.date(d, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
};

/** Value (or performance) chart inside the hero card. */
export const HeroChart = ({ data, mode, formatters, height = 260 }: {
    data: Point[];
    mode: 'value' | 'performance';
    formatters: Formatters;
    height?: number;
}) => {
    const t = useT();
    const id = useId().replace(/:/g, '');
    const reduceMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
    const showInvested = mode === 'value' && data.some((p) => (p.invested || 0) > 0);
    const spanDays = data.length > 1
        ? (parseDateOnlyUTC(data[data.length - 1].date).getTime() - parseDateOnlyUTC(data[0].date).getTime()) / 86_400_000
        : 0;

    if (data.length < 2) {
        return <div className="hero-chart-empty" style={{ height }}>{t.charts.noPrices}</div>;
    }

    const format = (value: number) => (mode === 'value' ? formatters.money(value, { decimals: 0 }) : formatters.percent(value, { sign: true }));

    return (
        <div style={{ height }} className="hero-chart">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.38} />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                        {/* userSpaceOnUse: a flat line has a zero-height box, which would hide a bounding-box gradient */}
                        <linearGradient id={`line-${id}`} gradientUnits="userSpaceOnUse" x1="0%" y1="0" x2="100%" y2="0">
                            <stop offset="0%" stopColor="var(--c3)" />
                            <stop offset="100%" stopColor="var(--c1)" />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        minTickGap={48}
                        tick={{ fill: 'var(--text3)', fontSize: 11, fontWeight: 600 }}
                        tickFormatter={(value: string) => formatTick(formatters, value, spanDays)}
                    />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                        cursor={{ stroke: 'var(--stroke2)', strokeWidth: 1 }}
                        content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const point = payload[0].payload as Point;
                            return (
                                <div className="hero-tip glass">
                                    <span className="ui-label">{formatters.date(parseDateOnlyUTC(String(label)), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
                                    <span className="hero-tip-value">{format(point.value)}</span>
                                    {showInvested && point.invested !== undefined && (
                                        <span className="ui-sub">{t.charts.invested(formatters.money(point.invested, { decimals: 0 }))}</span>
                                    )}
                                </div>
                            );
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={`url(#line-${id})`}
                        strokeWidth={3}
                        strokeLinecap="round"
                        fill={`url(#fill-${id})`}
                        isAnimationActive={!reduceMotion}
                        animationDuration={1400}
                        dot={false}
                        activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                    />
                    {showInvested && (
                        <Line
                            type="stepAfter"
                            dataKey="invested"
                            stroke="var(--text3)"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            strokeOpacity={0.7}
                            dot={false}
                            activeDot={false}
                            isAnimationActive={false}
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
