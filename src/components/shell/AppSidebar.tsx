"use client";

import React from 'react';
import { LogOut } from 'lucide-react';

export type ShellNavItem = { key: string; label: string; badge?: string | number };

type Props = {
    items: ShellNavItem[];
    activeKey: string;
    onNavigate: (key: string) => void;
    sync: { title: string; text: string; ok: boolean; onClick: () => void };
    file: { name: string; detail: string; modified: boolean; onSave: () => void };
    onClose: () => void;
};

/** Desktop navigation (design v2): logo, nav with dots and badges, sync card, file status. */
export const AppSidebar = ({ items, activeKey, onNavigate, sync, file, onClose }: Props) => (
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
            <div className="app-file">
                <button type="button" className="app-file-main" onClick={file.onSave} title={file.modified ? 'Jetzt speichern' : 'Gespeichert'}>
                    <span className={file.modified ? 'app-live is-warn' : 'app-live'} aria-hidden="true" />
                    <span className="app-file-text">
                        <span className="app-file-name">{file.name}</span>
                        <span className="app-file-meta">{file.detail}</span>
                    </span>
                </button>
                <button type="button" className="app-file-close" onClick={onClose} aria-label="Projekt schließen" title="Projekt schließen">
                    <LogOut size={15} />
                </button>
            </div>
            {!sync.ok && <span className="sr-only">{sync.text}</span>}
        </div>
    </aside>
);
