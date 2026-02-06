"use client";

import React, { useState, useMemo } from 'react';
import { X, Upload, Calendar, Hash, DollarSign, Tag, Search, Briefcase } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { Transaction, type Portfolio } from '@/types/domain';
import { parseFlatexCsv } from '@/lib/csvParser';

interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetPortfolio: { id: string; name: string; isNew: boolean } | null;
}

type Tab = 'import' | 'manual';
type TransactionType = 'Buy' | 'Sell';

export const TransactionModal = ({ isOpen, onClose, targetPortfolio }: TransactionModalProps) => {
    const { project, updateProject } = useProject();

    // Tab State
    const [activeTab, setActiveTab] = useState<Tab>('import');

    // Manual Form State
    const [type, setType] = useState<TransactionType>('Buy');
    const [identifier, setIdentifier] = useState(''); // ISIN/WKN/Ticker
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [shares, setShares] = useState('');
    const [price, setPrice] = useState('');
    const [currency, setCurrency] = useState('EUR');

    // Import Form State
    const [selectedBroker, setSelectedBroker] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [parsedTx, setParsedTx] = useState<Transaction[]>([]);
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

            if (txs.length > 0) {
                setParsedTx(txs);
                setImportStatus('ready');
            } else {
                alert("Keine Transaktionen gefunden. Bitte CSV prüfen.");
                setImportStatus('idle');
            }
        } catch (err) {
            console.error(err);
            alert("Fehler beim Lesen der Datei.");
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
        if (parsedTx.length === 0) return;

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

            return {
                ...prev,
                portfolios: updatedPortfolios,
                transactions: [...prev.transactions, ...mappedTxs],
                securities: updatedSecurities,
                modified: new Date().toISOString()
            };
        });

        setImportStatus('success');
        setTimeout(() => {
            onClose();
        }, 1000);
    };

    const currencies = useMemo(() => {
        const manual = ['EUR', 'USD', 'CHF', 'GBP'];
        const fromFx = project?.fxData.rates ? Object.keys(project.fxData.rates) : [];
        return Array.from(new Set([...manual, ...fromFx])).sort();
    }, [project]);

    if (!isOpen) return null;

    const handleSaveManual = () => {
        if (!identifier || !shares || !price) return;

        const newTransaction: Transaction = {
            id: crypto.randomUUID(),
            date,
            type,
            isin: identifier.toUpperCase(), // Using ID field for ISIN/Ticker temporarily
            name: identifier.toUpperCase(), // Placeholder name
            shares: type === 'Sell' ? -Math.abs(parseFloat(shares)) : Math.abs(parseFloat(shares)),
            amount: type === 'Sell'
                ? Math.abs(parseFloat(shares)) * parseFloat(price) // Sell = Cash Inflow (+)
                : -(Math.abs(parseFloat(shares)) * parseFloat(price)), // Buy = Cash Outflow (-)
            currency,
            broker: 'Manual',
            originalData: { manualEntry: true, pricePerShare: parseFloat(price) }
        };

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
            if (isin && !updatedSecurities[isin]) {
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
                modified: new Date().toISOString()
            };
        });

        onClose();
    };


    // --- STEP 2: Import / Manual Action View ---
    const renderContent = () => (
        <div className="flex flex-col h-full">
            {/* Header with Back Button */}
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-white leading-tight">Transaktionen hinzufügen</h2>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Briefcase size={10} />
                            {targetPortfolio?.name || 'Unbekanntes Depot'}
                        </p>
                    </div>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white transition">
                    <X size={24} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800 shrink-0">
                <button
                    onClick={() => setActiveTab('import')}
                    className={`flex-1 py-4 text-sm font-medium transition-colors relative ${activeTab === 'import' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                >
                    Datei Import (CSV/PDF)
                    {activeTab === 'import' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500"></div>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('manual')}
                    className={`flex-1 py-4 text-sm font-medium transition-colors relative ${activeTab === 'manual' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                >
                    Manuell Erfassen
                    {activeTab === 'manual' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500"></div>
                    )}
                </button>
            </div>

            {/* Content Area */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                {activeTab === 'import' ? (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Broker auswählen</label>
                            <select
                                value={selectedBroker}
                                onChange={(e) => setSelectedBroker(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                            >
                                <option value="" disabled>Bitte wählen...</option>
                                <option value="Flatex">Flatex</option>
                                <option value="TR">Trade Republic (Coming Soon)</option>
                            </select>
                            <p className="text-xs text-slate-500">Aktuell wird nur der Flatex CSV Export (Account & Transactions) unterstützt.</p>
                        </div>

                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition cursor-pointer group relative
                                ${isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800/50'}
                            `}
                        >
                            <input
                                type="file"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                accept=".csv"
                                onChange={handleFileInput}
                            />
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition">
                                <Upload size={32} className={importStatus === 'ready' ? "text-emerald-500" : "text-slate-400"} />
                            </div>
                            <h3 className="font-medium text-white mb-1">
                                {importStatus === 'ready' ? `${parsedTx.length} Transaktionen erkannt` : 'Datei hier ablegen'}
                            </h3>
                            <p className="text-sm text-slate-400">
                                {importStatus === 'ready' ? 'Klicken zum Ändern oder "Import starten" drücken' : 'oder klicken zum Auswählen (CSV)'}
                            </p>
                        </div>

                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3">
                            <div className="text-blue-400 mt-0.5">
                                <Search size={18} />
                            </div>
                            <div className="text-xs text-blue-300">
                                Lade deine <strong>Account.csv</strong> (Dividenden) oder <strong>Transactions.csv</strong> (Käufe/Verkäufe) hoch.
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Type Selection */}
                        <div className="flex bg-slate-800 p-1 rounded-lg w-full mb-6">
                            <button
                                onClick={() => setType('Buy')}
                                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${type === 'Buy' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                Kauf
                            </button>
                            <button
                                onClick={() => setType('Sell')}
                                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${type === 'Sell' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                Verkauf
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">WKN / ISIN / Ticker</label>
                                <div className="relative">
                                    <Hash size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
                                        placeholder="z.B. US0378331005"
                                        className="w-full bg-slate-800 border-none rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-600"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Datum</label>
                                <div className="relative">
                                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="w-full bg-slate-800 border-none rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Anzahl</label>
                                <div className="relative">
                                    <Tag size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="number"
                                        value={shares}
                                        onChange={(e) => setShares(e.target.value)}
                                        placeholder="0.00"
                                        step="0.0001"
                                        className="w-full bg-slate-800 border-none rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-600"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Preis pro Stück</label>
                                <div className="relative">
                                    <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="number"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="0.00"
                                        step="0.01"
                                        className="w-full bg-slate-800 border-none rounded-lg pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-600"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Währung</label>
                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                    className="w-full bg-slate-800 border-none rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                >
                                    {currencies.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-800 flex justify-end gap-3 shrink-0 bg-slate-900 z-10">
                <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition font-medium">Abbrechen</button>
                {activeTab === 'import' ? (
                    <button
                        onClick={commitImport}
                        disabled={importStatus !== 'ready'}
                        className={`px-6 py-2 rounded-lg font-bold transition
                                ${importStatus === 'ready'
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg cursor-pointer'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
                            `}
                    >
                        {importStatus === 'success' ? 'Erfolgreich!' : 'Import starten'}
                    </button>
                ) : (
                    <button
                        onClick={handleSaveManual}
                        className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition"
                    >
                        Transaktion speichern
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-[600px] max-h-[90vh]">
                {renderContent()}
            </div>
        </div>
    );
};
