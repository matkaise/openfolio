"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Security } from '@/types/domain';

type Props = {
    securities: Record<string, Security>;
    onSelect: (isin: string) => void;
};

/** Finds securities by name, ISIN or ticker; ⌘K / Ctrl+K focuses it. */
export const SecuritySearch = ({ securities, onSelect }: Props) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const results = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return [];
        return Object.values(securities)
            .filter((sec) => [sec.name, sec.isin, sec.symbol].some((value) => (value || '').toLowerCase().includes(needle)))
            .slice(0, 8);
    }, [query, securities]);

    const choose = (isin: string) => {
        onSelect(isin);
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
    };

    return (
        <div className="app-search glass">
            <Search size={15} aria-hidden="true" />
            <input
                ref={inputRef}
                type="search"
                value={query}
                placeholder="Wertpapier suchen"
                aria-label="Wertpapier suchen"
                aria-expanded={open && results.length > 0}
                aria-controls="app-search-results"
                role="combobox"
                onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlight(0);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlight((h) => Math.min(h + 1, results.length - 1));
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlight((h) => Math.max(h - 1, 0));
                    } else if (e.key === 'Enter' && results[highlight]) {
                        e.preventDefault();
                        choose(results[highlight].isin);
                    } else if (e.key === 'Escape') {
                        setOpen(false);
                        inputRef.current?.blur();
                    }
                }}
            />
            <span className="app-kbd" aria-hidden="true">⌘K</span>
            {open && results.length > 0 && (
                <ul id="app-search-results" className="app-search-results glass" role="listbox">
                    {results.map((sec, index) => (
                        <li key={sec.isin} role="option" aria-selected={index === highlight}>
                            <button
                                type="button"
                                className={index === highlight ? 'is-active' : ''}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => choose(sec.isin)}
                            >
                                <span className="app-search-name">{sec.name}</span>
                                <span className="app-search-meta">{sec.symbol && sec.symbol !== sec.isin ? `${sec.symbol} · ` : ''}{sec.isin}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
