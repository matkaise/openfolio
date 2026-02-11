"use client";

import React, { useState, useMemo } from 'react';
import { X, Upload, Calendar, Hash, DollarSign, Tag, Search, Briefcase } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { Transaction, type CashAccount, type Portfolio } from '@/types/domain';
import { parseFlatexCashBalancesCsv, parseFlatexCsv, type CashBalanceImportPoint } from '@/lib/csvParser';
import { applyManualCashEntryToExplicitHistory } from '@/lib/cashAccountUtils';
import { getCurrencyOptions } from '@/lib/fxUtils';

interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetPortfolio: { id: string; name: string; isNew: boolean } | null;
}

type Tab = 'import' | 'manual';
type TransactionType = 'Buy' | 'Sell';
type ManualHoldingType = 'security' | 'cash';
type ManualCashType = 'Deposit' | 'Withdrawal' | 'Dividend' | 'Tax' | 'Fee';

export const TransactionModal = ({ isOpen, onClose, targetPortfolio }: TransactionModalProps) => {
    const { project, updateProject } = useProject();

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

    // Import Form State
    const [selectedBroker, setSelectedBroker] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [parsedTx, setParsedTx] = useState<Transaction[]>([]);
    const [parsedCashBalances, setParsedCashBalances] = useState<CashBalanceImportPoint[]>([]);
    const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'ready' | 'success'>('idle');

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

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const processFile = async (file: File) => {
        setImportStatus('processing');
        try {
            const text = await file.text();
            // In future: Switch parser based on selectedBroker
            const txs = parseFlatexCsv(text);
            const cashBalances = parseFlatexCashBalancesCsv(text);

            if (txs.length > 0 || cashBalances.length > 0) {
                setParsedTx(txs);
                setParsedCashBalances(cashBalances);
                setImportStatus('ready');
            } else {
                alert("Keine Daten gefunden. Bitte CSV pruefen.");
                setParsedTx([]);
                setParsedCashBalances([]);
                setImportStatus('idle');
            }
        } catch (err) {
            console.error(err);
            alert("Fehler beim Lesen der Datei.");
            setParsedTx([]);
            setParsedCashBalances([]);
            setImportStatus('idle');
        }
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

    const commitImport = () => {
        if (parsedTx.length === 0 && parsedCashBalances.length === 0) return;

        updateProject(prev => {
            const updatedSecurities = { ...prev.securities };

            // Extract and merge securities from imported transactions
            parsedTx.forEach(tx => {
                const isin = tx.isin;
                if (isin && !updatedSecurities[isin]) {
                    updatedSecurities[isin] = {
                        isin: isin,
                        symbol: isin, // May be ISIN, user might need to map later
                        name: tx.name || isin,
                        currency: tx.currency,
                        quoteType: 'Stock', // Default
                        priceHistory: {}
                    };
                }
            });

            // Handle Portfolio Creation
            const portfolios = prev.portfolios || [];
            const target = getTargetPortfolioId(portfolios);

            let updatedPortfolios = portfolios;
            // Only add if it's new AND not already in the list (safety check)
            if (target.isNew && !updatedPortfolios.find(p => p.id === target.id)) {
                updatedPortfolios = [...portfolios, { id: target.id, name: target.name }];
            }

            // Assign Portfolio ID to transactions
            const mappedTxs = parsedTx.map(tx => ({
                ...tx,
                portfolioId: target.id
            }));

            // Merge imported balances into one reference account per portfolio + currency
            const existingCashAccounts = prev.cashAccounts || [];
            const mergeKeyFor = (account: Pick<CashAccount, 'portfolioId' | 'currency'>) => `${account.portfolioId || ''}|${account.currency}`;
            const cashAccountMap = new Map<string, CashAccount>(
                existingCashAccounts.map(account => [mergeKeyFor(account), account])
            );

            parsedCashBalances.forEach(point => {
                const key = `${target.id}|${point.currency}`;
                const existing = cashAccountMap.get(key);

                if (!existing) {
                    cashAccountMap.set(key, {
                        id: crypto.randomUUID(),
                        name: `${target.name} ${point.currency} Konto`,
                        portfolioId: target.id,
                        currency: point.currency,
                        balanceHistory: { [point.date]: point.balance }
                    });
                    return;
                }

                cashAccountMap.set(key, {
                    ...existing,
                    balanceHistory: {
                        ...(existing.balanceHistory || {}),
                        [point.date]: point.balance
                    }
                });
            });

            return {
                ...prev,
                portfolios: updatedPortfolios,
                transactions: [...prev.transactions, ...mappedTxs],
                securities: updatedSecurities,
                cashAccounts: Array.from(cashAccountMap.values()),
                modified: new Date().toISOString()
            };
        });

        setImportStatus('success');
        setTimeout(() => {
            onClose();
        }, 1000);
    };

    const currencies = useMemo(() => {
        return getCurrencyOptions(project?.fxData);
    }, [project?.fxData]);

    if (!isOpen) return null;

    const handleSaveManual = () => {
        let newTransaction: Transaction | null = null;

        if (manualHoldingType === 'security') {
            if (!identifier || !shares || !price) return;
            const parsedShares = Math.abs(parseFloat(shares));
            const parsedPrice = parseFloat(price);
            if (!Number.isFinite(parsedShares) || !Number.isFinite(parsedPrice) || parsedShares <= 0 || parsedPrice <= 0) {
                return;
            }

            newTransaction = {
                id: crypto.randomUUID(),
                date,
                type,
                isin: identifier.toUpperCase(),
                name: identifier.toUpperCase(),
                shares: type === 'Sell' ? -parsedShares : parsedShares,
                amount: type === 'Sell'
                    ? parsedShares * parsedPrice
                    : -(parsedShares * parsedPrice),
                currency,
                broker: 'Manual',
                originalData: { manualEntry: true, pricePerShare: parsedPrice }
            };
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

        updateProject(prev => {
            // Handle Portfolio Creation
            const portfolios = prev.portfolios || [];
            const target = getTargetPortfolioId(portfolios);

            let updatedPortfolios = portfolios;
            if (target.isNew && !updatedPortfolios.find(p => p.id === target.id)) {
                updatedPortfolios = [...portfolios, { id: target.id, name: target.name }];
            }

            const updatedSecurities = { ...prev.securities };
            const isin = newTransaction.isin;

            // Ensure security exists
            if (manualHoldingType === 'security' && isin && !updatedSecurities[isin]) {
                updatedSecurities[isin] = {
                    isin,
                    symbol: isin, // Default to ISIN/Ticker
                    name: isin,   // Default name
                    currency: newTransaction.currency,
                    quoteType: 'Stock', // Default
                    priceHistory: {}
                };
            }

            return {
                ...prev,
                portfolios: updatedPortfolios,
                transactions: [...prev.transactions, { ...newTransaction, portfolioId: target.id }],
                securities: updatedSecurities,
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

            <div className="p-5 pt-4 flex-1 overflow-y-auto custom-scrollbar md:overflow-visible">
                {activeTab === 'import' ? (
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
                                    ? `${parsedTx.length} Transaktionen, ${parsedCashBalances.length} Kontostaende erkannt`
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
                                Lade deine <strong>Account.csv</strong> (Dividenden) oder <strong>Transactions.csv</strong> (Kaeufe/Verkaeufe) hoch.
                            </div>
                        </div>
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
                                                onChange={(e) => setIdentifier(e.target.value)}
                                                placeholder="z.B. US0378331005"
                                                className="md3-field w-full pl-10 pr-4 py-3 text-sm outline-none"
                                            />
                                        </div>
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

            <div className="p-6 border-t md3-divider flex justify-end gap-3 shrink-0">
                <button type="button" onClick={onClose} className="md3-text-muted px-4 py-2 text-sm font-semibold hover:opacity-80">Abbrechen</button>
                {activeTab === 'import' ? (
                    <button
                        type="button"
                        onClick={commitImport}
                        disabled={importStatus !== 'ready'}
                        className="md3-filled-btn px-6 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {importStatus === 'success' ? 'Erfolgreich!' : 'Import starten'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleSaveManual}
                        className="md3-filled-btn px-6 text-sm font-semibold"
                    >
                        Transaktion speichern
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
            <div className="md3-card w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] md:max-h-none rounded-[28px]">
                {renderContent()}
            </div>
        </div>
    );
};
