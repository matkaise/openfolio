"use client";

import React from 'react';
import { hash53 } from '@/lib/hash';

// Building blocks of design v2. Styling lives in globals.css (.ui-*), colours are tokens.

export const GlassCard = ({ className = '', children, ...rest }: React.HTMLAttributes<HTMLElement> & { className?: string }) => (
    <section className={`ui-card glass ${className}`} {...rest}>{children}</section>
);

export const CardHeader = ({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) => (
    <div className="ui-card-head">
        <h2 className="ui-card-title">{title}</h2>
        {children}
    </div>
);

export type PillTone = 'up' | 'down' | 'neutral' | 'accent';

export const Pill = ({ tone = 'neutral', className = '', children, title }: { tone?: PillTone; className?: string; children: React.ReactNode; title?: string }) => (
    <span className={`ui-pill is-${tone} ${className}`} title={title}>{children}</span>
);

export const toneOf = (value: number): PillTone => (value > 0 ? 'up' : value < 0 ? 'down' : 'neutral');

export function Segmented<T extends string>({ options, value, onChange, ariaLabel, size = 'md' }: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    ariaLabel: string;
    size?: 'sm' | 'md';
}) {
    return (
        <div className={`ui-seg is-${size}`} role="radiogroup" aria-label={ariaLabel}>
            {options.map((option) => (
                <button
                    type="button"
                    key={option.value}
                    role="radio"
                    aria-checked={option.value === value}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export const Chip = ({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) => (
    <button type="button" className={active ? 'ui-chip is-active' : 'ui-chip'} aria-pressed={active} onClick={onClick}>{children}</button>
);

/** Two-letter avatar with a gradient whose hue is derived from the ISIN. */
export const Avatar = ({ seed, label, size = 44 }: { seed: string; label: string; size?: number }) => {
    const hue = parseInt(hash53(seed), 36) % 360;
    return (
        <span
            className="ui-avatar"
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                background: `linear-gradient(135deg, oklch(0.62 0.18 ${hue}), oklch(0.5 0.18 ${(hue + 30) % 360}))`
            }}
        >
            {label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '··'}
        </span>
    );
};

/** Donut via conic-gradient with small gaps between the segments. */
export const Donut = ({ segments, centerValue, centerLabel, size = 150 }: {
    segments: { label: string; value: number; color: string }[];
    centerValue: React.ReactNode;
    centerLabel: string;
    size?: number;
}) => {
    const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
    const gap = segments.length > 1 ? 0.8 : 0;
    let acc = 0;
    const stops: string[] = [];
    segments.forEach((segment) => {
        const share = total > 0 ? (Math.max(0, segment.value) / total) * 100 : 0;
        const from = acc;
        const to = acc + share;
        stops.push(`${segment.color} ${from.toFixed(2)}% ${Math.max(from, to - gap).toFixed(2)}%`);
        if (gap) stops.push(`transparent ${Math.max(from, to - gap).toFixed(2)}% ${to.toFixed(2)}%`);
        acc = to;
    });
    return (
        <div
            className="ui-donut"
            role="img"
            aria-label={`${centerLabel}: ${segments.map((s) => `${s.label} ${total > 0 ? ((s.value / total) * 100).toFixed(1) : 0} %`).join(', ')}`}
            style={{ width: size, height: size, background: total > 0 ? `conic-gradient(${stops.join(', ')})` : 'var(--surface2)' }}
        >
            <div className="ui-donut-hole">
                <div className="ui-donut-value">{centerValue}</div>
                <div className="ui-donut-label">{centerLabel}</div>
            </div>
        </div>
    );
};

export type KpiTone = 'accent' | 'gain' | 'teal' | 'amber';

export const Kpi = ({ label, value, sub, icon, tone, valueTone }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    icon: React.ReactNode;
    tone: KpiTone;
    valueTone?: PillTone;
}) => (
    <div className="ui-kpi glass">
        <div className="ui-kpi-top">
            <span className="ui-label">{label}</span>
            <span className={`ui-kpi-icon is-${tone}`} aria-hidden="true">{icon}</span>
        </div>
        <span className={`ui-kpi-value${valueTone === 'up' ? ' is-up' : valueTone === 'down' ? ' is-down' : ''}`}>{value}</span>
        {sub && <span className="ui-kpi-sub">{sub}</span>}
    </div>
);
