"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  PieChart,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Calendar,
  Settings,
  Bell,
  Plus,
  Search,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  Globe,
  Activity,
  AlertCircle,
  PiggyBank,
  CalendarCheck,
  Timer,
  Check,
  Coins,
  Banknote,
  Upload,
  FileText,
  CloudUpload,
  Loader2,
  FileCheck,
  Database,
  Save,
  LogOut,
  FolderOpen
} from 'lucide-react';
import {
  AreaChart,
  Area,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import { useMemo } from 'react';
import { calculateHoldings, calculatePortfolioHistory, type Holding } from '@/lib/portfolioUtils';
import { calculateAnalysisMetrics } from '@/lib/analysisService';
import { CurrencyService } from '@/lib/currencyService';
import { useProject } from '@/contexts/ProjectContext';
import { ProjectLauncher } from '@/components/ProjectLauncher';
import { DataSourcesContent } from '@/components/DataSourcesContent';
import { SimpleAreaChart } from '@/components/SimpleAreaChart';
import { AllocationChart } from '@/components/AllocationChart';
import { ImportContent } from '@/components/ImportContent';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { TransactionModal } from '@/components/TransactionModal';
import { ReturnChartModal } from '@/components/ReturnChartModal';


// --- Mock Data ---

const portfolioData = {
  totalValue: 142580.45,
  investedCapital: 112000.00,
  totalReturn: 30580.45,
  totalReturnPercent: 27.3,
  dayChange: 1240.50,
  dayChangePercent: 0.87,
};

const historyData = [
  { date: 'Jan', value: 112000 },
  { date: 'Feb', value: 115000 },
  { date: 'Mär', value: 113500 },
  { date: 'Apr', value: 118000 },
  { date: 'Mai', value: 122000 },
  { date: 'Jun', value: 121000 },
  { date: 'Jul', value: 128000 },
  { date: 'Aug', value: 132000 },
  { date: 'Sep', value: 129000 },
  { date: 'Okt', value: 135000 },
  { date: 'Nov', value: 139000 },
  { date: 'Dez', value: 142580 },
];



const holdings = [
  { id: 1, name: 'Vanguard FTSE All-World', ticker: 'VWCE', type: 'ETF', value: 65400.20, shares: 620, change: 1.2, color: 'bg-orange-500' },
  { id: 2, name: 'Apple Inc.', ticker: 'AAPL', type: 'Aktie', value: 15200.50, shares: 85, change: -0.4, color: 'bg-gray-100' },
  { id: 3, name: 'Microsoft Corp.', ticker: 'MSFT', type: 'Aktie', value: 12800.10, shares: 42, change: 2.1, color: 'bg-blue-600' },
  { id: 4, name: 'Bitcoin', ticker: 'BTC', type: 'Krypto', value: 8500.00, shares: 0.15, change: 4.5, color: 'bg-yellow-500' },
  { id: 5, name: 'iShares Core S&P 500', ticker: 'SXR8', type: 'ETF', value: 19600.00, shares: 45, change: 0.8, color: 'bg-black' },
  { id: 6, name: 'Ethereum', ticker: 'ETH', type: 'Krypto', value: 5500.00, shares: 2.5, change: -1.2, color: 'bg-indigo-500' },
];

// Analysis Data
const monthlyReturns = [
  { month: 'Jan', return: 2.4 },
  { month: 'Feb', return: -1.2 },
  { month: 'Mär', return: 0.8 },
  { month: 'Apr', return: 3.5 },
  { month: 'Mai', return: -0.5 },
  { month: 'Jun', return: 1.2 },
  { month: 'Jul', return: 4.1 },
  { month: 'Aug', return: 0.2 },
  { month: 'Sep', return: -2.1 },
  { month: 'Okt', return: 1.8 },
  { month: 'Nov', return: 2.9 },
  { month: 'Dez', return: 1.5 },
];



// Dividend Data
const dividendMonthly = [
  { month: 'Jan', current: 120, prev: 85 },
  { month: 'Feb', current: 45, prev: 30 },
  { month: 'Mär', current: 210, prev: 180 },
  { month: 'Apr', current: 15, prev: 10 },
  { month: 'Mai', current: 320, prev: 250 },
  { month: 'Jun', current: 180, prev: 160 },
  { month: 'Jul', current: 55, prev: 40 },
  { month: 'Aug', current: 25, prev: 20 },
  { month: 'Sep', current: 190, prev: 150 },
  { month: 'Okt', current: 0, prev: 10, forecast: 45 }, // Forecast example
  { month: 'Nov', current: 0, prev: 25, forecast: 30 },
  { month: 'Dez', current: 0, prev: 140, forecast: 160 },
];

const upcomingDividends = [
  { id: 1, name: 'Coca-Cola Co.', ticker: 'KO', payDate: '15. Okt', amount: 12.50, status: 'Bestätigt', color: 'bg-red-500' },
  { id: 2, name: 'Realty Income', ticker: 'O', payDate: '15. Okt', amount: 8.40, status: 'Prognose', color: 'bg-blue-700' },
  { id: 3, name: 'Apple Inc.', ticker: 'AAPL', payDate: '14. Nov', amount: 5.20, status: 'Prognose', color: 'bg-gray-100' },
  { id: 4, name: 'Microsoft', ticker: 'MSFT', payDate: '10. Dez', amount: 14.10, status: 'Prognose', color: 'bg-blue-500' },
];

const recentDividends = [
  { id: 1, name: 'Vanguard FTSE All-World', date: '28. Sep', amount: 154.20, type: 'Ausschüttung' },
  { id: 2, name: 'Johnson & Johnson', date: '08. Sep', amount: 24.50, type: 'Dividende' },
  { id: 3, name: 'Unilever PLC', date: '02. Sep', amount: 18.90, type: 'Dividende' },
  { id: 4, name: 'Realty Income', date: '15. Aug', amount: 8.35, type: 'Dividende' },
  { id: 5, name: 'Apple Inc.', date: '12. Aug', amount: 4.80, type: 'Dividende' },
];

const brokers = [
  "Trade Republic",
  "Scalable Capital",
  "ING DiBa",
  "Comdirect",
  "Consorsbank",
  "Interactive Brokers",
  "Flatex",
  "Coinbase"
];


// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${active
      ? 'bg-emerald-500/10 text-emerald-400 font-medium'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
  >
    <Icon size={20} />
    <span>{label}</span>
  </button>
);

