"use client";

import React, { useState } from 'react';
import { BookOpen, ExternalLink, Upload } from 'lucide-react';
import { Field, SelectInput } from '@/components/ui/primitives';
import { useFormatters } from '@/components/ui/useFormatters';
import { useT } from '@/lib/i18n';
import { FILE_IMPORTERS, findFileImporter } from '@/lib/importers/fileImporters';
import type { FileImportResult, ImportRowNote } from '@/lib/importers/fileImport';
import type { ImportSummary } from '@/lib/importers/importBatch';

// Broker file import inside the transaction dialog: broker choice, export guide,
// drop zone and the preview of what the files would add to the target portfolio.

export interface BrokerFileImportProps {
    importerId: string;
    onImporterChange: (id: string) => void;
    status: 'idle' | 'processing' | 'ready' | 'success';
    result: FileImportResult | null;
    fileNames: string[];
    preview: ImportSummary | null; // dry run of the merge into the target portfolio
    onFiles: (files: File[]) => void;
}

const NOTE_LIMIT = 8;

const NoteList = ({ notes }: { notes: ImportRowNote[] }) => {
    const t = useT();
    return (
        <ul className="mt-1 space-y-0.5 text-xs md3-text-muted">
            {notes.slice(0, NOTE_LIMIT).map((note) => (
                <li key={`${note.file || ''}:${note.line}`}>{t.fileImport.preview.note(note.line, note.label, note.file)}</li>
            ))}
            {notes.length > NOTE_LIMIT && <li>{t.fileImport.preview.more(notes.length - NOTE_LIMIT)}</li>}
        </ul>
    );
};

const GuideList = ({ title, items }: { title: string; items: string[] }) => (
    items.length === 0 ? null : (
        <div>
            <div className="ui-field-label">{title}</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
                {items.map((item) => <li key={item}>{item}</li>)}
            </ul>
        </div>
    )
);

