"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  PieChart,
  Wallet,
  TrendingUp,
  Calendar,
  Bell,
  Plus,
  Menu,
  X,
  Search,
  FileText,
  Database,
  Save,
  LogOut
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { ProjectLauncher } from '@/components/ProjectLauncher';
import { DataSourcesContent } from '@/components/DataSourcesContent';
import { ImportContent } from '@/components/ImportContent';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { TransactionModal } from '@/components/TransactionModal';
import { SecurityDetailModal } from '@/components/SecurityDetailModal';
import { syncProjectQuotes, repairProjectSecurities } from '@/lib/marketDataService';
import { type AnalysisCache } from '@/types/portfolioView';
import { SidebarItem } from '@/components/ui/SidebarItem';
import { DashboardContent } from '@/components/DashboardContent';
import { AnalysisContent } from '@/components/AnalysisContent';
import { DividendenContent } from '@/components/DividendenContent';
import { TransactionsContent } from '@/components/TransactionsContent';
import { PortfolioList } from '@/components/PortfolioList';

const NAV_ITEMS = [
  { key: 'Dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { key: 'Portfolio', label: 'Wertpapiere', icon: Wallet },
  { key: 'Analyse', label: 'Analyse', icon: PieChart },
  { key: 'Dividenden', label: 'Dividenden', icon: Calendar },
  { key: 'Transaktionen', label: 'Transaktionen', icon: FileText },
  { key: 'Datenquellen', label: 'Datenquellen', icon: Database }
] as const;

type NavKey = typeof NAV_ITEMS[number]['key'];
type TabKey = NavKey | 'Import';

// --- Main Application ---

export default function PortfolioApp() {
  const { isLoaded, closeProject, saveProject, project, isModified, updateProject } = useProject();
  const [activeTab, setActiveTab] = useState<TabKey>('Dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('1M');
  const [selectedPortfolioIds, setSelectedPortfolioIds] = useState<string[]>([]); // Empty array = All
  const [selectedSecurityIsin, setSelectedSecurityIsin] = useState<string | null>(null);
  const [analysisCache, setAnalysisCache] = useState<AnalysisCache | null>(null);
  const [includeDividendsInPerformance, setIncludeDividendsInPerformance] = useState(false);

  // State for Import Flow
  const [importTargetPortfolio, setImportTargetPortfolio] = useState<{ id: string; name: string; isNew: boolean } | null>(null);

  // Sync Market Data on Load (and auto-repair)
  useEffect(() => {
    if (!isLoaded || !project) return;

    // 1. Repair missing securities if any
    const repaired = repairProjectSecurities(project);
    const needsRepairUpdate = repaired !== project;

    // 2. Check if any security needs syncing (new or stale)
    const now = new Date();
    const needsSync = Object.values(repaired.securities || {}).some(sec => {
      const symbol = sec.symbol || sec.isin;
      if (!symbol) return false;
      if (!sec.lastSync) return true;
      const diffHours = (now.getTime() - new Date(sec.lastSync).getTime()) / (1000 * 60 * 60);
      const missingHistory = !sec.priceHistory || Object.keys(sec.priceHistory).length === 0;
      const missingDividends = !sec.dividendHistorySynced || sec.dividendHistory === undefined || sec.upcomingDividends === undefined;
      return diffHours > 24 || missingHistory || missingDividends;
    });

    if (!needsSync) {
      if (needsRepairUpdate) {
        updateProject(() => repaired);
      }
      return;
    }

    // 3. Sync Quotes
    syncProjectQuotes(repaired).then(updated => {
      if (updated !== repaired || needsRepairUpdate) {
        updateProject(() => updated);
      }
    });
  }, [isLoaded, project, updateProject]);

  const handleCacheUpdate = useCallback((data: AnalysisCache) => {
    setAnalysisCache(data);
  }, []);

  const handleNavClick = useCallback((key: NavKey) => {
    setActiveTab(key);
  }, []);

  // Show Launcher if no project is loaded
  if (!isLoaded) {
    return <ProjectLauncher />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard':
        return <DashboardContent timeRange={timeRange} setTimeRange={setTimeRange} selectedPortfolioIds={selectedPortfolioIds} onSelectSecurity={setSelectedSecurityIsin} onShowPortfolio={() => setActiveTab('Portfolio')} includeDividends={includeDividendsInPerformance} onToggleDividends={() => setIncludeDividendsInPerformance(v => !v)} />;
      case 'Portfolio':
        return <PortfolioList selectedPortfolioIds={selectedPortfolioIds} onSelectSecurity={setSelectedSecurityIsin} />;
      case 'Analyse':
        return <AnalysisContent selectedPortfolioIds={selectedPortfolioIds} cachedData={analysisCache} onCacheUpdate={handleCacheUpdate} includeDividends={includeDividendsInPerformance} onToggleDividends={() => setIncludeDividendsInPerformance(v => !v)} />;
      case 'Dividenden':
        return <DividendenContent selectedPortfolioIds={selectedPortfolioIds} />;
      case 'Transaktionen':
        return <TransactionsContent selectedPortfolioIds={selectedPortfolioIds} />;
      case 'Datenquellen':
        return <DataSourcesContent />;
      case 'Import':
        return (
          <ImportContent
            key={project?.id || 'import'}
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
          {NAV_ITEMS.map((item) => (
            <SidebarItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={activeTab === item.key}
              onClick={() => handleNavClick(item.key)}
            />
          ))}
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
            {NAV_ITEMS.map((item) => (
              <SidebarItem
                key={item.key}
                icon={item.icon}
                label={item.label}
                active={activeTab === item.key}
                onClick={() => { handleNavClick(item.key); setMobileMenuOpen(false); }}
              />
            ))}
          </nav>
        </div>
      )}

      {/* Transaction Modal */}
      {isTransactionModalOpen && (
        <TransactionModal
          isOpen={isTransactionModalOpen}
          onClose={() => setIsTransactionModalOpen(false)}
          targetPortfolio={importTargetPortfolio}
        />
      )}

    </div>
  );
}

