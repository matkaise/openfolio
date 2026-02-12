"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  PieChart,
  Wallet,
  Calendar,
  Plus,
  X,
  Search,
  FileText,
  Database,
  Save,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  Loader2,
  Sparkles,
  Settings
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { ProjectLauncher } from '@/components/ProjectLauncher';
import { DataSourcesContent } from '@/components/DataSourcesContent';
import { ImportContent } from '@/components/ImportContent';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { TransactionModal } from '@/components/TransactionModal';
import { SecurityDetailModal } from '@/components/SecurityDetailModal';
import { syncProjectQuotes, repairProjectSecurities } from '@/lib/marketDataService';
import { normalizeWealthGoalSettings } from '@/lib/wealthGoalUtils';
import { type AnalysisCache } from '@/types/portfolioView';
import { SidebarItem } from '@/components/ui/SidebarItem';
import { DashboardContent } from '@/components/DashboardContent';
import { AnalysisContent } from '@/components/AnalysisContent';
import { DividendenContent } from '@/components/DividendenContent';
import { TransactionsContent } from '@/components/TransactionsContent';
import { PortfolioList } from '@/components/PortfolioList';

const NAV_ITEMS = [
  { key: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'Portfolio', label: 'Wertpapiere', icon: Wallet },
  { key: 'Analyse', label: 'Analyse', icon: PieChart },
  { key: 'Dividenden', label: 'Dividenden', icon: Calendar },
  { key: 'Transaktionen', label: 'Transaktionen', icon: FileText },
  { key: 'Datenquellen', label: 'Datenquellen', icon: Database }
] as const;

type NavKey = (typeof NAV_ITEMS)[number]['key'];
type TabKey = NavKey | 'Import' | 'Einstellungen';

type ThemeTones = {
  bg: string;
  onBg: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  inverseSurface: string;
  inversePrimary: string;
  gradientA: string;
  gradientB: string;
  orbA: string;
  orbB: string;
};

type ThemeConfig = {
  id: string;
  name: string;
  swatch: string;
  light: ThemeTones;
  dark: ThemeTones;
};

