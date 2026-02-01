"use client";

import React, { useState, useEffect } from 'react';
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
import { useMemo } from 'react';
import { calculateHoldings, calculatePortfolioHistory } from '@/lib/portfolioUtils';
import { calculateAnalysisMetrics } from '@/lib/analysisService';
import { useProject } from '@/contexts/ProjectContext';
import { ProjectLauncher } from '@/components/ProjectLauncher';
import { DataSourcesContent } from '@/components/DataSourcesContent';
import { TransactionModal } from '@/components/TransactionModal';
import { SimpleAreaChart } from '@/components/SimpleAreaChart';
import { AllocationChart } from '@/components/AllocationChart';


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

const sectorData = [
  { name: 'Technologie', value: 42 },
  { name: 'Finanzen', value: 18 },
  { name: 'Gesundheitswesen', value: 12 },
  { name: 'Zykl. Konsum', value: 10 },
  { name: 'Industrie', value: 8 },
  { name: 'Krypto', value: 10 },
];

const regionData = [
  { name: 'Nordamerika', value: 62 },
  { name: 'Europa', value: 18 },
  { name: 'Asien / Pazifik', value: 12 },
  { name: 'Schwellenländer', value: 8 },
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
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('all');
  const [selectedSecurityIsin, setSelectedSecurityIsin] = useState<string | null>(null);
  const [analysisCache, setAnalysisCache] = useState<any>(null);

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
        return <DashboardContent timeRange={timeRange} setTimeRange={setTimeRange} selectedPortfolioId={selectedPortfolioId} onSelectSecurity={setSelectedSecurityIsin} />;
      case 'Portfolio':
        return <PortfolioList selectedPortfolioId={selectedPortfolioId} onSelectSecurity={setSelectedSecurityIsin} />;
      case 'Analyse':
        return <AnalysisContent selectedPortfolioId={selectedPortfolioId} cachedData={analysisCache} onCacheUpdate={handleCacheUpdate} />;
      case 'Dividenden':
        return <DividendenContent />;
      case 'Datenquellen':
        return <DataSourcesContent />;
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
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-400 to-blue-500 flex items-center justify-center font-bold text-white text-xs">
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
              <div className="hidden sm:flex items-center space-x-2 bg-slate-800 rounded-lg px-2 py-1">
                <span className="text-xs text-slate-400 font-medium">Depot:</span>
                <select
                  value={selectedPortfolioId}
                  onChange={(e) => setSelectedPortfolioId(e.target.value)}
                  className="bg-transparent text-sm font-bold text-white outline-none border-none focus:ring-0 cursor-pointer py-1 max-w-[150px]"
                >
                  <option value="all" className="bg-slate-800">Alle</option>
                  {project.portfolios.map(p => (
                    <option key={p.id} value={p.id} className="bg-slate-800">{p.name}</option>
                  ))}
                </select>
              </div>
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
              onClick={() => setIsTransactionModalOpen(true)}
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
      <TransactionModal isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)} />

    </div>
  );
}

// --- Sub-Components ---

const DashboardContent = ({ timeRange, setTimeRange, selectedPortfolioId, onSelectSecurity }: { timeRange: string, setTimeRange: (range: string) => void, selectedPortfolioId: string, onSelectSecurity: (isin: string) => void }) => {
  const { project } = useProject();
  const [chartMode, setChartMode] = useState<'value' | 'performance'>('value');

  // Filter transactions based on selected Portfolio
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioId === 'all') return project.transactions;
    return project.transactions.filter(t => t.portfolioId === selectedPortfolioId);
  }, [project, selectedPortfolioId]);

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
        if (firstPoint.value > 0) {
          badgeValue = ((lastPoint.value - firstPoint.value) / firstPoint.value) * 100;
        }
      } else {
        badgeValue = lastPoint.value;
      }

      if (badgeValue < 0) {
        color = '#f43f5e';
      }
    }
    return { badgeValue, color };
  }, [displayData, chartMode]);

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
          <h3 className="text-slate-400 font-medium">Dividenden (YTD)</h3>
          <div className="mt-2">
            <span className="text-3xl font-bold text-white">458,20 €</span>
            <p className="text-sm text-slate-500 mt-1">Nächste Auszahlung: 12,50 € (Coca-Cola)</p>
          </div>
          <div className="h-16 flex items-end space-x-1 mt-4">
            {[20, 35, 15, 45, 60, 40].map((h, i) => (
              <div key={i} className="flex-1 bg-blue-500/20 hover:bg-blue-500/40 rounded-t transition-colors relative group" style={{ height: `${h}%` }}>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-700 text-xs px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {h * 2} €
                </div>
              </div>
            ))}
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
                    {chartMetrics.badgeValue >= 0 ? '+' : ''}{chartMetrics.badgeValue.toFixed(2)}% {timeRange}
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

