"use client";

import React, { useState, useMemo } from 'react';
import { Upload, Calendar, Hash, DollarSign, Tag, Search, Briefcase, Check, ChevronDown } from 'lucide-react';
import { useProjectActions, useProjectData, useProjectStoreShallow } from '@/contexts/ProjectContext';
import { useNotifications } from '@/components/ui/notifications';
import { Transaction, type Security, type Portfolio } from '@/types/domain';
import { applyManualCashEntryToExplicitHistory } from '@/lib/cashAccountUtils';
import { getCurrencyOptions } from '@/lib/fxUtils';
import { buildManualPriceHistory } from '@/lib/marketDataService';
import { applyImportBatch, emptyImportBatch, isEmptyImportBatch, type ImportBatch } from '@/lib/importers/importBatch';
import { FileImportError, type FileImportResult } from '@/lib/importers/fileImport';
import { FILE_IMPORTERS, readImportFiles } from '@/lib/importers/fileImporters';
import { BrokerFileImport } from '@/components/import/BrokerFileImport';
import { searchCompanyMatches, type CompanyMatch } from '@/lib/tickerSearch';
import { createLogger } from '@/lib/logger';
import { useT } from '@/lib/i18n';
import { Modal } from '@/components/ui/Modal';
import { Button, Field, ListRow, Pill, Segmented, TextInput } from '@/components/ui/primitives';
import { buildGenericCashBalances, buildGenericTransactions, guessCsvMapping, parseGenericCsv, type CsvDateFormat, type CsvMapping } from '@/lib/importers/genericCsv';
import { addTransactions, getTransactions } from '@/lib/domain/ledger/store';

const log = createLogger('TransactionModal');

interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetPortfolio: { id: string; name: string; isNew: boolean } | null;
}

type Tab = 'import' | 'manual';
type TransactionType = 'Buy' | 'Sell';
type ManualHoldingType = 'security' | 'cash';
type ManualCashType = 'Deposit' | 'Withdrawal' | 'Dividend' | 'Tax' | 'Fee';
type ResolveTickerResult = {
    status: 'resolved' | 'unresolved' | 'error';
    symbol?: string;
    isin?: string;
    name?: string;
    currency?: string;
    source?: 'kursliste' | 'openfigi' | 'yahoo';
};
type CsvImportSummary = {
    imported: number;
    importedMovements?: number;
    skipped: number;
    duplicates?: number;
    errors: string[];
};