const MATERIAL_THEMES = {
  baseline: {
    id: 'baseline',
    name: 'Ocean Blue',
    swatch: '#005db8',
    light: {
      bg: '#f6faff',
      onBg: '#1a1c1e',
      surface: '#f6faff',
      onSurface: '#1a1c1e',
      surfaceVariant: '#d4e2f5',
      onSurfaceVariant: '#3e5168',
      outline: '#7388a2',
      primary: '#005db8',
      onPrimary: '#ffffff',
      primaryContainer: '#d6e8ff',
      onPrimaryContainer: '#002047',
      secondaryContainer: '#cfe1fb',
      onSecondaryContainer: '#102844',
      tertiary: '#6b5778',
      onTertiary: '#ffffff',
      surfaceContainer: '#e9f1ff',
      surfaceContainerHigh: '#e1ebfb',
      surfaceContainerHighest: '#d9e5f8',
      inverseSurface: '#2f3033',
      inversePrimary: '#9ecaff',
      gradientA: 'rgba(0, 93, 184, 0.22)',
      gradientB: 'rgba(0, 130, 240, 0.16)',
      orbA: 'rgba(0, 93, 184, 0.30)',
      orbB: 'rgba(0, 130, 240, 0.22)'
    },
    dark: {
      bg: '#161d27',
      onBg: '#e2e2e6',
      surface: '#161d27',
      onSurface: '#e2e2e6',
      surfaceVariant: '#3b4b63',
      onSurfaceVariant: '#bfcee2',
      outline: '#889ab2',
      primary: '#8ec5ff',
      onPrimary: '#003567',
      primaryContainer: '#084d8f',
      onPrimaryContainer: '#d1e4ff',
      secondaryContainer: '#334a69',
      onSecondaryContainer: '#d6e6fa',
      tertiary: '#d6bee4',
      onTertiary: '#3b2948',
      surfaceContainer: '#1b2431',
      surfaceContainerHigh: '#243043',
      surfaceContainerHighest: '#2e3d55',
      inverseSurface: '#e2e2e6',
      inversePrimary: '#005db8',
      gradientA: 'rgba(142, 197, 255, 0.24)',
      gradientB: 'rgba(76, 153, 230, 0.18)',
      orbA: 'rgba(68, 129, 194, 0.34)',
      orbB: 'rgba(52, 112, 180, 0.28)'
    }
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Orange',
    swatch: '#c44900',
    light: {
      bg: '#fffbff',
      onBg: '#201a17',
      surface: '#fffbff',
      onSurface: '#201a17',
      surfaceVariant: '#f4ded4',
      onSurfaceVariant: '#52443c',
      outline: '#85736b',
      primary: '#c44900',
      onPrimary: '#ffffff',
      primaryContainer: '#ffdbc8',
      onPrimaryContainer: '#2d1600',
      secondaryContainer: '#ffdbc8',
      onSecondaryContainer: '#2b160c',
      tertiary: '#695e2f',
      onTertiary: '#ffffff',
      surfaceContainer: '#ffeee5',
      surfaceContainerHigh: '#ffe8dd',
      surfaceContainerHighest: '#ffe2d5',
      inverseSurface: '#362f2c',
      inversePrimary: '#ffb68e',
      gradientA: 'rgba(196, 73, 0, 0.19)',
      gradientB: 'rgba(105, 94, 47, 0.16)',
      orbA: 'rgba(196, 73, 0, 0.26)',
      orbB: 'rgba(159, 120, 74, 0.20)'
    },
    dark: {
      bg: '#201a17',
      onBg: '#ede0da',
      surface: '#201a17',
      onSurface: '#ede0da',
      surfaceVariant: '#52443c',
      onSurfaceVariant: '#d7c2b8',
      outline: '#9f8d84',
      primary: '#ffb68e',
      onPrimary: '#552100',
      primaryContainer: '#7a3300',
      onPrimaryContainer: '#ffdbc8',
      secondaryContainer: '#5d4033',
      onSecondaryContainer: '#ffdbc8',
      tertiary: '#d6c68d',
      onTertiary: '#393005',
      surfaceContainer: '#251e1b',
      surfaceContainerHigh: '#302925',
      surfaceContainerHighest: '#3b3330',
      inverseSurface: '#ede0da',
      inversePrimary: '#c44900',
      gradientA: 'rgba(255, 182, 142, 0.20)',
      gradientB: 'rgba(214, 198, 141, 0.17)',
      orbA: 'rgba(156, 89, 47, 0.30)',
      orbB: 'rgba(124, 101, 60, 0.24)'
    }
  },
  forest: {
    id: 'forest',
    name: 'Forest Green',
    swatch: '#3f6939',
    light: {
      bg: '#fdfdf5',
      onBg: '#1a1c18',
      surface: '#fdfdf5',
      onSurface: '#1a1c18',
      surfaceVariant: '#dfe4d7',
      onSurfaceVariant: '#42493f',
      outline: '#73796e',
      primary: '#3f6939',
      onPrimary: '#ffffff',
      primaryContainer: '#c0f0b3',
      onPrimaryContainer: '#002204',
      secondaryContainer: '#d7e8cc',
      onSecondaryContainer: '#121f0e',
      tertiary: '#386569',
      onTertiary: '#ffffff',
      surfaceContainer: '#eff2ea',
      surfaceContainerHigh: '#e9ece4',
      surfaceContainerHighest: '#e3e6de',
      inverseSurface: '#2f312d',
      inversePrimary: '#a5d499',
      gradientA: 'rgba(63, 105, 57, 0.20)',
      gradientB: 'rgba(56, 101, 105, 0.16)',
      orbA: 'rgba(63, 105, 57, 0.27)',
      orbB: 'rgba(56, 101, 105, 0.21)'
    },
    dark: {
      bg: '#1a1c18',
      onBg: '#e2e3dc',
      surface: '#1a1c18',
      onSurface: '#e2e3dc',
      surfaceVariant: '#42493f',
      onSurfaceVariant: '#c2c8bc',
      outline: '#8c9388',
      primary: '#a5d499',
      onPrimary: '#0f380e',
      primaryContainer: '#275023',
      onPrimaryContainer: '#c0f0b3',
      secondaryContainer: '#3d4b37',
      onSecondaryContainer: '#d7e8cc',
      tertiary: '#a0cfd3',
      onTertiary: '#003739',
      surfaceContainer: '#1e201c',
      surfaceContainerHigh: '#282b26',
      surfaceContainerHighest: '#333631',
      inverseSurface: '#e2e3dc',
      inversePrimary: '#3f6939',
      gradientA: 'rgba(165, 212, 153, 0.20)',
      gradientB: 'rgba(160, 207, 211, 0.17)',
      orbA: 'rgba(74, 116, 69, 0.30)',
      orbB: 'rgba(63, 113, 117, 0.24)'
    }
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender Dream',
    swatch: '#6e4fa2',
    light: {
      bg: '#fffbff',
      onBg: '#1c1b1e',
      surface: '#fffbff',
      onSurface: '#1c1b1e',
      surfaceVariant: '#e7e0eb',
      onSurfaceVariant: '#49454e',
      outline: '#7a757f',
      primary: '#6e4fa2',
      onPrimary: '#ffffff',
      primaryContainer: '#eaddff',
      onPrimaryContainer: '#23005c',
      secondaryContainer: '#e9def8',
      onSecondaryContainer: '#1e192b',
      tertiary: '#7e525f',
      onTertiary: '#ffffff',
      surfaceContainer: '#f3edf7',
      surfaceContainerHigh: '#ede7f1',
      surfaceContainerHighest: '#e7e1eb',
      inverseSurface: '#313033',
      inversePrimary: '#d0bcff',
      gradientA: 'rgba(110, 79, 162, 0.19)',
      gradientB: 'rgba(126, 82, 95, 0.16)',
      orbA: 'rgba(110, 79, 162, 0.27)',
      orbB: 'rgba(126, 82, 95, 0.20)'
    },
    dark: {
      bg: '#1c1b1e',
      onBg: '#e5e1e6',
      surface: '#1c1b1e',
      onSurface: '#e5e1e6',
      surfaceVariant: '#49454e',
      onSurfaceVariant: '#cac5cd',
      outline: '#948f99',
      primary: '#d0bcff',
      onPrimary: '#3a1f73',
      primaryContainer: '#523789',
      onPrimaryContainer: '#eaddff',
      secondaryContainer: '#4b4458',
      onSecondaryContainer: '#e9def8',
      tertiary: '#efb8c7',
      onTertiary: '#492532',
      surfaceContainer: '#201f22',
      surfaceContainerHigh: '#2b2a2d',
      surfaceContainerHighest: '#363538',
      inverseSurface: '#e5e1e6',
      inversePrimary: '#6e4fa2',
      gradientA: 'rgba(208, 188, 255, 0.20)',
      gradientB: 'rgba(239, 184, 199, 0.17)',
      orbA: 'rgba(108, 86, 144, 0.30)',
      orbB: 'rgba(131, 78, 100, 0.24)'
    }
  }
} as const satisfies Record<string, ThemeConfig>;