export const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 ${className}`}>
    {children}
  </div>
);



// --- Updated Modal Component (File Import) ---
const LegacyTransactionModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [selectedBroker, setSelectedBroker] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setSelectedBroker('');
      setFile(null);
      setUploadStatus('idle');
    }
  }, [isOpen]);

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
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (uploadedFile: File) => {
    setFile(uploadedFile);
    // Simulate upload/parsing process
    setUploadStatus('uploading');
    setTimeout(() => {
      setUploadStatus('success');
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CloudUpload className="text-emerald-500" size={24} />
            Portfolio Import
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">

          {/* Step 1: Broker Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">1. Broker auswählen</label>
            <div className="relative">
              <select
                value={selectedBroker}
                onChange={(e) => setSelectedBroker(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 px-4 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition cursor-pointer"
              >
                <option value="" disabled>Bitte wählen...</option>
                {brokers.map(broker => (
                  <option key={broker} value={broker}>{broker}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <ChevronRight className="rotate-90" size={16} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Der passende Parser wird automatisch für den gewählten Broker aktiviert.
            </p>
          </div>

          {/* Step 2: Dropzone */}
          <div className={`space-y-2 transition-opacity duration-300 ${!selectedBroker ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <label className="text-sm font-medium text-slate-300">2. Datei hochladen (PDF oder CSV)</label>

            {uploadStatus === 'idle' && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer bg-slate-900/20 group
                        ${isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-900/50'}
                    `}
              >
                <input
                  type="file"
                  accept=".pdf,.csv"
                  className="hidden"
                  id="file-upload"
                  onChange={handleFileInput}
                />
                <label htmlFor="file-upload" className="flex flex-col items-center cursor-pointer w-full h-full">
                  <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="text-emerald-500" size={24} />
                  </div>
                  <p className="text-slate-300 font-medium mb-1">Datei hier ablegen</p>
                  <p className="text-xs text-slate-500">oder klicken zum Auswählen</p>
                </label>
              </div>
            )}

            {uploadStatus === 'uploading' && (
              <div className="border border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-slate-900/50">
                <Loader2 className="text-emerald-500 animate-spin mb-3" size={32} />
                <p className="text-slate-300 font-medium">Analysiere Datei...</p>
                <p className="text-xs text-slate-500 mt-1">{file?.name}</p>
              </div>
            )}

            {uploadStatus === 'success' && (
              <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-xl p-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-slate-900 shrink-0">
                  <FileCheck size={20} strokeWidth={3} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-emerald-400 font-medium">Analyse erfolgreich!</p>
                  <p className="text-xs text-emerald-500/70 truncate">{file?.name}</p>
                </div>
                <button onClick={() => setUploadStatus('idle')} className="text-xs text-slate-400 hover:text-white underline">
                  Ändern
                </button>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-3">
            <Activity className="text-blue-400 shrink-0 mt-0.5" size={16} />
            <div className="text-xs text-slate-300">
              Unser Algorithmus extrahiert Transaktionsdaten (Kauf, Verkauf, Dividenden, Steuern) automatisch lokal in deinem Browser. Deine Daten verlassen nie dein Gerät.
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-end space-x-3 bg-slate-800 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-slate-300 hover:bg-slate-700 hover:text-white transition font-medium"
          >
            Abbrechen
          </button>
          <button
            disabled={uploadStatus !== 'success'}
            className={`px-5 py-2.5 rounded-xl text-white shadow-lg transition font-medium flex items-center
                ${uploadStatus === 'success'
                ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20 cursor-pointer'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
            `}
          >
            {uploadStatus === 'success' ? '3 Transaktionen importieren' : 'Import starten'}
          </button>
        </div>
      </div>
    </div>
  );
};


import { SecurityDetailModal } from '@/components/SecurityDetailModal';
import { syncProjectQuotes, repairProjectSecurities } from '@/lib/marketDataService';

// --- Main Application ---

export default function PortfolioApp() {
  const { isLoaded, closeProject, saveProject, project, isModified, updateProject } = useProject();
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('1M');
  const [selectedPortfolioIds, setSelectedPortfolioIds] = useState<string[]>([]); // Empty array = All
  const [selectedSecurityIsin, setSelectedSecurityIsin] = useState<string | null>(null);
  const [analysisCache, setAnalysisCache] = useState<any>(null);

  // State for Import Flow
  const [importTargetPortfolio, setImportTargetPortfolio] = useState<{ id: string; name: string; isNew: boolean } | null>(null);

  // Invalidate cache when project data changes
  useEffect(() => {
    setAnalysisCache(null);
  }, [project]);

  // Sync Market Data on Load (and auto-repair)
  useEffect(() => {
    if (isLoaded && project) {
      // 1. Repair missing securities if any
      const repaired = repairProjectSecurities(project);

      // 2. Sync Quotes
      syncProjectQuotes(repaired).then(updated => {
        // If either repair or sync changed the project, update context
        if (updated !== project) {
          updateProject(() => updated);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, project?.id]); // Run once per project load

  // Show Launcher if no project is loaded
  if (!isLoaded) {
    return <ProjectLauncher />;
  }

  const handleCacheUpdate = (data: any) => {
    setAnalysisCache(data);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard':
        return <DashboardContent timeRange={timeRange} setTimeRange={setTimeRange} selectedPortfolioIds={selectedPortfolioIds} onSelectSecurity={setSelectedSecurityIsin} />;
      case 'Portfolio':
        return <PortfolioList selectedPortfolioIds={selectedPortfolioIds} onSelectSecurity={setSelectedSecurityIsin} />;
      case 'Analyse':
        return <AnalysisContent selectedPortfolioIds={selectedPortfolioIds} cachedData={analysisCache} onCacheUpdate={handleCacheUpdate} />;
      case 'Dividenden':
        return <DividendenContent selectedPortfolioIds={selectedPortfolioIds} />;
      case 'Datenquellen':
        return <DataSourcesContent />;
      case 'Import':
        return (
          <ImportContent
            onContinue={(portfolioId, isNew, newName) => {
              // 1. Set the target for the modal
              setImportTargetPortfolio({
                id: portfolioId,
                name: isNew ? (newName || 'Neues Depot') : (project?.portfolios.find(p => p.id === portfolioId)?.name || 'Unbekannt'),
                isNew: isNew
              });
              // 2. Open the modal
              setIsTransactionModalOpen(true);
            }}
          />
        );
      default:
        return <div className="text-slate-400 p-8 text-center">In Entwicklung...</div>;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden selection:bg-emerald-500/30">

      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 bg-slate-900/50 backdrop-blur-sm p-4">
        <div className="flex items-center space-x-2 px-4 mb-10 mt-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <TrendingUp size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">FinFolio</span>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem icon={LayoutDashboard} label="Übersicht" active={activeTab === 'Dashboard'} onClick={() => setActiveTab('Dashboard')} />
          <SidebarItem icon={PieChart} label="Analyse" active={activeTab === 'Analyse'} onClick={() => setActiveTab('Analyse')} />
          <SidebarItem icon={Wallet} label="Wertpapiere" active={activeTab === 'Portfolio'} onClick={() => setActiveTab('Portfolio')} />
          <SidebarItem icon={Calendar} label="Dividenden" active={activeTab === 'Dividenden'} onClick={() => setActiveTab('Dividenden')} />
          <SidebarItem icon={Database} label="Datenquellen" active={activeTab === 'Datenquellen'} onClick={() => setActiveTab('Datenquellen')} />
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800 space-y-2">
          <button
            onClick={saveProject}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${isModified ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
          >
            <Save size={20} />
            <span>{isModified ? 'Speichern *' : 'Gespeichert'}</span>
          </button>

          <button
            onClick={closeProject}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
          >
            <LogOut size={20} />
            <span>Schließen</span>
          </button>

          <div className="mt-4 px-4 py-3 bg-slate-800 rounded-xl flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-linear-to-tr from-emerald-400 to-blue-500 flex items-center justify-center font-bold text-white text-xs">
              {project?.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{project?.name}</p>
              <p className="text-xs text-slate-400 truncate">Lokal</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-y-auto">

        {/* Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
          <div className="flex items-center md:hidden">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 -ml-2 text-slate-400">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <span className="ml-2 text-lg font-bold text-white">FinFolio</span>
          </div>

          <div className="hidden md:block">
            <h1 className="text-xl font-semibold text-white">{activeTab}</h1>
            <p className="text-sm text-slate-400">Willkommen zurück, Max.</p>
          </div>

          <div className="flex items-center space-x-4">
            {/* Base Currency Selector */}
            <div className="hidden sm:flex items-center space-x-2 bg-slate-800 rounded-lg px-2 py-1">
              <span className="text-xs text-slate-400 font-medium">Währung:</span>
              <select
                value={project?.settings?.baseCurrency || 'EUR'}
                onChange={(e) => {
                  if (updateProject) {
                    updateProject(prev => ({
                      ...prev,
                      settings: { ...prev.settings, baseCurrency: e.target.value }
                    }));
                  }
                }}
                className="bg-transparent text-sm font-bold text-white outline-none border-none focus:ring-0 cursor-pointer py-1"
              >
                <option value="EUR" className="bg-slate-800">EUR</option>
                <option value="USD" className="bg-slate-800">USD</option>
                <option value="CHF" className="bg-slate-800">CHF</option>
                <option value="GBP" className="bg-slate-800">GBP</option>
              </select>
            </div>

            {/* Portfolio Filter */}
            {project?.portfolios && project.portfolios.length > 0 && (
              <MultiSelectDropdown
                options={project.portfolios}
                selectedIds={selectedPortfolioIds}
                onChange={setSelectedPortfolioIds}
              />
            )}

            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="ISIN, Name suchen..."
                className="bg-slate-800 border-none rounded-full py-2 pl-10 pr-4 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none w-64 placeholder-slate-500"
              />
            </div>
            <button className="p-2 text-slate-400 hover:text-white relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full border border-slate-900"></span>
            </button>
            <button
              onClick={() => setActiveTab('Import')}
              className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-emerald-500/20 text-sm"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Import</span>
            </button>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-8 space-y-6 w-full max-w-none" >
          {renderContent()}
        </div >

        {/* Security Detail Modal */}
        {selectedSecurityIsin && project?.securities?.[selectedSecurityIsin] && (
          <SecurityDetailModal
            isOpen={!!selectedSecurityIsin}
            onClose={() => setSelectedSecurityIsin(null)}
            security={project.securities[selectedSecurityIsin]}
            transactions={project.transactions}
            currency={project.settings.baseCurrency}
          />
        )}
      </main>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900 p-4 md:hidden">
          <div className="flex justify-between items-center mb-8">
            <span className="text-xl font-bold text-white">FinFolio</span>
            <button onClick={() => setMobileMenuOpen(false)}><X className="text-white" /></button>
          </div>
          <nav className="space-y-4">
            <SidebarItem icon={LayoutDashboard} label="Übersicht" active={activeTab === 'Dashboard'} onClick={() => { setActiveTab('Dashboard'); setMobileMenuOpen(false) }} />
            <SidebarItem icon={Wallet} label="Wertpapiere" active={activeTab === 'Portfolio'} onClick={() => { setActiveTab('Portfolio'); setMobileMenuOpen(false) }} />
            <SidebarItem icon={PieChart} label="Analyse" active={activeTab === 'Analyse'} onClick={() => { setActiveTab('Analyse'); setMobileMenuOpen(false) }} />
            <SidebarItem icon={Calendar} label="Dividenden" active={activeTab === 'Dividenden'} onClick={() => { setActiveTab('Dividenden'); setMobileMenuOpen(false) }} />
            <SidebarItem icon={Database} label="Datenquellen" active={activeTab === 'Datenquellen'} onClick={() => { setActiveTab('Datenquellen'); setMobileMenuOpen(false) }} />
          </nav>
        </div>
      )}

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        targetPortfolio={importTargetPortfolio}
      />

    </div>
  );
}

// --- Sub-Components ---

const DashboardContent = ({ timeRange, setTimeRange, selectedPortfolioIds, onSelectSecurity }: { timeRange: string, setTimeRange: (range: string) => void, selectedPortfolioIds: string[], onSelectSecurity: (isin: string) => void }) => {
  const { project } = useProject();
  const [chartMode, setChartMode] = useState<'value' | 'performance'>('value');
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const [dividendRange, setDividendRange] = useState<'YTD' | '1J'>('YTD');

  // Filter transactions based on selected Portfolio
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioIds.length === 0) return project.transactions; // All
    return project.transactions.filter(t => t.portfolioId && selectedPortfolioIds.includes(t.portfolioId));
  }, [project, selectedPortfolioIds]);

  const { holdings, realizedPnL } = useMemo(() => {
    if (!project) return { holdings: [], realizedPnL: 0 };

    // Extract latest quotes from securities history
    const quotes: Record<string, number> = {};
    if (project.securities) {
      Object.values(project.securities).forEach(sec => {
        if (sec.priceHistory) {
          const dates = Object.keys(sec.priceHistory).sort();
          if (dates.length > 0) {
            const lastDate = dates[dates.length - 1];
            quotes[sec.isin] = sec.priceHistory[lastDate];
          }
        }
      });
    }

    return calculateHoldings(
      filteredTransactions,
      Object.values(project.securities || {}),
      quotes, // Pass real quotes
      project.fxData.rates, // fxRates
      project.settings.baseCurrency // Pass selected base currency
    );
  }, [project, filteredTransactions]);

  // Calculate portfolio history for chart
  const historyData = useMemo(() => {
    if (!project) return [];

    return calculatePortfolioHistory(
      filteredTransactions,
      Object.values(project.securities || {}),
      project.fxData.rates,
      project.settings.baseCurrency,
      timeRange
    );
  }, [project, filteredTransactions, timeRange]);

  const displayData = useMemo(() => {
    if (chartMode === 'value') return historyData;

    // Performance mode: Calculate TWR (Time Weighted Return)
    // This matches Value % change if no cashflows, and handles cashflows correctly without jumps.

    if (historyData.length === 0) return [];

    // Period Money-Weighted Return (MWR) Logic
    // Formula: ((Val_Curr - Val_Start) - (Inv_Curr - Inv_Start)) / (Val_Start + (Inv_Curr - Inv_Start))

    // Get baseline values at start of period
    const startPoint = historyData[0];
    let startValue = startPoint.value;
    const startInvested = startPoint.invested || 0;

    // Detect if this is the start of the entire history (First Transaction)
    // If so, we want to baseline against Initial Investment to capture Day 1 Alpha.
    // This applies to MAX view OR any view (5J, 3J) that covers the inception date.
    let isStartOfHistory = timeRange === 'MAX';

    if (!isStartOfHistory && filteredTransactions.length > 0) {
      const firstTxDateStr = filteredTransactions.reduce((min, t) => t.date < min ? t.date : min, '9999-12-31');
      const firstTxTime = new Date(firstTxDateStr).setHours(0, 0, 0, 0);
      const startTime = new Date(startPoint.date).setHours(0, 0, 0, 0);
      // Allow 24h buffer for timezone diffs or exact match
      if (Math.abs(startTime - firstTxTime) < 86400000) {
        isStartOfHistory = true;
      }
    }

    if (isStartOfHistory && startInvested > 0) {
      startValue = startInvested;
    }

    return historyData.map((point, index) => {
      // For the very first point: MWR starts at 0% usually.
      // Special Case: If this is the Start of History (MAX/5J/etc covering inception),
      // we want Standard MWR definition (Value - Invested) / Invested to show Day 1 Alpha immediately.
      if (index === 0) {
        if (isStartOfHistory) {
          const inv = point.invested || 0;
          if (inv > 0) return { ...point, value: ((point.value - inv) / inv) * 100 };
          return { ...point, value: 0 };
        }
        return { ...point, value: 0 };
      }

      const currValue = point.value;
      const currInvested = point.invested || 0;

      const deltaInvested = currInvested - startInvested;
      const capitalAtWork = startValue + deltaInvested;

      let percent = 0;
      if (capitalAtWork > 0) {
        // Profit made strictly within this period = (Val_Curr - Val_Start) - Net_New_Cash
        const profitPeriod = (currValue - startValue) - deltaInvested;
        percent = (profitPeriod / capitalAtWork) * 100;
      }

      return {
        ...point,
        value: percent
      };
    });
    /* 
    const twrData = [];

    // Initialize performance
    let runningPerformance = 1.0;
    let startPercent = 0;

    // For MAX view: Capture the "Day 1" intraday/IPO performance relative to cost basis
    // If I buy at 100 and close at 131, Day 1 is +31%.
    if (timeRange === 'MAX' && historyData[0].invested > 0) {
      runningPerformance = historyData[0].value / historyData[0].invested;
      startPercent = (runningPerformance - 1) * 100;
    }

    twrData.push({ ...historyData[0], value: startPercent });

    for (let i = 1; i < historyData.length; i++) {
      const prev = historyData[i - 1];
      const curr = historyData[i];

      const prevValue = prev.value;
      const currValue = curr.value;

      const prevInvested = prev.invested || 0;
      const currInvested = curr.invested || 0;

      const cashFlow = currInvested - prevInvested;

      // Robust TWR Formula for Daily Data:
      // Assumes CashFlow happens at Start-Of-Day (or effectively before Close)
      // This correctly handles the "First Buy" (Prev=0, CF=10k) and subsequent flows.
      // R = EndValue / (StartValue + CashFlow) - 1

      let periodReturn = 0;
      const costBasis = prevValue + cashFlow;

      if (costBasis > 0) {
        periodReturn = (currValue / costBasis) - 1;
      }

      runningPerformance *= (1 + periodReturn);

      twrData.push({
        ...curr,
        value: (runningPerformance - 1) * 100
      });
    }

    */
  }, [historyData, chartMode, timeRange]);

  const investedCapital = holdings.reduce((sum, h) => sum + (h.quantity * (h.averageBuyPrice || 0)), 0);
  const currentMaketValue = holdings.reduce((sum, h) => sum + h.value, 0);
  // totalReturn = (MarketValue + RealizedPnL) - Invested. (Simplified)
  // Or just MarketValue - Invested for Unrealized.
  // Let's stick to Unrealized for Dashboard Card for now + Realized.
  const totalReturn = (currentMaketValue + realizedPnL) - investedCapital;
  const totalReturnPercent = investedCapital > 0 ? (totalReturn / investedCapital) * 100 : 0;

  // Day change is missing real data source (need quotes). Mocking 0 for now or calculating if we had Yest Close.
  const dayChangePercent = 0;

  const chartMetrics = useMemo(() => {
    let badgeValue = 0;
    let color = '#10b981';

    if (displayData.length > 1) {
      const firstPoint = displayData[0];
      const lastPoint = displayData[displayData.length - 1];

      if (chartMode === 'value') {
        badgeValue = lastPoint.value - firstPoint.value;
      } else {
        badgeValue = lastPoint.value;
      }

      if (badgeValue < 0) {
        color = '#f43f5e';
      }
    }
    return { badgeValue, color };
  }, [displayData, chartMode]);

  const dividendSummary = useMemo(() => {
    if (!project) {
      return {
        ytdValue: 0,
        nextPayout: null as null | { name: string; amount: number; date: string },
        monthlyBars1J: new Array(12).fill(0),
        monthlyBarsYTD: [],
        isTheoretical: false
      };
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    const dividendsTx = filteredTransactions.filter(t => t.type === 'Dividend');

    const convertToBaseAtDate = (amount: number, currency: string, date: string) => {
      if (currency === baseCurrency) return amount;
      const rateFrom = CurrencyService.getRate(project.fxData, currency, date) || 1;
      const amountEur = amount / rateFrom;
      if (baseCurrency === 'EUR') return amountEur;
      const rateTo = CurrencyService.getRate(project.fxData, baseCurrency, date) || 1;
      return amountEur * rateTo;
    };

    const getLatestRate = (currency: string): number => {
      const fxBase = project.fxData.baseCurrency || 'EUR';
      if (currency === fxBase) return 1;
      const rates = project.fxData.rates[currency];
      if (!rates) return 1;
      const dates = Object.keys(rates).sort().reverse();
      return rates[dates[0]] || 1;
    };

    const convertToBaseLatest = (amount: number, currency: string) => {
      if (currency === baseCurrency) return amount;
      const rateOrg = getLatestRate(currency);
      const inEur = amount / rateOrg;
      const rateBase = getLatestRate(baseCurrency);
      return baseCurrency === 'EUR' ? inEur : inEur * rateBase;
    };

    const monthKeys1J: string[] = [];
    const monthKeySet = new Set<string>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthKeys1J.push(key);
      monthKeySet.add(key);
    }

    const monthKeysYTD: string[] = [];
    for (let m = 0; m <= today.getMonth(); m++) {
      monthKeysYTD.push(`${today.getFullYear()}-${m}`);
    }

    const monthlyMap: Record<string, number> = {};
    let ytdValue = 0;

    if (dividendsTx.length > 0) {
      dividendsTx.forEach(t => {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const amount = convertToBaseAtDate(Math.abs(t.amount), t.currency, t.date);
        if (d.getFullYear() === currentYear) {
          ytdValue += amount;
        }
        if (monthKeySet.has(key)) {
          monthlyMap[key] = (monthlyMap[key] || 0) + amount;
        }
      });
    } else {
      const txByIsin: Record<string, any[]> = {};
      filteredTransactions.forEach(t => {
        if (!t.isin) return;
        if (!txByIsin[t.isin]) txByIsin[t.isin] = [];
        txByIsin[t.isin].push(t);
      });

      Object.keys(txByIsin).forEach(isin => {
        const sec = project.securities?.[isin];
        if (!sec || !sec.dividendHistory) return;
        const secTx = (txByIsin[isin] || []).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        sec.dividendHistory.forEach((dh: any) => {
          const dDate = new Date(dh.date);
          if (dDate > today) return;

          let sharesAtDate = 0;
          for (const t of secTx) {
            if (new Date(t.date) > dDate) break;
            const qty = Math.abs(t.shares || t.quantity || 0);
            if (t.type === 'Buy' || t.type === 'Sparplan_Buy') sharesAtDate += qty;
            else if (t.type === 'Sell') sharesAtDate -= qty;
          }
          if (sharesAtDate <= 0.0001) return;

          const amount = convertToBaseAtDate(dh.amount * sharesAtDate, sec.currency || 'EUR', dh.date);
          const key = `${dDate.getFullYear()}-${dDate.getMonth()}`;
          if (dDate.getFullYear() === currentYear) {
            ytdValue += amount;
          }
          if (monthKeySet.has(key)) {
            monthlyMap[key] = (monthlyMap[key] || 0) + amount;
          }
        });
      });
    }

    const monthlyBars1J = monthKeys1J.map(key => monthlyMap[key] || 0);
    const monthlyBarsYTD = monthKeysYTD.map(key => monthlyMap[key] || 0);

    const forecastEvents: { date: Date; amount: number; name: string }[] = [];
    holdings.forEach((h: any) => {
      const sec = project.securities?.[h.security.isin];
      if (!sec) return;
      const shares = h.quantity || 0;
      if (shares <= 0) return;
      const secCurrency = sec.currency || 'EUR';

      if (sec.upcomingDividends && Array.isArray(sec.upcomingDividends)) {
        sec.upcomingDividends.forEach((ud: any) => {
          const exDate = new Date(ud.exDate);
          if (exDate.getFullYear() === currentYear && exDate > today) {
            let amount = ud.amount;
            if (!amount && sec.dividendHistory?.length) {
              const sortedHist = [...sec.dividendHistory].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
              amount = sortedHist[0].amount;
            }
            if (amount) {
              const total = amount * shares;
              forecastEvents.push({
                date: exDate,
                amount: convertToBaseLatest(total, secCurrency),
                name: sec.name || h.security.isin
              });
            }
          }
        });
      }

      if (sec.dividendHistory && Array.isArray(sec.dividendHistory)) {
        sec.dividendHistory.forEach((dh: any) => {
          const dDate = new Date(dh.date);
          if (dDate.getFullYear() !== currentYear - 1) return;
          const thisYearDate = new Date(currentYear, dDate.getMonth(), dDate.getDate());
          if (thisYearDate <= today) return;
          const hasUpcoming = forecastEvents.some(e => e.name === (sec.name || h.security.isin) && e.date.getMonth() === dDate.getMonth());
          if (hasUpcoming) return;
          const total = dh.amount * shares;
          forecastEvents.push({
            date: thisYearDate,
            amount: convertToBaseLatest(total, secCurrency),
            name: sec.name || h.security.isin
          });
        });
      }
    });

    forecastEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
    const next = forecastEvents.length > 0 ? forecastEvents[0] : null;

    return {
      ytdValue,
      nextPayout: next ? { name: next.name, amount: next.amount, date: next.date.toLocaleDateString('de-DE') } : null,
      monthlyBars1J,
      monthlyBarsYTD,
      isTheoretical: dividendsTx.length === 0
    };
  }, [project, filteredTransactions, holdings, baseCurrency]);

  // Calculate Allocation Data
  const allocationData = useMemo(() => {
    const groups: Record<string, { value: number; count: number }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      // Normalize type
      let type = h.security.quoteType || 'Sonstige';
      // Yahoo types normalization
      const yahooTypeMap: Record<string, string> = {
        'EQUITY': 'Einzelaktien',
        'ETF': 'ETFs',
        'CRYPTOCURRENCY': 'Krypto',
        'MUTUALFUND': 'Fonds',
        'FUTURE': 'Derivate',
        'INDEX': 'Indizes',
        'CURRENCY': 'Währungen'
      };

      const normalizedType = yahooTypeMap[type.toUpperCase()] || (type === 'Stock' ? 'Einzelaktien' : type);

      if (!groups[normalizedType]) groups[normalizedType] = { value: 0, count: 0 };
      groups[normalizedType].value += h.value;
      groups[normalizedType].count += 1;
      totalValue += h.value;
    });

    // Define colors
    const colorMap: Record<string, string> = {
      'Einzelaktien': '#3b82f6', // blue-500
      'Aktie': '#3b82f6',
      'ETFs': '#10b981', // emerald-500
      'Krypto': '#a855f7', // purple-500
      'Fonds': '#f97316', // orange-500
      'Derivate': '#ef4444', // red-500
      'Sonstige': '#64748b' // slate-500
    };

    return Object.entries(groups)
      .map(([name, data]) => ({
        id: name,
        name,
        value: data.value,
        count: data.count,
        percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
        color: colorMap[name] || '#64748b'
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  // Calculate Sector Data
  const sectorData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const sector = h.security.sector || 'Unbekannt';
      if (!groups[sector]) groups[sector] = { value: 0, holdings: [] };
      groups[sector].value += h.value;
      groups[sector].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [holdings]);

  // Calculate Region Data
  const regionData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const region = h.security.region || h.security.country || 'Unbekannt';
      if (!groups[region]) groups[region] = { value: 0, holdings: [] };
      groups[region].value += h.value;
      groups[region].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [holdings]);

  // Calculate Industry Data (Branche)
  const industryData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const industry = h.security.industry || 'Unbekannt';
      if (!groups[industry]) groups[industry] = { value: 0, holdings: [] };
      groups[industry].value += h.value;
      groups[industry].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [holdings]);

  return (
    <>
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1 md:col-span-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={120} className="text-emerald-500" />
          </div>
          <div className="relative z-10">
            <h3 className="text-slate-400 font-medium mb-1">Gesamtwert Portfolio</h3>
            <div className="flex items-baseline space-x-3">
              <span className="text-4xl font-bold text-white tracking-tight">
                {currentMaketValue.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
              </span>
              <span className={`flex items-center px-2 py-0.5 rounded text-sm font-medium ${dayChangePercent >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                {dayChangePercent >= 0 ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
                {dayChangePercent}%
              </span>
            </div>
            <div className="mt-6 flex gap-8">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Ertrag Gesamt</p>
                <p className={`text-lg font-semibold ${totalReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalReturn > 0 ? '+' : ''}{totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Investiert</p>
                <p className="text-lg font-semibold text-slate-300">
                  {investedCapital.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-400 font-medium">Dividenden ({dividendRange})</h3>
            <div className="flex bg-slate-900/50 p-1 rounded-lg">
              <button
                onClick={() => setDividendRange('YTD')}
                className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-all ${dividendRange === 'YTD' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                YTD
              </button>
              <button
                onClick={() => setDividendRange('1J')}
                className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-all ${dividendRange === '1J' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                1J
              </button>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-bold text-white">
              {(
                dividendRange === '1J'
                  ? dividendSummary.monthlyBars1J.reduce((sum, v) => sum + v, 0)
                  : dividendSummary.ytdValue
              ).toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
            </span>
            <p className="text-sm text-slate-500 mt-1">
              {dividendSummary.nextPayout ? (
                <>
                  {'N\u00e4chste Auszahlung:'} <span className="font-semibold text-slate-200">{dividendSummary.nextPayout.amount.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}</span> ({dividendSummary.nextPayout.name}) - <span className="font-semibold text-slate-200">{dividendSummary.nextPayout.date}</span>
                  {dividendSummary.isTheoretical ? <span className="text-xs text-slate-600 ml-2">Prognose</span> : null}
                </>
              ) : (
                'Keine geplanten Auszahlungen'
              )}
            </p>
          </div>
          <div className="h-16 flex items-end space-x-1 mt-4">
            {(() => {
              const bars = dividendRange === '1J' ? dividendSummary.monthlyBars1J : dividendSummary.monthlyBarsYTD;
              const max = Math.max(...bars, 1);
              return bars.map((val, i) => (
                <div key={i} className="flex-1 bg-blue-500/20 hover:bg-blue-500/40 rounded-t transition-colors relative group" style={{ height: `${(val / max) * 100}%` }}>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-700 text-xs px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {val.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      < div className="grid grid-cols-1 lg:grid-cols-3 gap-6" >
        {/* Performance Chart */}
        < Card className="lg:col-span-2 min-h-[350px]" >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 relative">
            {/* Left: Toggles */}
            <div className="flex items-center gap-4 z-10">
              <div className="flex bg-slate-900/50 p-1 rounded-lg">
                <button
                  onClick={() => setChartMode('value')}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${chartMode === 'value' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  Wert
                </button>
                <button
                  onClick={() => setChartMode('performance')}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${chartMode === 'performance' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  %
                </button>
              </div>
            </div>

            {/* Center: Time Range */}
            <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex bg-slate-900/50 p-1 rounded-lg overflow-x-auto max-w-full">
              {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${timeRange === range
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                  {range}
                </button>
              ))}
            </div>
            {/* Mobile fallback for TimeRange (not absolute centered) */}
            <div className="md:hidden flex bg-slate-900/50 p-1 rounded-lg overflow-x-auto max-w-full self-start">
              {['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${timeRange === range
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Right: Badge */}
            <div className="flex items-center z-10">
              {displayData.length > 1 && (
                <div className="bg-slate-800/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-700/50">
                  <span className={`text-sm font-medium ${chartMetrics.badgeValue >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {chartMetrics.badgeValue >= 0 ? '+' : ''}
                    {chartMode === 'value'
                      ? chartMetrics.badgeValue.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })
                      : `${chartMetrics.badgeValue.toFixed(2)}%`
                    } {timeRange}
                  </span>
                </div>
              )}
            </div>
          </div>

          <SimpleAreaChart
            data={displayData}
            currency={project?.settings.baseCurrency || 'EUR'}
            timeRange={timeRange}
            showAxes={true}
            isPercentage={chartMode === 'performance'}
            color={chartMetrics.color}
          />
        </Card >

        {/* Allocation Chart */}
        <Card className="p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <PieChart size={18} className="text-emerald-500" />
            Allokation
          </h3>

          <div className="flex flex-col items-center gap-6">
            <div className="w-full h-52 relative">
              {allocationData.length > 0 ? (
                <AllocationChart
                  data={allocationData}
                  currency={project?.settings.baseCurrency || 'EUR'}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-500 text-sm">
                  Portfolio leer
                </div>
              )}
            </div>

            <div className="w-full border-t border-slate-800/50 pt-4">
              <div className="space-y-2 overflow-y-auto max-h-52 custom-scrollbar pr-2">
                {allocationData.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm group hover:bg-slate-800/50 p-2 rounded-lg transition-colors cursor-default">
                    <div className="flex items-center space-x-3">
                      <span className="w-2.5 h-2.5 rounded-full shadow-sm shadow-black/50 ring-2 ring-slate-900" style={{ backgroundColor: item.color }}></span>
                      <span className="text-slate-200 font-medium truncate max-w-[150px]">{item.name}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider w-12 text-right">{item.percentage.toFixed(1)}%</span>
                      <span className="font-bold text-white text-xs w-24 text-right">{item.value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} {project?.settings.baseCurrency}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div >

      {/* Holdings List (Compact) */}
      < div className="mt-2" >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Top Holding Performance</h3>
          <button
            onClick={() => window.location.hash = 'portfolio'} // Or better routing
            className="text-sm text-emerald-400 hover:text-emerald-300 flex items-center"
          >
            Alles sehen <ChevronRight size={16} />
          </button>
        </div>
        <div className="space-y-3">
          {holdings.length === 0 ? (
            <div className="text-slate-400 text-sm p-4 text-center bg-slate-800/20 rounded-xl">Keine Positionen vorhanden.</div>
          ) : (
            holdings.slice(0, 5).map((stock) => (
              <div key={stock.security.isin} onClick={() => onSelectSecurity(stock.security.isin)} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between hover:bg-slate-800/80 transition cursor-pointer">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs bg-slate-700`}>
                    {stock.security.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{stock.security.name}</h4>
                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                      <span className="bg-slate-700 px-1.5 rounded">{stock.security.quoteType || 'Aktie'}</span>
                      <span>{stock.quantity} Stk.</span>
                      <span className="text-slate-500">•</span>
                      <span>Ø {stock.averageBuyPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                      <span className="text-slate-500">•</span>
                      <span>Aktuell: {stock.currentPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-medium text-white">{stock.value.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
                  <div className="flex flex-col items-end">
                    <p className={`text-xs ${(stock.totalReturn) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {stock.totalReturn > 0 ? '+' : ''}{stock.totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                    </p>
                    <p className={`text-xs ${(stock.totalReturnPercent) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {stock.totalReturnPercent > 0 ? '+' : ''}{stock.totalReturnPercent.toLocaleString('de-DE', { maximumFractionDigits: 2 })}%
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div >
    </>
  )
};

const DrawdownModal = ({ isOpen, onClose, data }: { isOpen: boolean; onClose: () => void; data: { date: string; value: number }[] }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="text-rose-500" />
            Drawdown Historie
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="text-slate-400 hover:text-white" />
          </button>
        </div>
        <div className="h-80 w-full">
          <SimpleAreaChart
            data={data}
            color="#f43f5e"
            height={320}
            showAxes={true}
            timeRange="MAX"
            isPercentage={true}
            tooltipLabel="Abstand zum Hoch"
          />
        </div>
        <p className="text-slate-400 text-sm mt-4 text-center">
          Der Chart zeigt den prozentualen Rückgang vom jeweils letzten Höchststand (High-Water Mark) des Portfolios.
        </p>
      </div>
    </div>
  );
};

const HoldingsGroupModal = ({
  isOpen,
  onClose,
  title,
  holdings,
  currency,
  groupValue,
  portfolioValue
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  holdings: Holding[];
  currency: string;
  groupValue: number;
  portfolioValue: number;
}) => {
  if (!isOpen) return null;

  const sortedHoldings = [...holdings].sort((a, b) => b.value - a.value);
  const safeGroupValue = groupValue || sortedHoldings.reduce((sum, h) => sum + h.value, 0);
  const groupShare = portfolioValue > 0 ? (safeGroupValue / portfolioValue) * 100 : 0;
  const formatCurrency = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-1">
              {sortedHoldings.length} Positionen - {groupShare.toFixed(1)}% vom Portfolio
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="text-slate-400 hover:text-white" />
          </button>
        </div>

        <div
          className="max-h-[60vh] overflow-y-auto divide-y divide-slate-800 pr-2 -mr-2 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.5)_rgba(15,23,42,0.3)]"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {sortedHoldings.map(h => {
            const percentOfGroup = safeGroupValue > 0 ? (h.value / safeGroupValue) * 100 : 0;
            return (
              <div key={h.security.isin} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{h.security.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {h.security.isin}{h.security.quoteType ? ` - ${h.security.quoteType}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-white">{formatCurrency(h.value)}</p>
                  <p className="text-xs text-slate-400">{percentOfGroup.toFixed(1)}% der Gruppe</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RiskMetricModal = ({
  isOpen,
  onClose,
  title,
  series,
  color,
  isPercentage,
  tooltipLabel
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  series: { date: string; value: number }[];
  color: string;
  isPercentage: boolean;
  tooltipLabel: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="text-emerald-500" />
            {title}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="text-slate-400 hover:text-white" />
          </button>
        </div>

        <div className="h-80 w-full">
          {series.length > 0 ? (
            <SimpleAreaChart
              data={series}
              color={color}
              height={320}
              showAxes={true}
              timeRange="MAX"
              currency={isPercentage ? 'EUR' : ''}
              isPercentage={isPercentage}
              tooltipLabel={tooltipLabel}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">
              Keine Daten fÃ¼r diesen Zeitraum verfÃ¼gbar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DividendListModal = ({
  isOpen,
  onClose,
  title,
  items,
  currency
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: { id: string; name: string; date: string; amount: number; type: string }[];
  currency: string;
}) => {
  if (!isOpen) return null;

  const formatCurrency = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <style>{`
        .dividend-modal-scroll::-webkit-scrollbar { width: 8px; }
        .dividend-modal-scroll::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.35);
          border-radius: 999px;
        }
        .dividend-modal-scroll::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.55);
          border-radius: 999px;
          border: 2px solid rgba(15, 23, 42, 0.35);
        }
        .dividend-modal-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(203, 213, 225, 0.75);
        }
      `}</style>
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-1">{items.length} Eintraege</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="text-slate-400 hover:text-white" />
          </button>
        </div>

        <div
          className="dividend-modal-scroll max-h-[60vh] overflow-y-auto divide-y divide-slate-800 pr-2 -mr-2 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.5)_rgba(15,23,42,0.3)]"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {items.map(item => (
            <div key={item.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200 truncate">{item.name}</div>
                <div className="text-xs text-slate-500">{item.date} - {item.type}</div>
              </div>
              <div className="text-emerald-400 font-medium text-sm whitespace-nowrap">
                +{formatCurrency(item.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const AnalysisContent = ({
  selectedPortfolioIds,
  cachedData,
  onCacheUpdate
}: {
  selectedPortfolioIds: string[],
  cachedData?: any,
  onCacheUpdate?: (data: any) => void
}) => {
  const { project } = useProject();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [isCalculating, setIsCalculating] = useState(true);

  // New View States
  const [returnViewMode, setReturnViewMode] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [selectedTileData, setSelectedTileData] = useState<{
    title: string;
    series: { date: string; value: number }[];
    timeRange: string;
  } | null>(null);
  const [groupOverlay, setGroupOverlay] = useState<{
    title: string;
    holdings: Holding[];
    groupValue: number;
  } | null>(null);
  const [riskModal, setRiskModal] = useState<{
    title: string;
    series: { date: string; value: number }[];
    color: string;
    isPercentage: boolean;
    tooltipLabel: string;
  } | null>(null);

  const riskFreeRate = 0.02;
  const [performanceRange, setPerformanceRange] = useState<'1M' | '6M' | 'YTD' | '1J' | '3J' | '5J' | 'MAX'>('1J');
  const [benchmarkInput, setBenchmarkInput] = useState('');
  const [benchmarkList, setBenchmarkList] = useState<{ symbol: string; name: string; history: Record<string, number>; currency?: string }[]>([]);
  const [isBenchmarkLoading, setIsBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [isBenchmarkCurrencyLoading, setIsBenchmarkCurrencyLoading] = useState(false);
  const benchmarkCurrencyAttempts = useRef<Set<string>>(new Set());

  // Filter transactions based on selected Portfolio (same as Dashboard)
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioIds.length === 0) return project.transactions;
    return project.transactions.filter(t => t.portfolioId && selectedPortfolioIds.includes(t.portfolioId));
  }, [project, selectedPortfolioIds]);

  // Calculate Holdings for Analysis (needed for Sector/Region)
  const { holdings } = useMemo(() => {
    if (!project) return { holdings: [] };

    // Extract latest quotes from securities history
    const quotes: Record<string, number> = {};
    if (project.securities) {
      Object.values(project.securities).forEach(sec => {
        if (sec.priceHistory) {
          const dates = Object.keys(sec.priceHistory).sort();
          if (dates.length > 0) {
            const lastDate = dates[dates.length - 1];
            quotes[sec.isin] = sec.priceHistory[lastDate];
          }
        }
      });
    }

    return calculateHoldings(
      filteredTransactions,
      Object.values(project.securities || {}),
      quotes, // Pass real quotes
      project.fxData.rates, // fxRates
      project.settings.baseCurrency // Pass selected base currency
    );
  }, [project, filteredTransactions]);

  // Calculate Sector Data
  const sectorData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const sector = h.security.sector || 'Unbekannt';
      if (!groups[sector]) groups[sector] = { value: 0, holdings: [] };
      groups[sector].value += h.value;
      groups[sector].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [holdings]);

  // Calculate Region Data
  const regionData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const region = h.security.region || h.security.country || 'Unbekannt';
      if (!groups[region]) groups[region] = { value: 0, holdings: [] };
      groups[region].value += h.value;
      groups[region].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [holdings]);

  // Calculate Industry Data (Branche)
  const industryData = useMemo(() => {
    const groups: Record<string, { value: number; holdings: Holding[] }> = {};
    let totalValue = 0;

    holdings.forEach(h => {
      const industry = h.security.industry || 'Unbekannt';
      if (!groups[industry]) groups[industry] = { value: 0, holdings: [] };
      groups[industry].value += h.value;
      groups[industry].holdings.push(h);
      totalValue += h.value;
    });

    return Object.entries(groups)
      .map(([name, group]) => ({
        name,
        value: totalValue > 0 ? Math.round((group.value / totalValue) * 100) : 0,
        totalValue: group.value,
        holdings: group.holdings.sort((a, b) => b.value - a.value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [holdings]);

  const portfolioTotalValue = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.value, 0);
  }, [holdings]);

  // Calculate portfolio history for MAX (for analysis metrics across years)
  // Moved to effect to unblock UI
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [analysisMetrics, setAnalysisMetrics] = useState<any>(
    { volatility: 0, sharpeRatio: 0, maxDrawdown: 0, maxDrawdownDate: '', availableYears: [], monthlyReturns: [], twrSeries: [] }
  );

  const riskSeries = useMemo(() => {
    const series = analysisMetrics?.twrSeries || [];
    if (series.length < 2) return { volatility: [], sharpe: [] };

    const msPerDay = 1000 * 60 * 60 * 24;
    const annualizationDays = 365;
    const indexSeries = series.map(p => ({
      date: p.date,
      index: 1 + (p.value / 100)
    }));

    const dailyReturns: number[] = new Array(indexSeries.length).fill(0);
    for (let i = 1; i < indexSeries.length; i++) {
      const prev = indexSeries[i - 1].index;
      const curr = indexSeries[i].index;
      dailyReturns[i] = prev > 0 ? (curr / prev) - 1 : 0;
    }

    let windowStart = 1;
    let sum = 0;
    let sumSq = 0;
    const volatility: { date: string; value: number }[] = [];
    const sharpe: { date: string; value: number }[] = [];

    for (let i = 1; i < indexSeries.length; i++) {
      const r = dailyReturns[i];
      sum += r;
      sumSq += r * r;

      while (windowStart < i) {
        const daysDiff = (new Date(indexSeries[i].date).getTime() - new Date(indexSeries[windowStart].date).getTime()) / msPerDay;
        if (daysDiff <= annualizationDays) break;
        const rDrop = dailyReturns[windowStart];
        sum -= rDrop;
        sumSq -= rDrop * rDrop;
        windowStart++;
      }

      const count = i - windowStart + 1;
      if (count < 2) continue;

      const windowSpanDays = (new Date(indexSeries[i].date).getTime() - new Date(indexSeries[windowStart].date).getTime()) / msPerDay;
      if (windowSpanDays < annualizationDays) continue;

      const mean = sum / count;
      const variance = Math.max(0, (sumSq / count) - (mean * mean));
      const dailyVol = Math.sqrt(variance);
      const annualizedVol = dailyVol * Math.sqrt(annualizationDays) * 100;

      const startIndexValue = indexSeries[Math.max(windowStart - 1, 0)].index;
      const startDate = new Date(indexSeries[Math.max(windowStart - 1, 0)].date);
      const endDate = new Date(indexSeries[i].date);
      const yearsElapsed = (endDate.getTime() - startDate.getTime()) / (msPerDay * annualizationDays);

      let annualizedReturn = 0;
      if (yearsElapsed > 0 && startIndexValue > 0) {
        annualizedReturn = Math.pow(indexSeries[i].index / startIndexValue, 1 / yearsElapsed) - 1;
      }

      const sharpeValue = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / (annualizedVol / 100) : 0;

      volatility.push({ date: indexSeries[i].date, value: Math.round(annualizedVol * 10) / 10 });
      sharpe.push({ date: indexSeries[i].date, value: Math.round(sharpeValue * 100) / 100 });
    }

    return { volatility, sharpe };
  }, [analysisMetrics?.twrSeries, riskFreeRate]);

  useEffect(() => {
    if (!project) return;

    // Check Cache
    // Added version suffix to force invalidation after TWR refactor
    const cacheKey = `${project.id}-${selectedPortfolioIds.slice().sort().join(',')}|v3`;
    if (cachedData && cachedData.key === cacheKey) {
      setHistoryData(cachedData.historyData);
      setAnalysisMetrics(cachedData.analysisMetrics);
      setIsCalculating(false);
      return;
    }

    // Start loading immediately
    setIsCalculating(true);

    // Defer heavy calculation to next tick to allow UI to render loading state
    const timer = setTimeout(() => {
      const data = calculatePortfolioHistory(
        filteredTransactions,
        Object.values(project.securities || {}),
        project.fxData.rates,
        project.settings.baseCurrency,
        'MAX', // Full history
        'daily' // High precision for TWR/Drawdown
      );

      const metrics = calculateAnalysisMetrics(data);

      setHistoryData(data);
      setAnalysisMetrics(metrics);

      // Update Cache
      if (onCacheUpdate) {
        onCacheUpdate({ key: cacheKey, historyData: data, analysisMetrics: metrics });
      }

      setIsCalculating(false);
    }, 100); // 100ms delay to ensure loading state is visible and UI feels responsive

    return () => clearTimeout(timer);
  }, [project, filteredTransactions, cachedData]);

  // Removed old synchronous useMemos and redundant loading effects

  // Ensure selectedYear is valid when data changes
  useEffect(() => {
    if (analysisMetrics?.availableYears && analysisMetrics.availableYears.length > 0) {
      if (!analysisMetrics.availableYears.includes(selectedYear)) {
        // Default to most recent year if selected is invalid
        setSelectedYear(analysisMetrics.availableYears[0]);
      }
    }
  }, [analysisMetrics?.availableYears, selectedYear]);

  // Get monthly returns for selected year
  const displayedMonthlyReturns = useMemo(() => {
    if (!analysisMetrics?.monthlyReturnsMap) return analysisMetrics.monthlyReturns || [];

    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const result = [];

    for (let month = 0; month < 12; month++) {
      const monthKey = `${selectedYear}-${String(month + 1).padStart(2, '0')}`;
      const returnValue = analysisMetrics.monthlyReturnsMap[monthKey] || 0;
      result.push({
        month: monthNames[month],
        return: Math.round(returnValue * 10) / 10
      });
    }
    return result;
  }, [analysisMetrics, selectedYear]);

  // Calculate Aggregated Returns (Quarterly / Yearly)
  const aggregatedReturns = useMemo(() => {
    if (!analysisMetrics?.monthlyReturnsMap) return { quarterly: [], yearly: [] };

    const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4'];
    const quarterly = [];

    // Quarterly for Selected Year
    for (let q = 0; q < 4; q++) {
      // Simple geometric linking of monthly returns for the quarter: (1+r1)(1+r2)(1+r3) - 1
      // This is an approximation for Q-MWR but standard for composed periods.
      let growingReturn = 1.0;
      let hasData = false;

      for (let m = 0; m < 3; m++) {
        const monthIndex = q * 3 + m + 1;
        const monthKey = `${selectedYear}-${String(monthIndex).padStart(2, '0')}`;
        if (analysisMetrics.monthlyReturnsMap[monthKey] !== undefined) {
          growingReturn *= (1 + (analysisMetrics.monthlyReturnsMap[monthKey] / 100));
          hasData = true;
        }
      }

      quarterly.push({
        label: quarterNames[q],
        return: hasData ? Math.round((growingReturn - 1) * 100 * 10) / 10 : 0,
        hasData,
        startDate: `${selectedYear}-${String(q * 3 + 1).padStart(2, '0')}-01`,
        endDate: toDateKey(new Date(selectedYear, (q + 1) * 3, 0)) // Last day of quarter
      });
    }

    // Yearly (All Years)
    const yearly = (analysisMetrics.availableYears || []).map((year: number) => {
      let growingReturn = 1.0;
      let hasData = false;

      // Aggregate all 12 months for that year
      for (let m = 1; m <= 12; m++) {
        const monthKey = `${year}-${String(m).padStart(2, '0')}`;
        if (analysisMetrics.monthlyReturnsMap[monthKey] !== undefined) {
          growingReturn *= (1 + (analysisMetrics.monthlyReturnsMap[monthKey] / 100));
          hasData = true;
        }
      }

      return {
        year,
        return: hasData ? Math.round((growingReturn - 1) * 100 * 10) / 10 : 0,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`
      };
    });

    return { quarterly, yearly };
  }, [analysisMetrics, selectedYear]);

  const openGroupOverlay = (title: string, group: { holdings: Holding[]; totalValue: number }) => {
    if (!group?.holdings?.length) return;
    setGroupOverlay({
      title,
      holdings: group.holdings,
      groupValue: group.totalValue
    });
  };

  // Build a period chart series from the single TWR source of truth
  const buildPeriodSeries = (periodStart: string, periodEnd: string) => {
    const series = analysisMetrics?.twrSeries || [];
    if (!series.length) return [];

    const startIndex = series.findIndex(p => p.date >= periodStart);
    if (startIndex === -1) return [];

    const baselineIndex = Math.max(startIndex - 1, 0);
    let endIndex = series.length - 1;

    for (let i = startIndex; i < series.length; i++) {
      if (series[i].date > periodEnd) {
        endIndex = i - 1;
        break;
      }
    }

    if (endIndex < baselineIndex) return [];

    const baselineValue = series[baselineIndex].value;
    const baselineIndexValue = 1 + (baselineValue / 100);
    const slice = series.slice(baselineIndex, endIndex + 1);

    if (baselineIndexValue === 0) {
      return slice.map(p => ({ date: p.date, value: 0 }));
    }

    return slice.map(p => {
      const currentIndexValue = 1 + (p.value / 100);
      return {
        date: p.date,
        value: ((currentIndexValue / baselineIndexValue) - 1) * 100
      };
    });
  };

  // Build performance series using MWR-style logic (matches Dashboard)
  const buildMwrSeries = (
    sourceHistory: { date: string; value: number; invested: number }[],
    rangeStart: string,
    rangeEnd: string
  ) => {
    if (!sourceHistory.length) return [];

    const periodData = sourceHistory.filter(d => d.date >= rangeStart && d.date <= rangeEnd);
    if (periodData.length === 0) return [];

    const startPoint = periodData[0];
    let startValue = startPoint.value;
    const startInvested = startPoint.invested || 0;

    // Align with Dashboard performance logic (MWR-style)
    let isStartOfHistory = performanceRange === 'MAX';

    if (!isStartOfHistory && filteredTransactions.length > 0) {
      const firstTxDateStr = filteredTransactions.reduce((min, t) => t.date < min ? t.date : min, '9999-12-31');
      const firstTxTime = new Date(firstTxDateStr).setHours(0, 0, 0, 0);
      const startTime = new Date(startPoint.date).setHours(0, 0, 0, 0);
      if (Math.abs(startTime - firstTxTime) < 86400000) {
        isStartOfHistory = true;
      }
    }

    if (isStartOfHistory && startInvested > 0) {
      startValue = startInvested;
    }

    return periodData.map((point, index) => {
      if (index === 0) {
        if (isStartOfHistory) {
          const inv = point.invested || 0;
          if (inv > 0) return { date: point.date, value: ((point.value - inv) / inv) * 100 };
          return { date: point.date, value: 0 };
        }
        return { date: point.date, value: 0 };
      }

      const currValue = point.value;
      const currInvested = point.invested || 0;
      const deltaInvested = currInvested - startInvested;
      const capitalAtWork = startValue + deltaInvested;

      let percent = 0;
      if (capitalAtWork > 0) {
        const profitPeriod = (currValue - startValue) - deltaInvested;
        percent = (profitPeriod / capitalAtWork) * 100;
      }

      return { date: point.date, value: percent };
    });
  };

  const performanceRangeDates = useMemo(() => {
    const series = analysisMetrics?.twrSeries || [];
    if (!series.length) return { start: '', end: '' };

    const end = series[series.length - 1].date;
    if (performanceRange === 'MAX') {
      return { start: series[0].date, end };
    }

    const endDate = new Date(end);
    const startDate = new Date(endDate);

    if (performanceRange === '1M') startDate.setMonth(endDate.getMonth() - 1);
    if (performanceRange === '6M') startDate.setMonth(endDate.getMonth() - 6);
    if (performanceRange === 'YTD') startDate.setMonth(0, 1);
    if (performanceRange === '1J') startDate.setFullYear(endDate.getFullYear() - 1);
    if (performanceRange === '3J') startDate.setFullYear(endDate.getFullYear() - 3);
    if (performanceRange === '5J') startDate.setFullYear(endDate.getFullYear() - 5);

    const earliest = series[0].date;
    const start = startDate < new Date(earliest) ? earliest : toDateKey(startDate);
    return { start, end };
  }, [analysisMetrics?.twrSeries, performanceRange]);

  const portfolioPerformanceSeries = useMemo(() => {
    if (!performanceRangeDates.start || !performanceRangeDates.end) return [];
    return buildMwrSeries(historyData, performanceRangeDates.start, performanceRangeDates.end);
  }, [historyData, filteredTransactions, performanceRangeDates.start, performanceRangeDates.end, performanceRange]);

  useEffect(() => {
    const missingCurrency = benchmarkList.filter(b => !b.currency && !benchmarkCurrencyAttempts.current.has(b.symbol));
    if (missingCurrency.length === 0 || isBenchmarkCurrencyLoading) return;

    let isActive = true;
    const fetchCurrencies = async () => {
      setIsBenchmarkCurrencyLoading(true);
      try {
        for (const b of missingCurrency) {
          benchmarkCurrencyAttempts.current.add(b.symbol);
          try {
            const res = await fetch('/api/yahoo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol: b.symbol })
            });
            const data = await res.json();
            if (!res.ok || data.error) continue;

            const currency = data.currency;
            if (currency && isActive) {
              setBenchmarkList(prev => prev.map(item => item.symbol === b.symbol ? { ...item, currency } : item));
            }
          } catch {
            // Ignore individual benchmark errors
          }
        }
      } finally {
        if (isActive) setIsBenchmarkCurrencyLoading(false);
      }
    };

    fetchCurrencies();
    return () => {
      isActive = false;
    };
  }, [benchmarkList, isBenchmarkCurrencyLoading]);

  const getFxRate = (currency: string, date?: string) => {
    if (!project || !project.fxData?.rates) return 1;
    if (currency === 'EUR') return 1;
    const history = project.fxData.rates[currency];
    if (!history) return 1;

    if (date) {
      const targetTime = new Date(date).getTime();
      const availableDates = Object.keys(history).sort();
      let closestDate = availableDates[0];
      for (const d of availableDates) {
        const dTime = new Date(d).getTime();
        if (dTime <= targetTime) {
          closestDate = d;
        } else {
          break;
        }
      }
      return history[closestDate] || 1;
    }

    const dates = Object.keys(history).sort();
    const latest = dates[dates.length - 1];
    return history[latest] || 1;
  };

  const convertCurrency = (amount: number, from: string, to: string, date?: string) => {
    if (from === to) return amount;
    const rateFrom = getFxRate(from, date);
    const amountEur = amount / rateFrom;
    if (to === 'EUR') return amountEur;
    const rateTo = getFxRate(to, date);
    return amountEur * rateTo;
  };

  const buildBenchmarkMwrHistory = (
    history: Record<string, number>,
    currency: string,
    baseCurrency: string,
    rangeStart: string,
    rangeEnd: string
  ) => {
    if (!historyData.length) return [];

    const cashflowData = historyData.filter(d => d.date >= rangeStart && d.date <= rangeEnd);
    if (cashflowData.length === 0) return [];

    const priceDates = Object.keys(history || {}).sort();
    if (priceDates.length === 0) return [];

    let priceIndex = 0;
    let shares = 0;
    let invested = 0;
    const synthetic: { date: string; value: number; invested: number }[] = [];

    for (let i = 0; i < cashflowData.length; i++) {
      const date = cashflowData[i].date;

      while (priceIndex + 1 < priceDates.length && priceDates[priceIndex + 1] <= date) {
        priceIndex++;
      }

      const priceDate = priceDates[priceIndex];
      if (!priceDate || priceDate > date) {
        continue;
      }

      const rawPrice = history[priceDate];
      if (!rawPrice) continue;

      const price = convertCurrency(rawPrice, currency, baseCurrency, priceDate);
      if (!price || price <= 0) continue;

      const cashFlow = i === 0 ? cashflowData[i].invested : (cashflowData[i].invested - cashflowData[i - 1].invested);
      if (cashFlow !== 0) {
        shares += cashFlow / price;
        invested += cashFlow;
      }

      const value = shares * price;
      synthetic.push({ date, value, invested });
    }

    return synthetic;
  };

  const buildBenchmarkSeries = (
    history: Record<string, number>,
    start: string,
    end: string,
    currency: string,
    baseCurrency: string
  ) => {
    const syntheticHistory = buildBenchmarkMwrHistory(history, currency, baseCurrency, start, end);
    return buildMwrSeries(syntheticHistory, start, end);
  };

  const benchmarkSeries = useMemo(() => {
    if (!performanceRangeDates.start || !performanceRangeDates.end) return [];
    const colors = ['#38bdf8', '#a855f7', '#f59e0b', '#22c55e', '#f43f5e', '#e2e8f0'];
    const baseCurrency = project?.settings.baseCurrency || 'EUR';
    return benchmarkList.map((b, i) => ({
      key: `bench_${b.symbol}`,
      name: b.name || b.symbol,
      color: colors[i % colors.length],
      series: buildBenchmarkSeries(b.history, performanceRangeDates.start, performanceRangeDates.end, b.currency || baseCurrency, baseCurrency)
    }));
  }, [
    benchmarkList,
    historyData,
    filteredTransactions,
    performanceRange,
    performanceRangeDates.start,
    performanceRangeDates.end,
    project?.settings.baseCurrency,
    project?.fxData?.rates
  ]);

  const performanceComparisonData = useMemo(() => {
    const dataMap = new Map<string, any>();

    const addPoint = (date: string, key: string, value: number) => {
      if (!dataMap.has(date)) dataMap.set(date, { date });
      dataMap.get(date)[key] = value;
    };

    portfolioPerformanceSeries.forEach(p => addPoint(p.date, 'portfolio', p.value));
    benchmarkSeries.forEach(b => b.series.forEach(p => addPoint(p.date, b.key, p.value)));

    return Array.from(dataMap.keys()).sort().map(date => dataMap.get(date));
  }, [portfolioPerformanceSeries, benchmarkSeries]);

  const portfolioGradientOffset = useMemo(() => {
    const values = performanceComparisonData
      .map(d => Number(d.portfolio))
      .filter(v => !Number.isNaN(v));
    if (values.length === 0) return 0.5;
    const dataMax = Math.max(...values);
    const dataMin = Math.min(...values);
    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;
    return dataMax / (dataMax - dataMin);
  }, [performanceComparisonData]);

  const handleAddBenchmark = async () => {
    const raw = benchmarkInput.trim();
    if (!raw || isBenchmarkLoading) return;

    const symbol = raw.toUpperCase();
    if (benchmarkList.some(b => b.symbol.toUpperCase() === symbol)) {
      setBenchmarkInput('');
      return;
    }

    setIsBenchmarkLoading(true);
    setBenchmarkError(null);

    try {
      const res = await fetch('/api/yahoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });

      const data = await res.json();
      if (!res.ok || data.error || !data.history) {
        throw new Error(data.error || 'Benchmark konnte nicht geladen werden.');
      }

      setBenchmarkList(prev => [
        ...prev,
        { symbol, name: data.longName || symbol, history: data.history, currency: data.currency }
      ]);
      setBenchmarkInput('');
    } catch (err: any) {
      setBenchmarkError(err?.message || 'Benchmark konnte nicht geladen werden.');
    } finally {
      setIsBenchmarkLoading(false);
    }
  };

  const removeBenchmark = (symbol: string) => {
    setBenchmarkList(prev => prev.filter(b => b.symbol !== symbol));
  };

  // Helper to open chart modal
  const handleTileClick = (periodStart: string, periodEnd: string, title: string) => {
    if (!periodStart || !periodEnd) return;

    const series = buildPeriodSeries(periodStart, periodEnd);
    if (series.length === 0) return;

    setSelectedTileData({
      title,
      series,
      timeRange: returnViewMode === 'monthly' ? '1M' : returnViewMode === 'quarterly' ? '3M' : '1Y'
    });
  };


  // Helper to get volatility label
  const getVolatilityLabel = (vol: number) => {
    if (vol < 10) return { text: 'Niedrig', color: 'text-emerald-400' };
    if (vol < 20) return { text: 'Mittel', color: 'text-yellow-400' };
    return { text: 'Hoch', color: 'text-rose-400' };
  };

  // Helper to get Sharpe Ratio label
  const getSharpeLabel = (sharpe: number) => {
    if (sharpe > 1.5) return { text: 'Sehr gut', color: 'text-emerald-400' };
    if (sharpe > 1.0) return { text: 'Gut', color: 'text-emerald-400' };
    if (sharpe > 0.5) return { text: 'OK', color: 'text-yellow-400' };
    return { text: 'Schwach', color: 'text-rose-400' };
  };

  const currentVolatility = riskSeries.volatility.length > 0
    ? riskSeries.volatility[riskSeries.volatility.length - 1].value
    : analysisMetrics.volatility;
  const currentSharpe = riskSeries.sharpe.length > 0
    ? riskSeries.sharpe[riskSeries.sharpe.length - 1].value
    : analysisMetrics.sharpeRatio;

  const volLabel = getVolatilityLabel(currentVolatility);
  const sharpeLabel = getSharpeLabel(currentSharpe);

  const availableYears = analysisMetrics.availableYears || [];
  const hasPrevYear = availableYears.indexOf(selectedYear) < availableYears.length - 1;
  const hasNextYear = availableYears.indexOf(selectedYear) > 0;

  const navigateYear = (direction: 'prev' | 'next') => {
    const currentIndex = availableYears.indexOf(selectedYear);
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex < availableYears.length) {
      setSelectedYear(availableYears[newIndex]);
    }
  };

  return (
    <div className="space-y-6">

      {/* Loading State */}
      {isCalculating && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 animate-pulse">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-slate-400 text-sm">Analysedaten werden berechnet...</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full mt-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-4 h-24 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {!isCalculating && (
        <>
          <DrawdownModal
            isOpen={showDrawdown}
            onClose={() => setShowDrawdown(false)}
            data={analysisMetrics.drawdownHistory || []}
          />
          <RiskMetricModal
            isOpen={!!riskModal}
            onClose={() => setRiskModal(null)}
            title={riskModal?.title || ''}
            series={riskModal?.series || []}
            color={riskModal?.color || '#10b981'}
            isPercentage={riskModal?.isPercentage ?? true}
            tooltipLabel={riskModal?.tooltipLabel || ''}
          />

          {/* Risk Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div
              onClick={() => setRiskModal({
                title: 'Volatilität (1J)',
                series: riskSeries.volatility,
                color: '#f97316',
                isPercentage: true,
                tooltipLabel: 'Volatilität (annualisiert)'
              })}
              className="cursor-pointer hover:bg-slate-800 transition-colors group relative rounded-xl"
            >
              <Card className="flex flex-col items-center justify-center p-4 hover:border-slate-600 transition-colors">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <BarChart3 size={14} className="text-slate-500" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Volatilität (1J)</p>
                <span className="text-xl font-bold text-white">{currentVolatility.toFixed(1)}%</span>
                <span className={`text-xs mt-1 ${volLabel.color}`}>{volLabel.text}</span>
              </Card>
            </div>
            <div
              onClick={() => setRiskModal({
                title: 'Sharpe Ratio (1J)',
                series: riskSeries.sharpe,
                color: '#10b981',
                isPercentage: false,
                tooltipLabel: 'Sharpe Ratio'
              })}
              className="cursor-pointer hover:bg-slate-800 transition-colors group relative rounded-xl"
            >
              <Card className="flex flex-col items-center justify-center p-4 hover:border-slate-600 transition-colors">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <BarChart3 size={14} className="text-slate-500" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sharpe Ratio (1J)</p>
                <span className="text-xl font-bold text-white">{currentSharpe.toFixed(2)}</span>
                <span className={`text-xs mt-1 ${sharpeLabel.color}`}>{sharpeLabel.text}</span>
              </Card>
            </div>
            <div
              onClick={() => setShowDrawdown(true)}
              className="cursor-pointer hover:bg-slate-800 transition-colors group relative rounded-xl"
            >
              <Card className="flex flex-col items-center justify-center p-4 hover:border-slate-600 transition-colors">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <BarChart3 size={14} className="text-slate-500" />
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Max Drawdown</p>
                <span className="text-xl font-bold text-rose-400">{analysisMetrics.maxDrawdown.toFixed(1)}%</span>
                <span className="text-xs text-slate-500 mt-1">
                  {analysisMetrics.maxDrawdownDate ? new Date(analysisMetrics.maxDrawdownDate).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }) : 'N/A'}
                </span>
              </Card>
            </div>
            <Card className="flex flex-col items-center justify-center p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Dividendenrendite</p>
              <span className="text-xl font-bold text-white">1.92%</span>
              <span className="text-xs text-slate-500 mt-1">Ø 245€ / Monat</span>
            </Card>
          </div>

          {/* Performance Comparison */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-emerald-400" />
                <h3 className="font-semibold text-white">Performancevergleich</h3>
              </div>
              <div className="flex bg-slate-900/50 p-1 rounded-lg">
                {(['1M', '6M', 'YTD', '1J', '3J', '5J', 'MAX'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setPerformanceRange(range)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${performanceRange === range ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                value={benchmarkInput}
                onChange={(e) => setBenchmarkInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddBenchmark(); }}
                placeholder="Benchmark Symbol (z.B. SPY, ^GDAXI)"
                className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <button
                onClick={handleAddBenchmark}
                disabled={isBenchmarkLoading || !benchmarkInput.trim()}
                className={`px-3 py-2 text-sm rounded-lg font-medium transition-all ${isBenchmarkLoading || !benchmarkInput.trim() ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
              >
                {isBenchmarkLoading ? 'Lädt...' : 'Hinzufügen'}
              </button>
            </div>

            {benchmarkError && (
              <p className="text-xs text-rose-400 mt-2">{benchmarkError}</p>
            )}
            {isBenchmarkCurrencyLoading && (
              <p className="text-xs text-slate-500 mt-2">Benchmark-Währungen werden aktualisiert...</p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs">
                Portfolio
              </span>
              {benchmarkList.map(b => (
                <span key={b.symbol} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-slate-800 text-slate-300 text-xs">
                  {b.name || b.symbol}
                  <button
                    onClick={() => removeBenchmark(b.symbol)}
                    className="text-slate-500 hover:text-white"
                    aria-label={`Benchmark ${b.symbol} entfernen`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>

            <div className="h-80 mt-4">
              {performanceComparisonData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceComparisonData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="portfolioSplitStroke" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={portfolioGradientOffset} stopColor="#10b981" stopOpacity={1} />
                        <stop offset={portfolioGradientOffset} stopColor="#f43f5e" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="portfolioSplitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={portfolioGradientOffset} stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset={portfolioGradientOffset} stopColor="#f43f5e" stopOpacity={0.25} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(dateStr: string) => {
                        const d = new Date(dateStr);
                        if (['3J', '5J', 'MAX'].includes(performanceRange)) return d.getFullYear().toString();
                        return `${d.getDate()}.${d.getMonth() + 1}.`;
                      }}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      minTickGap={80}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(val: number) => `${val.toFixed(1)}%`}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '12px' }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(value: any, name: any) => [`${Number(value).toFixed(2)}%`, name]}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('de-DE')}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      wrapperStyle={{ color: '#94a3b8', paddingTop: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="portfolio"
                      name="Portfolio"
                      stroke="url(#portfolioSplitStroke)"
                      strokeWidth={2.2}
                      fill="url(#portfolioSplitFill)"
                      dot={false}
                    />
                    {benchmarkSeries.map(b => (
                      <Line
                        key={b.key}
                        type="monotone"
                        dataKey={b.key}
                        name={b.name}
                        stroke={b.color}
                        strokeWidth={1.8}
                        dot={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Keine Performance-Daten für den ausgewählten Zeitraum.
                </div>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Return Heatmap / Grid */}
            <Card className="lg:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Activity size={18} className="text-emerald-400" />
                    Rendite
                    {returnViewMode !== 'yearly' && <span className="text-slate-500 font-normal">({selectedYear})</span>}
                  </h3>

                  {/* View Toggle */}
                  <div className="flex bg-slate-900/50 p-1 rounded-lg">
                    {(['monthly', 'quarterly', 'yearly'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setReturnViewMode(mode)}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${returnViewMode === mode ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        {mode === 'monthly' ? 'Monat' : mode === 'quarterly' ? 'Quartal' : 'Jahr'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Year Navigation (Only for Monthly/Quarterly) */}
                {returnViewMode !== 'yearly' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigateYear('prev')}
                      disabled={!hasPrevYear}
                      className={`p-1 rounded hover:bg-slate-800 transition-colors ${!hasPrevYear ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400'}`}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => navigateYear('next')}
                      disabled={!hasNextYear}
                      className={`p-1 rounded hover:bg-slate-800 transition-colors ${!hasNextYear ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400'}`}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </div>

              <div className={`grid gap-3 ${returnViewMode === 'monthly' ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6' : returnViewMode === 'quarterly' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
                {returnViewMode === 'monthly' && displayedMonthlyReturns.map((m: { month: string; return: number }, index: number) => {
                  // Calculate mock dates for click
                  const monthIndex = index + 1;
                  const startDate = `${selectedYear}-${String(monthIndex).padStart(2, '0')}-01`;
                  const endDate = toDateKey(new Date(selectedYear, monthIndex, 0));

                  return (
                    <div
                      key={m.month}
                      onClick={() => handleTileClick(startDate, endDate, `${m.month} ${selectedYear}`)}
                      className="bg-slate-900/50 rounded-lg p-3 flex flex-col items-center justify-center hover:bg-slate-800 transition cursor-pointer group relative"
                    >
                      <span className="text-xs text-slate-500 mb-1">{m.month}</span>
                      <span className={`font-bold ${m.return >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {m.return > 0 ? '+' : ''}{m.return}%
                      </span>
                      <div className="absolute inset-0 border-2 border-emerald-500/0 group-hover:border-emerald-500/20 rounded-lg transition-all"></div>
                    </div>
                  );
                })}

                {returnViewMode === 'quarterly' && aggregatedReturns.quarterly.map((q) => (
                  <div
                    key={q.label}
                    onClick={() => handleTileClick(q.startDate, q.endDate, `${q.label} ${selectedYear}`)}
                    className="bg-slate-900/50 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-slate-800 transition cursor-pointer group relative"
                  >
                    <span className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{q.label}</span>
                    <span className={`text-lg font-bold ${q.return >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {q.return > 0 ? '+' : ''}{q.return}%
                    </span>
                    <div className="absolute inset-0 border-2 border-emerald-500/0 group-hover:border-emerald-500/20 rounded-lg transition-all"></div>
                  </div>
                ))}

                {returnViewMode === 'yearly' && aggregatedReturns.yearly.map((y) => (
                  <div
                    key={y.year}
                    onClick={() => handleTileClick(y.startDate, y.endDate, `Jahr ${y.year}`)}
                    className="bg-slate-900/50 rounded-lg p-4 flex flex-col items-center justify-center hover:bg-slate-800 transition cursor-pointer group relative"
                  >
                    <span className="text-xs text-slate-500 mb-1">{y.year}</span>
                    <span className={`text-lg font-bold ${y.return >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {y.return > 0 ? '+' : ''}{y.return}%
                    </span>
                    <div className="absolute inset-0 border-2 border-emerald-500/0 group-hover:border-emerald-500/20 rounded-lg transition-all"></div>
                  </div>
                ))}
              </div>
            </Card>

            <ReturnChartModal
              isOpen={!!selectedTileData}
              onClose={() => setSelectedTileData(null)}
              series={selectedTileData?.series || []}
              title={selectedTileData?.title || ''}
              currency={project?.settings.baseCurrency || 'EUR'}
              timeRange={selectedTileData?.timeRange}
            />

            <HoldingsGroupModal
              isOpen={!!groupOverlay}
              onClose={() => setGroupOverlay(null)}
              title={groupOverlay?.title || ''}
              holdings={groupOverlay?.holdings || []}
              currency={project?.settings.baseCurrency || 'EUR'}
              groupValue={groupOverlay?.groupValue || 0}
              portfolioValue={portfolioTotalValue}
            />

            {/* Region Allocation */}
            <Card>
              <h3 className="font-semibold text-white flex items-center gap-2 mb-6">
                <Globe size={18} className="text-blue-400" />
                Regionen
              </h3>
              <div className="space-y-4">
                {regionData.map((region) => (
                  <button
                    key={region.name}
                    type="button"
                    onClick={() => openGroupOverlay(`Region: ${region.name}`, region)}
                    className="w-full text-left group -mx-2 px-2 py-2 rounded-lg transition-all hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-lg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 cursor-pointer"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
                        {region.name}
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 group-hover:text-slate-300 transition-colors">Details</span>
                      </span>
                      <span className="text-slate-400 flex items-center gap-1">
                        {region.value}%
                        <ChevronRight className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all group-hover:brightness-110"
                        style={{ width: `${region.value}%` }}
                      ></div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Industry Allocation */}
            <Card>
              <h3 className="font-semibold text-white flex items-center gap-2 mb-6">
                <Banknote size={18} className="text-amber-400" />
                Branchen
              </h3>
              <div className="space-y-4">
                {industryData.map((industry) => (
                  <button
                    key={industry.name}
                    type="button"
                    onClick={() => openGroupOverlay(`Branche: ${industry.name}`, industry)}
                    className="w-full text-left group -mx-2 px-2 py-2 rounded-lg transition-all hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-lg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 cursor-pointer"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
                        {industry.name}
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 group-hover:text-slate-300 transition-colors">Details</span>
                      </span>
                      <span className="text-slate-400 flex items-center gap-1">
                        {industry.value}%
                        <ChevronRight className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-amber-500 h-2 rounded-full transition-all group-hover:brightness-110"
                        style={{ width: `${industry.value}%` }}
                      ></div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
            {/* Sector Allocation */}
            <Card>
              <h3 className="font-semibold text-white flex items-center gap-2 mb-6">
                <BarChart3 size={18} className="text-purple-400" />
                Sektoren
              </h3>
              <div className="space-y-4">
                {sectorData.map((sector) => (
                  <button
                    key={sector.name}
                    type="button"
                    onClick={() => openGroupOverlay(`Sektor: ${sector.name}`, sector)}
                    className="w-full text-left group -mx-2 px-2 py-2 rounded-lg transition-all hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-lg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40 cursor-pointer"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
                        {sector.name}
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 group-hover:text-slate-300 transition-colors">Details</span>
                      </span>
                      <span className="text-slate-400 flex items-center gap-1">
                        {sector.value}%
                        <ChevronRight className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full transition-all group-hover:brightness-110"
                        style={{ width: `${sector.value}%` }}
                      ></div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Diversification Score / Alert */}
            {/* Diversification Score / Alert */}
            <Card className="flex flex-col justify-center">
              {(() => {
                const risks = [
                  { type: 'Sektor', data: sectorData[0] },
                  { type: 'Region', data: regionData[0] },
                  { type: 'Branche', data: industryData[0] }
                ]
                  .filter(item => item.data && item.data.value > 30)
                  .sort((a, b) => b.data.value - a.data.value);

                if (risks.length > 0) {
                  return (
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-yellow-500/10 rounded-xl max-h-min">
                        <AlertCircle size={32} className="text-yellow-500" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-bold text-white mb-2">Klumpenrisiken erkannt</h4>
                        <div className="space-y-3">
                          {risks.map((risk, index) => (
                            <div key={index} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{risk.type}</span>
                                <span className="text-xs font-bold text-rose-400">{risk.data.value}%</span>
                              </div>
                              <div className="text-white font-medium">{risk.data.name}</div>
                            </div>
                          ))}
                        </div>
                        <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                          Eine höhere Diversifikation in diesen Bereichen könnte die Volatilität senken.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl">
                      <Check size={32} className="text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">Gut diversifiziert</h4>
                      <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                        Kein Bereich (Sektor, Region, Branche) dominiert das Portfolio übermäßig (über 30%).
                      </p>
                    </div>
                  </div>
                );
              })()}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};





const DividendenContent = ({ selectedPortfolioIds }: { selectedPortfolioIds: string[] }) => {
  const { project } = useProject();
  const [chartView, setChartView] = useState<'monthly' | 'yearly'>('yearly'); // Default to yearly as requested "Last 5 Years"
  const [historyRange, setHistoryRange] = useState<'5Y' | 'MAX'>('5Y');
  const [dividendListModal, setDividendListModal] = useState<{
    title: string;
    items: { id: string; name: string; date: string; amount: number; type: string }[];
  } | null>(null);
  const baseCurrency = project?.settings.baseCurrency || 'EUR';
  const formatCurrency = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: baseCurrency });

  // 1. Filter Transactions (same logic as other tabs)
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioIds.length === 0) return project.transactions;
    return project.transactions.filter(t => t.portfolioId && selectedPortfolioIds.includes(t.portfolioId));
  }, [project, selectedPortfolioIds]);

  // 2. Calculate Holdings (for Yield Calculation)
  const { totalValue, totalInvested, holdings } = useMemo(() => {
    if (!project) return { totalValue: 0, totalInvested: 0, holdings: [] };

    // Quick Holdings Calcs (simplified compared to Dashboard)
    const quotes: Record<string, number> = {};
    if (project.securities) {
      Object.values(project.securities).forEach(sec => {
        if (sec.priceHistory) {
          const dates = Object.keys(sec.priceHistory).sort();
          if (dates.length > 0) quotes[sec.isin] = sec.priceHistory[dates[dates.length - 1]];
        }
      });
    }

    const { holdings } = calculateHoldings(
      filteredTransactions,
      Object.values(project.securities || {}),
      quotes,
      project.fxData.rates,
      project.settings.baseCurrency
    );

    const val = holdings.reduce((sum, h) => sum + h.value, 0);
    const inv = holdings.reduce((sum, h) => sum + (h.value - h.totalReturn), 0);
    return { totalValue: val, totalInvested: inv, holdings };
  }, [project, filteredTransactions]);

  // 3. Process Dividends
  const {
    receivedCurrentYear,
    receivedLastYear,
    monthlyData,
    recentDividends,
    upcomingDividends,
    personalYield,
    yieldOnCost,
    projectedRestYear,
    annualData
  } = useMemo(() => {
    if (!project) return { receivedCurrentYear: 0, receivedLastYear: 0, monthlyData: [], recentDividends: [], upcomingDividends: [], personalYield: 0, yieldOnCost: 0, projectedRestYear: 0, annualData: [] };

    const dividends = filteredTransactions.filter(t => t.type === 'Dividend');
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    const currentMonth = new Date().getMonth(); // 0 = Jan

    let sumCurrent = 0;
    let sumLast = 0;

    // Config for 5 Year Monthly Comparison
    const comparisonYears = Array.from({ length: 5 }, (_, i) => currentYear - i).reverse(); // [2021, 2022, 2023, 2024, 2025]
    const monthlyHistoryMap: Record<string, number> = {}; // "Year-Month" -> Amount

    const convertToBaseAtDate = (amount: number, currency: string, date: string) => {
      if (currency === baseCurrency) return amount;
      const rateFrom = CurrencyService.getRate(project.fxData, currency, date) || 1;
      const amountEur = amount / rateFrom;
      if (baseCurrency === 'EUR') return amountEur;
      const rateTo = CurrencyService.getRate(project.fxData, baseCurrency, date) || 1;
      return amountEur * rateTo;
    };
    const convertDividendToBase = (amount: number, currency: string, date: string) => {
      return convertToBaseAtDate(amount, currency, date);
    };

    // Group actual dividends (converted to base currency)
    dividends.forEach(d => {
      const date = new Date(d.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const amount = convertDividendToBase(d.amount, d.currency, d.date);

      if (year === currentYear) {
        sumCurrent += amount;
      } else if (year === lastYear) {
        sumLast += amount;
      }

      // Populate 5-Year Map
      if (year >= currentYear - 4) {
        monthlyHistoryMap[`${year}-${month}`] = (monthlyHistoryMap[`${year}-${month}`] || 0) + amount;
      }
    });

    // Helper: Get latest FX rate
    const getLatestRate = (currency: string): number => {
      const fxBase = project.fxData.baseCurrency || 'EUR';
      if (currency === fxBase) return 1;
      const rates = project.fxData.rates[currency];
      if (!rates) return 1; // Fallback
      // Find latest date
      const dates = Object.keys(rates).sort().reverse();
      return rates[dates[0]] || 1;
    };

    // Helper: Convert to Base Currency
    const convertToBase = (amount: number, currency: string, date?: string) => {
      const effectiveDate = date || project.fxData.lastUpdated || new Date().toISOString().split('T')[0];
      return convertToBaseAtDate(amount, currency, effectiveDate);
    };

    const convertToBaseLatest = (amount: number, currency: string) => {
      if (currency === baseCurrency) return amount;
      const rateOrg = getLatestRate(currency);
      const rateBase = getLatestRate(baseCurrency);
      const inEur = amount / rateOrg;
      return baseCurrency === 'EUR' ? inEur : inEur * rateBase;
    };

    // --- FORECAST LOGIC (History & Upcoming Based) ---
    let projectedAnnual = 0;
    const forecastEvents: { date: Date, amount: number, name: string, ticker: string, debug?: string }[] = [];
    const monthlyForecastMap: Record<number, number> = {}; // Month -> Amount

    holdings.forEach((h: any) => {
      const sec = project.securities?.[h.security.isin];
      if (!sec) return;

      const shares = h.quantity || 0;
      if (shares === 0) return;

      const secCurrency = sec.currency || 'EUR';
      // const fxRate = getLatestRate(secCurrency);
      // Rate is typically Base/Quote or Quote/Base? 
      // Usually OpenParqet stores rate as "1 EUR = X USD". 
      // If base is CHF and we have USD, we need USD->CHF.
      // Assuming project.fxData stores rates relative to BASE (EUR usually).
      // If Project Base is `CHF` and data is from ECB (EUR base), we need to be careful.
      // Let's assume `calculateHoldings` logic handles FX already correctly.
      // If `fxData.rates` contains `USD` it means `1 EUR = x USD`.
      // If Project Base is `CHF` and Sec is `USD`:
      // Convert USD -> EUR -> CHF.
      // For simplicity here, I will check how `calculateHoldings` converts. 
      // It likely uses `1 / rate` if `rate` is `EURUSD`.
      // Let's assume standard "Divide by rate if rate is FC/EUR" logic if base is EUR.
      // If `baseCurrency` is CHF, `fxData` might be rebased?
      // Let's stick to a simple converter: 
      // If we have EUR based rates: ValueInEUR = ValueInOrg / Rate(Org). ValueInTarget = ValueInEUR * Rate(Target).

      // 1. Check Upcoming Dividends (Confirmed)
      if (sec.upcomingDividends && Array.isArray(sec.upcomingDividends)) {
        sec.upcomingDividends.forEach((ud: any) => {
          const exDate = new Date(ud.exDate);
          if (exDate.getFullYear() === currentYear && exDate > new Date()) {
            let amount = ud.amount;
            // If amount is missing, infer from latest history
            if (!amount && sec.dividendHistory?.length) {
              const sortedHist = [...sec.dividendHistory].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
              amount = sortedHist[0].amount;
            }

            if (amount) {
              const totalPayout = amount * shares;
              const finalVal = convertToBaseLatest(totalPayout, secCurrency);

              forecastEvents.push({
                date: exDate,
                amount: finalVal,
                name: sec.name,
                ticker: sec.symbol || sec.isin,
                debug: `${shares}x ~${amount.toFixed(2)} ${secCurrency}`
              });
              monthlyForecastMap[exDate.getMonth()] = (monthlyForecastMap[exDate.getMonth()] || 0) + finalVal;
              projectedAnnual += finalVal;
            }
          }
        });
      }

      // 2. Project from History (If no upcoming for the period)
      // Strategy: Look at Dividends from Previous Year (Last Year). 
      // If a dividend was paid in Month M last year, and we haven't passed Month M this year (or we passed it but assume next year... wait, REST of year).
      // Only look for months > currentMonth.
      if (sec.dividendHistory && Array.isArray(sec.dividendHistory)) {
        sec.dividendHistory.forEach((dh: any) => {
          const dDate = new Date(dh.date);
          if (dDate.getFullYear() === lastYear) {
            // Check if this "slot" is in the future for current year
            // e.g. Last year paid on Sept 15. Today is Feb. 
            // We expect a payment in Sept this year.
            const thisYearDate = new Date(currentYear, dDate.getMonth(), dDate.getDate());

            // Only add if it's in the future AND we haven't already added a confirmed upcoming dividend for this month?
            // (Simple dedup: if monthlyForecastMap has entry, maybe skip? No, multiple stocks pay in same month).
            // Better: check if `forecastEvents` already has an entry for this stock in this month.

            if (thisYearDate > new Date()) {
              const hasUpcoming = forecastEvents.some(e => e.ticker === sec.symbol && e.date.getMonth() === dDate.getMonth());
              if (!hasUpcoming) {
                const totalPayout = dh.amount * shares;
                const finalVal = convertToBaseLatest(totalPayout, secCurrency);

                forecastEvents.push({
                  date: thisYearDate, // Projected date
                  amount: finalVal,
                  name: sec.name,
                  ticker: sec.symbol || sec.isin,
                  debug: `Hist(${dDate.toLocaleDateString()}): ${shares}x ${dh.amount} ${secCurrency}`
                });
                monthlyForecastMap[dDate.getMonth()] = (monthlyForecastMap[dDate.getMonth()] || 0) + finalVal;
                projectedAnnual += finalVal;
              }
            }
          }
        });
      }
    });

    // Estimate Rest of Year
    // Only sum the "future" forecast events
    const estimatedRest = forecastEvents.filter(e => e.date > new Date()).reduce((sum, e) => sum + e.amount, 0);

    // --- RECONSTRUCTED HISTORY (Actual & Theoretical Combined) ---
    // Instead of naive "current shares * past div", we rebuild share count at each dividend date.
    const theoreticalLast: Record<number, number> = {};
    const theoreticalCurrent: Record<number, number> = {};
    const monthlyTheoreticalMap: Record<string, number> = {}; // "Year-Month" -> Amount
    const annualTheoreticalMap: Record<number, number> = {};  // Year -> Amount
    const theoreticalRecent: { id: string; name: string; date: string; amount: number; type: string; sortKey: number }[] = [];
    const today = new Date();

    // 1. Identify all securities involved in transactions
    const relevantIsins = new Set(filteredTransactions.map(t => t.isin).filter(Boolean) as string[]);

    // Group transactions by ISIN for fast lookup
    const txByIsin: Record<string, any[]> = {};
    filteredTransactions.forEach(t => {
      const id = t.isin; // consistent ID
      if (!id) return;
      if (!txByIsin[id]) txByIsin[id] = [];
      txByIsin[id].push(t);
    });

    relevantIsins.forEach((isin: string) => {
      const sec = project.securities?.[isin];
      // If security or history missing, we can't do anything
      if (!sec || !sec.dividendHistory) return;

      // Sort Dividend History (Oldest first) needed? No, just iterate.
      // Sort Transactions (Oldest first) for running balance
      const secTx = (txByIsin[isin] || []).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // We only care about dividends in our relevant buckets (Comparison Years + Last/Current Year)
      // Optimization: Pre-filter dividends? Or just check date.

      sec.dividendHistory.forEach((dh: any) => {
        const dDate = new Date(dh.date);
        const month = dDate.getMonth();
        const year = dDate.getFullYear();

        // Optimization: Skip if year is older than our Max Range (e.g. 2000)
        const minYear = Math.min(...comparisonYears, lastYear);
        if (year < minYear - 1) return; // -1 buffer

        // CALCULATE SHARES AT DATE (dDate)
        // Sum buys/sells where date < dDate (Ex-Date usually determines entitlement, assuming dh.date is Ex-Date or Pay-Date close enough)
        let sharesAtDate = 0;
        for (const t of secTx) {
          if (new Date(t.date) > dDate) break; // Transaction happened after dividend

          const qty = Math.abs(t.shares || t.quantity || 0);
          if (t.type === 'Buy' || t.type === 'Sparplan_Buy') {
            sharesAtDate += qty;
          } else if (t.type === 'Sell') {
            sharesAtDate -= qty;
          }
        }

        if (sharesAtDate <= 0.0001) return; // No shares held at this time

        const secCurrency = sec.currency || 'EUR';
        const amount = convertToBase(dh.amount * sharesAtDate, secCurrency, dh.date);

        // Populate Maps
        monthlyTheoreticalMap[`${year}-${month}`] = (monthlyTheoreticalMap[`${year}-${month}`] || 0) + amount;
        annualTheoreticalMap[year] = (annualTheoreticalMap[year] || 0) + amount;

        if (dDate <= today) {
          theoreticalRecent.push({
            id: `${isin}-${dh.date}`,
            name: sec.name || isin,
            date: dDate.toLocaleDateString('de-DE'),
            amount,
            type: 'Theoretisch',
            sortKey: dDate.getTime()
          });
        }

        if (year === lastYear) {
          theoreticalLast[month] = (theoreticalLast[month] || 0) + amount;
        } else if (year === currentYear) {
          theoreticalCurrent[month] = (theoreticalCurrent[month] || 0) + amount;
        }
      });
    });

    // Prepare Chart Data
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    const chartData = monthNames.map((name, monthIndex) => {
      // Create 5-year values
      const yearsData = comparisonYears.map(year => {
        // Use Actual if available, otherwise Theoretical
        const actual = monthlyHistoryMap[`${year}-${monthIndex}`] || 0;
        const theoretical = monthlyTheoreticalMap[`${year}-${monthIndex}`] || 0;

        return {
          year,
          amount: actual > 0 ? actual : theoretical
        };
      });

      return {
        month: name,
        years: yearsData
      };
    });

    // Sort Forecast Events for List
    const upcomingList = forecastEvents
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(e => ({
        date: e.date.toLocaleDateString(),
        name: e.name,
        amount: e.amount,
        ticker: e.ticker,
        type: 'Prognose',
        debug: e.debug
      }));

    // List Data (Past)
    const recentActual = [...dividends]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(d => ({
        id: d.id,
        name: d.name || d.isin,
        date: new Date(d.date).toLocaleDateString('de-DE'),
        amount: convertDividendToBase(d.amount, d.currency, d.date),
        type: 'Ausschuettung'
      }));

    const recentTheoretical = theoreticalRecent
      .sort((a, b) => b.sortKey - a.sortKey);

    const recent = recentActual.length > 0 ? recentActual : recentTheoretical;

    // Updated Yields
    // Personal Yield = (Received YTD + Forecast Rest) / Total Value? 
    // Or just (Forecast 12m) / Value?
    // User wants "Personal Dividend Yield". Usually: (Projected Annual Income) / Invested Capital.
    // Let's use (Sum(Last 12 Month Actuals) if available OR Projected Annual)
    // Given we built `projectedAnnual` quite carefully:
    const totalProjected = (sumCurrent + estimatedRest); // Mix of YTD actuals + Future Forecast
    // Or we can construct strict "Forward Annual Dividend" sum.

    const pYield = totalValue > 0 ? (totalProjected / totalValue) * 100 : 0;
    const yoc = totalInvested > 0 ? (totalProjected / totalInvested) * 100 : 0;

    // --- ANNUAL DATA (Yearly History) ---
    const annualHistoryMap: Record<number, number> = {};
    const yearsSet = new Set<number>();

    // 1. From Transactions
    dividends.forEach(d => {
      const y = new Date(d.date).getFullYear();
      const amount = convertDividendToBase(d.amount, d.currency, d.date);
      annualHistoryMap[y] = (annualHistoryMap[y] || 0) + amount;
      yearsSet.add(y);
    });

    // 2. From Theoretical History (to fill gaps for 5Y view if no data?)
    // Actually, "last 5 years" usually means actuals. 
    // If the user wants "Everything", we show 0 if nothing happened.
    // Let's ensure we have at least last 5 years in the set if chartView is 5Y?
    // Or just show what we have.
    const currentYearNum = new Date().getFullYear();

    // Merge Theoretical into Annual Map if Actual is missing?
    // Or just use maximum?
    // Let's iterate over theoretical years
    Object.keys(annualTheoreticalMap).forEach(yStr => {
      const y = parseInt(yStr);
      if (!annualHistoryMap[y]) {
        annualHistoryMap[y] = annualTheoreticalMap[y];
        // Add to yearsSet if recent enough or if we want to show all theoretical history
        if (y >= currentYearNum - 10) yearsSet.add(y);
      }
    });

    for (let y = currentYearNum - 4; y <= currentYearNum; y++) {
      yearsSet.add(y);
    }

    const sortedYears = Array.from(yearsSet).sort();
    const annualData = sortedYears.map(year => ({
      year,
      amount: annualHistoryMap[year] || 0,
      isCurrent: year === currentYearNum,
      isForecast: year > currentYearNum // Future if any
    }));

    return {
      receivedCurrentYear: sumCurrent,
      receivedLastYear: sumLast,
      monthlyData: chartData,
      recentDividends: recent,
      upcomingDividends: upcomingList,
      personalYield: pYield,
      yieldOnCost: yoc,
      projectedRestYear: estimatedRest,
      annualData
    };
  }, [project, filteredTransactions, totalValue, totalInvested, holdings]);

  // Prepare Yearly Data for Display
  const yearlyDisplayData = useMemo(() => {
    if (!annualData) return [];
    let data = annualData;
    if (historyRange === '5Y') {
      const currentYear = new Date().getFullYear();
      data = annualData.filter(d => d.year >= currentYear - 4);
    }
    return data;
  }, [annualData, historyRange]);


  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-emerald-500/10 rounded-xl">
            <PiggyBank size={28} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Erhalten {new Date().getFullYear()}</p>
            <p className="text-2xl font-bold text-white">{receivedCurrentYear.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
            <p className={`text-xs flex items-center mt-0.5 ${receivedCurrentYear >= receivedLastYear ? 'text-emerald-400' : 'text-rose-400'}`}>
              <TrendingUp size={12} className="mr-1" /> {receivedLastYear > 0 ? ((receivedCurrentYear - receivedLastYear) / receivedLastYear * 100).toFixed(1) : 0}% vs. Vorjahr
            </p>
          </div>
        </Card>
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Timer size={28} className="text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Erwartet (Restjahr)</p>
            <p className="text-2xl font-bold text-white">{projectedRestYear.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
            <p className="text-xs text-slate-400 mt-0.5">Prognose auf Basis von Positionen</p>
          </div>
        </Card>
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-purple-500/10 rounded-xl">
            <Activity size={28} className="text-purple-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Pers. Dividendenrendite</p>
            <p className="text-2xl font-bold text-white">{personalYield.toFixed(2)} %</p>
            <p className="text-xs text-slate-400 mt-0.5">Yield on Cost: {yieldOnCost.toFixed(2)}%</p>
          </div>
        </Card>
      </div>

      {/* Dividend Chart (Year over Year) */}
      <Card className="h-96 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <BarChart3 size={18} className="text-emerald-400" />
            Dividendenentwicklung
          </h3>
          <div className="flex gap-4 items-center">
            {/* View Toggles */}
            <div className="flex bg-slate-900/50 p-1 rounded-lg">
              <button
                onClick={() => setChartView('monthly')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${chartView === 'monthly' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Monatlich
              </button>
              <button
                onClick={() => setChartView('yearly')}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${chartView === 'yearly' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Jährlich
              </button>
            </div>

            {/* Range Toggles (Only for Yearly) */}
            {chartView === 'yearly' && (
              <div className="flex bg-slate-900/50 p-1 rounded-lg">
                <button
                  onClick={() => setHistoryRange('5Y')}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${historyRange === '5Y' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  5J
                </button>
                <button
                  onClick={() => setHistoryRange('MAX')}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${historyRange === 'MAX' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  max
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 w-full flex items-end justify-between gap-2 sm:gap-4 px-2">
          {chartView === 'monthly' ? (
            // --- MONTHLY VIEW (Last 5 Years) ---
            monthlyData.map((m, i) => {
              // Find global max for scale
              const allAmounts = monthlyData.flatMap(d => d.years.map(y => y.amount));
              const maxVal = Math.max(...allAmounts, 1);
              const max = maxVal * 1.1;

              return (
                <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group relative">
                  <div className="w-full flex justify-center items-end gap-px sm:gap-1 h-full px-0.5">
                    {m.years.map((yData, idx) => (
                      <div
                        key={yData.year}
                        className={`flex-1 rounded-t-sm transition-all relative
                                ${yData.year === new Date().getFullYear() ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}
                            `}
                        style={{ height: `${(yData.amount / max) * 100}%` }}
                      >
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] sm:text-xs text-slate-500 mt-3 truncate w-full text-center">{m.month}</span>

                  {/* Hover Tooltip (Detailed) */}
                  <div className="absolute bottom-full mb-2 bg-slate-800 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 w-48 text-left">
                    <div className="text-xs text-slate-400 mb-2 font-bold border-b border-slate-700 pb-1">{m.month} Historie</div>
                    {m.years.slice().reverse().map(yData => (
                      <div key={yData.year} className="flex justify-between text-xs mb-0.5">
                        <span className={yData.year === new Date().getFullYear() ? "text-emerald-400 font-bold" : "text-slate-400"}>{yData.year}</span>
                        <span className="text-white font-medium">{formatCurrency(yData.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            // --- YEARLY VIEW ---
            (() => {
              const maxVal = Math.max(...yearlyDisplayData.map(d => d.amount));
              const max = maxVal > 0 ? maxVal * 1.1 : 100;

              return yearlyDisplayData.map((d) => (
                <div key={d.year} className="flex-1 flex flex-col justify-end items-center h-full group relative">
                  <div
                    className={`w-4 sm:w-8 rounded-t-lg transition-all ${d.isCurrent ? 'bg-emerald-500' : 'bg-slate-600 hover:bg-slate-500'}`}
                    style={{ height: `${(d.amount / max) * 100}%` }}
                  ></div>
                  <span className="text-xs text-slate-500 mt-3">{d.year}</span>

                  <div className="absolute bottom-full mb-2 bg-slate-800 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 min-w-[80px] text-center">
                    <div className="text-xs text-slate-400 mb-1">{d.year}</div>
                    <div className="text-sm font-bold text-white">{formatCurrency(d.amount)}</div>
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      </Card>

      {/* Bottom Section: Calendar & History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Payments */}
        <Card className="flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <CalendarCheck size={18} className="text-blue-400" />
              {'N\u00e4chste Auszahlungen'}
            </h3>
          </div>
          <div className="space-y-3 flex-1">
            {upcomingDividends.length === 0 ? (
              <div className="text-slate-400 text-sm p-4 text-center">
                {'Keine best\u00e4tigten Ex-Dates.'}
                <br />
                <span className="text-xs text-slate-500">Prognose basiert auf aktuellen Positionen.</span>
              </div>
            ) : (
              upcomingDividends.slice(0, 5).map((div, i) => (
                <div key={`${div.ticker}-${div.date}-${i}`} className={`flex items-center justify-between py-3 ${i !== Math.min(upcomingDividends.length, 5) - 1 ? 'border-b border-slate-700/50' : ''}`}>
                  <div>
                    <div className="text-sm font-medium text-slate-200">{div.name}</div>
                    <div className="text-xs text-slate-500">{div.date} - {div.type}</div>
                  </div>
                  <div className="text-emerald-400 font-medium text-sm">
                    +{formatCurrency(div.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
          {upcomingDividends.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => {
                  if (upcomingDividends.length <= 5) return;
                  setDividendListModal({
                    title: 'N\u00e4chste Auszahlungen',
                    items: upcomingDividends.map((div, i) => ({
                      id: `${div.ticker}-${div.date}-${i}`,
                      name: div.name,
                      date: div.date,
                      amount: div.amount,
                      type: div.type
                    }))
                  });
                }}
                disabled={upcomingDividends.length <= 5}
                className="text-xs text-slate-300 hover:text-white transition-colors disabled:opacity-50"
              >
                {upcomingDividends.length <= 5
                  ? `Alle angezeigt (${upcomingDividends.length})`
                  : `Alle anzeigen (${upcomingDividends.length})`}
              </button>
            </div>
          )}
        </Card>

        {/* Recent History */}
        <Card className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Wallet size={18} className="text-slate-400" />
              Zahlungshistorie
            </h3>
          </div>
          <div className="space-y-0 flex-1">
            {recentDividends.length === 0 ? (
              <div className="text-slate-400 text-sm p-4 text-center">
                Keine Auszahlungen gefunden.
              </div>
            ) : (
              recentDividends.slice(0, 5).map((div, i) => (
                <div key={div.id} className={`flex items-center justify-between py-3 ${i !== Math.min(recentDividends.length, 5) - 1 ? 'border-b border-slate-700/50' : ''}`}>
                  <div>
                    <div className="text-sm font-medium text-slate-200">{div.name}</div>
                    <div className="text-xs text-slate-500">{div.date} - {div.type}</div>
                  </div>
                  <div className="text-emerald-400 font-medium text-sm">
                    +{formatCurrency(div.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
          {recentDividends.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => {
                  if (recentDividends.length <= 5) return;
                  setDividendListModal({
                    title: 'Zahlungshistorie',
                    items: recentDividends.map(div => ({
                      id: div.id,
                      name: div.name,
                      date: div.date,
                      amount: div.amount,
                      type: div.type
                    }))
                  });
                }}
                disabled={recentDividends.length <= 5}
                className="text-xs text-slate-300 hover:text-white transition-colors disabled:opacity-50"
              >
                {recentDividends.length <= 5
                  ? `Alle angezeigt (${recentDividends.length})`
                  : `Alle anzeigen (${recentDividends.length})`}
              </button>
            </div>
          )}
        </Card>
      </div>

      <DividendListModal
        isOpen={!!dividendListModal}
        onClose={() => setDividendListModal(null)}
        title={dividendListModal?.title || ''}
        items={dividendListModal?.items || []}
        currency={baseCurrency}
      />
    </div>
  );
};




const PortfolioList = ({ selectedPortfolioIds, onSelectSecurity }: { selectedPortfolioIds: string[], onSelectSecurity: (isin: string) => void }) => {
  const { project } = useProject();

  // Filter transactions based on selected Portfolio
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioIds.length === 0) return project.transactions;
    return project.transactions.filter(t => t.portfolioId && selectedPortfolioIds.includes(t.portfolioId));
  }, [project, selectedPortfolioIds]);

  const { holdings } = useMemo(() => {
    if (!project) return { holdings: [] };

    // Extract latest quotes from securities history
    const quotes: Record<string, number> = {};
    if (project.securities) {
      Object.values(project.securities).forEach(sec => {
        if (sec.priceHistory) {
          const dates = Object.keys(sec.priceHistory).sort();
          if (dates.length > 0) {
            const lastDate = dates[dates.length - 1];
            quotes[sec.isin] = sec.priceHistory[lastDate];
          }
        }
      });
    }

    return calculateHoldings(
      filteredTransactions,
      Object.values(project.securities || {}),
      quotes, // Pass real quotes
      project.fxData.rates, // fxRates
      project.settings.baseCurrency // Pass selected base currency
    );
  }, [project, filteredTransactions]);

  return (
    <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Wallet size={20} className="text-emerald-500" />
          Wertpapiere
        </h2>
        <div className="text-sm text-slate-400">
          {holdings.length} Positionen
        </div>
      </div>

      <div className="space-y-3">
        {holdings.length === 0 ? (
          <div className="text-slate-400 text-sm p-8 text-center bg-slate-800/20 rounded-xl">Keine Positionen vorhanden. Importiere deine Trades!</div>
        ) : (
          holdings.map((stock) => (
            <div key={stock.security.isin} onClick={() => onSelectSecurity(stock.security.isin)} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between hover:bg-slate-800/80 transition cursor-pointer">
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs bg-slate-700`}>
                  {stock.security.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-medium text-white">{stock.security.name}</h4>
                  <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                    <span className="bg-slate-700 px-1.5 rounded">{stock.security.quoteType || 'Aktie'}</span>
                    <span>{stock.quantity} Stk.</span>
                    <span className="text-slate-500">•</span>
                    <span>Ø {stock.averageBuyPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                    <span className="text-slate-500">•</span>
                    <span>Aktuell: {stock.currentPriceInOriginalCurrency.toLocaleString('de-DE', { style: 'currency', currency: stock.currency })}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="font-medium text-white">{stock.value.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}</p>
                <div className="flex flex-col items-end">
                  <p className={`text-xs ${(stock.totalReturn) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {stock.totalReturn > 0 ? '+' : ''}{stock.totalReturn.toLocaleString('de-DE', { style: 'currency', currency: project?.settings.baseCurrency || 'EUR' })}
                  </p>
                  <p className={`text-xs ${(stock.totalReturnPercent) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {stock.totalReturnPercent > 0 ? '+' : ''}{stock.totalReturnPercent.toLocaleString('de-DE', { maximumFractionDigits: 2 })}%
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