export const BrokerFileImport = ({ importerId, onImporterChange, status, result, fileNames, preview, onFiles }: BrokerFileImportProps) => {
    const t = useT();
    const fmt = useFormatters();
    const [isDragging, setIsDragging] = useState(false);
    const importer = findFileImporter(importerId) || FILE_IMPORTERS[0];
    const guide = t.fileImport.guides[importer.id];
    const report = result?.report;

    const take = (list: FileList | null) => {
        if (!list || list.length === 0) return;
        const files = Array.from(list);
        onFiles(importer.multiple ? files : files.slice(0, 1));
    };

    const variantLabel = (variant: string) => variant
        .split('+')
        .map((part) => t.fileImport.variants[importer.id]?.[part] || part)
        .join(', ');

    const previewRows: { label: string; value: string }[] = report && preview ? [
        { label: t.fileImport.preview.format, value: `${importer.broker} · ${variantLabel(report.variant)}` },
        ...(fileNames.length ? [{ label: t.fileImport.preview.files, value: fileNames.join(', ') }] : []),
        ...(report.period ? [{ label: t.fileImport.preview.period, value: t.fileImport.preview.periodValue(fmt.date(report.period.from), fmt.date(report.period.to)) }] : []),
        { label: t.fileImport.preview.rows, value: fmt.number(report.rows) },
        { label: t.fileImport.preview.newTrades, value: fmt.number(preview.addedTransactions) },
        { label: t.fileImport.preview.newMovements, value: fmt.number(preview.addedMovements) },
        ...(preview.balancePoints ? [{ label: t.fileImport.preview.balances, value: fmt.number(preview.balancePoints) }] : []),
        { label: t.fileImport.preview.duplicates, value: fmt.number(preview.duplicateTransactions + preview.duplicateMovements) }
    ] : [];

    return (
        <div className="space-y-5">
            <Field label={t.fileImport.broker}>
                <SelectInput value={importer.id} onChange={(e) => onImporterChange(e.target.value)}>
                    {FILE_IMPORTERS.map((option) => (
                        <option key={option.id} value={option.id}>{`${option.broker} (${option.formats.join(', ')})`}</option>
                    ))}
                </SelectInput>
            </Field>

            {guide && (
                <details className="ui-info-card text-xs md3-text-muted">
                    <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold md3-text-main">
                        <BookOpen size={16} />
                        {t.fileImport.guideTitle(importer.broker)}
                    </summary>
                    <div className="mt-3 space-y-3">
                        <div>
                            <div className="ui-field-label">{t.fileImport.guideSections.scope}</div>
                            <p className="mt-1">{guide.scope}</p>
                        </div>
                        <div>
                            <div className="ui-field-label">{t.fileImport.guideSections.steps}</div>
                            <ol className="mt-1 list-decimal space-y-1 pl-5">
                                {guide.steps.map((step) => <li key={step}>{step}</li>)}
                            </ol>
                        </div>
                        <GuideList title={t.fileImport.guideSections.settings} items={guide.settings} />
                        <div>
                            <div className="ui-field-label">{t.fileImport.guideSections.accounts}</div>
                            <p className="mt-1">{guide.accounts}</p>
                        </div>
                        <GuideList title={t.fileImport.guideSections.supported} items={guide.supported} />
                        <GuideList title={t.fileImport.guideSections.unsupported} items={guide.unsupported} />
                        <GuideList title={t.fileImport.guideSections.limits} items={guide.limits} />
                        <div>
                            <div className="ui-field-label">{t.fileImport.sources}</div>
                            <ul className="mt-1 space-y-1">
                                {importer.sources.map((source) => (
                                    <li key={source.url}>
                                        <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 md3-accent">
                                            {source.label}<ExternalLink size={12} />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2">{t.fileImport.verified(fmt.date(importer.verified))}</p>
                        </div>
                    </div>
                </details>
            )}

            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); take(e.dataTransfer.files); }}
                className="relative rounded-2xl border border-dashed p-6 text-center transition cursor-pointer"
                style={isDragging
                    ? { borderColor: 'var(--md3-primary)', background: 'color-mix(in srgb, var(--md3-primary-container) 55%, transparent 45%)' }
                    : { borderColor: 'color-mix(in srgb, var(--md3-outline) 45%, transparent 55%)', background: 'var(--md3-surface-container-high)' }}
            >
                <input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept={importer.accept}
                    multiple={Boolean(importer.multiple)}
                    onChange={(e) => { take(e.target.files); e.target.value = ''; }}
                />
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--md3-surface-container-highest)' }}>
                    <Upload size={22} className={status === 'ready' ? 'md3-accent' : 'md3-text-muted'} />
                </div>
                <h3 className="text-sm font-semibold md3-text-main">
                    {status === 'processing' ? t.fileImport.reading : t.fileImport.dropFiles(Boolean(importer.multiple))}
                </h3>
                <p className="text-xs md3-text-muted mt-1">{t.fileImport.orClick(importer.accept)}</p>
            </div>

            {report && preview && (
                <section className="ui-info-card space-y-3" aria-label={t.fileImport.preview.title}>
                    <div className="text-sm font-semibold md3-text-main">{t.fileImport.preview.title}</div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                        {previewRows.map((row) => (
                            <React.Fragment key={row.label}>
                                <dt className="md3-text-muted">{row.label}</dt>
                                <dd className="md3-text-main text-right break-words">{row.value}</dd>
                            </React.Fragment>
                        ))}
                    </dl>
                    {preview.addedTransactions + preview.addedMovements === 0 && preview.balancePoints === 0 && (
                        <p className="text-xs md3-text-muted">{t.fileImport.preview.nothingNew}</p>
                    )}
                    {report.unsupported.length > 0 && (
                        <div>
                            <div className="text-xs font-semibold md3-negative">{`${t.fileImport.preview.unsupported}: ${fmt.number(report.unsupported.length)}`}</div>
                            <p className="text-xs md3-text-muted mt-1">{t.fileImport.preview.unsupportedHint}</p>
                            <NoteList notes={report.unsupported} />
                        </div>
                    )}
                    {report.ignored.length > 0 && (
                        <div>
                            <div className="text-xs font-semibold md3-text-main">{`${t.fileImport.preview.ignored}: ${fmt.number(report.ignored.length)}`}</div>
                            <p className="text-xs md3-text-muted mt-1">{t.fileImport.preview.ignoredHint}</p>
                            <NoteList notes={report.ignored} />
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};
