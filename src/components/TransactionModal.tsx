"use client";

import React, { useState, useMemo } from 'react';
import { X, Upload, Calendar, Hash, DollarSign, Tag, Search, Briefcase } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { Transaction, type CashAccount, type Portfolio, type ProjectData } from '@/types/domain';
import { parseFlatexCashBalancesCsv, parseFlatexCsv, type CashBalanceImportPoint } from '@/lib/csvParser';
import { applyManualCashEntryToExplicitHistory } from '@/lib/cashAccountUtils';
import { getCurrencyOptions } from '@/lib/fxUtils';
import { buildManualPriceHistory } from '@/lib/marketDataService';

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
type CompanyMatch = {
    symbol: string;
    name?: string;
    exchange?: string;
    currency?: string;
    quoteType?: string;
};
type CsvMapping = {
    date?: string;
    identifier?: string;
    shares?: string;
    price?: string;
    currency?: string;
};
type CsvImportSummary = {
    imported: number;
    skipped: number;
    errors: string[];
};

export const TransactionModal = ({ isOpen, onClose, targetPortfolio }: TransactionModalProps) => {
    const { project, updateProject, syncMarket, isMarketSyncing, marketSyncProgress } = useProject();

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
    const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'ready' | 'success'>('idle');
    const [genericHeaders, setGenericHeaders] = useState<string[]>([]);
    const [genericRows, setGenericRows] = useState<string[][]>([]);
    const [genericFileName, setGenericFileName] = useState('');
    const [genericMapping, setGenericMapping] = useState<CsvMapping>({});
    const [genericDateFormat, setGenericDateFormat] = useState<'auto' | 'ymd' | 'dmy' | 'mdy'>('auto');
    const [genericDefaultCurrency, setGenericDefaultCurrency] = useState('EUR');
    const [genericImportSummary, setGenericImportSummary] = useState<CsvImportSummary | null>(null);
    const [genericStep, setGenericStep] = useState<'upload' | 'mapping'>('upload');
    const [showGenericPreview, setShowGenericPreview] = useState(false);

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

    const detectDelimiter = (line: string) => {
        const candidates = [',', ';', '\t'];
        let best = ',';
        let bestCount = 0;
        candidates.forEach((delim) => {
            const count = line.split(delim).length - 1;
            if (count > bestCount) {
                bestCount = count;
                best = delim;
            }
        });
        return best;
    };

    const parseCsvLineWithDelimiter = (line: string, delimiter: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result.map((c) => c.trim().replace(/^"|"$/g, ''));
    };

    const normalizeHeaderName = (value: string) => {
        return value
            .toLowerCase()
            .replace(/\u00c3\u00a4/g, 'a')
            .replace(/\u00c3\u00b6/g, 'o')
            .replace(/\u00c3\u00bc/g, 'u')
            .replace(/\u00c3\u009f/g, 'ss')
            .replace(/\u00e4/g, 'a')
            .replace(/\u00f6/g, 'o')
            .replace(/\u00fc/g, 'u')
            .replace(/\u00df/g, 'ss')
            .replace(/[^a-z0-9]+/g, '');
    };

    const detectDateFormatFromColumn = (rows: string[][], columnIdx: number): 'auto' | 'ymd' | 'dmy' | 'mdy' => {
        if (columnIdx < 0) return 'auto';
        const sample = rows.slice(0, 25);
        let ymd = 0;
        let dmy = 0;
        let mdy = 0;

        sample.forEach((row) => {
            const raw = (row[columnIdx] ?? '').trim();
            if (!raw) return;
            if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(raw)) {
                ymd += 1;
                return;
            }
            const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
            if (!match) return;
            const dayOrMonth = Number(match[1]);
            const monthOrDay = Number(match[2]);
            if (dayOrMonth > 12 && monthOrDay <= 12) {
                dmy += 1;
            } else if (monthOrDay > 12 && dayOrMonth <= 12) {
                mdy += 1;
            } else {
                dmy += 1;
            }
        });

        if (ymd >= dmy && ymd >= mdy && ymd > 0) return 'ymd';
        if (dmy >= mdy && dmy > 0) return 'dmy';
        if (mdy > 0) return 'mdy';
        return 'auto';
    };

    const pickBestHeaderIndex = (
        headers: string[],
        scorer: (normalized: string) => number,
        used: Set<number>
    ) => {
        let bestIdx = -1;
        let bestScore = 0;
        headers.forEach((header, idx) => {
            if (used.has(idx)) return;
            const normalized = normalizeHeaderName(header);
            if (!normalized) return;
            const score = scorer(normalized);
            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        });
        return bestIdx;
    };

    const detectCurrencyColumn = (headers: string[], rows: string[][], used: Set<number>) => {
        const sample = rows.slice(0, 25);
        const maxColumns = Math.max(headers.length, ...sample.map((row) => row.length));
        let bestIdx = -1;
        let bestCount = 0;

        for (let idx = 0; idx < maxColumns; idx += 1) {
            if (used.has(idx)) continue;
            let count = 0;
            sample.forEach((row) => {
                const value = (row[idx] ?? '').trim().toUpperCase();
                if (/^[A-Z]{3}$/.test(value)) {
                    count += 1;
                }
            });
            if (count > bestCount) {
                bestCount = count;
                bestIdx = idx;
            }
        }

        if (bestIdx >= 0 && bestCount >= Math.max(2, Math.floor(sample.length * 0.4))) {
            return bestIdx;
        }
        return -1;
    };

    const detectNameHeaderIndex = (headers: string[], used: Set<number>) => {
        let bestIdx = -1;
        let bestScore = 0;
        headers.forEach((header, idx) => {
            if (used.has(idx)) return;
            const normalized = normalizeHeaderName(header);
            if (!normalized || normalized.startsWith('spalte')) return;
            let score = 0;
            if (normalized.includes('produkt')) score += 10;
            if (normalized.includes('name') || normalized.includes('bezeichnung')) score += 8;
            if (normalized.includes('wertpapier') || normalized.includes('security')) score += 6;
            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        });
        return bestIdx;
    };

    const guessMappingFromHeaders = (headers: string[], rows: string[][]) => {
        const mapping: CsvMapping = {};
        const used = new Set<number>();

        const assign = (key: keyof CsvMapping, idx: number) => {
            if (idx >= 0 && idx < headers.length && !used.has(idx)) {
                mapping[key] = headers[idx];
                used.add(idx);
            }
        };

        const scoreDate = (normalized: string) => (normalized.includes('datum') || normalized.includes('date') ? 10 : 0);
        const scoreIdentifier = (normalized: string) => {
            if (normalized.includes('isin')) return 12;
            if (normalized.includes('wkn')) return 10;
            if (normalized.includes('ticker') || normalized.includes('symbol')) return 9;
            return 0;
        };
        const scoreShares = (normalized: string) => {
            if (normalized.includes('anzahl')) return 10;
            if (normalized.includes('shares') || normalized.includes('quantity') || normalized.includes('qty')) return 8;
            return 0;
        };
        const scorePrice = (normalized: string) => {
            if (normalized.includes('kurs')) return 10;
            if (normalized.includes('price') || normalized.includes('preis')) return 8;
            return 0;
        };
        const scoreCurrency = (normalized: string) => {
            if (normalized.includes('waehrung') || normalized.includes('wahrung')) return 10;
            if (normalized.includes('currency') || normalized.includes('ccy')) return 8;
            return 0;
        };

        assign('date', pickBestHeaderIndex(headers, scoreDate, used));
        assign('identifier', pickBestHeaderIndex(headers, scoreIdentifier, used));
        assign('shares', pickBestHeaderIndex(headers, scoreShares, used));
        assign('price', pickBestHeaderIndex(headers, scorePrice, used));
        const currencyIdx = pickBestHeaderIndex(headers, scoreCurrency, used);
        if (currencyIdx >= 0) {
            assign('currency', currencyIdx);
        } else {
            const detectedCurrencyIdx = detectCurrencyColumn(headers, rows, used);
            assign('currency', detectedCurrencyIdx);
        }

        const dateHeader = mapping.date ? headers.indexOf(mapping.date) : -1;
        const dateFormat = detectDateFormatFromColumn(rows, dateHeader);

        return { mapping, dateFormat };
    };

    const parseGenericCsv = (text: string): { headers: string[]; rows: string[][] } => {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        if (lines.length === 0) return { headers: [], rows: [] };

        const delimiter = detectDelimiter(lines[0]);
        const headers = parseCsvLineWithDelimiter(lines[0], delimiter).map((h, index) => {
            const trimmed = h.trim();
            return trimmed.length > 0 ? trimmed : `Spalte ${index + 1}`;
        });
        const rows = lines.slice(1).map((line) => parseCsvLineWithDelimiter(line, delimiter));
        return { headers, rows };
    };

    const parseNumberFlexible = (value: string): number => {
        if (!value) return 0;
        let cleaned = value.replace(/[^\d,.-]/g, '');
        if (cleaned.includes(',') && cleaned.includes('.')) {
            if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
                cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            } else {
                cleaned = cleaned.replace(/,/g, '');
            }
        } else if (cleaned.includes(',')) {
            cleaned = cleaned.replace(',', '.');
        }
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const parseDateValue = (value: string, format: 'auto' | 'ymd' | 'dmy' | 'mdy'): string | null => {
        const trimmed = value.trim();
        if (!trimmed) return null;

        const tryYmd = (val: string) => {
            const match = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(val);
            if (!match) return null;
            const [, y, m, d] = match;
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        };
        const tryDmy = (val: string) => {
            const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(val);
            if (!match) return null;
            const [, d, m, y] = match;
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        };
        const tryMdy = (val: string) => {
            const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(val);
            if (!match) return null;
            const [, m, d, y] = match;
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        };

        if (format === 'ymd') return tryYmd(trimmed);
        if (format === 'dmy') return tryDmy(trimmed);
        if (format === 'mdy') return tryMdy(trimmed);

        return tryYmd(trimmed) || tryDmy(trimmed) || tryMdy(trimmed);
    };

    const processGenericFile = async (file: File) => {
        try {
            const text = await file.text();
            const { headers, rows } = parseGenericCsv(text);
            const guess = guessMappingFromHeaders(headers, rows);
            setGenericFileName(file.name);
            setGenericHeaders(headers);
            setGenericRows(rows);
            setGenericMapping(guess.mapping);
            if (guess.dateFormat !== 'auto') {
                setGenericDateFormat(guess.dateFormat);
            } else {
                setGenericDateFormat('auto');
            }
            setGenericImportSummary(null);
            setGenericDefaultCurrency(project?.settings.baseCurrency || 'EUR');
            setGenericStep('mapping');
            setShowGenericPreview(false);
        } catch (e) {
            console.error(e);
            setGenericFileName(file.name);
            setGenericHeaders([]);
            setGenericRows([]);
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

        let updatedProject: ProjectData | null = null;

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

            updatedProject = {
                ...prev,
                portfolios: updatedPortfolios,
                transactions: [...prev.transactions, ...mappedTxs],
                securities: updatedSecurities,
                cashAccounts: Array.from(cashAccountMap.values()),
                modified: new Date().toISOString()
            };
            return updatedProject;
        });

        if (updatedProject) {
            void syncMarket(true, { full: true, projectOverride: updatedProject });
        }

        setImportStatus('success');
        setTimeout(() => {
            onClose();
        }, 1000);
    };

    const currencies = useMemo(() => {
        return getCurrencyOptions(project?.fxData);
    }, [project?.fxData]);

    const headerOptions = useMemo(() => {
        return genericHeaders.filter((h) => h && h.length > 0);
    }, [genericHeaders]);

    const isGenericMappingReady = Boolean(
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

    const buildGenericTransactions = (): { transactions: Transaction[]; errors: string[] } => {
        const errors: string[] = [];
        if (!genericHeaders.length || !genericRows.length) {
            errors.push('Keine CSV-Daten geladen.');
            return { transactions: [], errors };
        }

        if (!genericMapping.date || !genericMapping.identifier || !genericMapping.shares || !genericMapping.price) {
            errors.push('Bitte Datum, Identifier, Anzahl und Preis zuordnen.');
            return { transactions: [], errors };
        }

        const dateIdx = genericHeaders.indexOf(genericMapping.date);
        const identifierIdx = genericHeaders.indexOf(genericMapping.identifier);
        const sharesIdx = genericHeaders.indexOf(genericMapping.shares);
        const priceIdx = genericMapping.price ? genericHeaders.indexOf(genericMapping.price) : -1;
        const currencyIdx = genericMapping.currency ? genericHeaders.indexOf(genericMapping.currency) : -1;
        const usedIdx = new Set<number>([dateIdx, identifierIdx, sharesIdx, priceIdx, currencyIdx].filter((v) => v >= 0));
        const nameIdx = detectNameHeaderIndex(genericHeaders, usedIdx);

        const transactions: Transaction[] = [];

        genericRows.forEach((row, index) => {
            const dateRaw = row[dateIdx] ?? '';
            const identifierRaw = row[identifierIdx] ?? '';
            const sharesRaw = row[sharesIdx] ?? '';

            const dateValue = parseDateValue(dateRaw, genericDateFormat);
            const identifierValue = identifierRaw.trim().toUpperCase();
            const sharesValue = parseNumberFlexible(sharesRaw);
            if (!identifierValue || !dateValue || !sharesValue) {
                errors.push(`Zeile ${index + 2}: Pflichtfelder fehlen.`);
                return;
            }

            const currencyValue = currencyIdx >= 0 ? (row[currencyIdx] ?? '').trim().toUpperCase() : genericDefaultCurrency;
            const nameValue = nameIdx >= 0 ? (row[nameIdx] ?? '').trim() : '';
            const priceRaw = priceIdx >= 0 ? (row[priceIdx] ?? '').toString().trim() : '';
            const priceValue = priceIdx >= 0 ? parseNumberFlexible(row[priceIdx] ?? '') : 0;
            const isSell = sharesValue < 0;
            const absShares = Math.abs(sharesValue);
            if (!absShares) {
                errors.push(`Zeile ${index + 2}: Preis oder Anzahl ungueltig.`);
                return;
            }

            const hasExplicitPrice = priceRaw.length > 0;
            if (!hasExplicitPrice) {
                errors.push(`Zeile ${index + 2}: Preis oder Anzahl ungueltig.`);
                return;
            }

            const signedAmount = isSell ? absShares * (priceValue || 0) : -(absShares * priceValue);

            transactions.push({
                id: crypto.randomUUID(),
                date: dateValue,
                type: isSell ? 'Sell' : 'Buy',
                isin: identifierValue,
                name: nameValue || identifierValue,
                shares: isSell ? -absShares : absShares,
                amount: signedAmount,
                currency: currencyValue || genericDefaultCurrency,
                broker: 'Manual',
                originalData: { manualEntry: true, pricePerShare: priceValue, csvRow: row }
            });
        });

        return { transactions, errors };
    };

    const commitGenericImport = () => {
        const { transactions, errors } = buildGenericTransactions();
        if (transactions.length === 0) {
            setGenericImportSummary({
                imported: 0,
                skipped: genericRows.length,
                errors: errors.length ? errors.slice(0, 3) : ['Keine gueltigen Zeilen gefunden.']
            });
            return;
        }

        let updatedProject: ProjectData | null = null;

        updateProject(prev => {
            const portfolios = prev.portfolios || [];
            const target = getTargetPortfolioId(portfolios);
            let updatedPortfolios = portfolios;
            if (target.isNew && !updatedPortfolios.find(p => p.id === target.id)) {
                updatedPortfolios = [...portfolios, { id: target.id, name: target.name }];
            }

            const updatedTransactions = [...prev.transactions];
            const updatedSecurities = { ...prev.securities };

            transactions.forEach((tx) => {
                const securityKey = tx.isin;
                if (!securityKey) return;

                const existing = updatedSecurities[securityKey];
                updatedTransactions.push({ ...tx, isin: securityKey, portfolioId: target.id });

                updatedSecurities[securityKey] = {
                    isin: securityKey,
                    symbol: existing?.symbol || securityKey,
                    name: existing?.name || tx.name || securityKey,
                    currency: existing?.currency || tx.currency,
                    quoteType: existing?.quoteType || 'Stock',
                    priceHistory: existing?.priceHistory || {},
                    symbolStatus: existing?.symbolStatus,
                    symbolSource: existing?.symbolSource,
                    symbolLastTried: existing?.symbolLastTried,
                    ignoreMarketData: existing?.ignoreMarketData,
                    dividendHistory: existing?.dividendHistory || [],
                    upcomingDividends: existing?.upcomingDividends || [],
                    dividendHistorySynced: existing?.dividendHistorySynced
                };
            });

            updatedProject = {
                ...prev,
                portfolios: updatedPortfolios,
                transactions: updatedTransactions,
                securities: updatedSecurities,
                modified: new Date().toISOString()
            };
            return updatedProject;
        });

        if (updatedProject) {
            void syncMarket(true, { full: true, projectOverride: updatedProject });
        }

        setGenericImportSummary({
            imported: transactions.length,
            skipped: genericRows.length - transactions.length,
            errors: errors.slice(0, 3)
        });
    };

    if (!isOpen) return null;

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
            console.error(e);
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
                    symbolStatus: options.ignoreMarketData
                        ? 'ignored'
                        : options.resolvedSymbol
                            ? 'resolved'
                            : 'unresolved',
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

    const searchCompanyMatches = async (query: string): Promise<CompanyMatch[]> => {
        const res = await fetch('/api/ticker-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.matches) ? data.matches : [];
    };

    const handleCompanySearch = async () => {
        if (!companyQuery.trim()) return;
        setIsCompanySearching(true);
        setCompanySearchMessage(null);
        setCompanyMatches([]);

        const matches = await searchCompanyMatches(companyQuery.trim());
        setIsCompanySearching(false);

        if (!matches.length) {
            setCompanySearchMessage('Kein Treffer gefunden.');
            return;
        }

        setCompanyMatches(matches);
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

            <div className="p-5 pt-4 flex-1 overflow-y-auto custom-scrollbar md:overflow-visible">
                {activeTab === 'import' ? (
                    <div className="space-y-5">
                        <div className="md3-segment flex w-full items-center gap-1 p-1">
                            <button
                                type="button"
                                onClick={() => setImportMode('generic')}
                                className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${importMode === 'generic'
                                    ? 'md3-chip-tonal'
                                    : 'md3-text-muted hover:opacity-90'
                                    }`}
                            >
                                CSV mit Spaltenzuordnung
                            </button>
                            <button
                                type="button"
                                onClick={() => setImportMode('template')}
                                className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${importMode === 'template'
                                    ? 'md3-chip-tonal'
                                    : 'md3-text-muted hover:opacity-90'
                                    }`}
                            >
                                Broker Templates
                            </button>
                        </div>

                        {importMode === 'generic' ? (
                            <div className="space-y-4">
                                <div className="md3-segment flex w-full items-center gap-1 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setGenericStep('upload')}
                                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${genericStep === 'upload'
                                            ? 'md3-chip-tonal'
                                            : 'md3-text-muted hover:opacity-90'
                                            }`}
                                    >
                                        1. Upload
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setGenericStep('mapping')}
                                        disabled={genericHeaders.length === 0}
                                        className={`flex-1 px-3 py-2 text-xs font-semibold transition-all ${genericStep === 'mapping'
                                            ? 'md3-chip-tonal'
                                            : 'md3-text-muted hover:opacity-90'} ${genericHeaders.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        2. Zuordnung
                                    </button>
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
                                            <div className="md3-list-item p-4 flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold md3-text-main">Datei bereit</div>
                                                    <div className="text-xs md3-text-muted">{genericFileName}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setGenericStep('mapping')}
                                                    className="md3-filled-btn px-4 py-2 text-sm font-semibold"
                                                >
                                                    Weiter zur Zuordnung
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {genericStep === 'mapping' && genericHeaders.length > 0 && (
                                    <div className="md3-list-item p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm font-semibold md3-text-main">Spalten zuordnen</div>
                                            <div className="text-xs md3-text-muted">{genericFileName}</div>
                                        </div>
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
                                        </div>
                                        <div className="text-xs md3-text-muted">
                                            Hinweis: Negative Anzahl wird als Verkauf interpretiert, positive als Kauf.
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                        Importiert: {genericImportSummary.imported} - Uebersprungen: {genericImportSummary.skipped}
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
                            {importStatus === 'success' ? 'Erfolgreich!' : 'Import starten'}
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
            <div className="md3-card w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] md:max-h-none rounded-[28px]">
                {renderContent()}
            </div>
            {isCompanySearchOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsCompanySearchOpen(false)}>
                    <div className="md3-card w-full max-w-lg rounded-[24px] p-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold md3-text-main">Firmennamen suchen</h3>
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
                                placeholder="Firmennamen eingeben (z.B. Apple)"
                                className="md3-field w-full px-3 py-2 text-sm outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleCompanySearch}
                                disabled={isCompanySearching || !companyQuery.trim()}
                                className="md3-filled-btn px-4 py-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isCompanySearching ? 'Suche...' : 'Suchen'}
                            </button>
                        </div>

                        {companySearchMessage && (
                            <div className="mt-3 text-xs md3-text-muted">{companySearchMessage}</div>
                        )}

                        {companyMatches.length > 0 && (
                            <div className="mt-4 rounded-xl border border-white/10 bg-black/5 p-2">
                                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider md3-text-muted">
                                    <span>Treffer ({companyMatches.length})</span>
                                    <span>Scrollen fuer mehr</span>
                                </div>
                                <div className="max-h-64 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                                    {companyMatches.map(match => (
                                        <div key={match.symbol} className="md3-list-item flex items-center justify-between gap-3 px-3 py-2">
                                            <div className="min-w-0">
                                                <div className="text-sm md3-text-main font-medium truncate">{match.name || match.symbol}</div>
                                                <div className="text-xs md3-text-muted">
                                                    <span>{match.symbol}</span>
                                                    {match.exchange && <span> - {match.exchange}</span>}
                                                    {match.currency && <span> - {match.currency}</span>}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSelectCompanyMatch(match)}
                                                className="md3-filled-btn px-3 py-1.5 text-xs font-semibold"
                                            >
                                                Uebernehmen
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
