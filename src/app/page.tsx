"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  LayoutDashboard,
  Activity,
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
  Settings,
  ShieldAlert,
  FolderSync,
  Monitor
} from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { ProjectLauncher } from '@/components/ProjectLauncher';
import { DataSourcesContent } from '@/components/DataSourcesContent';
import { ImportContent } from '@/components/ImportContent';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { TransactionModal } from '@/components/TransactionModal';
import { SecurityDetailModal } from '@/components/SecurityDetailModal';
import { repairProjectSecurities, securityNeedsSync } from '@/lib/marketDataService';
import { findMissingFxCurrencies } from '@/lib/domain/fx/rates';
import { applyThemePreference, NEXT_THEME, resolveThemePreference, THEME_LABELS, type ThemePreference } from '@/lib/theme';
import { normalizeWealthGoalSettings } from '@/lib/wealthGoalUtils';
import { type AnalysisCache } from '@/types/portfolioView';
import { SidebarItem } from '@/components/ui/SidebarItem';
import { DashboardContent } from '@/components/DashboardContent';
import { AnalysisContent } from '@/components/AnalysisContent';
import { DividendenContent } from '@/components/DividendenContent';
import { TransactionsContent } from '@/components/TransactionsContent';
import { PortfolioList } from '@/components/PortfolioList';
import { BrokersContent } from '@/components/brokers/BrokersContent';
import { PendingImportDialog } from '@/components/brokers/PendingImportDialog';
import { TanDialog } from '@/components/brokers/TanDialog';

const NAV_ITEMS = [
  { key: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'Portfolio', label: 'Wertpapiere', icon: Wallet },
  { key: 'Analyse', label: 'Analyse', icon: PieChart },
  { key: 'Dividenden', label: 'Dividenden', icon: Calendar },
  { key: 'Transaktionen', label: 'Transaktionen', icon: FileText },
  { key: 'Datenquellen', label: 'Datenquellen', icon: Database },
  { key: 'Broker', label: 'Broker', icon: FolderSync }
] as const;

type NavKey = (typeof NAV_ITEMS)[number]['key'];
type TabKey = NavKey | 'Import' | 'Einstellungen';

