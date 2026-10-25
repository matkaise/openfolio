"use client";

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Dialog of design v2: glass panel over a blurred backdrop, header with title and close
 * button, scrolling body, optional footer. Escape and a click on the backdrop close it.
 */
export const Modal = ({ open, onClose, title, subtitle, icon, size = 'md', footer, children, closeOnBackdrop = true, labelledBy }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    footer?: React.ReactNode;
    children: React.ReactNode;
    closeOnBackdrop?: boolean;
    labelledBy?: string;
}) => {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        panelRef.current?.focus();
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div className="ui-modal-backdrop" onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}>
            <div
                ref={panelRef}
                className={`ui-modal glass is-${size}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy ?? titleId}
                tabIndex={-1}
            >
                <header className="ui-modal-head">
                    {icon && <span className="ui-modal-icon" aria-hidden="true">{icon}</span>}
                    <div className="ui-modal-heading">
                        <h2 id={titleId} className="ui-modal-title">{title}</h2>
                        {subtitle && <div className="ui-modal-sub">{subtitle}</div>}
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Schließen" title="Schließen">
                        <X size={18} />
                    </button>
                </header>
                <div className="ui-modal-body">{children}</div>
                {footer && <footer className="ui-modal-foot">{footer}</footer>}
            </div>
        </div>
    );
};
