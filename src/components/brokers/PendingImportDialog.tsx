"use client";

import React from 'react';
import { FolderSync, X } from 'lucide-react';
import type { BrokerConnection } from '@/types/domain';
import { useBrokerSync } from './BrokerSyncContext';

const BROKER_NAMES: Record<BrokerConnection['kind'], string> = {
    'degiro-folder': 'DEGIRO',
    'ibkr-flex': 'Interactive Brokers',
    trading212: 'Trading 212',
    comdirect: 'comdirect'
};

/** Preview of new broker exports. Rendered inside the themed app shell. */
export const PendingImportDialog = () => {
    const { pending, confirmPending, dismissPending } = useBrokerSync();
    if (!pending) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-4">
            <div
                className="w-full max-w-md rounded-3xl border p-6 shadow-2xl"
                style={{ background: 'var(--md3-surface)', borderColor: 'var(--md3-outline)' }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="pending-import-title"
            >
                <div className="flex items-start gap-3">
                    <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                        style={{ background: 'var(--md3-primary-container)', color: 'var(--md3-on-primary-container)' }}
                    >
                        <FolderSync size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div id="pending-import-title" className="text-sm font-semibold md3-text-main">
                            {pending.connection.kind === 'degiro-folder'
                                ? `Neue DEGIRO-Exporte in „${pending.connection.label}“`
                                : `Neue Buchungen von ${BROKER_NAMES[pending.connection.kind]}${pending.connection.kind === 'trading212' ? '' : ` (${pending.connection.label})`}`}
                        </div>
                        <div className="mt-0.5 text-xs md3-text-muted">{pending.source.files.join(', ')}</div>
                    </div>
                    <button type="button" onClick={() => dismissPending()} className="md3-icon-btn" aria-label="Später">
                        <X size={18} />
                    </button>
                </div>
                <ul className="mt-4 space-y-1 text-sm md3-text-main">
                    <li>{pending.summary.addedTransactions} neue Transaktionen</li>
                    <li>{pending.summary.addedMovements} neue Kontobewegungen</li>
                    <li className="md3-text-muted">
                        {pending.summary.duplicateTransactions + pending.summary.duplicateMovements} bereits vorhanden (werden übersprungen)
                    </li>
                </ul>
                {pending.notes.length > 0 && (
                    <div className="mt-3 rounded-2xl px-3 py-2 text-xs md3-warning-soft">
                        <div className="font-semibold">Hinweise:</div>
                        <ul className="mt-1 space-y-0.5">
                            {pending.notes.map((note) => <li key={note}>{note}</li>)}
                        </ul>
                    </div>
                )}
                {pending.warnings.length > 0 && (
                    <div className="mt-3 rounded-2xl px-3 py-2 text-xs md3-warning-soft">
                        <div className="font-semibold">Bestand weicht vom Broker ab:</div>
                        <ul className="mt-1 space-y-0.5">
                            {pending.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                        <div className="mt-1">Meist fehlen Buchungen vor dem Abfragezeitraum. Ein Export über einen längeren Zeitraum behebt das.</div>
                    </div>
                )}
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={() => dismissPending()} className="md3-text-muted px-3 py-2 text-sm font-semibold">
                        Später
                    </button>
                    <button type="button" onClick={confirmPending} className="md3-filled-btn px-4 py-2 text-sm font-semibold">
                        Importieren
                    </button>
                </div>
            </div>
        </div>
    );
};
