"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  LayoutDashboard,
  PieChart,
  Wallet,
  Calendar,
  FileText,
  Database,
  FolderSync
} from 'lucide-react';
import { useProjectActions, useProjectData } from '@/contexts/ProjectContext';
import { FileStatusCard, MissingFxNotice, MobileSaveButton, StartupMarketSync, SyncButton } from '@/components/shell/ShellStatus';
import { ProjectLauncher } from '@/components/ProjectLauncher';
import { SettingsContent } from '@/components/SettingsContent';
import { DataSourcesContent } from '@/components/DataSourcesContent';
import { ImportContent } from '@/components/ImportContent';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { TransactionModal } from '@/components/TransactionModal';
import { SecurityDetailModal } from '@/components/SecurityDetailModal';
import { applyThemePreference, resolveThemePreference, type ThemePreference } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { useFormatters } from '@/components/ui/useFormatters';
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
  { key: 'Dashboard', icon: LayoutDashboard },
  { key: 'Portfolio', icon: Wallet },
  { key: 'Analyse', icon: PieChart },
  { key: 'Dividenden', icon: Calendar },
  { key: 'Transaktionen', icon: FileText },
  { key: 'Datenquellen', icon: Database },
  { key: 'Broker', icon: FolderSync }
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

/** Pages with their own header; the dashboard greets with the date instead. */
const HEADING_KEYS = ['Portfolio', 'Analyse', 'Dividenden', 'Transaktionen', 'Datenquellen', 'Broker', 'Einstellungen', 'Import'] as const;
const hasHeading = (tab: TabKey): tab is (typeof HEADING_KEYS)[number] => (HEADING_KEYS as readonly string[]).includes(tab);

const MOBILE_MAIN_KEYS = ['Dashboard', 'Portfolio', 'Dividenden', 'Transaktionen'] as const;

export default function PortfolioApp() {
  const t = useT();
  const formatters = useFormatters();
  // Only the project: file status and sync progress are read by the small status components
  const project = useProjectData();
  const isLoaded = project !== null;
  const { closeProject, updateProject } = useProjectActions();
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
  const [, startTransition] = useTransition();

  const [importTargetPortfolio, setImportTargetPortfolio] = useState<{ id: string; name: string; isNew: boolean } | null>(null);

  // Only meaningful once FX data is loaded (lazy hydration or the first sync may still be running).
  const holdingsCount = useMemo(() => (
    project ? calculateProjectHoldings(project, selectCalculationTransactions(project, [])).holdings.length : 0
  ), [project]);

  const themePreference = resolveThemePreference(project?.settings);

  useEffect(() => {
    applyThemePreference(themePreference);
  }, [themePreference]);

  const setThemePreference = useCallback((theme: ThemePreference) => {
    updateProject((prev) => ({ ...prev, settings: { ...prev.settings, theme } }));
  }, [updateProject]);

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
        return <SettingsContent />;
      case 'Import':
        return (
          <ImportContent
            key={project?.id || 'import'}
            onContinue={(portfolioId, isNew, newName) => {
              setImportTargetPortfolio({
                id: portfolioId,
                name: isNew ? (newName || t.shell.newPortfolio) : (project?.portfolios.find((p) => p.id === portfolioId)?.name || t.common.unknown),
                isNew
              });
              setIsTransactionModalOpen(true);
            }}
          />
        );
      default:
        return <div className="p-8 text-center" style={{ color: 'var(--md3-on-surface-variant)' }}>{t.shell.inDevelopment}</div>;
    }
  };

  const brokerConnections = getBrokerConnections(project);
  const navItems: ShellNavItem[] = NAV_ITEMS.map((item) => ({
    key: item.key,
    label: t.shell.nav[item.key],
    badge: item.key === 'Portfolio' ? holdingsCount : item.key === 'Broker' ? brokerConnections.length : undefined
  }));
  navItems.push({ key: 'Einstellungen', label: t.shell.nav.Einstellungen });
  const hour = shellNow.getHours();
  const greeting = hour < 11 ? t.shell.greeting.morning : hour < 18 ? t.shell.greeting.day : t.shell.greeting.evening;
  const mobileMainKeys: readonly TabKey[] = MOBILE_MAIN_KEYS;
  const heading = hasHeading(activeTab) ? t.shell.headings[activeTab] : null;

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
            title: t.shell.syncActiveTitle,
            text: t.shell.syncActiveText(brokerConnections.length),
            ok: true,
            onClick: () => handleTabChange('Broker')
          }
          : {
            title: t.shell.connectTitle,
            text: t.shell.connectText,
            ok: false,
            onClick: () => handleTabChange('Broker')
          }}
        fileStatus={<FileStatusCard onClose={handleCloseProject} />}
      />

      <main className="app-main">
        <header className="app-bar anim-in">
          <div className="app-hello">
            <span className="app-hello-sub">{heading?.sub ?? formatters.date(shellNow, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <h1 className="app-hello-title">{heading?.title ?? greeting}</h1>
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
              aria-label={t.shell.displayCurrency}
              title={t.shell.displayCurrency}
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
            <div className="app-tgl glass app-hide-mobile" role="radiogroup" aria-label={t.shell.appearance}>
              {(['dark', 'light', 'system'] as ThemePreference[]).map((theme) => (
                <button
                  type="button"
                  key={theme}
                  role="radio"
                  aria-checked={themePreference === theme}
                  onClick={() => setThemePreference(theme)}
                >
                  {t.theme[theme]}
                </button>
              ))}
            </div>
            <SyncButton />
            <button type="button" onClick={() => handleTabChange('Import')} className="md3-tonal-btn app-hide-mobile px-4 text-sm">
              {t.shell.importButton}
            </button>
            <button type="button" onClick={() => handleTabChange('Import')} className="md3-filled-btn px-4 text-sm">
              {t.shell.addTransaction}
            </button>
          </div>
        </header>

        <MissingFxNotice />

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

      <nav className="app-bottom-nav glass" aria-label={t.shell.navigation}>
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
            {t.shell.mobile[key as (typeof MOBILE_MAIN_KEYS)[number]]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsMobileMoreOpen((open) => !open)}
          className={isMobileMoreOpen || !mobileMainKeys.includes(activeTab) ? 'is-active' : ''}
          aria-expanded={isMobileMoreOpen}
        >
          {t.shell.mobile.more}
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
            <MobileSaveButton onDone={() => setIsMobileMoreOpen(false)} />
            <button type="button" className="app-nav-item" onClick={() => { setIsMobileMoreOpen(false); handleCloseProject(); }}>
              <span className="app-nav-dot" aria-hidden="true" />
              {t.shell.closeProject}
            </button>
          </div>
        </div>
      )}

      <PendingImportDialog />
      <TanDialog />

      <StartupMarketSync />

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
