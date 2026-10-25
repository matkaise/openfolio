"use client";

import React from 'react';

export type ShellNavItem = { key: string; label: string; badge?: string | number };

type Props = {
    items: ShellNavItem[];
    activeKey: string;
    onNavigate: (key: string) => void;
    sync: { title: string; text: string; ok: boolean; onClick: () => void };
    /** File status card; subscribes to the store itself so status changes do not re-render the shell. */
    fileStatus: React.ReactNode;
};

/** Desktop navigation (design v2): logo, nav with dots and badges, sync card, file status. */
export const AppSidebar = ({ items, activeKey, onNavigate, sync, fileStatus }: Props) => (
    <aside className="app-side" aria-label="Hauptnavigation">
        <div className="app-logo">
            <span className="app-logo-mark" aria-hidden="true">O</span>
            <span className="app-logo-name">Openfolio</span>
        </div>

        <nav className="app-nav">
            {items.map((item) => (
                <button
                    type="button"
                    key={item.key}
                    onClick={() => onNavigate(item.key)}
                    className={item.key === activeKey ? 'app-nav-item is-active' : 'app-nav-item'}
                    aria-current={item.key === activeKey ? 'page' : undefined}
                >
                    <span className="app-nav-dot" aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge !== '' && item.badge !== 0 && (
                        <span className="app-nav-badge">{item.badge}</span>
                    )}
                </button>
            ))}
        </nav>

        <div className="app-side-foot">
            <button type="button" className="app-promo glass" onClick={sync.onClick}>
                <span className="app-promo-title">{sync.title}</span>
                <span className="app-promo-text">{sync.text}</span>
            </button>
            {fileStatus}
            {!sync.ok && <span className="sr-only">{sync.text}</span>}
        </div>
    </aside>
);