const AnalysisContent = ({
  selectedPortfolioId,
  cachedData,
  onCacheUpdate
}: {
  selectedPortfolioId: string,
  cachedData?: any,
  onCacheUpdate?: (data: any) => void
}) => {
  const { project } = useProject();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [isCalculating, setIsCalculating] = useState(true);

  // Filter transactions based on selected Portfolio (same as Dashboard)
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioId === 'all') return project.transactions;
    return project.transactions.filter(t => t.portfolioId === selectedPortfolioId);
  }, [project, selectedPortfolioId]);

  // Calculate portfolio history for MAX (for analysis metrics across years)
  // Moved to effect to unblock UI
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [analysisMetrics, setAnalysisMetrics] = useState<any>(
    { volatility: 0, sharpeRatio: 0, maxDrawdown: 0, maxDrawdownDate: '', availableYears: [], monthlyReturns: [] }
  );

  useEffect(() => {
    if (!project) return;

    // Check Cache
    const cacheKey = `${project.id}-${selectedPortfolioId}`;
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

  const volLabel = getVolatilityLabel(analysisMetrics.volatility);
  const sharpeLabel = getSharpeLabel(analysisMetrics.sharpeRatio);

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

          {/* Risk Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="flex flex-col items-center justify-center p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Volatilität (1J)</p>
              <span className="text-xl font-bold text-white">{analysisMetrics.volatility.toFixed(1)}%</span>
              <span className={`text-xs mt-1 ${volLabel.color}`}>{volLabel.text}</span>
            </Card>
            <Card className="flex flex-col items-center justify-center p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sharpe Ratio</p>
              <span className="text-xl font-bold text-white">{analysisMetrics.sharpeRatio.toFixed(2)}</span>
              <span className={`text-xs mt-1 ${sharpeLabel.color}`}>{sharpeLabel.text}</span>
            </Card>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Monthly Heatmap */}
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Activity size={18} className="text-emerald-400" />
                  Monatliche Rendite ({selectedYear})
                </h3>
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
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {displayedMonthlyReturns.map((m) => (
                  <div key={m.month} className="bg-slate-900/50 rounded-lg p-3 flex flex-col items-center justify-center hover:bg-slate-800 transition">
                    <span className="text-xs text-slate-500 mb-1">{m.month}</span>
                    <span className={`font-bold ${m.return >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.return > 0 ? '+' : ''}{m.return}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Region Allocation */}
            <Card>
              <h3 className="font-semibold text-white flex items-center gap-2 mb-6">
                <Globe size={18} className="text-blue-400" />
                Regionen
              </h3>
              <div className="space-y-4">
                {regionData.map((region) => (
                  <div key={region.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">{region.name}</span>
                      <span className="text-slate-400">{region.value}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${region.value}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sector Allocation */}
            <Card>
              <h3 className="font-semibold text-white flex items-center gap-2 mb-6">
                <BarChart3 size={18} className="text-purple-400" />
                Sektoren
              </h3>
              <div className="space-y-4">
                {sectorData.map((sector) => (
                  <div key={sector.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">{sector.name}</span>
                      <span className="text-slate-400">{sector.value}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full"
                        style={{ width: `${sector.value}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Diversification Score / Alert */}
            <Card className="flex flex-col justify-center">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-yellow-500/10 rounded-xl">
                  <AlertCircle size={32} className="text-yellow-500" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Klumpenrisiko erkannt</h4>
                  <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                    Dein Portfolio hat eine starke Gewichtung im Sektor <strong>Technologie (42%)</strong>.
                    Eine höhere Diversifikation könnte die Volatilität senken.
                  </p>
                  <button className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition">
                    Details anzeigen
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};


const DividendenContent = () => (
  <div className="space-y-6">
    {/* Top KPIs */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="flex items-center space-x-4">
        <div className="p-3 bg-emerald-500/10 rounded-xl">
          <PiggyBank size={28} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-sm text-slate-500">Erhalten 2023</p>
          <p className="text-2xl font-bold text-white">1.135,00 €</p>
          <p className="text-xs text-emerald-400 flex items-center mt-0.5">
            <TrendingUp size={12} className="mr-1" /> +12% vs. Vorjahr
          </p>
        </div>
      </Card>
      <Card className="flex items-center space-x-4">
        <div className="p-3 bg-blue-500/10 rounded-xl">
          <Timer size={28} className="text-blue-500" />
        </div>
        <div>
          <p className="text-sm text-slate-500">Erwartet (Restjahr)</p>
          <p className="text-2xl font-bold text-white">235,00 €</p>
          <p className="text-xs text-slate-400 mt-0.5">Basierend auf Historie</p>
        </div>
      </Card>
      <Card className="flex items-center space-x-4">
        <div className="p-3 bg-purple-500/10 rounded-xl">
          <Activity size={28} className="text-purple-500" />
        </div>
        <div>
          <p className="text-sm text-slate-500">Pers. Dividendenrendite</p>
          <p className="text-2xl font-bold text-white">1,92 %</p>
          <p className="text-xs text-slate-400 mt-0.5">Yield on Cost: 2,4%</p>
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
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-slate-600 rounded-sm"></span>
            <span className="text-slate-400">2022</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-emerald-500 rounded-sm"></span>
            <span className="text-slate-400">2023</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-emerald-500/40 rounded-sm border border-emerald-500/50 border-dashed"></span>
            <span className="text-slate-400">Prognose</span>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full flex items-end justify-between gap-2 sm:gap-4 px-2">
        {dividendMonthly.map((m, i) => {
          const max = 350; // hardcoded scale for mockup
          return (
            <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group relative">
              {/* Bars Container */}
              <div className="w-full flex justify-center items-end gap-1 h-full">
                {/* Previous Year */}
                <div
                  className="w-1.5 sm:w-3 bg-slate-600 rounded-t-sm transition-all hover:bg-slate-500"
                  style={{ height: `${(m.prev / max) * 100}%` }}
                ></div>
                {/* Current Year / Forecast */}
                <div
                  className={`w-1.5 sm:w-3 rounded-t-sm transition-all ${m.forecast ? 'bg-emerald-500/30 border border-emerald-500/50 border-dashed border-b-0' : 'bg-emerald-500 hover:bg-emerald-400'}`}
                  style={{ height: `${((m.current || m.forecast || 0) / max) * 100}%` }}
                ></div>
              </div>
              <span className="text-xs text-slate-500 mt-3">{m.month}</span>

              {/* Hover Tooltip */}
              <div className="absolute bottom-full mb-2 bg-slate-800 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-24 text-center">
                <div className="text-xs text-slate-400 mb-1">{m.month}</div>
                <div className="text-sm font-bold text-white">{(m.current || m.forecast)} €</div>
                <div className="text-xs text-slate-500">2022: {m.prev} €</div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>

    {/* Bottom Section: Calendar & History */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Upcoming Payments */}
      <Card>
        <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
          <CalendarCheck size={18} className="text-blue-400" />
          Nächste Auszahlungen
        </h3>
        <div className="space-y-3">
          {upcomingDividends.map((div) => (
            <div key={div.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl hover:bg-slate-800 transition border border-transparent hover:border-slate-700">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-slate-900 ${div.color === 'bg-gray-100' ? 'text-black' : 'text-white'} ${div.color}`}>
                  {div.ticker}
                </div>
                <div>
                  <div className="font-medium text-white">{div.name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    Ex-Date: {div.payDate}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-white">{div.amount.toFixed(2)} €</div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${div.status === 'Bestätigt' ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-slate-600 text-slate-400'}`}>
                  {div.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent History */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Wallet size={18} className="text-slate-400" />
            Zahlungshistorie
          </h3>
          <button className="text-xs text-emerald-400 hover:text-emerald-300">Alle</button>
        </div>
        <div className="space-y-0">
          {recentDividends.map((div, i) => (
            <div key={div.id} className={`flex items-center justify-between py-3 ${i !== recentDividends.length - 1 ? 'border-b border-slate-700/50' : ''}`}>
              <div>
                <div className="text-sm font-medium text-slate-200">{div.name}</div>
                <div className="text-xs text-slate-500">{div.date} • {div.type}</div>
              </div>
              <div className="text-emerald-400 font-medium text-sm">
                +{div.amount.toFixed(2)} €
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </div>
);




const PortfolioList = ({ selectedPortfolioId, onSelectSecurity }: { selectedPortfolioId: string, onSelectSecurity: (isin: string) => void }) => {
  const { project } = useProject();

  // Filter transactions based on selected Portfolio
  const filteredTransactions = useMemo(() => {
    if (!project) return [];
    if (selectedPortfolioId === 'all') return project.transactions;
    return project.transactions.filter(t => t.portfolioId === selectedPortfolioId);
  }, [project, selectedPortfolioId]);

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
