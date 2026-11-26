import React, {useEffect, useState} from 'react';
import {AlertCircle, Clock, ShieldAlert, CheckCircle2, Trash2} from 'lucide-react';
import {GameInspector} from './components/GameInspector';
import {ScriptConsole} from './components/ScriptConsole';
import {SearchBar} from './components/SearchBar';
import {translations, type Locale} from './i18n/translations';
import type {
  HistoryEntry,
  LuaGenerationOptions,
  SteamAppDetails,
  SteamDepotInfo,
  SteamDlcItem,
} from './types/steam';

const HISTORY_STORAGE_KEY = 'walftech_lua_gen_history_v1';

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');

  const [selectedApp, setSelectedApp] = useState<SteamAppDetails | null>(null);
  const [depots, setDepots] = useState<SteamDepotInfo[]>([]);
  const [dlcs, setDlcs] = useState<SteamDlcItem[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('public');
  const [isLoadingApp, setIsLoadingApp] = useState(false);
  const [isLoadingDlcs, setIsLoadingDlcs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [options, setOptions] = useState<LuaGenerationOptions>({
    includeDlc: true,
    includeManifestCalls: true,
    includeComments: true,
    folderStructure: 'flat',
    customKeyOverride: '',
  });

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const t = translations[locale];

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage quota issues
    }
  }, [history]);

  const loadApp = async (appid: number) => {
    setIsLoadingApp(true);
    setError(null);
    setDlcs([]);
    setSelectedBranch('public');

    try {
      const res = await fetch(`/api/steam/app/${appid}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to load AppID ${appid}`);
      }
      const data: SteamAppDetails = await res.json();
      setSelectedApp(data);
      setDepots(data.depots);

      const initialDlcs: SteamDlcItem[] = data.dlcIds.map((id) => ({
        appid: id,
        name: `DLC #${id}`,
        included: true,
      }));
      setDlcs(initialDlcs);

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.appid !== data.appid);
        const next: HistoryEntry = {
          appid: data.appid,
          name: data.name,
          headerImage: data.headerImage,
          hasDenuvo: data.drm.hasDenuvo,
          depotCount: data.depots.length,
          dlcCount: data.dlcIds.length,
          timestamp: Date.now(),
        };
        return [next, ...filtered].slice(0, 12);
      });

      if (data.dlcIds.length > 0) {
        setIsLoadingDlcs(true);
        fetch('/api/steam/dlcs', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({appids: data.dlcIds.slice(0, 50)}),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((dlcData) => {
            if (!dlcData || !Array.isArray(dlcData.dlcs)) return;
            const nameMap = new Map<number, SteamDlcItem>(
              dlcData.dlcs.map((d: SteamDlcItem) => [d.appid, d])
            );
            setDlcs((prev) =>
              prev.map((item) => {
                const resolved = nameMap.get(item.appid);
                return resolved ? {...resolved, included: item.included} : item;
              })
            );
          })
          .catch(() => {
            // Keep numeric DLC entries if name lookup fails
          })
          .finally(() => {
            setIsLoadingDlcs(false);
          });
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load Steam App details.');
    } finally {
      setIsLoadingApp(false);
    }
  };

  const handleSelectBranch = (branch: string) => {
    setSelectedBranch(branch);
    setDepots((prev) =>
      prev.map((d) => {
        const bInfo = d.branchManifests?.[branch];
        if (!bInfo) return d;
        return {
          ...d,
          manifestId: bInfo.gid,
          sizeBytes: bInfo.sizeBytes || d.sizeBytes,
        };
      })
    );
  };

  const fetchDlcDetails = async () => {
    if (!selectedApp || selectedApp.dlcIds.length === 0) return;
    setIsLoadingDlcs(true);
    try {
      const res = await fetch('/api/steam/dlcs', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({appids: selectedApp.dlcIds.slice(0, 50)}),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.dlcs)) {
          const nameMap = new Map<number, SteamDlcItem>(
            data.dlcs.map((d: SteamDlcItem) => [d.appid, d])
          );
          setDlcs((prev) =>
            prev.map((item) => {
              const resolved = nameMap.get(item.appid);
              return resolved ? {...resolved, included: item.included} : item;
            })
          );
        }
      }
    } finally {
      setIsLoadingDlcs(false);
    }
  };

  const toggleDlc = (appid: number) => {
    setDlcs((prev) =>
      prev.map((d) => (d.appid === appid ? {...d, included: !d.included} : d))
    );
  };

  const selectAllDlcs = (selected: boolean) => {
    setDlcs((prev) => prev.map((d) => ({...d, included: selected})));
  };

  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col"
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setSelectedApp(null);
              setError(null);
            }}
            className="text-base sm:text-lg font-display font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.brand}
          </button>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setLocale((prev) => (prev === 'en' ? 'ar' : 'en'))}
              className="px-4 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.langSwitch}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-8">
          {/* Search & Hero Strip */}
          <section className="space-y-4">
            <div className="space-y-1.5 max-w-3xl">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50 text-balance">
                {t.heroTitle}
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">{t.heroSubtitle}</p>
            </div>

            <SearchBar
              onSelectApp={loadApp}
              isLoadingApp={isLoadingApp}
              placeholder={t.searchPlaceholder}
              buttonLabel={t.searchButton}
              quickPicksLabel={t.quickPicks}
              searchingLabel={t.searching}
            />
          </section>

          {/* Error State */}
          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/70 flex items-center gap-3 text-sm text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoadingApp && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-[460/215] bg-slate-800/70" />
                <div className="p-5 space-y-3">
                  <div className="h-6 bg-slate-800 rounded w-2/3" />
                  <div className="h-4 bg-slate-800/70 rounded w-1/2" />
                  <div className="h-14 bg-slate-800/50 rounded" />
                </div>
              </div>
              <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl h-[520px] animate-pulse" />
            </div>
          )}

          {/* Populated Workspace */}
          {!isLoadingApp && selectedApp && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5">
                <GameInspector
                  app={selectedApp}
                  depots={depots}
                  onChangeDepots={setDepots}
                  dlcs={dlcs}
                  isLoadingDlcs={isLoadingDlcs}
                  onFetchDlcs={fetchDlcDetails}
                  onToggleDlc={toggleDlc}
                  onSelectAllDlcs={selectAllDlcs}
                  labels={{
                    drmCompatible: t.drmCompatible,
                    drmDenuvo: t.drmDenuvo,
                    drmCaution: t.drmCaution,
                    depotsHeading: t.depotsHeading,
                    addDepot: t.addDepot,
                    depotIdCol: t.depotIdCol,
                    manifestCol: t.manifestCol,
                    sizeCol: t.sizeCol,
                    dlcHeading: t.dlcHeading,
                    loadDlcs: t.loadDlcs,
                    loadingDlcs: t.loadingDlcs,
                    selectAll: t.selectAll,
                    deselectAll: t.deselectAll,
                    noDlcs: t.noDlcs,
                  }}
                />
              </div>
              <div className="lg:col-span-7">
                <ScriptConsole
                  app={selectedApp}
                  depots={depots}
                  dlcs={dlcs}
                  options={options}
                  onChangeOptions={setOptions}
                  selectedBranch={selectedBranch}
                  onSelectBranch={handleSelectBranch}
                  labels={{
                    outputLua: t.outputLua,
                    outputFiles: t.outputFiles,
                    outputManifest: t.outputManifest,
                    outputSteamCmd: t.outputSteamCmd,
                    copyBtn: t.copyBtn,
                    copiedBtn: t.copiedBtn,
                    downloadLua: t.downloadLua,
                    downloadZip: t.downloadZip,
                    optionsIncludeDlc: t.optionsIncludeDlc,
                    optionsManifestCalls: t.optionsManifestCalls,
                    optionsComments: t.optionsComments,
                    optionsFolderMode: t.optionsFolderMode,
                    layoutSteamtools: t.layoutSteamtools,
                    layoutFlat: t.layoutFlat,
                    customKeyLabel: t.customKeyLabel,
                    customKeyPlaceholder: t.customKeyPlaceholder,
                  }}
                />
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingApp && !selectedApp && (
            <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-4">
                <h2 className="text-xl font-semibold text-slate-100">{t.emptyTitle}</h2>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xl">
                  {t.emptySubtitle}
                </p>
                <div className="pt-2 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => loadApp(12120)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    GTA: San Andreas (12120)
                  </button>
                  <button
                    type="button"
                    onClick={() => loadApp(1245620)}
                    className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                  >
                    Elden Ring (1245620)
                  </button>
                </div>
              </div>
              <div className="lg:col-span-5 relative min-h-[220px] bg-slate-900 border-t lg:border-t-0 lg:border-s border-slate-800">
                <img
                  src="/src/assets/images/generator_workspace_banner_1795649895085.jpg"
                  alt="Depot and Lua cartridge visualization"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </section>
          )}

          {/* Recent Lookups History */}
          {history.length > 0 && (
            <section className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Clock className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <span>{t.historyHeading}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHistory([])}
                  className="text-xs text-slate-500 hover:text-red-400 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.clearHistory}</span>
                </button>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-800/80">
                  {history.map((item) => (
                    <button
                      key={item.appid}
                      type="button"
                      onClick={() => loadApp(item.appid)}
                      className="w-full px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-800/40 text-start transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={item.headerImage}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src =
                              '/src/assets/images/generator_workspace_banner_1795649895085.jpg';
                          }}
                          className="w-14 h-7 object-cover rounded border border-slate-800 shrink-0"
                        />
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-400 shrink-0">
                        <span className="hidden sm:inline">
                          {item.depotCount} depots · {item.dlcCount} DLCs
                        </span>
                        {item.hasDenuvo ? (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Denuvo</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Steam</span>
                          </span>
                        )}
                        <span className="text-slate-300">#{item.appid}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-5 px-4 sm:px-6">
        <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>Walftech Manifest &amp; Lua Generator</span>
          <span>Public Steam Store &amp; Depot Metadata Utility</span>
        </div>
      </footer>
    </div>
  );
}
