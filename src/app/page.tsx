"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  LayoutDashboard,
  Activity,
  PieChart,
  Wallet,
  Calendar,
  FileText,
  Database,
  RefreshCw,
  Loader2,
  Sparkles,
  ShieldAlert,
  FolderSync
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
import { applyThemePreference, resolveThemePreference, THEME_LABELS, type ThemePreference } from '@/lib/theme';
import { DEFAULT_NUMBER_LOCALE, NUMBER_LOCALES, type NumberLocale } from '@/lib/format';
import { normalizeWealthGoalSettings } from '@/lib/wealthGoalUtils';
import { type AnalysisCache } from '@/types/portfolioView';
import { AppSidebar, type ShellNavItem } from '@/components/shell/AppSidebar';
import { SecuritySearch } from '@/components/shell/SecuritySearch';
import { getBrokerConnections } from '@/lib/brokers/connections';
import { calculateProjectHoldings, selectCalculationTransactions } from '@/lib/portfolioSelectors';
import { DashboardContent } from '@/components/DashboardContent';
import { AnalysisContent } from '@/components/AnalysisContent';
import { DividendenContent } from '@/components/DividendenContent';
import { TransactionsContent } from '@/components/TransactionsContent';
import { PortfolioList } from '@/components/PortfolioList';
import { BrokersContent } from '@/components/brokers/BrokersContent';
import { PendingImportDialog } from '@/components/brokers/PendingImportDialog';
import { TanDialog } from '@/components/brokers/TanDialog';
import { getTransactions } from '@/lib/domain/ledger/store';

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

const MOBILE_LABELS: Partial<Record<TabKey, string>> = {
  Dashboard: 'Übersicht',
  Portfolio: 'Positionen',
  Dividenden: 'Dividenden',
  Transaktionen: 'Umsätze'
};

