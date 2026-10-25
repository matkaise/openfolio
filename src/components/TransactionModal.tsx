"use client";

import React, { useState, useMemo } from 'react';
import { Upload, Calendar, Hash, DollarSign, Tag, Search, Briefcase, Check, ChevronDown } from 'lucide-react';
import { useProjectActions, useProjectData, useProjectStoreShallow } from '@/contexts/ProjectContext';
import { useNotifications } from '@/components/ui/notifications';
import { Transaction, type Security, type Portfolio } from '@/types/domain';
import { applyManualCashEntryToExplicitHistory } from '@/lib/cashAccountUtils';
import { getCurrencyOptions } from '@/lib/fxUtils';
import { buildManualPriceHistory } from '@/lib/marketDataService';
import { applyImportBatch, emptyImportBatch, isEmptyImportBatch, parseDegiroFiles, type ImportBatch } from '@/lib/importers/importBatch';
import { isTradeEntry } from '@/lib/importers/entries';
import { searchCompanyMatches, type CompanyMatch } from '@/lib/tickerSearch';
import { createLogger } from '@/lib/logger';
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
    const [selectedBroker, setSelectedBroker] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [parsedBatch, setParsedBatch] = useState<ImportBatch>(() => emptyImportBatch('Flatex'));
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

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const handleGenericDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processGenericFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const handleGenericFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processGenericFile(e.target.files[0]);
        }
    };

    const processFile = async (file: File) => {
        setImportStatus('processing');
        try {
            const text = await file.text();
            // In future: Switch parser based on selectedBroker
            const batch = parseDegiroFiles([text]);

            if (!isEmptyImportBatch(batch)) {
                setParsedBatch(batch);
                setImportStatus('ready');
            } else {
                notify({ tone: 'error', title: 'Keine Daten gefunden', message: 'Die Datei enthält keine erkennbaren DEGIRO-Buchungen. Bitte Export prüfen.' });
                setParsedBatch(emptyImportBatch('Flatex'));
                setImportStatus('idle');
            }
        } catch (err) {
            log.error(err);
            notify({ tone: 'error', title: 'Die Datei konnte nicht gelesen werden.' });
            setParsedBatch(emptyImportBatch('Flatex'));
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

    const buildFlatexBatch = (): ImportBatch => parsedBatch;

    const commitImport = () => {
        if (!project) return;
        const batch = buildFlatexBatch();
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
                    errors: errors.length ? errors.slice(0, 3) : ['Keine gültigen Zeilen gefunden.']
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
                errors: errors.length ? errors.slice(0, 3) : ['Keine gültigen Zeilen gefunden.']
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

    // Preview of the Flatex import: how many trades are already in the target portfolio.
    const importPreview = importStatus === 'ready' && project && targetPortfolio
        ? applyImportBatch(project, buildFlatexBatch(), targetPortfolio).summary
        : null;
    const importPreviewDuplicates = importPreview ? importPreview.duplicateTransactions + importPreview.duplicateMovements : 0;

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
            setCompanySearchMessage('Kein Treffer gefunden.');
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

            const cashNameMap: Record<ManualCashType, string> = {
                Deposit: 'Einzahlung',
                Withdrawal: 'Auszahlung',
                Dividend: 'Zinsen / Dividende',
                Tax: 'Steuern',
                Fee: 'Gebühren'
            };

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
                options={[{ value: 'import', label: 'Datei importieren' }, { value: 'manual', label: 'Manuell erfassen' }]}
                value={activeTab}
                onChange={setActiveTab}
                ariaLabel="Art der Erfassung"
            />

                {activeTab === 'import' ? (
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="ui-field-label">Importart</div>
                            <select
                                value={importMode}
                                onChange={(e) => setImportMode(e.target.value as 'generic' | 'template')}
                                className="ui-input w-full sm:w-auto"
                            >
                                <option value="generic">CSV mit Spaltenzuordnung</option>
                                <option value="template">Broker Templates</option>
                            </select>
                        </div>

                        {importMode === 'generic' ? (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                                        <span className={`rounded-full px-3 py-1 ${genericStep === 'upload' ? 'md3-chip-tonal' : 'md3-segment md3-text-muted'}`}>
                                            1 Upload
                                        </span>
                                        <span className="md3-text-muted">→</span>
                                        <span className={`rounded-full px-3 py-1 ${genericStep === 'mapping' && !showGenericPreview ? 'md3-chip-tonal' : 'md3-segment md3-text-muted'}`}>
                                            2 Zuordnung
                                        </span>
                                        <span className="md3-text-muted">→</span>
                                        <span className={`rounded-full px-3 py-1 ${genericStep === 'mapping' && showGenericPreview ? 'md3-chip-tonal' : 'md3-segment md3-text-muted'}`}>
                                            3 Vorschau
                                        </span>
                                    </div>
                                    {genericHeaders.length > 0 && genericStep === 'upload' && (
                                        <button
                                            type="button"
                                            onClick={() => setGenericStep('mapping')}
                                            className="ui-btn is-primary is-md"
                                        >
                                            Zuordnung starten
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
                                                    ? `${genericRows.length} Zeilen erkannt (${genericFileName})`
                                                    : 'CSV Datei hier ablegen'}
                                            </h3>
                                            <p className="text-xs md3-text-muted mt-1">
                                                {genericHeaders.length > 0 ? 'Neue Datei ziehen, um erneut zu mappen' : 'oder klicken zum Auswählen (CSV)'}
                                            </p>
                                        </div>

                                        {genericHeaders.length > 0 && (
                                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs md3-text-muted">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-semibold md3-text-main">{genericFileName}</span>
                                                    <span>• {genericRows.length} Zeilen</span>
                                                </div>
                                                <span className="md3-chip-tonal px-2 py-0.5 rounded-full">Bereit</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {genericStep === 'mapping' && genericHeaders.length > 0 && (
                                    <div className="ui-info-card p-4 space-y-4">
                                        <div className="space-y-1">
                                            <div className="text-sm font-semibold md3-text-main">Spalten zuordnen</div>
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
                                                Wertpapiere
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleGenericImportTypeChange('cash')}
                                                className={`px-3 py-1 text-[11px] font-semibold transition-all ${genericImportType === 'cash'
                                                    ? 'md3-chip-tonal'
                                                    : 'md3-text-muted hover:opacity-90'
                                                    }`}
                                            >
                                                Cash
                                            </button>
                                        </div>

                                        {genericImportType === 'security' ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">Datum *</label>
                                                    <select
                                                        value={genericMapping.date || ''}
                                                        onChange={(e) => updateMapping('date', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">Bitte wählen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`date_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">WKN / ISIN / Ticker *</label>
                                                    <select
                                                        value={genericMapping.identifier || ''}
                                                        onChange={(e) => updateMapping('identifier', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">Bitte wählen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`id_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">Anzahl *</label>
                                                    <select
                                                        value={genericMapping.shares || ''}
                                                        onChange={(e) => updateMapping('shares', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">Bitte wählen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`shares_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">Preis pro Stück *</label>
                                                    <select
                                                        value={genericMapping.price || ''}
                                                        onChange={(e) => updateMapping('price', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">Bitte wählen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`price_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">Datum *</label>
                                                    <select
                                                        value={genericMapping.date || ''}
                                                        onChange={(e) => updateMapping('date', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">Bitte wählen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`date_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">Änderung (optional bei Saldo)</label>
                                                    <select
                                                        value={genericMapping.amount || ''}
                                                        onChange={(e) => updateMapping('amount', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">Nicht verwendet</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`amt_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">Saldo (optional bei Änderung)</label>
                                                    <select
                                                        value={genericMapping.balance || ''}
                                                        onChange={(e) => updateMapping('balance', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">Nicht verwendet</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`bal_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="ui-field-label">Währung (optional)</label>
                                                    <select
                                                        value={genericMapping.currency || ''}
                                                        onChange={(e) => updateMapping('currency', e.target.value)}
                                                        className="ui-input w-full"
                                                    >
                                                        <option value="">Nicht verwendet</option>
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
                                            Erweiterte Optionen
                                            <ChevronDown size={14} className={`transition-transform ${showGenericAdvanced ? 'rotate-180' : ''}`} />
                                        </button>

                                        {showGenericAdvanced && (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {genericImportType === 'security' && (
                                                        <div className="space-y-1">
                                                            <label className="ui-field-label">Währung (optional)</label>
                                                            <select
                                                                value={genericMapping.currency || ''}
                                                                onChange={(e) => updateMapping('currency', e.target.value)}
                                                                className="ui-input w-full"
                                                            >
                                                                <option value="">Nicht verwendet</option>
                                                                {headerOptions.map((h) => (
                                                                    <option key={`cur_${h}`} value={h}>{h}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    {genericImportType === 'cash' && (
                                                        <div className="space-y-1">
                                                            <label className="ui-field-label">Beschreibung (optional)</label>
                                                            <select
                                                                value={genericMapping.description || ''}
                                                                onChange={(e) => updateMapping('description', e.target.value)}
                                                                className="ui-input w-full"
                                                            >
                                                                <option value="">Nicht verwendet</option>
                                                                {headerOptions.map((h) => (
                                                                    <option key={`cash_desc_${h}`} value={h}>{h}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    {genericImportType === 'cash' && (
                                                        <div className="space-y-1">
                                                            <label className="ui-field-label">Bewegungstyp (optional)</label>
                                                            <select
                                                                value={genericMapping.type || ''}
                                                                onChange={(e) => updateMapping('type', e.target.value)}
                                                                className="ui-input w-full"
                                                            >
                                                                <option value="">Nicht verwendet</option>
                                                                {headerOptions.map((h) => (
                                                                    <option key={`cash_type_${h}`} value={h}>{h}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    <div className="space-y-1">
                                                        <label className="ui-field-label">Standardwährung</label>
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
                                                        <label className="ui-field-label">Datumsformat</label>
                                                        <select
                                                            value={genericDateFormat}
                                                            onChange={(e) => setGenericDateFormat(e.target.value as 'auto' | 'ymd' | 'dmy' | 'mdy')}
                                                            className="ui-input w-full"
                                                        >
                                                            <option value="auto">Auto</option>
                                                            <option value="ymd">YYYY-MM-DD</option>
                                                            <option value="dmy">DD.MM.YYYY</option>
                                                            <option value="mdy">MM/DD/YYYY</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="text-xs md3-text-muted">
                                                    {genericImportType === 'security'
                                                        ? 'Hinweis: Negative Anzahl wird als Verkauf interpretiert, positive als Kauf.'
                                                        : 'Hinweis: Wenn Saldo gesetzt ist, wird er für den Kontostand genutzt. Sonst wird der Saldo aus der Änderung kumuliert.'}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => setGenericStep('upload')}
                                                className="md3-text-muted px-3 py-2 text-xs font-semibold hover:opacity-80"
                                            >
                                                Zurück
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowGenericPreview((v) => !v)}
                                                className="md3-text-muted text-xs font-semibold hover:opacity-80"
                                            >
                                                {showGenericPreview ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}
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
                                        Importiert: {genericImportSummary.imported} {genericImportType === 'cash' ? 'Kontostände' : 'Transaktionen'}
                                        {genericImportType === 'cash' && (
                                            <> - Kontobewegungen: {genericImportSummary.importedMovements || 0}</>
                                        )}
                                        {' '} - Übersprungen: {genericImportSummary.skipped}
                                        {genericImportSummary.duplicates ? <> (davon {genericImportSummary.duplicates} Duplikate)</> : null}
                                        {genericImportSummary.errors.length > 0 && (
                                            <div className="mt-2 text-xs md3-negative">{genericImportSummary.errors.join(' ')}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="ui-field-label">Broker</label>
                                    <select
                                        value={selectedBroker}
                                        onChange={(e) => setSelectedBroker(e.target.value)}
                                        className="ui-input w-full"
                                    >
                                        <option value="" disabled>Bitte wählen...</option>
                                        <option value="Flatex">Flatex</option>
                                        <option value="TR">Trade Republic (Coming Soon)</option>
                                    </select>
                                    <p className="text-xs md3-text-muted">Aktuell wird nur der Flatex CSV Export (Account & Transactions) unterstützt.</p>
                                </div>

                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className="relative rounded-2xl border border-dashed p-6 text-center transition cursor-pointer"
                                    style={isDragging
                                        ? { borderColor: 'var(--md3-primary)', background: 'color-mix(in srgb, var(--md3-primary-container) 55%, transparent 45%)' }
                                        : { borderColor: 'color-mix(in srgb, var(--md3-outline) 45%, transparent 55%)', background: 'var(--md3-surface-container-high)' }}
                                >
                                    <input
                                        type="file"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        accept=".csv"
                                        onChange={handleFileInput}
                                    />
                                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--md3-surface-container-highest)' }}>
                                        <Upload size={22} className={importStatus === 'ready' ? 'md3-accent' : 'md3-text-muted'} />
                                    </div>
                                    <h3 className="text-sm font-semibold md3-text-main">
                                        {importStatus === 'ready'
                                            ? `${parsedBatch.entries.filter(isTradeEntry).length} Transaktionen${importPreviewDuplicates > 0 ? ` (${importPreviewDuplicates} bereits vorhanden)` : ''}, ${parsedBatch.cashBalances.length} Kontostände, ${parsedBatch.entries.filter((entry) => !isTradeEntry(entry)).length} Kontobewegungen erkannt`
                                            : 'Datei hier ablegen'}
                                    </h3>
                                    <p className="text-xs md3-text-muted mt-1">
                                        {importStatus === 'ready' ? 'Klicken zum Ändern oder Import starten' : 'oder klicken zum Auswählen (CSV)'}
                                    </p>
                                </div>

                                <div className="ui-info-card flex gap-3 p-4">
                                    <div className="mt-0.5 md3-text-muted">
                                        <Search size={18} />
                                    </div>
                                    <div className="text-xs md3-text-muted">
                                        Lade deine <strong>Account.csv</strong> (Kontobewegungen, Dividenden, Salden) oder <strong>Transactions.csv</strong> (Käufe/Verkäufe) hoch.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="ui-field-label">Art der Buchung</label>
                            <select
                                value={manualHoldingType}
                                onChange={(e) => setManualHoldingType(e.target.value as ManualHoldingType)}
                                className="ui-input w-full"
                            >
                                <option value="security">Wertpapier</option>
                                <option value="cash">Kontobewegung (Einzahlung, Dividende, Gebühr …)</option>
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
                                        Kauf
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('Sell')}
                                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all rounded-full ${type === 'Sell'
                                            ? 'md3-negative-soft'
                                            : 'md3-text-muted hover:opacity-90'
                                            }`}
                                    >
                                        Verkauf
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="ui-field-label">WKN / ISIN / Ticker</label>
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
                                                placeholder="z.B. US0378331005"
                                                className="ui-input w-full pl-10"
                                            />
                                        </div>
                                        {resolveStatus === 'unresolved' && manualHoldingType === 'security' && (
                                            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                                                <span>Kein Ticker gefunden. Ticker anpassen, Firmensuche oder Ignorieren.</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCompanySearchOpen(true)}
                                                    className="ui-btn is-primary is-md"
                                                >
                                                    Firmensuche
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="ui-field-label">Datum</label>
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
                                        <label className="ui-field-label">Anzahl</label>
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
                                        <label className="ui-field-label">Preis pro Stück</label>
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
                                        <label className="ui-field-label">Währung</label>
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
                                    <label className="ui-field-label">Art der Kontobewegung</label>
                                    <select
                                        value={cashType}
                                        onChange={(e) => setCashType(e.target.value as ManualCashType)}
                                        className="ui-input w-full"
                                    >
                                        <option value="Deposit">Einzahlung</option>
                                        <option value="Withdrawal">Auszahlung</option>
                                        <option value="Dividend">Zinsen / Dividende</option>
                                        <option value="Tax">Steuern</option>
                                        <option value="Fee">Gebühren</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="ui-field-label">Datum</label>
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
                                    <label className="ui-field-label">Betrag</label>
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
                                    <label className="ui-field-label">Währung</label>
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
                            <span>Marktdaten werden aktualisiert</span>
                            <span>{marketSyncProgress!.current}/{marketSyncProgress!.total}</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: 'var(--md3-surface-container-highest)' }}>
                            <div
                                className="h-full rounded-full"
                                style={{ width: `${marketSyncPercent}%`, background: 'var(--md3-primary)' }}
                            />
                        </div>
                        {marketSyncProgress!.symbol && (
                            <div className="mt-1 text-[11px] md3-text-muted">Aktuell: {marketSyncProgress!.symbol}</div>
                        )}
                    </div>
                </div>
            )}

        </>
    );

    const renderFooter = () => (
        <>
                <button type="button" onClick={onClose} className="md3-text-muted px-4 py-2 text-sm font-semibold hover:opacity-80">Abbrechen</button>
                {activeTab === 'import' ? (
                    importMode === 'generic' ? (
                        <button
                            type="button"
                            onClick={commitGenericImport}
                            disabled={!isGenericMappingReady}
                            className="ui-btn is-primary is-md"
                        >
                            CSV importieren
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={commitImport}
                            disabled={importStatus !== 'ready'}
                            className="ui-btn is-primary is-md"
                        >
                            {importStatus === 'success'
                                ? (importResult && importResult.duplicates > 0
                                    ? `Importiert: ${importResult.added} neu, ${importResult.duplicates} Duplikate übersprungen`
                                    : 'Erfolgreich!')
                                : 'Import starten'}
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
                                    Ticker anpassen
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
                                    Ignorieren &amp; speichern
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSaveManual}
                                disabled={isResolving}
                                className="ui-btn is-primary is-md"
                            >
                                {isResolving ? 'Prüfe Ticker...' : 'Transaktion speichern'}
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
                title="Transaktionen hinzufügen"
                subtitle={targetPortfolio?.name ? `Depot „${targetPortfolio.name}“` : 'Unbekanntes Depot'}
                icon={<Briefcase size={20} />}
                footer={renderFooter()}
            >
                {renderBody()}
            </Modal>
            <Modal
                open={isCompanySearchOpen}
                onClose={() => setIsCompanySearchOpen(false)}
                title="Ticker zuweisen"
                subtitle="Wähle den passenden Treffer aus"
                icon={<Search size={20} />}
                footer={<Button onClick={() => setIsCompanySearchOpen(false)}>Schließen</Button>}
            >
                <form className="ui-inline-form" onSubmit={(e) => { e.preventDefault(); void handleCompanySearch(); }}>
                    <Field label="Ticker oder Firmenname">
                        <TextInput
                            value={companyQuery}
                            onChange={(e) => {
                                setCompanyQuery(e.target.value);
                                setCompanySearchMessage(null);
                                setCompanyMatches([]);
                            }}
                            placeholder="z. B. AAPL oder Apple"
                            autoFocus
                        />
                    </Field>
                    <Button type="submit" variant="primary" icon={<Search size={16} className={isCompanySearching ? 'animate-spin' : ''} />} disabled={isCompanySearching || !companyQuery.trim()}>
                        Suchen
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
                                trailing={<Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => handleSelectCompanyMatch(match)}>Übernehmen</Button>}
                            />
                        ))}
                    </div>
                )}
            </Modal>
        </>
    );
};
