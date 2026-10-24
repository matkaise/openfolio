"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

// In-app replacements for window.alert / window.confirm: toasts and a confirm dialog.

type ToastTone = 'info' | 'success' | 'error';
type Toast = { id: number; tone: ToastTone; title: string; message?: string };
type ConfirmRequest = {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
    resolve: (ok: boolean) => void;
};

interface NotificationsContextType {
    notify: (toast: { tone?: ToastTone; title: string; message?: string }) => void;
    /** Resolves true when the user confirms. */
    confirm: (request: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const useNotifications = () => {
    const context = useContext(NotificationsContext);
    if (!context) throw new Error('useNotifications must be used within a NotificationsProvider');
    return context;
};

const TOAST_MS = 6000;
const ICONS: Record<ToastTone, React.ReactNode> = {
    info: <Info size={18} />,
    success: <CheckCircle2 size={18} />,
    error: <AlertTriangle size={18} />
};

const ConfirmDialog = ({ request, onClose }: { request: ConfirmRequest; onClose: (ok: boolean) => void }) => {
    const confirmRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        confirmRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onClick={() => onClose(false)}>
            <div
                className="glass w-full max-w-sm rounded-3xl p-6"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby={request.message ? 'confirm-message' : undefined}
                onClick={(e) => e.stopPropagation()}
                style={{ background: 'color-mix(in oklch, var(--surface) 92%, transparent)' }}
            >
                <h2 id="confirm-title" className="text-base font-extrabold">{request.title}</h2>
                {request.message && <p id="confirm-message" className="mt-2 text-sm" style={{ color: 'var(--text2)' }}>{request.message}</p>}
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="md3-tonal-btn px-4 text-sm" onClick={() => onClose(false)}>
                        {request.cancelLabel || 'Abbrechen'}
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        className="md3-filled-btn px-4 text-sm"
                        style={request.tone === 'danger' ? { background: 'var(--loss)', color: 'oklch(0.99 0 0)', boxShadow: 'none' } : undefined}
                        onClick={() => onClose(true)}
                    >
                        {request.confirmLabel || 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
    const nextId = useRef(1);

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const notify = useCallback((toast: { tone?: ToastTone; title: string; message?: string }) => {
        const id = nextId.current++;
        setToasts((prev) => [...prev.slice(-3), { id, tone: toast.tone || 'info', title: toast.title, message: toast.message }]);
        setTimeout(() => dismiss(id), TOAST_MS);
    }, [dismiss]);

    const confirm = useCallback((request: Omit<ConfirmRequest, 'resolve'>) => new Promise<boolean>((resolve) => {
        setConfirmRequest({ ...request, resolve });
    }), []);

    const closeConfirm = useCallback((ok: boolean) => {
        setConfirmRequest((current) => {
            current?.resolve(ok);
            return null;
        });
    }, []);

    return (
        <NotificationsContext.Provider value={{ notify, confirm }}>
            {children}
            <div className="ui-toasts" aria-live="polite" aria-atomic="false">
                {toasts.map((toast) => (
                    <div key={toast.id} className={`ui-toast glass is-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
                        <span className="ui-toast-icon" aria-hidden="true">{ICONS[toast.tone]}</span>
                        <span className="ui-toast-text">
                            <span className="ui-toast-title">{toast.title}</span>
                            {toast.message && <span className="ui-toast-message">{toast.message}</span>}
                        </span>
                        <button type="button" className="ui-toast-close" onClick={() => dismiss(toast.id)} aria-label="Hinweis schließen">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
            {confirmRequest && <ConfirmDialog request={confirmRequest} onClose={closeConfirm} />}
        </NotificationsContext.Provider>
    );
};