export const TransactionModal = ({ isOpen, onClose, targetPortfolio }: TransactionModalProps) => {
    const project = useProjectData();
    const { updateProject, syncMarket } = useProjectActions();
    const { isMarketSyncing, marketSyncProgress } = useProjectStoreShallow((state) => ({
        isMarketSyncing: state.isMarketSyncing,
        marketSyncProgress: state.marketSyncProgress
    }));
    const { notify } = useNotifications();
    const t = useT();

    // Tab State
    const [activeTab, setActiveTab] = useState<Tab>('import');

    // Manual Form State
    const [manualHoldingType, setManualHoldingType] = useState<ManualHoldingType>('security');
    const [type, setType] = useState<TransactionType>('Buy');
    const [cashType, setCashType] = useState<ManualCashType>('Deposit');
    const [identifier, setIdentifier] = useState(''); // ISIN/WKN/Ticker
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [shares, setShares] = useState('');
    const [price, setPrice] = useState('');
    const [cashAmount, setCashAmount] = useState('');
    const [currency, setCurrency] = useState('EUR');
    const [isResolving, setIsResolving] = useState(false);
    const [resolveStatus, setResolveStatus] = useState<'idle' | 'unresolved' | 'error'>('idle');
    const [resolveResult, setResolveResult] = useState<ResolveTickerResult | null>(null);
    const [companyQuery, setCompanyQuery] = useState('');
    const [companySearchMessage, setCompanySearchMessage] = useState<string | null>(null);
    const [companyMatches, setCompanyMatches] = useState<CompanyMatch[]>([]);
    const [isCompanySearching, setIsCompanySearching] = useState(false);
    const [isCompanySearchOpen, setIsCompanySearchOpen] = useState(false);

    // Import Form State
    const [importMode, setImportMode] = useState<'generic' | 'template'>('generic');
    const [fileImporterId, setFileImporterId] = useState(FILE_IMPORTERS[0].id);
    const [isDragging, setIsDragging] = useState(false);
    const [fileImport, setFileImport] = useState<{ result: FileImportResult; fileNames: string[] } | null>(null);
    const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'ready' | 'success'>('idle');
    const [genericHeaders, setGenericHeaders] = useState<string[]>([]);
    const [genericRows, setGenericRows] = useState<string[][]>([]);
    const [genericFileName, setGenericFileName] = useState('');
    const [genericMapping, setGenericMapping] = useState<CsvMapping>({});
    const [genericDateFormat, setGenericDateFormat] = useState<CsvDateFormat>('auto');
    const [genericDefaultCurrency, setGenericDefaultCurrency] = useState('EUR');
    const [genericImportSummary, setGenericImportSummary] = useState<CsvImportSummary | null>(null);
    const [importResult, setImportResult] = useState<{ added: number; duplicates: number } | null>(null);
    const [genericStep, setGenericStep] = useState<'upload' | 'mapping'>('upload');
    const [showGenericPreview, setShowGenericPreview] = useState(false);
    const [showGenericAdvanced, setShowGenericAdvanced] = useState(false);
    const [genericImportType, setGenericImportType] = useState<'security' | 'cash'>('security');

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleGenericDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processGenericFile(e.dataTransfer.files[0]);
        }
    };

    const handleGenericFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processGenericFile(e.target.files[0]);
        }
    };

    const processFiles = async (files: File[]) => {
        setImportStatus('processing');
        try {
            const texts = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })));
            const { importer, result } = readImportFiles(texts);
            const { report } = result;
            if (isEmptyImportBatch(result.batch) && report.unsupported.length === 0 && report.ignored.length === 0) {
                throw new FileImportError('noRows');
            }
            if (importer.id !== fileImporterId) {
                setFileImporterId(importer.id);
                notify({ tone: 'info', title: t.fileImport.switched(importer.broker) });
            }
            setFileImport({ result, fileNames: files.length > 1 ? files.map((file) => file.name) : [] });
            setImportStatus('ready');
        } catch (err) {
            log.error(err);
            const message = !(err instanceof FileImportError)
                ? t.txModal.unreadable
                : err.code === 'invalidNumber' || err.code === 'invalidDate'
                    ? t.fileImport.errors[err.code](err.line)
                    : t.fileImport.errors[err.code];
            notify({ tone: 'error', title: t.fileImport.errors.title, message });
            setFileImport(null);
            setImportStatus('idle');
        }
    };

    const applyGenericGuess = (headers: string[], rows: string[][], mode: 'security' | 'cash') => {
        const guess = guessCsvMapping(headers, rows, mode);
        setGenericMapping(guess.mapping);
        if (guess.dateFormat !== 'auto') {
            setGenericDateFormat(guess.dateFormat);
        } else {
            setGenericDateFormat('auto');
        }
    };

    const processGenericFile = async (file: File) => {
        try {
            const text = await file.text();
            const { headers, rows } = parseGenericCsv(text);
            setGenericFileName(file.name);
            setGenericHeaders(headers);
            setGenericRows(rows);
            applyGenericGuess(headers, rows, genericImportType);
            setGenericImportSummary(null);
            setGenericDefaultCurrency(project?.settings.baseCurrency || 'EUR');
            setGenericStep('mapping');
            setShowGenericPreview(false);
        } catch (e) {
            log.error(e);
            setGenericFileName(file.name);
            setGenericHeaders([]);
            setGenericRows([]);
        }
    };

    const handleGenericImportTypeChange = (nextType: 'security' | 'cash') => {
        setGenericImportType(nextType);
        if (genericHeaders.length > 0 && genericRows.length > 0) {
            applyGenericGuess(genericHeaders, genericRows, nextType);
        }
        setGenericImportSummary(null);
    };

    // Helper to get or create target portfolio ID
    const getTargetPortfolioId = (currentPortfolios: Portfolio[]) => {
        if (!targetPortfolio) {
            // Fallback if something went wrong
            return { id: currentPortfolios[0]?.id || crypto.randomUUID(), name: 'Fallback', isNew: !currentPortfolios.length };
        }

        if (targetPortfolio.isNew) {
            return { id: targetPortfolio.id, name: targetPortfolio.name, isNew: true };
        }

        return { id: targetPortfolio.id, name: targetPortfolio.name, isNew: false };
    };

    const buildFileBatch = (): ImportBatch => fileImport?.result.batch || emptyImportBatch('File');

    const commitImport = () => {
        if (!project) return;
        const batch = buildFileBatch();
        if (isEmptyImportBatch(batch)) return;

        // Resolve the target once so every run of the updater below uses the same portfolio id.
        const target = getTargetPortfolioId(project.portfolios || []);
        const { project: nextProject, summary } = applyImportBatch(project, batch, target);
        // applyImportBatch is pure: safe to run again on the latest state inside the updater.
        updateProject(prev => applyImportBatch(prev, batch, target).project);
        void syncMarket(true, { full: true, projectOverride: nextProject });

        const duplicates = summary.duplicateTransactions + summary.duplicateMovements;
        setImportResult({ added: summary.addedTransactions + summary.addedMovements, duplicates });
        setImportStatus('success');
        setTimeout(() => {
            onClose();
        }, duplicates > 0 ? 2500 : 1000);
    };

    const currencies = useMemo(() => {
        return getCurrencyOptions(project?.fxData);
    }, [project?.fxData]);

    const headerOptions = useMemo(() => {
        return genericHeaders.filter((h) => h && h.length > 0);
    }, [genericHeaders]);

    const isGenericMappingReady = genericImportType === 'cash'
        ? Boolean(
            genericHeaders.length > 0 &&
            genericMapping.date &&
            (genericMapping.amount || genericMapping.balance)
        )
        : Boolean(
            genericHeaders.length > 0 &&
            genericMapping.date &&
            genericMapping.identifier &&
            genericMapping.shares &&
            genericMapping.price
        );

    const showMarketSyncProgress = Boolean(isMarketSyncing && marketSyncProgress && marketSyncProgress.total > 0);
    const marketSyncPercent = showMarketSyncProgress
        ? Math.min(100, Math.round((marketSyncProgress!.current / marketSyncProgress!.total) * 100))
        : 0;

    const updateMapping = (key: keyof CsvMapping, value: string) => {
        setGenericMapping((prev) => ({ ...prev, [key]: value || undefined }));
    };

    const commitGenericImport = () => {
        const genericInput = { headers: genericHeaders, rows: genericRows, mapping: genericMapping, dateFormat: genericDateFormat, defaultCurrency: genericDefaultCurrency };
        if (genericImportType === 'cash') {
            const { cashPoints, entries, errors, processedRows } = buildGenericCashBalances(genericInput);
            if (cashPoints.length === 0 && entries.length === 0) {
                setGenericImportSummary({
                    imported: 0,
                    importedMovements: 0,
                    skipped: genericRows.length,
                    errors: errors.length ? errors.slice(0, 3) : [t.txModal.noValidRows]
                });
                return;
            }

            if (!project) return;
            const cashTarget = getTargetPortfolioId(project.portfolios || []);
            const cashBatch: ImportBatch = { ...emptyImportBatch('CSV'), entries, cashBalances: cashPoints };
            updateProject(prev => applyImportBatch(prev, cashBatch, cashTarget).project);

            setGenericImportSummary({
                imported: cashPoints.length,
                importedMovements: entries.length,
                skipped: Math.max(0, genericRows.length - processedRows),
                errors: errors.slice(0, 3)
            });
            return;
        }

        const { entries, errors } = buildGenericTransactions(genericInput);
        if (entries.length === 0) {
            setGenericImportSummary({
                imported: 0,
                skipped: genericRows.length,
                errors: errors.length ? errors.slice(0, 3) : [t.txModal.noValidRows]
            });
            return;
        }

        if (!project) return;
        const target = getTargetPortfolioId(project.portfolios || []);
        const batch: ImportBatch = { ...emptyImportBatch('CSV'), entries: entries.filter((entry) => Boolean(entry.isin)) };
        const { project: nextProject, summary } = applyImportBatch(project, batch, target);
        updateProject(prev => applyImportBatch(prev, batch, target).project);
        void syncMarket(true, { full: true, projectOverride: nextProject });
        setGenericImportSummary({
            imported: summary.addedTransactions,
            skipped: genericRows.length - summary.addedTransactions,
            duplicates: summary.duplicateTransactions,
            errors: errors.slice(0, 3)
        });
    };

    if (!isOpen) return null;

    // Preview of the broker file import: what the files add to the target portfolio.
    const importPreview = importStatus === 'ready' && project && targetPortfolio
        ? applyImportBatch(project, buildFileBatch(), targetPortfolio).summary
        : null;

    const normalizeIdentifier = (value: string) => value.trim().toUpperCase();
    const isIsin = (value: string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value);

    const buildManualSecurityTransaction = (): Transaction | null => {
        if (!identifier || !shares || !price) return null;
        const parsedShares = Math.abs(parseFloat(shares));
        const parsedPrice = parseFloat(price);
        if (!Number.isFinite(parsedShares) || !Number.isFinite(parsedPrice) || parsedShares <= 0 || parsedPrice <= 0) {
            return null;
        }

        const normalizedIdentifier = normalizeIdentifier(identifier);
        return {
            id: crypto.randomUUID(),
            date,
            type,
            isin: normalizedIdentifier,
            name: normalizedIdentifier,
            shares: type === 'Sell' ? -parsedShares : parsedShares,
            amount: type === 'Sell'
                ? parsedShares * parsedPrice
                : -(parsedShares * parsedPrice),
            currency,
            broker: 'Manual',
            originalData: { manualEntry: true, pricePerShare: parsedPrice }
        };
    };

    const resolveTicker = async (value: string, currencyHint: string): Promise<ResolveTickerResult | null> => {
        try {
            const res = await fetch('/api/resolve-ticker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: value,
                    currency: currencyHint,
                    isin: isIsin(value) ? value : undefined
                })
            });
            if (!res.ok) return null;
            return res.json();
        } catch (e) {
            log.error(e);
            return null;
        }
    };

    const saveManualSecurity = (newTransaction: Transaction, options: {
        resolvedSymbol?: string;
        resolvedIsin?: string;
        resolvedName?: string;
        resolvedCurrency?: string;
        resolvedSource?: ResolveTickerResult['source'];
        ignoreMarketData?: boolean;
    }) => {
        updateProject(prev => {
            // Handle Portfolio Creation
            const portfolios = prev.portfolios || [];
            const target = getTargetPortfolioId(portfolios);

            let updatedPortfolios = portfolios;
            if (target.isNew && !updatedPortfolios.find(p => p.id === target.id)) {
                updatedPortfolios = [...portfolios, { id: target.id, name: target.name }];
            }

            const fallbackIdentifier = newTransaction.isin || normalizeIdentifier(identifier);
            const securityKey = options.resolvedIsin || fallbackIdentifier;
            const symbolValue = options.resolvedSymbol || fallbackIdentifier;
            const existing = prev.securities[securityKey];

            const withTransaction = addTransactions(prev, [{ ...newTransaction, isin: securityKey, portfolioId: target.id }]);
            const transactions = getTransactions(withTransaction);

            const manualHistory = options.ignoreMarketData
                ? buildManualPriceHistory(transactions, securityKey)
                : undefined;

            const updatedSecurities = {
                ...prev.securities,
                [securityKey]: {
                    isin: securityKey,
                    symbol: symbolValue,
                    name: options.resolvedName || existing?.name || newTransaction.name || securityKey,
                    currency: options.resolvedCurrency || existing?.currency || newTransaction.currency,
                    quoteType: existing?.quoteType || 'Stock',
                    priceHistory: manualHistory ? { ...(existing?.priceHistory || {}), ...manualHistory } : (existing?.priceHistory || {}),
                    symbolStatus: (options.ignoreMarketData
                        ? 'ignored'
                        : options.resolvedSymbol
                            ? 'resolved'
                            : 'unresolved') as Security['symbolStatus'],
                    symbolSource: options.ignoreMarketData ? 'manual' : (options.resolvedSource || existing?.symbolSource),
                    symbolLastTried: new Date().toISOString(),
                    ignoreMarketData: Boolean(options.ignoreMarketData),
                    dividendHistory: existing?.dividendHistory || [],
                    upcomingDividends: existing?.upcomingDividends || [],
                    dividendHistorySynced: existing?.dividendHistorySynced
                }
            };

            return {
                ...withTransaction,
                portfolios: updatedPortfolios,
                securities: updatedSecurities,
                cashAccounts: prev.cashAccounts,
                modified: new Date().toISOString()
            };
        });

        onClose();
    };

    const handleCompanySearch = async () => {
        if (!companyQuery.trim()) return;
        setIsCompanySearching(true);
        setCompanySearchMessage(null);
        setCompanyMatches([]);

        const query = companyQuery.trim();
        const resolveResult = await resolveTicker(query, currency);
        const directMatches: CompanyMatch[] = [];

        if (resolveResult?.status === 'resolved' && resolveResult.symbol) {
            directMatches.push({
                symbol: resolveResult.symbol,
                name: resolveResult.name,
                currency: resolveResult.currency
            });
        }

        const matches = await searchCompanyMatches(query);
        setIsCompanySearching(false);

        const combinedMatches = directMatches.length
            ? [
                ...directMatches,
                ...matches.filter(match => match.symbol !== directMatches[0].symbol)
            ]
            : matches;

        if (!combinedMatches.length) {
            setCompanySearchMessage(t.txModal.noMatch);
            return;
        }

        setCompanyMatches(combinedMatches);
    };

    const handleSelectCompanyMatch = (match: CompanyMatch) => {
        const newTransaction = buildManualSecurityTransaction();
        if (!newTransaction) return;

        const updatedTransaction = {
            ...newTransaction,
            name: match.name || newTransaction.name
        };

        saveManualSecurity(updatedTransaction, {
            resolvedSymbol: match.symbol,
            resolvedName: match.name,
            resolvedCurrency: match.currency || currency,
            resolvedSource: 'yahoo'
        });
    };

    const handleSaveManual = async () => {
        let newTransaction: Transaction | null = null;

        if (manualHoldingType === 'security') {
            newTransaction = buildManualSecurityTransaction();
            if (!newTransaction) return;
        } else {
            if (!cashAmount) return;
            const parsedAmount = Math.abs(parseFloat(cashAmount));
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                return;
            }

            const signedAmount = (cashType === 'Deposit' || cashType === 'Dividend')
                ? parsedAmount
                : -parsedAmount;

            const cashNameMap: Record<ManualCashType, string> = t.txModal.cashTypes;

            newTransaction = {
                id: crypto.randomUUID(),
                date,
                type: cashType,
                name: cashNameMap[cashType],
                amount: signedAmount,
                currency,
                broker: 'Manual',
                originalData: { manualEntry: true, manualCashEntry: true }
            };
        }

        if (!newTransaction) return;

        if (manualHoldingType === 'security') {
            setIsResolving(true);
            const normalizedIdentifier = normalizeIdentifier(identifier);
            const result = await resolveTicker(normalizedIdentifier, currency);
            setIsResolving(false);

            if (result?.status === 'resolved' && result.symbol) {
                setResolveStatus('idle');
                setResolveResult(null);
                const resolvedIsin = result.isin && isIsin(normalizeIdentifier(result.isin)) ? normalizeIdentifier(result.isin) : undefined;
                const updatedTransaction = {
                    ...newTransaction,
                    isin: resolvedIsin || newTransaction.isin,
                    name: result.name || newTransaction.name
                };
                saveManualSecurity(updatedTransaction, {
                    resolvedSymbol: result.symbol,
                    resolvedIsin,
                    resolvedName: result.name,
                    resolvedCurrency: result.currency || currency,
                    resolvedSource: result.source
                });
                return;
            }

            setResolveStatus('unresolved');
            setResolveResult(result || { status: 'unresolved' });
            setCompanySearchMessage(null);
            setCompanyMatches([]);
            return;
        }

        updateProject(prev => {
            // Handle Portfolio Creation
            const portfolios = prev.portfolios || [];
            const target = getTargetPortfolioId(portfolios);

            let updatedPortfolios = portfolios;
            if (target.isNew && !updatedPortfolios.find(p => p.id === target.id)) {
                updatedPortfolios = [...portfolios, { id: target.id, name: target.name }];
            }

            return {
                ...addTransactions(prev, [{ ...newTransaction, portfolioId: target.id }]),
                portfolios: updatedPortfolios,
                cashAccounts: manualHoldingType === 'cash'
                    ? applyManualCashEntryToExplicitHistory(prev.cashAccounts, target.id, newTransaction, {
                        portfolioName: target.name
                    })
                    : prev.cashAccounts,
                modified: new Date().toISOString()
            };
        });

        onClose();
    };


    // --- STEP 2: Import / Manual Action View ---
    const renderBody = () => (
        <>
            <Segmented
                options={[{ value: 'import', label: t.txModal.tabs.import }, { value: 'manual', label: t.txModal.tabs.manual }]}
                value={activeTab}
                onChange={setActiveTab}
                ariaLabel={t.txModal.tabsLabel}
            />

                {activeTab === 'import' ? (
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="ui-field-label">{t.txModal.importMode}</div>
                            <select
                                value={importMode}
                                onChange={(e) => setImportMode(e.target.value as 'generic' | 'template')}
                                className="ui-input w-full sm:w-auto"
                            >
                                <option value="generic">{t.txModal.modes.generic}</option>
                                <option value="template">{t.txModal.modes.template}</option>
                            </select>
                        </div>

                        {importMode === 'generic' ? (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                                        <span className={`rounded-full px-3 py-1 ${genericStep === 'upload' ? 'md3-chip-tonal' : 'md3-segment md3-text-muted'}`}>
                                            {t.txModal.steps.upload}
                                        </span>
                                        <span className="md3-text-muted">→</span>
                                        <span className={`rounded-full px-3 py-1 ${genericStep === 'mapping' && !showGenericPreview ? 'md3-chip-tonal' : 'md3-segment md3-text-muted'}`}>
                                            {t.txModal.steps.mapping}
                                        </span>
                                        <span className="md3-text-muted">→</span>
                                        <span className={`rounded-full px-3 py-1 ${genericStep === 'mapping' && showGenericPreview ? 'md3-chip-tonal' : 'md3-segment md3-text-muted'}`}>
                                            {t.txModal.steps.preview}
                                        </span>
                                    </div>
                                    {genericHeaders.length > 0 && genericStep === 'upload' && (
                                        <button
                                            type="button"
                                            onClick={() => setGenericStep('mapping')}
                                            className="ui-btn is-primary is-md"
                                        >
                                            {t.txModal.startMapping}
                                        </button>
                                    )}
                                </div>

                                {genericStep === 'upload' && (
                                    <div className="space-y-4">
                                        <div
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleGenericDrop}
                                            className="relative rounded-2xl border border-dashed p-6 text-center transition cursor-pointer"
                                            style={isDragging
                                                ? { borderColor: 'var(--md3-primary)', background: 'color-mix(in srgb, var(--md3-primary-container) 55%, transparent 45%)' }
                                                : { borderColor: 'color-mix(in srgb, var(--md3-outline) 45%, transparent 55%)', background: 'var(--md3-surface-container-high)' }}
                                        >
                                            <input
                                                type="file"
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                accept=".csv"
                                                onChange={handleGenericFileInput}
                                            />
                                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--md3-surface-container-highest)' }}>
                                                <Upload size={22} className={genericHeaders.length > 0 ? 'md3-accent' : 'md3-text-muted'} />
                                            </div>
                                            <h3 className="text-sm font-semibold md3-text-main">
                                                {genericHeaders.length > 0
                                                    ? t.txModal.rowsDetected(genericRows.length, genericFileName)
                                                    : t.txModal.dropCsv}
                                            </h3>
                                            <p className="text-xs md3-text-muted mt-1">
                                                {genericHeaders.length > 0 ? t.txModal.dropAgain : t.txModal.orClick}
                                            </p>
                                        </div>

                                        {genericHeaders.length > 0 && (
                                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs md3-text-muted">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-semibold md3-text-main">{genericFileName}</span>
                                                    <span>{t.txModal.rows(genericRows.length)}</span>
                                                </div>
                                                <span className="md3-chip-tonal px-2 py-0.5 rounded-full">{t.txModal.ready}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {genericStep === 'mapping' && genericHeaders.length > 0 && (
                                    <div className="ui-info-card p-4 space-y-4">
                                        <div className="space-y-1">
                                            <div className="text-sm font-semibold md3-text-main">{t.txModal.mapColumns}</div>
                                            <div className="text-xs md3-text-muted">{genericFileName}</div>
                                        </div>
                                        <div className="md3-segment flex w-max items-center gap-1 p-1">
                                            <button
                                                type="button"
                                                onClick={() => handleGenericImportTypeChange('security')}
                                                className={`px-3 py-1 text-[11px] font-semibold transition-all ${genericImportType === 'security'
                                                    ? 'md3-chip-tonal'
                                                    : 'md3-text-muted hover:opacity-90'
                                                    }`}
                                            >
                                                {t.txModal.securities}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleGenericImportTypeChange('cash')}
                                                className={`px-3 py-1 text-[11px] font-semibold transition-all ${genericImportType === 'cash'
                                                    ? 'md3-chip-tonal'
                                                    : 'md3-text-muted hover:opacity-90'
                                                    }`}
                                            >
                                                {t.txModal.cash}
                                            </button>
                                        </div>

                                        {genericImportType === 'security' ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">{t.txModal.required(t.txModal.columns.date)}</label>
                                                    <select
                                                        value={genericMapping.date || ''}
                                                        onChange={(e) => updateMapping('date', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">{t.txModal.choose}</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`date_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">{t.txModal.required(t.txModal.columns.identifier)}</label>
                                                    <select
                                                        value={genericMapping.identifier || ''}
                                                        onChange={(e) => updateMapping('identifier', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">{t.txModal.choose}</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`id_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">{t.txModal.required(t.txModal.columns.shares)}</label>
                                                    <select
                                                        value={genericMapping.shares || ''}
                                                        onChange={(e) => updateMapping('shares', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">{t.txModal.choose}</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`shares_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">{t.txModal.required(t.txModal.columns.price)}</label>
                                                    <select
                                                        value={genericMapping.price || ''}
                                                        onChange={(e) => updateMapping('price', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">{t.txModal.choose}</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`price_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">{t.txModal.required(t.txModal.columns.date)}</label>
                                                    <select
                                                        value={genericMapping.date || ''}
                                                        onChange={(e) => updateMapping('date', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">{t.txModal.choose}</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`date_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">{t.txModal.columns.change}</label>
                                                    <select
                                                        value={genericMapping.amount || ''}
                                                        onChange={(e) => updateMapping('amount', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">{t.txModal.unused}</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`amt_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">{t.txModal.columns.balance}</label>
                                                    <select
                                                        value={genericMapping.balance || ''}
                                                        onChange={(e) => updateMapping('balance', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">{t.txModal.unused}</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`bal_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">{t.txModal.columns.currency}</label>
                                                    <select
                                                        value={genericMapping.currency || ''}
                                                        onChange={(e) => updateMapping('currency', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">{t.txModal.unused}</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`cash_cur_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => setShowGenericAdvanced(prev => !prev)}
                                            className="inline-flex items-center gap-2 text-xs font-semibold md3-text-muted hover:opacity-90"
                                        >
                                            {t.txModal.advanced}
                                            <ChevronDown size={14} className={`transition-transform ${showGenericAdvanced ? 'rotate-180' : ''}`} />
                                        </button>

                                        {showGenericAdvanced && (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {genericImportType === 'security' && (
                                                        <div className="space-y-1">
                                                            <label className="ui-field-label">{t.txModal.columns.currency}</label>
                                                            <select
                                                                value={genericMapping.currency || ''}
                                                                onChange={(e) => updateMapping('currency', e.target.value)}
                                                                className="ui-input w-full"
                                                            >
                                                                <option value="">{t.txModal.unused}</option>
                                                                {headerOptions.map((h) => (
                                                                    <option key={`cur_${h}`} value={h}>{h}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    {genericImportType === 'cash' && (
                                                        <div className="space-y-1">
                                                            <label className="ui-field-label">{t.txModal.columns.description}</label>
                                                            <select
                                                                value={genericMapping.description || ''}
                                                                onChange={(e) => updateMapping('description', e.target.value)}
                                                                className="ui-input w-full"
                                                            >
                                                                <option value="">{t.txModal.unused}</option>
                                                                {headerOptions.map((h) => (
                                                                    <option key={`cash_desc_${h}`} value={h}>{h}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    {genericImportType === 'cash' && (
                                                        <div className="space-y-1">
                                                            <label className="ui-field-label">{t.txModal.columns.movementType}</label>
                                                            <select
                                                                value={genericMapping.type || ''}
                                                                onChange={(e) => updateMapping('type', e.target.value)}
                                                                className="ui-input w-full"
                                                            >
                                                                <option value="">{t.txModal.unused}</option>
                                                                {headerOptions.map((h) => (
                                                                    <option key={`cash_type_${h}`} value={h}>{h}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    <div className="space-y-1">
                                                        <label className="ui-field-label">{t.txModal.defaultCurrency}</label>
                                                        <select
                                                            value={genericDefaultCurrency}
                                                            onChange={(e) => setGenericDefaultCurrency(e.target.value)}
                                                            className="ui-input w-full"
                                                        >
                                                            {currencies.map((c) => (
                                                                <option key={`def_${c}`} value={c}>{c}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="ui-field-label">{t.txModal.dateFormat}</label>
                                                        <select
                                                            value={genericDateFormat}
                                                            onChange={(e) => setGenericDateFormat(e.target.value as 'auto' | 'ymd' | 'dmy' | 'mdy')}
                                                            className="ui-input w-full"
                                                        >
                                                            <option value="auto">{t.txModal.auto}</option>
                                                            <option value="ymd">YYYY-MM-DD</option>
                                                            <option value="dmy">DD.MM.YYYY</option>
                                                            <option value="mdy">MM/DD/YYYY</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="text-xs md3-text-muted">
                                                    {genericImportType === 'security'
                                                        ? t.txModal.hintSecurities
                                                        : t.txModal.hintCash}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => setGenericStep('upload')}
                                                className="md3-text-muted px-3 py-2 text-xs font-semibold hover:opacity-80"
                                            >
                                                {t.txModal.back}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowGenericPreview((v) => !v)}
                                                className="md3-text-muted text-xs font-semibold hover:opacity-80"
                                            >
                                                {showGenericPreview ? t.txModal.hidePreview : t.txModal.showPreview}
                                            </button>
                                        </div>

                                        {showGenericPreview && (
                                            <div className="overflow-auto rounded-xl border border-white/10">
                                                <table className="min-w-[640px] w-full text-xs">
                                                    <thead>
                                                        <tr className="text-left md3-text-muted">
                                                            {genericHeaders.map((h) => (
                                                                <th key={`head_${h}`} className="px-2 py-2 font-semibold">{h}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {genericRows.slice(0, 5).map((row, idx) => (
                                                            <tr key={`row_${idx}`} className="border-t border-white/10">
                                                                {genericHeaders.map((_, colIdx) => (
                                                                    <td key={`cell_${idx}_${colIdx}`} className="px-2 py-2">
                                                                        {row[colIdx] || ''}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {genericImportSummary && (
                                    <div className="ui-info-card p-3 text-xs md3-text-muted">
                                        {t.txModal.summary(
                                            genericImportSummary.imported,
                                            genericImportType === 'cash',
                                            genericImportSummary.importedMovements || 0,
                                            genericImportSummary.skipped,
                                            genericImportSummary.duplicates || 0
                                        )}
                                        {genericImportSummary.errors.length > 0 && (
                                            <div className="mt-2 text-xs md3-negative">{genericImportSummary.errors.join(' ')}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <BrokerFileImport
                                importerId={fileImporterId}
                                onImporterChange={(id) => {
                                    setFileImporterId(id);
                                    setFileImport(null);
                                    setImportStatus('idle');
                                }}
                                status={importStatus}
                                result={fileImport?.result || null}
                                fileNames={fileImport?.fileNames || []}
                                preview={importPreview}
                                onFiles={(files) => { void processFiles(files); }}
                            />
                        )}
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="ui-field-label">{t.txModal.bookingKind}</label>
                            <select
                                value={manualHoldingType}
                                onChange={(e) => setManualHoldingType(e.target.value as ManualHoldingType)}
                                className="ui-input w-full"
                            >
                                <option value="security">{t.txModal.kinds.security}</option>
                                <option value="cash">{t.txModal.kinds.cash}</option>
                            </select>
                        </div>

                        {manualHoldingType === 'security' ? (
                            <>
                                <div className="md3-segment flex w-full items-center gap-1 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setType('Buy')}
                                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all rounded-full ${type === 'Buy'
                                            ? 'md3-chip-accent'
                                            : 'md3-text-muted hover:opacity-90'
                                            }`}
                                    >
                                        {t.txModal.buy}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('Sell')}
                                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all rounded-full ${type === 'Sell'
                                            ? 'md3-negative-soft'
                                            : 'md3-text-muted hover:opacity-90'
                                            }`}
                                    >
                                        {t.txModal.sell}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="ui-field-label">{t.txModal.identifier}</label>
                                        <div className="relative">
                                            <Hash size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                            <input
                                                type="text"
                                                value={identifier}
                                                onChange={(e) => {
                                                    setIdentifier(e.target.value);
                                                    setResolveStatus('idle');
                                                    setResolveResult(null);
                                                    setCompanySearchMessage(null);
                                                    setCompanyMatches([]);
                                                }}
                                                placeholder={t.txModal.identifierPlaceholder}
                                                className="ui-input w-full pl-10"
                                            />
                                        </div>
                                        {resolveStatus === 'unresolved' && manualHoldingType === 'security' && (
                                            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                                                <span>{t.txModal.noTicker}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCompanySearchOpen(true)}
                                                    className="ui-btn is-primary is-md"
                                                >
                                                    {t.txModal.companySearch}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="ui-field-label">{t.txModal.date}</label>
                                        <div className="relative">
                                            <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                            <input
                                                type="date"
                                                value={date}
                                                onChange={(e) => setDate(e.target.value)}
                                                className="ui-input w-full pl-10"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="ui-field-label">{t.txModal.shares}</label>
                                        <div className="relative">
                                            <Tag size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                            <input
                                                type="number"
                                                value={shares}
                                                onChange={(e) => setShares(e.target.value)}
                                                placeholder="0.00"
                                                step="0.0001"
                                                className="ui-input w-full pl-10"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="ui-field-label">{t.txModal.price}</label>
                                        <div className="relative">
                                            <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                            <input
                                                type="number"
                                                value={price}
                                                onChange={(e) => setPrice(e.target.value)}
                                                placeholder="0.00"
                                                step="0.01"
                                                className="ui-input w-full pl-10"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="ui-field-label">{t.txModal.currency}</label>
                                        <select
                                            value={currency}
                                            onChange={(e) => setCurrency(e.target.value)}
                                            className="ui-input w-full"
                                        >
                                            {currencies.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="ui-field-label">{t.txModal.cashKind}</label>
                                    <select
                                        value={cashType}
                                        onChange={(e) => setCashType(e.target.value as ManualCashType)}
                                        className="ui-input w-full"
                                    >
                                        <option value="Deposit">{t.txModal.cashTypes.Deposit}</option>
                                        <option value="Withdrawal">{t.txModal.cashTypes.Withdrawal}</option>
                                        <option value="Dividend">{t.txModal.cashTypes.Dividend}</option>
                                        <option value="Tax">{t.txModal.cashTypes.Tax}</option>
                                        <option value="Fee">{t.txModal.cashTypes.Fee}</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="ui-field-label">{t.txModal.date}</label>
                                    <div className="relative">
                                        <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                        <input
                                            type="date"
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            className="ui-input w-full pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="ui-field-label">{t.txModal.amount}</label>
                                    <div className="relative">
                                        <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                        <input
                                            type="number"
                                            value={cashAmount}
                                            onChange={(e) => setCashAmount(e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            className="ui-input w-full pl-10"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="ui-field-label">{t.txModal.currency}</label>
                                    <select
                                        value={currency}
                                        onChange={(e) => setCurrency(e.target.value)}
                                        className="ui-input w-full"
                                    >
                                        {currencies.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            
            {showMarketSyncProgress && (
                <div className="px-6 pb-3">
                    <div className="ui-info-card p-3 text-xs md3-text-muted">
                        <div className="flex items-center justify-between">
                            <span>{t.txModal.marketSync}</span>
                            <span>{marketSyncProgress!.current}/{marketSyncProgress!.total}</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: 'var(--md3-surface-container-highest)' }}>
                            <div
                                className="h-full rounded-full"
                                style={{ width: `${marketSyncPercent}%`, background: 'var(--md3-primary)' }}
                            />
                        </div>
                        {marketSyncProgress!.symbol && (
                            <div className="mt-1 text-[11px] md3-text-muted">{t.txModal.current(marketSyncProgress!.symbol)}</div>
                        )}
                    </div>
                </div>
            )}

        </>
    );

    const renderFooter = () => (
        <>
                <button type="button" onClick={onClose} className="md3-text-muted px-4 py-2 text-sm font-semibold hover:opacity-80">{t.common.cancel}</button>
                {activeTab === 'import' ? (
                    importMode === 'generic' ? (
                        <button
                            type="button"
                            onClick={commitGenericImport}
                            disabled={!isGenericMappingReady}
                            className="ui-btn is-primary is-md"
                        >
                            {t.txModal.importCsv}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={commitImport}
                            disabled={importStatus !== 'ready' || isEmptyImportBatch(buildFileBatch())}
                            className="ui-btn is-primary is-md"
                        >
                            {importStatus === 'success'
                                ? (importResult && importResult.duplicates > 0
                                    ? t.txModal.imported(importResult.added, importResult.duplicates)
                                    : t.txModal.success)
                                : t.txModal.startImport}
                        </button>
                    )
                ) : (
                    <>
                        {resolveStatus === 'unresolved' && manualHoldingType === 'security' ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setResolveStatus('idle');
                                        setResolveResult(null);
                                    }}
                                    className="md3-text-muted px-4 py-2 text-sm font-semibold hover:opacity-80"
                                >
                                    {t.txModal.adjustTicker}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const ignoredTx = buildManualSecurityTransaction();
                                        if (!ignoredTx) return;
                                        const resolvedIsin = resolveResult?.isin && isIsin(normalizeIdentifier(resolveResult.isin))
                                            ? normalizeIdentifier(resolveResult.isin)
                                            : undefined;
                                        saveManualSecurity(ignoredTx, {
                                            resolvedIsin,
                                            resolvedName: resolveResult?.name,
                                            resolvedCurrency: resolveResult?.currency || currency,
                                            ignoreMarketData: true
                                        });
                                    }}
                                    className="ui-btn is-primary is-md"
                                >
                                    {t.txModal.ignoreAndSave}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSaveManual}
                                disabled={isResolving}
                                className="ui-btn is-primary is-md"
                            >
                                {isResolving ? t.txModal.checkingTicker : t.txModal.save}
                            </button>
                        )}
                    </>
                )}
            
        </>
    );

    return (
        <>
            <Modal
                open
                onClose={onClose}
                size="xl"
                title={t.txModal.title}
                subtitle={targetPortfolio?.name ? t.txModal.portfolio(targetPortfolio.name) : t.txModal.unknownPortfolio}
                icon={<Briefcase size={20} />}
                footer={renderFooter()}
            >
                {renderBody()}
            </Modal>
            <Modal
                open={isCompanySearchOpen}
                onClose={() => setIsCompanySearchOpen(false)}
                title={t.txModal.assignTicker}
                subtitle={t.txModal.assignTickerText}
                icon={<Search size={20} />}
                footer={<Button onClick={() => setIsCompanySearchOpen(false)}>{t.common.close}</Button>}
            >
                <form className="ui-inline-form" onSubmit={(e) => { e.preventDefault(); void handleCompanySearch(); }}>
                    <Field label={t.txModal.tickerOrCompany}>
                        <TextInput
                            value={companyQuery}
                            onChange={(e) => {
                                setCompanyQuery(e.target.value);
                                setCompanySearchMessage(null);
                                setCompanyMatches([]);
                            }}
                            placeholder={t.txModal.tickerPlaceholder}
                            autoFocus
                        />
                    </Field>
                    <Button type="submit" variant="primary" icon={<Search size={16} className={isCompanySearching ? 'animate-spin' : ''} />} disabled={isCompanySearching || !companyQuery.trim()}>
                        {t.txModal.search}
                    </Button>
                </form>
                {companySearchMessage && <p className="ui-field-hint">{companySearchMessage}</p>}
                {companyMatches.length > 0 && (
                    <div className="ui-rows ui-scroll" style={{ maxHeight: 300 }}>
                        {companyMatches.map((match) => (
                            <ListRow
                                key={match.symbol}
                                title={match.name || match.symbol}
                                meta={(
                                    <>
                                        <Pill>{match.symbol}</Pill>
                                        {match.exchange && <Pill>{match.exchange}</Pill>}
                                        {match.currency && <Pill>{match.currency}</Pill>}
                                    </>
                                )}
                                trailing={<Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => handleSelectCompanyMatch(match)}>{t.txModal.apply}</Button>}
                            />
                        ))}
                    </div>
                )}
            </Modal>
        </>
    );
};