export default function PortfolioApp() {
  const { isLoaded, closeProject, saveProject, project, isModified, updateProject, syncAll, syncMarket, isSyncing, isMarketSyncing, marketSyncProgress, isHydratingProject, encryptionStatus, fileName, lastSavedAt } = useProject();
  const [activeTab, setActiveTab] = useState<TabKey>('Dashboard');
  const [visitedTabs, setVisitedTabs] = useState<TabKey[]>(['Dashboard']);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  // Reference time for the greeting; taken once per mount to keep rendering pure.
  const [shellNow] = useState(() => new Date());
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('1J');
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
  const holdingsCount = useMemo(() => (
    project ? calculateProjectHoldings(project, selectCalculationTransactions(project, [])).holdings.length : 0
  ), [project]);

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

  const handleTabChange = useCallback((key: TabKey) => {
    setVisitedTabs((prev) => (prev.includes(key) ? prev : [...prev, key]));
    startTransition(() => {
      setActiveTab(key);
    });
  }, [startTransition]);

  const handleCloseProject = useCallback(async () => {
    if (!(await closeProject())) return;
    setActiveTab('Dashboard');
    setVisitedTabs(['Dashboard']);
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
            onSelectPortfolios={setSelectedPortfolioIds}
            onSelectSecurity={(isin, currency) => setSelectedSecurity({ isin, currency })}
            onShowPortfolio={() => handleTabChange('Portfolio')}
            onShowBrokers={() => handleTabChange('Broker')}
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

              <label className="mt-6 block max-w-sm text-sm font-semibold">
                Zahlenformat
                <select
                  value={project?.settings?.numberLocale || DEFAULT_NUMBER_LOCALE}
                  onChange={(e) => {
                    const numberLocale = e.target.value as NumberLocale;
                    updateProject((prev) => ({ ...prev, settings: { ...prev.settings, numberLocale } }));
                  }}
                  className="md3-field mt-2 w-full px-3 text-sm outline-none"
                >
                  {NUMBER_LOCALES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
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

  const brokerConnections = getBrokerConnections(project);
  const navItems: ShellNavItem[] = NAV_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    badge: item.key === 'Portfolio' ? holdingsCount : item.key === 'Broker' ? brokerConnections.length : undefined
  }));
  navItems.push({ key: 'Einstellungen', label: 'Einstellungen' });
  const hour = shellNow.getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const savedTime = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
  const fileDetail = isModified
    ? 'Ungespeicherte Änderungen'
    : `${encryptionStatus === 'encrypted' ? 'Verschlüsselt' : 'Unverschlüsselt'} · ${savedTime ? `${savedTime} gespeichert` : 'noch nicht gespeichert'}`;
  const mobileMainKeys: TabKey[] = ['Dashboard', 'Portfolio', 'Dividenden', 'Transaktionen'];

  return (
    <div className="theme-md3 md3-app app-shell font-sans">
      <div className="app-glow app-glow-1" aria-hidden="true" />
      <div className="app-glow app-glow-2" aria-hidden="true" />

      <AppSidebar
        items={navItems}
        activeKey={activeTab}
        onNavigate={(key) => handleTabChange(key as TabKey)}
        sync={brokerConnections.length > 0
          ? {
            title: 'Auto-Sync aktiv',
            text: `${brokerConnections.length} ${brokerConnections.length === 1 ? 'Broker' : 'Broker'} verbunden. Abgleich beim Öffnen des Projekts.`,
            ok: true,
            onClick: () => handleTabChange('Broker')
          }
          : {
            title: 'Broker verbinden',
            text: 'Neue Buchungen automatisch übernehmen: DEGIRO-Ordner, IBKR, Trading 212, comdirect.',
            ok: false,
            onClick: () => handleTabChange('Broker')
          }}
        file={{ name: fileName || 'Unbenannt.openfolio', detail: fileDetail, modified: isModified, onSave: () => void saveProject() }}
        onClose={handleCloseProject}
      />

      <main className="app-main">
        <header className="app-bar anim-in">
          <div className="app-hello">
            <span className="app-hello-sub">{shellNow.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span className="app-hello-title">{greeting}</span>
          </div>
          <div className="app-bar-actions">
            <SecuritySearch
              securities={project?.securities || {}}
              onSelect={(isin) => setSelectedSecurity({ isin })}
            />
            {project?.portfolios && project.portfolios.length > 0 && (
              <MultiSelectDropdown
                options={project.portfolios}
                selectedIds={selectedPortfolioIds}
                onChange={setSelectedPortfolioIds}
              />
            )}
            <select
              aria-label="Anzeigewährung"
              title="Anzeigewährung"
              value={project?.settings?.baseCurrency || 'EUR'}
              onChange={(e) => {
                const nextCurrency = e.target.value;
                updateProject((prev) => ({
                  ...prev,
                  settings: { ...normalizeWealthGoalSettings(prev.settings), baseCurrency: nextCurrency }
                }));
              }}
              className="app-select app-hide-mobile"
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="CHF">CHF</option>
              <option value="GBP">GBP</option>
            </select>
            <div className="app-tgl glass app-hide-mobile" role="radiogroup" aria-label="Darstellung">
              {(['dark', 'light', 'system'] as ThemePreference[]).map((theme) => (
                <button
                  type="button"
                  key={theme}
                  role="radio"
                  aria-checked={themePreference === theme}
                  onClick={() => setThemePreference(theme)}
                >
                  {THEME_LABELS[theme]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => syncAll(true)}
              className="md3-icon-btn"
              aria-label="Kurse und Wechselkurse aktualisieren"
              disabled={isSyncing || isMarketSyncing}
              title="Kurse und Wechselkurse aktualisieren"
            >
              {(isSyncing || isMarketSyncing) ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            </button>
            <button type="button" onClick={() => handleTabChange('Import')} className="md3-tonal-btn app-hide-mobile px-4 text-sm">
              Import
            </button>
            <button type="button" onClick={() => handleTabChange('Import')} className="md3-filled-btn px-4 text-sm">
              + Transaktion
            </button>
          </div>
        </header>

        {missingFxCurrencies.length > 0 && (
          <div className="app-notices">
            <div className="md3-warning-soft flex items-start gap-3 rounded-2xl px-4 py-3 text-sm" role="status">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" />
              <span>
                Kurs fehlt: Für {missingFxCurrencies.join(', ')} gibt es keinen Wechselkurs.
                Beträge in {missingFxCurrencies.length === 1 ? 'dieser Währung' : 'diesen Währungen'} sind in den Summen nicht enthalten.
              </span>
            </div>
          </div>
        )}

        <div className="app-content pt-4">
          {visitedTabs.map((tab) => (
            <section
              key={tab}
              aria-hidden={activeTab !== tab}
              className={activeTab === tab ? 'space-y-6' : 'hidden'}
            >
              {renderContent(tab)}
            </section>
          ))}
        </div>

        {selectedSecurity && project?.securities?.[selectedSecurity.isin] && (
          <SecurityDetailModal
            isOpen={!!selectedSecurity}
            onClose={() => setSelectedSecurity(null)}
            security={project.securities[selectedSecurity.isin]}
            transactions={getTransactions(project)}
            currencyFilter={selectedSecurity.currency}
          />
        )}
      </main>

      <nav className="app-bottom-nav glass" aria-label="Navigation">
        {mobileMainKeys.map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => {
              setIsMobileMoreOpen(false);
              handleTabChange(key);
            }}
            className={activeTab === key ? 'is-active' : ''}
            aria-current={activeTab === key ? 'page' : undefined}
          >
            {MOBILE_LABELS[key] || key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsMobileMoreOpen((open) => !open)}
          className={isMobileMoreOpen || !mobileMainKeys.includes(activeTab) ? 'is-active' : ''}
          aria-expanded={isMobileMoreOpen}
        >
          Mehr
        </button>
      </nav>

      {isMobileMoreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setIsMobileMoreOpen(false)}>
          <div
            className="glass absolute bottom-[calc(84px+env(safe-area-inset-bottom))] left-3 right-3 flex flex-col gap-1 rounded-3xl p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.filter((item) => !mobileMainKeys.includes(item.key as TabKey)).map((item) => (
              <button
                type="button"
                key={item.key}
                className={activeTab === item.key ? 'app-nav-item is-active' : 'app-nav-item'}
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  handleTabChange(item.key as TabKey);
                }}
              >
                <span className="app-nav-dot" aria-hidden="true" />
                {item.label}
              </button>
            ))}
            <button type="button" className="app-nav-item" onClick={() => { setIsMobileMoreOpen(false); void saveProject(); }}>
              <span className="app-nav-dot" aria-hidden="true" />
              {isModified ? 'Speichern (ungespeicherte Änderungen)' : 'Gespeichert'}
            </button>
            <button type="button" className="app-nav-item" onClick={() => { setIsMobileMoreOpen(false); handleCloseProject(); }}>
              <span className="app-nav-dot" aria-hidden="true" />
              Projekt schließen
            </button>
          </div>
        </div>
      )}

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