const TAB_PRELOAD_SEQUENCE: TabKey[] = [
  'Portfolio',
  'Analyse',
  'Dividenden',
  'Transaktionen',
  'Datenquellen',
  'Broker',
  'Einstellungen',
  'Import'
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.slice(0, 4);

export default function PortfolioApp() {
  const { isLoaded, closeProject, saveProject, project, isModified, updateProject, syncAll, syncMarket, isSyncing, isMarketSyncing, marketSyncProgress, isHydratingProject, encryptionStatus } = useProject();
  const [activeTab, setActiveTab] = useState<TabKey>('Dashboard');
  const [visitedTabs, setVisitedTabs] = useState<TabKey[]>(['Dashboard']);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('1M');
  const [selectedPortfolioIds, setSelectedPortfolioIds] = useState<string[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<{ isin: string; currency?: string } | null>(null);
  const [analysisCache, setAnalysisCache] = useState<AnalysisCache | null>(null);
  const [includeDividendsInPerformance, setIncludeDividendsInPerformance] = useState(false);
  const [showStartupSyncModal, setShowStartupSyncModal] = useState(false);
  const [, startTransition] = useTransition();
  const lastMarketAutoSyncRef = useRef(0);
  const performanceMethod = project?.settings?.performanceMethod || 'MWR';
  const performanceSmoothing = project?.settings?.performanceSmoothing || '1d';

  const [importTargetPortfolio, setImportTargetPortfolio] = useState<{ id: string; name: string; isNew: boolean } | null>(null);

  // Only meaningful once FX data is loaded (lazy hydration or the first sync may still be running).
  const missingFxCurrencies = useMemo(() => {
    if (!project || isHydratingProject || Object.keys(project.fxData?.rates || {}).length === 0) return [];
    return findMissingFxCurrencies(project);
  }, [project, isHydratingProject]);

  const themePreference = resolveThemePreference(project?.settings);

  useEffect(() => {
    applyThemePreference(themePreference);
  }, [themePreference]);

  const setThemePreference = useCallback((theme: ThemePreference) => {
    updateProject((prev) => ({ ...prev, settings: { ...prev.settings, theme } }));
  }, [updateProject]);

  useEffect(() => {
    if (project) return;
    // Reset startup sync cooldown after closing a project so the next opened project syncs immediately.
    lastMarketAutoSyncRef.current = 0;
  }, [project]);

  useEffect(() => {
    if (!isLoaded || !project?.id) return;

    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    let cancelled = false;
    let timeoutHandle: number | null = null;
    let idleHandle: number | null = null;
    const queue = [...TAB_PRELOAD_SEQUENCE];

    // Preload tabs in small idle slices so project open stays responsive.
    const preloadNext = () => {
      if (cancelled || queue.length === 0) return;
      const nextTab = queue.shift();
      if (!nextTab) return;

      setVisitedTabs((prev) => (prev.includes(nextTab) ? prev : [...prev, nextTab]));

      const schedule = idleWindow.requestIdleCallback
        ? () => {
          idleHandle = idleWindow.requestIdleCallback?.(preloadNext, { timeout: 250 }) ?? null;
        }
        : () => {
          timeoutHandle = window.setTimeout(preloadNext, 80);
        };

      schedule();
    };

    timeoutHandle = window.setTimeout(preloadNext, 120);

    return () => {
      cancelled = true;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
      if (idleHandle !== null && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleHandle);
      }
    };
  }, [isLoaded, project?.id]);

  // Sync Market Data on load and auto-repair missing securities.
  useEffect(() => {
    if (!isLoaded || !project || isMarketSyncing || isHydratingProject) return;

    if (repairProjectSecurities(project) !== project) {
      // Apply to the latest state, not to this render's snapshot
      updateProject((prev) => repairProjectSecurities(prev));
      return;
    }

    const now = new Date();
    const needsSync = Object.values(project.securities || {}).some((sec) => securityNeedsSync(sec, now));
    if (!needsSync) {
      return;
    }

    const cooldownMs = 10 * 60 * 1000;
    if (Date.now() - lastMarketAutoSyncRef.current < cooldownMs) {
      return;
    }

    lastMarketAutoSyncRef.current = Date.now();
    void Promise.resolve()
      .then(() => {
        setShowStartupSyncModal(true);
        return syncMarket(false, { full: true });
      })
      .finally(() => {
        setShowStartupSyncModal(false);
      });
  }, [isLoaded, project, isMarketSyncing, isHydratingProject, syncMarket, updateProject]);

  const handleCacheUpdate = useCallback((data: AnalysisCache) => {
    setAnalysisCache(data);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleTabChange = useCallback((key: TabKey) => {
    setVisitedTabs((prev) => (prev.includes(key) ? prev : [...prev, key]));
    startTransition(() => {
      setActiveTab(key);
    });
    closeSidebar();
  }, [closeSidebar, startTransition]);

  const handleNavClick = useCallback((key: NavKey) => {
    handleTabChange(key);
  }, [handleTabChange]);

  const handleCloseProject = useCallback(() => {
    setActiveTab('Dashboard');
    setVisitedTabs(['Dashboard']);
    closeProject();
  }, [closeProject]);


  const startupSyncModalVisible = showStartupSyncModal && isMarketSyncing;
  const startupSyncProgress = marketSyncProgress && marketSyncProgress.total > 0
    ? Math.min(100, Math.round((marketSyncProgress.current / marketSyncProgress.total) * 100))
    : 0;

  if (!isLoaded) {
    return <ProjectLauncher />;
  }

  const renderContent = (tab: TabKey) => {
    switch (tab) {
      case 'Dashboard':
        return (
          <DashboardContent
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            selectedPortfolioIds={selectedPortfolioIds}
            onSelectSecurity={(isin, currency) => setSelectedSecurity({ isin, currency })}
            onShowPortfolio={() => handleTabChange('Portfolio')}
            includeDividends={includeDividendsInPerformance}
            onToggleDividends={() => setIncludeDividendsInPerformance((v) => !v)}
          />
        );
      case 'Portfolio':
        return <PortfolioList selectedPortfolioIds={selectedPortfolioIds} onSelectSecurity={(isin, currency) => setSelectedSecurity({ isin, currency })} />;
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
      case 'Broker':
        return <BrokersContent />;
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
                    Dunkel, hell oder wie im Betriebssystem eingestellt.
                  </p>
                </div>
              </div>

              <div className="mt-6 inline-flex gap-1 rounded-2xl p-1" style={{ background: 'var(--surface2)' }} role="radiogroup" aria-label="Darstellung">
                {(['dark', 'light', 'system'] as ThemePreference[]).map((theme) => (
                  <button
                    type="button"
                    key={theme}
                    role="radio"
                    aria-checked={themePreference === theme}
                    onClick={() => setThemePreference(theme)}
                    className="rounded-xl px-4 py-2 text-sm font-bold transition"
                    style={themePreference === theme
                      ? { background: 'var(--text)', color: 'var(--bg)' }
                      : { color: 'var(--text2)' }}
                  >
                    {THEME_LABELS[theme]}
                  </button>
                ))}
              </div>
            </div>

            <div className="md3-card p-6">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{
                    background: 'var(--md3-primary-container)',
                    color: 'var(--md3-on-primary-container)'
                  }}
                >
                  <Activity size={22} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Performance</h2>
                  <p className="text-sm" style={{ color: 'var(--md3-on-surface-variant)' }}>
                    Waehle, wie Renditen berechnet werden sollen.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <div className="md3-segment flex w-fit p-1">
                  <button
                    type="button"
                    onClick={() => updateProject((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        performanceMethod: 'MWR'
                      }
                    }))}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${performanceMethod === 'MWR' ? 'md3-chip-accent' : 'md3-text-muted'}`}
                  >
                    Geldgewichtet (MWR)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProject((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        performanceMethod: 'TWR'
                      }
                    }))}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${performanceMethod === 'TWR' ? 'md3-chip-accent' : 'md3-text-muted'}`}
                  >
                    Zeitgewichtet (TWR)
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'var(--md3-on-surface-variant)' }}>
                  MWR beruecksichtigt Ein- und Auszahlungen, TWR zeigt die reine Anlagestrategie ohne Cashflow-Effekte.
                </p>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--md3-on-surface-variant)' }}>
                    Glaettung
                  </span>
                  <div className="md3-segment flex w-fit p-1">
                    <button
                      type="button"
                      onClick={() => updateProject((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          performanceSmoothing: '1d'
                        }
                      }))}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${performanceSmoothing === '1d' ? 'md3-chip-accent' : 'md3-text-muted'}`}
                    >
                      1 Tag
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProject((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          performanceSmoothing: '7d'
                        }
                      }))}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${performanceSmoothing === '7d' ? 'md3-chip-accent' : 'md3-text-muted'}`}
                    >
                      7 Tage
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProject((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          performanceSmoothing: '1m'
                        }
                      }))}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${performanceSmoothing === '1m' ? 'md3-chip-accent' : 'md3-text-muted'}`}
                    >
                      1 Monat
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--md3-on-surface-variant)' }}>
                    Wir glätten nur die Darstellung der Performance-Charts. Kennzahlen bleiben unveraendert.
                  </p>
                </div>
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
    <div className="theme-md3 md3-app flex min-h-[100dvh] w-full font-sans">
      <div className="app-glow app-glow-1" aria-hidden="true" />
      <div className="app-glow app-glow-2" aria-hidden="true" />
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
                <div className="text-xl font-bold tracking-tight">Openfolio</div>
                <div className="text-xs" style={{ color: 'var(--md3-on-surface-variant)' }}>OpenFolio</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                handleTabChange('Import');
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
                  handleTabChange('Einstellungen');
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
                onClick={handleCloseProject}
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
                  onClick={() => setThemePreference(NEXT_THEME[themePreference])}
                  className="md3-icon-btn"
                  aria-label={`Darstellung: ${THEME_LABELS[themePreference]} (wechseln)`}
                  title={`Darstellung: ${THEME_LABELS[themePreference]}`}
                >
                  {themePreference === 'dark' ? <Moon size={18} /> : themePreference === 'light' ? <Sun size={18} /> : <Monitor size={18} />}
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
            {missingFxCurrencies.length > 0 && (
              <div className="md3-warning-soft mt-3 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm" role="status">
                <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                <span>
                  Kurs fehlt: Für {missingFxCurrencies.join(', ')} gibt es keinen Wechselkurs.
                  Beträge in {missingFxCurrencies.length === 1 ? 'dieser Währung' : 'diesen Währungen'} sind in den Summen nicht enthalten.
                </span>
              </div>
            )}
            {encryptionStatus === 'legacy-unencrypted' && (
              <div className="md3-warning-soft mt-3 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm" role="status">
                <ShieldAlert size={18} className="shrink-0" />
                <span className="flex-1 min-w-[12rem]">
                  Diese Datei hatte nur eine Zugriffssperre, die Daten lagen unverschlüsselt darin.
                  Beim nächsten Speichern wird sie mit deinem Passwort verschlüsselt.
                </span>
                <button type="button" onClick={() => void saveProject()} className="md3-filled-btn px-3 py-1.5 text-xs font-semibold">
                  Jetzt verschlüsseln
                </button>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-4 pb-[calc(6.8rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-10 custom-scrollbar">
            <div className="mx-auto w-full max-w-none space-y-6">
              {visitedTabs.map((tab) => (
                <section
                  key={tab}
                  aria-hidden={activeTab !== tab}
                  className={activeTab === tab ? '' : 'hidden'}
                >
                  {renderContent(tab)}
                </section>
              ))}
            </div>
          </div>

          {selectedSecurity && project?.securities?.[selectedSecurity.isin] && (
            <SecurityDetailModal
              isOpen={!!selectedSecurity}
              onClose={() => setSelectedSecurity(null)}
              security={project.securities[selectedSecurity.isin]}
              transactions={project.transactions}
              currencyFilter={selectedSecurity.currency}
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
          onClick={() => handleTabChange('Import')}
          className="md3-fab flex h-14 w-14 items-center justify-center rounded-[18px]"
          aria-label="Import"
        >
          <Plus size={24} />
        </button>
      </div>

      <PendingImportDialog />
      <TanDialog />

      {startupSyncModalVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-4">
          <div
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl border"
            style={{
              background: 'var(--md3-surface)',
              borderColor: 'var(--md3-outline)'
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{
                  background: 'var(--md3-primary-container)',
                  color: 'var(--md3-on-primary-container)'
                }}
              >
                <Loader2 size={20} className="animate-spin" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--md3-on-surface)' }}>
                  Marktdaten werden synchronisiert
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--md3-on-surface-variant)' }}>
                  Projektstart-Update
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--md3-on-surface-variant)' }}>
                <span>
                  {marketSyncProgress && marketSyncProgress.total > 0
                    ? `Markt ${marketSyncProgress.current}/${marketSyncProgress.total}`
                    : 'Vorbereitung...'}
                </span>
                <span>{marketSyncProgress?.symbol || ''}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--md3-surface-container-highest)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${startupSyncProgress}%`,
                    background: 'var(--md3-primary)'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
