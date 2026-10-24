"use client";

import React, { useState, useMemo } from 'react';
import { X, Upload, Calendar, Hash, DollarSign, Tag, Search, Briefcase, Check, ChevronDown } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useNotifications } from '@/components/ui/notifications';
import { Transaction, type Security, type Portfolio } from '@/types/domain';
import { parseFlatexCashBalancesCsv, parseFlatexCashMovementsCsv, parseFlatexCsv, type CashBalanceImportPoint, type CashMovementImportEntry } from '@/lib/csvParser';
import { applyManualCashEntryToExplicitHistory } from '@/lib/cashAccountUtils';
import { getCurrencyOptions } from '@/lib/fxUtils';
import { buildManualPriceHistory } from '@/lib/marketDataService';
import { applyImportBatch, emptyImportBatch, isEmptyImportBatch, type ImportBatch } from '@/lib/importers/importBatch';
import { searchCompanyMatches, type CompanyMatch } from '@/lib/tickerSearch';
import { createLogger } from '@/lib/logger';
import { buildGenericCashBalances, buildGenericTransactions, guessCsvMapping, parseGenericCsv, type CsvDateFormat, type CsvMapping } from '@/lib/importers/genericCsv';

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
    const { project, updateProject, syncMarket, isMarketSyncing, marketSyncProgress } = useProject();
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
    const [parsedTx, setParsedTx] = useState<Transaction[]>([]);
    const [parsedCashBalances, setParsedCashBalances] = useState<CashBalanceImportPoint[]>([]);
    const [parsedCashMovements, setParsedCashMovements] = useState<CashMovementImportEntry[]>([]);
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
            const txs = parseFlatexCsv(text);
            const cashBalances = parseFlatexCashBalancesCsv(text);
            const cashMovements = parseFlatexCashMovementsCsv(text);

            if (txs.length > 0 || cashBalances.length > 0 || cashMovements.length > 0) {
                setParsedTx(txs);
                setParsedCashBalances(cashBalances);
                setParsedCashMovements(cashMovements);
                setImportStatus('ready');
            } else {
                notify({ tone: 'error', title: 'Keine Daten gefunden', message: 'Die Datei enthält keine erkennbaren DEGIRO-Buchungen. Bitte Export prüfen.' });
                setParsedTx([]);
                setParsedCashBalances([]);
                setParsedCashMovements([]);
                setImportStatus('idle');
            }
        } catch (err) {
            log.error(err);
            notify({ tone: 'error', title: 'Die Datei konnte nicht gelesen werden.' });
            setParsedTx([]);
            setParsedCashBalances([]);
            setParsedCashMovements([]);
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

    const buildFlatexBatch = (): ImportBatch => ({
        broker: 'Flatex',
        transactions: parsedTx,
        cashMovements: parsedCashMovements,
        cashBalances: parsedCashBalances
    });

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
            const { cashPoints, cashMovements, errors, processedRows } = buildGenericCashBalances(genericInput);
            if (cashPoints.length === 0 && cashMovements.length === 0) {
                setGenericImportSummary({
                    imported: 0,
                    importedMovements: 0,
                    skipped: genericRows.length,
                    errors: errors.length ? errors.slice(0, 3) : ['Keine gueltigen Zeilen gefunden.']
                });
                return;
            }

            if (!project) return;
            const cashTarget = getTargetPortfolioId(project.portfolios || []);
            const cashBatch: ImportBatch = { ...emptyImportBatch('CSV'), cashMovements, cashBalances: cashPoints };
            updateProject(prev => applyImportBatch(prev, cashBatch, cashTarget).project);

            setGenericImportSummary({
                imported: cashPoints.length,
                importedMovements: cashMovements.length,
                skipped: Math.max(0, genericRows.length - processedRows),
                errors: errors.slice(0, 3)
            });
            return;
        }

        const { transactions, errors } = buildGenericTransactions(genericInput);
        if (transactions.length === 0) {
            setGenericImportSummary({
                imported: 0,
                skipped: genericRows.length,
                errors: errors.length ? errors.slice(0, 3) : ['Keine gueltigen Zeilen gefunden.']
            });
            return;
        }

        if (!project) return;
        const target = getTargetPortfolioId(project.portfolios || []);
        const batch: ImportBatch = { ...emptyImportBatch('CSV'), transactions: transactions.filter((tx) => Boolean(tx.isin)) };
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

            const transactions = [...prev.transactions, { ...newTransaction, isin: securityKey, portfolioId: target.id }];

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
                ...prev,
                portfolios: updatedPortfolios,
                transactions,
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
                Fee: 'Gebuehren'
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
                ...prev,
                portfolios: updatedPortfolios,
                transactions: [...prev.transactions, { ...newTransaction, portfolioId: target.id }],
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
    const renderContent = () => (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between p-6 border-b md3-divider">
                <div className="flex items-center gap-3">
                    <div>
                        <h2 className="text-xl font-semibold md3-text-main leading-tight">Transaktionen hinzufuegen</h2>
                        <p className="text-xs md3-text-muted mt-0.5 flex items-center gap-1">
                            <Briefcase size={10} className="md3-text-muted" />
                            {targetPortfolio?.name || 'Unbekanntes Depot'}
                        </p>
                    </div>
                </div>
                <button type="button" onClick={onClose} className="md3-icon-btn" aria-label="Schliessen">
                    <X size={20} />
                </button>
            </div>

            <div className="px-6 pt-4">
                <div className="md3-segment flex w-full items-center gap-1 p-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('import')}
                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${activeTab === 'import'
                            ? 'md3-chip-tonal'
                            : 'md3-text-muted hover:opacity-90'
                            }`}
                    >
                        Datei Import (CSV/PDF)
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('manual')}
                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${activeTab === 'manual'
                            ? 'md3-chip-tonal'
                            : 'md3-text-muted hover:opacity-90'
                            }`}
                    >
                        Manuell erfassen
                    </button>
                </div>
            </div>

            <div className="p-5 pt-4 flex-1 overflow-y-auto custom-scrollbar">
                {activeTab === 'import' ? (
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs font-semibold uppercase tracking-wider md3-text-muted">Importtyp</div>
                            <select
                                value={importMode}
                                onChange={(e) => setImportMode(e.target.value as 'generic' | 'template')}
                                className="md3-field w-full sm:w-auto px-3 py-2 text-xs font-semibold outline-none"
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
                                            className="md3-filled-btn px-3 py-1.5 text-xs font-semibold"
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
                                                {genericHeaders.length > 0 ? 'Neue Datei ziehen, um erneut zu mappen' : 'oder klicken zum Auswaehlen (CSV)'}
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
                                    <div className="md3-list-item p-4 space-y-4">
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
                                                    <label className="text-[11px] uppercase tracking-wider md3-text-muted">Datum *</label>
                                                    <select
                                                        value={genericMapping.date || ''}
                                                        onChange={(e) => updateMapping('date', e.target.value)}
                                                        className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                    >
                                                        <option value="">Bitte waehlen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`date_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[11px] uppercase tracking-wider md3-text-muted">WKN / ISIN / Ticker *</label>
                                                    <select
                                                        value={genericMapping.identifier || ''}
                                                        onChange={(e) => updateMapping('identifier', e.target.value)}
                                                        className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                    >
                                                        <option value="">Bitte waehlen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`id_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[11px] uppercase tracking-wider md3-text-muted">Anzahl *</label>
                                                    <select
                                                        value={genericMapping.shares || ''}
                                                        onChange={(e) => updateMapping('shares', e.target.value)}
                                                        className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                    >
                                                        <option value="">Bitte waehlen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`shares_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[11px] uppercase tracking-wider md3-text-muted">Preis pro Stueck *</label>
                                                    <select
                                                        value={genericMapping.price || ''}
                                                        onChange={(e) => updateMapping('price', e.target.value)}
                                                        className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                    >
                                                        <option value="">Bitte waehlen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`price_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[11px] uppercase tracking-wider md3-text-muted">Datum *</label>
                                                    <select
                                                        value={genericMapping.date || ''}
                                                        onChange={(e) => updateMapping('date', e.target.value)}
                                                        className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                    >
                                                        <option value="">Bitte waehlen...</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`date_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[11px] uppercase tracking-wider md3-text-muted">Aenderung (optional bei Saldo)</label>
                                                    <select
                                                        value={genericMapping.amount || ''}
                                                        onChange={(e) => updateMapping('amount', e.target.value)}
                                                        className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                    >
                                                        <option value="">Nicht verwendet</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`amt_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[11px] uppercase tracking-wider md3-text-muted">Saldo (optional bei Aenderung)</label>
                                                    <select
                                                        value={genericMapping.balance || ''}
                                                        onChange={(e) => updateMapping('balance', e.target.value)}
                                                        className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                    >
                                                        <option value="">Nicht verwendet</option>
                                                        {headerOptions.map((h) => (
                                                            <option key={`bal_${h}`} value={h}>{h}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[11px] uppercase tracking-wider md3-text-muted">Waehrung (optional)</label>
                                                    <select
                                                        value={genericMapping.currency || ''}
                                                        onChange={(e) => updateMapping('currency', e.target.value)}
                                                        className="md3-field w-full px-3 py-2 text-sm outline-none"
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
                                                            <label className="text-[11px] uppercase tracking-wider md3-text-muted">Waehrung (optional)</label>
                                                            <select
                                                                value={genericMapping.currency || ''}
                                                                onChange={(e) => updateMapping('currency', e.target.value)}
                                                                className="md3-field w-full px-3 py-2 text-sm outline-none"
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
                                                            <label className="text-[11px] uppercase tracking-wider md3-text-muted">Beschreibung (optional)</label>
                                                            <select
                                                                value={genericMapping.description || ''}
                                                                onChange={(e) => updateMapping('description', e.target.value)}
                                                                className="md3-field w-full px-3 py-2 text-sm outline-none"
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
                                                            <label className="text-[11px] uppercase tracking-wider md3-text-muted">Bewegungstyp (optional)</label>
                                                            <select
                                                                value={genericMapping.type || ''}
                                                                onChange={(e) => updateMapping('type', e.target.value)}
                                                                className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                            >
                                                                <option value="">Nicht verwendet</option>
                                                                {headerOptions.map((h) => (
                                                                    <option key={`cash_type_${h}`} value={h}>{h}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    <div className="space-y-1">
                                                        <label className="text-[11px] uppercase tracking-wider md3-text-muted">Standard Waehrung</label>
                                                        <select
                                                            value={genericDefaultCurrency}
                                                            onChange={(e) => setGenericDefaultCurrency(e.target.value)}
                                                            className="md3-field w-full px-3 py-2 text-sm outline-none"
                                                        >
                                                            {currencies.map((c) => (
                                                                <option key={`def_${c}`} value={c}>{c}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[11px] uppercase tracking-wider md3-text-muted">Datumsformat</label>
                                                        <select
                                                            value={genericDateFormat}
                                                            onChange={(e) => setGenericDateFormat(e.target.value as 'auto' | 'ymd' | 'dmy' | 'mdy')}
                                                            className="md3-field w-full px-3 py-2 text-sm outline-none"
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
                                                        : 'Hinweis: Wenn Saldo gesetzt ist, wird er fuer den Kontostand genutzt. Sonst wird der Saldo aus der Aenderung kumuliert.'}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => setGenericStep('upload')}
                                                className="md3-text-muted px-3 py-2 text-xs font-semibold hover:opacity-80"
                                            >
                                                Zurueck
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
                                    <div className="md3-list-item p-3 text-xs md3-text-muted">
                                        Importiert: {genericImportSummary.imported} {genericImportType === 'cash' ? 'Kontostaende' : 'Transaktionen'}
                                        {genericImportType === 'cash' && (
                                            <> - Kontobewegungen: {genericImportSummary.importedMovements || 0}</>
                                        )}
                                        {' '} - Uebersprungen: {genericImportSummary.skipped}
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
                                    <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Broker auswaehlen</label>
                                    <select
                                        value={selectedBroker}
                                        onChange={(e) => setSelectedBroker(e.target.value)}
                                        className="md3-field w-full px-4 py-3 text-sm outline-none"
                                    >
                                        <option value="" disabled>Bitte waehlen...</option>
                                        <option value="Flatex">Flatex</option>
                                        <option value="TR">Trade Republic (Coming Soon)</option>
                                    </select>
                                    <p className="text-xs md3-text-muted">Aktuell wird nur der Flatex CSV Export (Account & Transactions) unterstuetzt.</p>
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
                                            ? `${parsedTx.length} Transaktionen${importPreviewDuplicates > 0 ? ` (${importPreviewDuplicates} bereits vorhanden)` : ''}, ${parsedCashBalances.length} Kontostaende, ${parsedCashMovements.length} Kontobewegungen erkannt`
                                            : 'Datei hier ablegen'}
                                    </h3>
                                    <p className="text-xs md3-text-muted mt-1">
                                        {importStatus === 'ready' ? 'Klicken zum Aendern oder Import starten' : 'oder klicken zum Auswaehlen (CSV)'}
                                    </p>
                                </div>

                                <div className="md3-list-item flex gap-3 p-4">
                                    <div className="mt-0.5 md3-text-muted">
                                        <Search size={18} />
                                    </div>
                                    <div className="text-xs md3-text-muted">
                                        Lade deine <strong>Account.csv</strong> (Kontobewegungen, Dividenden, Salden) oder <strong>Transactions.csv</strong> (Kaeufe/Verkaeufe) hoch.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Holding Typ</label>
                            <select
                                value={manualHoldingType}
                                onChange={(e) => setManualHoldingType(e.target.value as ManualHoldingType)}
                                className="md3-field w-full px-4 py-3 text-sm outline-none"
                            >
                                <option value="security">Wertpapier</option>
                                <option value="cash">Cash</option>
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
                                        <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">WKN / ISIN / Ticker</label>
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
                                                className="md3-field w-full pl-10 pr-4 py-3 text-sm outline-none"
                                            />
                                        </div>
                                        {resolveStatus === 'unresolved' && manualHoldingType === 'security' && (
                                            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                                                <span>Kein Ticker gefunden. Ticker anpassen, Firmensuche oder Ignorieren.</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCompanySearchOpen(true)}
                                                    className="md3-filled-btn px-3 py-1.5 text-xs font-semibold"
                                                >
                                                    Firmensuche
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Datum</label>
                                        <div className="relative">
                                            <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                            <input
                                                type="date"
                                                value={date}
                                                onChange={(e) => setDate(e.target.value)}
                                                className="md3-field w-full pl-10 pr-4 py-3 text-sm outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Anzahl</label>
                                        <div className="relative">
                                            <Tag size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                            <input
                                                type="number"
                                                value={shares}
                                                onChange={(e) => setShares(e.target.value)}
                                                placeholder="0.00"
                                                step="0.0001"
                                                className="md3-field w-full pl-10 pr-4 py-3 text-sm outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Preis pro Stueck</label>
                                        <div className="relative">
                                            <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                            <input
                                                type="number"
                                                value={price}
                                                onChange={(e) => setPrice(e.target.value)}
                                                placeholder="0.00"
                                                step="0.01"
                                                className="md3-field w-full pl-10 pr-4 py-3 text-sm outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Waehrung</label>
                                        <select
                                            value={currency}
                                            onChange={(e) => setCurrency(e.target.value)}
                                            className="md3-field w-full px-4 py-3 text-sm outline-none"
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
                                    <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Cash Typ</label>
                                    <select
                                        value={cashType}
                                        onChange={(e) => setCashType(e.target.value as ManualCashType)}
                                        className="md3-field w-full px-4 py-3 text-sm outline-none"
                                    >
                                        <option value="Deposit">Einzahlung</option>
                                        <option value="Withdrawal">Auszahlung</option>
                                        <option value="Dividend">Zinsen / Dividende</option>
                                        <option value="Tax">Steuern</option>
                                        <option value="Fee">Gebuehren</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Datum</label>
                                    <div className="relative">
                                        <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                        <input
                                            type="date"
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            className="md3-field w-full pl-10 pr-4 py-3 text-sm outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Betrag</label>
                                    <div className="relative">
                                        <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 md3-text-muted" />
                                        <input
                                            type="number"
                                            value={cashAmount}
                                            onChange={(e) => setCashAmount(e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            className="md3-field w-full pl-10 pr-4 py-3 text-sm outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs uppercase font-semibold tracking-wider md3-text-muted">Waehrung</label>
                                    <select
                                        value={currency}
                                        onChange={(e) => setCurrency(e.target.value)}
                                        className="md3-field w-full px-4 py-3 text-sm outline-none"
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
            </div>

            {showMarketSyncProgress && (
                <div className="px-6 pb-3">
                    <div className="md3-list-item p-3 text-xs md3-text-muted">
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

            <div className="p-6 border-t md3-divider flex justify-end gap-3 shrink-0">
                <button type="button" onClick={onClose} className="md3-text-muted px-4 py-2 text-sm font-semibold hover:opacity-80">Abbrechen</button>
                {activeTab === 'import' ? (
                    importMode === 'generic' ? (
                        <button
                            type="button"
                            onClick={commitGenericImport}
                            disabled={!isGenericMappingReady}
                            className="md3-filled-btn px-6 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            CSV importieren
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={commitImport}
                            disabled={importStatus !== 'ready'}
                            className="md3-filled-btn px-6 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
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
                                    className="md3-filled-btn px-6 text-sm font-semibold"
                                >
                                    Ignorieren &amp; speichern
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSaveManual}
                                disabled={isResolving}
                                className="md3-filled-btn px-6 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isResolving ? 'Pruefe Ticker...' : 'Transaktion speichern'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
            <div className="md3-card w-full max-w-5xl overflow-hidden flex flex-col min-h-[70vh] max-h-[92vh] rounded-[28px]">
                {renderContent()}
            </div>
            {isCompanySearchOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsCompanySearchOpen(false)}>
                    <div className="md3-card w-full max-w-lg rounded-[24px] p-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold md3-text-main">Ticker zuweisen</h3>
                                <p className="text-xs md3-text-muted">Waehle den passenden Treffer aus.</p>
                            </div>
                            <button type="button" onClick={() => setIsCompanySearchOpen(false)} className="md3-icon-btn" aria-label="Schliessen">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input
                                type="text"
                                value={companyQuery}
                                onChange={(e) => {
                                    setCompanyQuery(e.target.value);
                                    setCompanySearchMessage(null);
                                    setCompanyMatches([]);
                                }}
                                placeholder="Ticker oder Firmenname (z.B. AAPL oder Apple)"
                                className="md3-field w-full px-3 py-2 text-sm outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleCompanySearch}
                                disabled={isCompanySearching || !companyQuery.trim()}
                                className="md3-icon-btn h-10 w-10 disabled:opacity-60 disabled:cursor-not-allowed"
                                aria-label="Suchen"
                                title="Suchen"
                            >
                                <Search size={16} className={isCompanySearching ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        {companySearchMessage && (
                            <div className="mt-3 text-xs md3-text-muted">{companySearchMessage}</div>
                        )}

                        {companyMatches.length > 0 && (
                            <div className="mt-5 rounded-2xl border border-white/10 bg-black/5 p-3">
                                <div className="max-h-72 space-y-3 overflow-y-auto pr-2 [scrollbar-width:thin]">
                                    {companyMatches.map(match => (
                                        <div key={match.symbol} className="md3-list-item flex items-start justify-between gap-4 rounded-2xl px-4 py-3">
                                            <div className="min-w-0">
                                                <div className="text-sm md3-text-main font-semibold leading-snug truncate">
                                                    {match.name || match.symbol}
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] md3-text-muted">
                                                    <span className="md3-chip-tonal px-2 py-0.5 rounded-full">{match.symbol}</span>
                                                    {match.exchange && (
                                                        <span className="md3-chip-tonal px-2 py-0.5 rounded-full">{match.exchange}</span>
                                                    )}
                                                    {match.currency && (
                                                        <span className="md3-chip-tonal px-2 py-0.5 rounded-full">{match.currency}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSelectCompanyMatch(match)}
                                                className="md3-icon-btn h-10 w-10 md3-positive-soft border border-emerald-300/40"
                                                aria-label="Uebernehmen"
                                                title="Uebernehmen"
                                            >
                                                <Check size={18} className="text-emerald-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-4 flex justify-end">
                            <button type="button" onClick={() => setIsCompanySearchOpen(false)} className="md3-text-muted px-4 py-2 text-sm font-semibold hover:opacity-80">
                                Schliessen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
