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

export type ButtonVariant = 'primary' | 'tonal' | 'ghost' | 'danger';

/** Buttons of design v2: primary (violet with glow), tonal (surface), ghost (text) and danger. */
export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: 'sm' | 'md';
    icon?: React.ReactNode;
}>(({ variant = 'tonal', size = 'md', icon, className = '', children, type = 'button', ...rest }, ref) => (
    <button ref={ref} type={type} className={`ui-btn is-${variant} is-${size} ${className}`} {...rest}>
        {icon && <span className="ui-btn-icon" aria-hidden="true">{icon}</span>}
        {children}
    </button>
));
Button.displayName = 'Button';

export const IconButton = ({ label, className = '', children, type = 'button', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
    <button type={type} className={`ui-icon-btn ${className}`} aria-label={label} title={label} {...rest}>{children}</button>
);

/** Label above a form control, with an optional hint below. */
export const Field = ({ label, hint, className = '', children }: { label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }) => (
    <label className={`ui-field ${className}`}>
        <span className="ui-field-label">{label}</span>
        {children}
        {hint && <span className="ui-field-hint">{hint}</span>}
    </label>
);

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className = '', ...rest }, ref) => <input ref={ref} className={`ui-input ${className}`} {...rest} />
);
TextInput.displayName = 'TextInput';

export const SelectInput = ({ className = '', children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select className={`ui-input ui-select ${className}`} {...rest}>{children}</select>
);

/**
 * List row of design v2: leading element (avatar, icon), title with meta line, trailing values.
 * Clickable when onClick is set.
 */
export const ListRow = ({ leading, title, meta, trailing, onClick, className = '' }: {
    leading?: React.ReactNode;
    title: React.ReactNode;
    meta?: React.ReactNode;
    trailing?: React.ReactNode;
    onClick?: () => void;
    className?: string;
}) => {
    const content = (
        <>
            {leading && <span className="ui-row-lead">{leading}</span>}
            <span className="ui-row-main">
                <span className="ui-row-title">{title}</span>
                {meta && <span className="ui-row-meta">{meta}</span>}
            </span>
            {trailing && <span className="ui-row-trail">{trailing}</span>}
        </>
    );
    return onClick
        ? <button type="button" className={`ui-row is-clickable ${className}`} onClick={onClick}>{content}</button>
        : <div className={`ui-row ${className}`}>{content}</div>;
};

/** Round icon tile in a tone colour (list leading element, card icons). */
export const IconTile = ({ tone = 'accent', size = 40, children }: { tone?: KpiTone | 'loss' | 'neutral'; size?: number; children: React.ReactNode }) => (
    <span className={`ui-icon-tile is-${tone}`} style={{ width: size, height: size }} aria-hidden="true">{children}</span>
);

export const EmptyState = ({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: React.ReactNode; action?: React.ReactNode }) => (
    <div className="ui-empty">
        {icon && <IconTile tone="neutral" size={48}>{icon}</IconTile>}
        <span className="ui-empty-title">{title}</span>
        {text && <span className="ui-empty-text">{text}</span>}
        {action}
    </div>
);
