"use client";

import React from 'react';
import { FolderSync } from 'lucide-react';
import type { BrokerConnection } from '@/types/domain';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/primitives';
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
    const { connection, summary } = pending;
    const duplicates = summary.duplicateTransactions + summary.duplicateMovements;
    return (
        <Modal
            open
            onClose={() => dismissPending()}
            title={connection.kind === 'degiro-folder' ? 'Neue DEGIRO-Exporte' : `Neue Buchungen von ${BROKER_NAMES[connection.kind]}`}
            subtitle={connection.kind === 'degiro-folder' ? `Ordner „${connection.label}“ · ${pending.source.files.join(', ')}` : pending.source.files.join(', ') || connection.label}
            icon={<FolderSync size={20} />}
            footer={(
                <>
                    <Button variant="ghost" onClick={() => dismissPending()}>Später</Button>
                    <Button variant="primary" onClick={confirmPending}>Importieren</Button>
                </>
            )}
        >
            <div className="ui-stat-grid">
                <div className="ui-stat"><span className="ui-stat-value">{summary.addedTransactions}</span><span className="ui-label">neue Transaktionen</span></div>
                <div className="ui-stat"><span className="ui-stat-value">{summary.addedMovements}</span><span className="ui-label">neue Kontobewegungen</span></div>
                <div className="ui-stat is-muted"><span className="ui-stat-value">{duplicates}</span><span className="ui-label">schon vorhanden</span></div>
            </div>
            {pending.notes.length > 0 && (
                <div className="ui-notice is-warn">
                    <strong>Hinweise</strong>
                    <ul>{pending.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                </div>
            )}
            {pending.warnings.length > 0 && (
                <div className="ui-notice is-warn">
                    <strong>Bestand weicht vom Broker ab</strong>
                    <ul>{pending.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                    <span>Meist fehlen Buchungen vor dem Abfragezeitraum. Ein Export über einen längeren Zeitraum behebt das.</span>
                </div>
            )}
        </Modal>
    );
};