const MOBILE_NAV_ITEMS = NAV_ITEMS.slice(0, 4);

export default function PortfolioApp() {
  const { isLoaded, closeProject, saveProject, project, isModified, updateProject, syncAll, isSyncing, isMarketSyncing } = useProject();
  const [activeTab, setActiveTab] = useState<TabKey>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('1M');
  const [selectedPortfolioIds, setSelectedPortfolioIds] = useState<string[]>([]);
  const [selectedSecurityIsin, setSelectedSecurityIsin] = useState<string | null>(null);
  const [analysisCache, setAnalysisCache] = useState<AnalysisCache | null>(null);
  const [includeDividendsInPerformance, setIncludeDividendsInPerformance] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState<keyof typeof MATERIAL_THEMES>('baseline');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [importTargetPortfolio, setImportTargetPortfolio] = useState<{ id: string; name: string; isNew: boolean } | null>(null);

  const resolveThemeId = useCallback((value?: string) => {
    if (value && value in MATERIAL_THEMES) return value as keyof typeof MATERIAL_THEMES;
    return 'baseline';
  }, []);

  useEffect(() => {
    if (!project) return;
    setActiveThemeId(resolveThemeId(project.settings?.themeId));
    setIsDarkMode(Boolean(project.settings?.isDarkMode));
  }, [project?.id, project?.settings?.themeId, project?.settings?.isDarkMode, resolveThemeId, project]);

  // Sync Market Data on load and auto-repair missing securities.
  useEffect(() => {
    if (!isLoaded || !project) return;

    const repaired = repairProjectSecurities(project);
    const needsRepairUpdate = repaired !== project;

    const now = new Date();
    const needsSync = Object.values(repaired.securities || {}).some((sec) => {
      if (sec.ignoreMarketData || sec.symbolStatus === 'ignored') return false;
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

    syncProjectQuotes(repaired).then((updated) => {
      if (updated !== repaired || needsRepairUpdate) {
        updateProject(() => updated);
      }
    });
  }, [isLoaded, project, updateProject]);

  const handleCacheUpdate = useCallback((data: AnalysisCache) => {
    setAnalysisCache(data);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleNavClick = useCallback((key: NavKey) => {
    setActiveTab(key);
    closeSidebar();
  }, [closeSidebar]);

  const currentTheme = MATERIAL_THEMES[activeThemeId] ?? MATERIAL_THEMES.baseline;
  const tones = isDarkMode ? currentTheme.dark : currentTheme.light;

  const themeVars = useMemo(() => ({
    '--background': tones.bg,
    '--foreground': tones.onBg,
    '--md3-bg': tones.bg,
    '--md3-on-bg': tones.onBg,
    '--md3-surface': tones.surface,
    '--md3-on-surface': tones.onSurface,
    '--md3-surface-variant': tones.surfaceVariant,
    '--md3-on-surface-variant': tones.onSurfaceVariant,
    '--md3-outline': tones.outline,
    '--md3-primary': tones.primary,
    '--md3-on-primary': tones.onPrimary,
    '--md3-primary-container': tones.primaryContainer,
    '--md3-on-primary-container': tones.onPrimaryContainer,
    '--md3-secondary-container': tones.secondaryContainer,
    '--md3-on-secondary-container': tones.onSecondaryContainer,
    '--md3-tertiary': tones.tertiary,
    '--md3-on-tertiary': tones.onTertiary,
    '--md3-surface-container': tones.surfaceContainer,
    '--md3-surface-container-high': tones.surfaceContainerHigh,
    '--md3-surface-container-highest': tones.surfaceContainerHighest,
    '--md3-inverse-surface': tones.inverseSurface,
    '--md3-inverse-primary': tones.inversePrimary,
    '--md3-gradient-a': tones.gradientA,
    '--md3-gradient-b': tones.gradientB,
    '--md3-orb-a': tones.orbA,
    '--md3-orb-b': tones.orbB
  }) as React.CSSProperties, [tones]);

  if (!isLoaded) {
    return <ProjectLauncher />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard':
        return (
          <DashboardContent
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            selectedPortfolioIds={selectedPortfolioIds}
            onSelectSecurity={setSelectedSecurityIsin}
            onShowPortfolio={() => setActiveTab('Portfolio')}
            includeDividends={includeDividendsInPerformance}
            onToggleDividends={() => setIncludeDividendsInPerformance((v) => !v)}
          />
        );
      case 'Portfolio':
        return <PortfolioList selectedPortfolioIds={selectedPortfolioIds} onSelectSecurity={setSelectedSecurityIsin} />;
      case 'Analyse':
        return (
          <AnalysisContent
            selectedPortfolioIds={selectedPortfolioIds}
            cachedData={analysisCache}
            onCacheUpdate={handleCacheUpdate}
            includeDividends={includeDividendsInPerformance}
            onToggleDividends={() => setIncludeDividendsInPerformance((v) => !v)}
          />
        );
      case 'Dividenden':
        return <DividendenContent selectedPortfolioIds={selectedPortfolioIds} />;
      case 'Transaktionen':
        return <TransactionsContent selectedPortfolioIds={selectedPortfolioIds} />;
      case 'Datenquellen':
        return <DataSourcesContent />;
      case 'Einstellungen':
        return (
          <div className="space-y-6">
            <div className="md3-card p-6">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{
                    background: 'var(--md3-secondary-container)',
                    color: 'var(--md3-on-secondary-container)'
                  }}
                >
                  <Sparkles size={22} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Design</h2>
                  <p className="text-sm" style={{ color: 'var(--md3-on-surface-variant)' }}>
                    Waehle dein Farbschema fuer die App.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.values(MATERIAL_THEMES).map((theme) => {
                  const active = theme.id === activeThemeId;
                  return (
                    <button
                      type="button"
                      key={theme.id}
                      onClick={() => {
                        const nextTheme = theme.id as keyof typeof MATERIAL_THEMES;
                        setActiveThemeId(nextTheme);
                        updateProject((prev) => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            themeId: nextTheme
                          }
                        }));
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition"
                      style={{
                        background: active ? 'var(--md3-secondary-container)' : 'var(--md3-surface-container)',
                        color: active ? 'var(--md3-on-secondary-container)' : 'var(--md3-on-surface-variant)'
                      }}
                    >
                      <span className="md3-theme-dot" style={{ backgroundColor: theme.swatch }} />
                      <span className="text-sm font-semibold">{theme.name}</span>
                      {active && <Sparkles size={15} className="ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      case 'Import':
        return (
          <ImportContent
            key={project?.id || 'import'}
            onContinue={(portfolioId, isNew, newName) => {
              setImportTargetPortfolio({
                id: portfolioId,
                name: isNew ? (newName || 'Neues Depot') : (project?.portfolios.find((p) => p.id === portfolioId)?.name || 'Unbekannt'),
                isNew
              });
              setIsTransactionModalOpen(true);
            }}
          />
        );
      default:
        return <div className="p-8 text-center" style={{ color: 'var(--md3-on-surface-variant)' }}>In Entwicklung...</div>;
    }
  };

  return (
    <div className="theme-md3 md3-app flex min-h-[100dvh] w-full overflow-hidden font-sans" style={themeVars}>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeSidebar}
          className="md:hidden fixed inset-0 z-30 bg-black/40"
        />
      )}

      <div className="relative z-10 flex w-full">
        <aside
          className={`
            fixed inset-y-0 left-0 z-40 w-[84vw] max-w-[320px] transform p-0 transition-transform duration-300 ease-out
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0 md:w-72
          `}
        >
          <div className="md3-sidebar flex h-full flex-col p-4">
            <div className="flex items-center justify-between px-2 pb-2 md:hidden">
              <span className="text-sm font-semibold" style={{ color: 'var(--md3-on-surface-variant)' }}>Navigation</span>
              <button type="button" onClick={closeSidebar} className="md3-icon-btn" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="mb-5 flex h-20 items-center gap-3 px-2">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{
                  background: 'var(--md3-primary-container)',
                  color: 'var(--md3-on-primary-container)'
                }}
              >
                <Wallet size={24} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold tracking-tight">FinFlow</div>
                <div className="text-xs" style={{ color: 'var(--md3-on-surface-variant)' }}>OpenFolio</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveTab('Import');
                closeSidebar();
              }}
              className="md3-fab mb-5 flex items-center justify-center gap-2 px-4 text-sm font-semibold"
            >
              <Plus size={20} />
              <span>Import</span>
            </button>

            <nav className="flex-1 space-y-1">
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

            <div className="mt-auto space-y-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('Einstellungen');
                  closeSidebar();
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition"
                style={{ color: 'var(--md3-on-surface-variant)' }}
              >
                <Settings size={18} />
                <span className="text-sm font-semibold">Einstellungen</span>
              </button>

              <button
                type="button"
                onClick={saveProject}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition"
                style={isModified
                  ? { background: 'var(--md3-primary)', color: 'var(--md3-on-primary)' }
                  : { color: 'var(--md3-on-surface-variant)' }}
              >
                <Save size={18} />
                <span>{isModified ? 'Speichern *' : 'Gespeichert'}</span>
              </button>

              <button
                type="button"
                onClick={closeProject}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition hover:bg-rose-500/10"
                style={{ color: 'var(--md3-on-surface-variant)' }}
              >
                <LogOut size={18} />
                <span>Schliessen</span>
              </button>

            </div>
          </div>
        </aside>

        <main className="flex min-h-[100dvh] flex-1 flex-col overflow-hidden md:pl-72" style={{ background: 'var(--md3-bg)' }}>
          <header
            className="sticky top-0 z-20 px-4 py-3 md:px-8"
            style={{ background: 'var(--md3-surface)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3" />
              <div className="flex items-center gap-2 md:gap-3">
                <div className="md3-field hidden items-center gap-2 px-3 sm:flex">
                  <span className="text-xs font-semibold" style={{ color: 'var(--md3-on-surface-variant)' }}>Waehrung</span>
                  <select
                    value={project?.settings?.baseCurrency || 'EUR'}
                    onChange={(e) => {
                      const nextCurrency = e.target.value;
                      updateProject((prev) => {
                        const normalizedSettings = normalizeWealthGoalSettings(prev.settings);

                        return {
                          ...prev,
                          settings: {
                            ...normalizedSettings,
                            baseCurrency: nextCurrency
                          }
                        };
                      });
                    }}
                    className="cursor-pointer border-none py-1 text-sm font-semibold outline-none"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="CHF">CHF</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>

                {project?.portfolios && project.portfolios.length > 0 && (
                  <MultiSelectDropdown
                    options={project.portfolios}
                    selectedIds={selectedPortfolioIds}
                    onChange={setSelectedPortfolioIds}
                  />
                )}

                <div className="md3-field hidden items-center px-4 lg:flex lg:w-72">
                  <Search size={16} style={{ color: 'var(--md3-on-surface-variant)' }} />
                  <input
                    type="text"
                    placeholder="ISIN oder Name suchen"
                    className="ml-3 w-full border-none bg-transparent text-sm outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = !isDarkMode;
                    setIsDarkMode(next);
                    updateProject((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        isDarkMode: next
                      }
                    }));
                  }}
                  className="md3-icon-btn"
                  aria-label="Toggle appearance"
                >
                  {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>

                <button
                  type="button"
                  onClick={() => syncAll(true)}
                  className="md3-icon-btn"
                  aria-label="Aktualisieren"
                  disabled={isSyncing || isMarketSyncing}
                  title="Aktualisieren"
                >
                  {(isSyncing || isMarketSyncing) ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 pb-[calc(6.8rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-10 custom-scrollbar">
            <div className="mx-auto w-full max-w-none space-y-6">
              {renderContent()}
            </div>
          </div>

          {selectedSecurityIsin && project?.securities?.[selectedSecurityIsin] && (
            <SecurityDetailModal
              isOpen={!!selectedSecurityIsin}
              onClose={() => setSelectedSecurityIsin(null)}
              security={project.securities[selectedSecurityIsin]}
              transactions={project.transactions}
            />
          )}
        </main>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 px-2 py-1 md:hidden"
        style={{
          background: 'var(--md3-surface)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.25rem)'
        }}
      >
        <div className="flex items-center justify-between">
          {MOBILE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => handleNavClick(item.key)}
                className="flex min-w-[74px] flex-col items-center gap-1 px-2 py-1"
              >
                <span
                  className="flex h-8 w-14 items-center justify-center rounded-full transition"
                  style={active
                    ? { background: 'var(--md3-secondary-container)', color: 'var(--md3-on-secondary-container)' }
                    : { color: 'var(--md3-on-surface-variant)' }}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                </span>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: active ? 'var(--md3-on-secondary-container)' : 'var(--md3-on-surface-variant)' }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] right-4 z-30 md:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('Import')}
          className="md3-fab flex h-14 w-14 items-center justify-center rounded-[18px]"
          aria-label="Import"
        >
          <Plus size={24} />
        </button>
      </div>

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
