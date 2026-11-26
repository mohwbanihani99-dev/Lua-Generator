import React, {useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Layers,
  Loader2,
  Package,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {SteamAppDetails, SteamDepotInfo, SteamDlcItem} from '../types/steam';
import {formatBytes} from '../utils/luaGenerator';

interface GameInspectorProps {
  app: SteamAppDetails;
  depots: SteamDepotInfo[];
  onChangeDepots: (depots: SteamDepotInfo[]) => void;
  dlcs: SteamDlcItem[];
  isLoadingDlcs: boolean;
  onFetchDlcs: () => void;
  onToggleDlc: (appid: number) => void;
  onSelectAllDlcs: (selected: boolean) => void;
  labels: {
    drmCompatible: string;
    drmDenuvo: string;
    drmCaution: string;
    depotsHeading: string;
    addDepot: string;
    depotIdCol: string;
    manifestCol: string;
    sizeCol: string;
    dlcHeading: string;
    loadDlcs: string;
    loadingDlcs: string;
    selectAll: string;
    deselectAll: string;
    noDlcs: string;
  };
}

export const GameInspector: React.FC<GameInspectorProps> = ({
  app,
  depots,
  onChangeDepots,
  dlcs,
  isLoadingDlcs,
  onFetchDlcs,
  onToggleDlc,
  onSelectAllDlcs,
  labels,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const toggleDepot = (depotId: string) => {
    onChangeDepots(
      depots.map((d) => (d.depotId === depotId ? {...d, included: !d.included} : d))
    );
  };

  const updateDepotField = (
    depotId: string,
    field: 'manifestId' | 'depotKey' | 'depotId',
    value: string
  ) => {
    onChangeDepots(
      depots.map((d) => (d.depotId === depotId ? {...d, [field]: value} : d))
    );
  };

  const addCustomDepot = () => {
    const nextId = String(app.appid + depots.length + 1);
    onChangeDepots([
      ...depots,
      {
        depotId: nextId,
        name: `Custom Depot ${depots.length + 1}`,
        oslist: 'windows',
        manifestId: '',
        sizeBytes: 0,
        depotKey: '',
        included: true,
      },
    ]);
  };

  const removeDepot = (depotId: string) => {
    onChangeDepots(depots.filter((d) => d.depotId !== depotId));
  };

  const drmTone =
    app.drm.compatibilityStatus === 'incompatible'
      ? {
          wrapper: 'bg-red-950/35 border-red-900/70 text-red-200',
          icon: <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />,
          title: labels.drmDenuvo,
        }
      : app.drm.compatibilityStatus === 'caution'
        ? {
            wrapper: 'bg-amber-950/35 border-amber-900/70 text-amber-200',
            icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />,
            title: labels.drmCaution,
          }
        : {
            wrapper: 'bg-emerald-950/30 border-emerald-900/60 text-emerald-200',
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />,
            title: labels.drmCompatible,
          };

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden flex flex-col">
      {/* Steam Banner */}
      <div className="relative aspect-[460/215] w-full bg-slate-900 border-b border-slate-800 overflow-hidden">
        <img
          src={
            imgFailed
              ? '/src/assets/images/generator_workspace_banner_1795649895085.jpg'
              : app.headerImage
          }
          alt={app.name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111827] via-transparent to-transparent" />
      </div>

      {/* Title & Unboxed Metadata */}
      <div className="p-5 border-b border-slate-800/80 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-50 leading-snug">{app.name}</h2>
          <a
            href={`https://store.steampowered.com/app/${app.appid}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center gap-1 shrink-0 mt-1"
            title="Open on Steam Store"
          >
            <span className="font-mono tabular-nums">{app.appid}</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
          {app.developers[0] && <span>{app.developers[0]}</span>}
          {app.developers[0] && app.releaseDate && <span aria-hidden="true">·</span>}
          <span>{app.releaseDate}</span>
          {app.priceFormatted && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-300">{app.priceFormatted}</span>
            </>
          )}
          {app.buildId && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-300">Build {app.buildId}</span>
            </>
          )}
        </div>

        {/* DRM Alert */}
        <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${drmTone.wrapper}`}>
          {drmTone.icon}
          <div className="min-w-0 space-y-0.5">
            <div className="font-medium">{drmTone.title}</div>
            {(app.drm.rawNotice || app.drm.thirdPartyAccount) && (
              <p className="text-slate-300/90 leading-relaxed">
                {app.drm.rawNotice || app.drm.thirdPartyAccount}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Depots Section */}
      <div className="p-5 border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Package className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span>{labels.depotsHeading}</span>
            <span className="text-xs font-mono tabular-nums text-slate-500">({depots.length})</span>
          </div>
          <button
            type="button"
            onClick={addCustomDepot}
            className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{labels.addDepot}</span>
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
          {depots.map((depot) => (
            <div
              key={depot.depotId}
              className="p-2.5 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={depot.included}
                    onChange={() => toggleDepot(depot.depotId)}
                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
                  />
                  <span className="text-xs font-medium text-slate-200 truncate">{depot.name}</span>
                </label>
                <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  <span>{depot.oslist}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatBytes(depot.sizeBytes)}</span>
                  {depots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDepot(depot.depotId)}
                      className="text-slate-500 hover:text-red-400 p-0.5 cursor-pointer"
                      aria-label={`Remove depot ${depot.depotId}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[11px] text-slate-500 mb-1">{labels.depotIdCol}</span>
                  <input
                    type="text"
                    value={depot.depotId}
                    onChange={(e) => updateDepotField(depot.depotId, 'depotId', e.target.value)}
                    className="w-full h-8 px-2.5 rounded bg-[#111827] border border-slate-800 text-xs font-mono tabular-nums text-slate-200 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
                <div>
                  <span className="block text-[11px] text-slate-500 mb-1">{labels.manifestCol}</span>
                  <input
                    type="text"
                    value={depot.manifestId}
                    placeholder="Manifest GID"
                    onChange={(e) => updateDepotField(depot.depotId, 'manifestId', e.target.value)}
                    className="w-full h-8 px-2.5 rounded bg-[#111827] border border-slate-800 text-xs font-mono tabular-nums text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DLC Section */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Layers className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span>{labels.dlcHeading}</span>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              ({app.dlcIds.length})
            </span>
          </div>

          {app.dlcIds.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              {isLoadingDlcs && (
                <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" aria-label={labels.loadingDlcs} />
              )}
              {dlcs.length === 0 ? (
                <button
                  type="button"
                  onClick={onFetchDlcs}
                  disabled={isLoadingDlcs}
                  className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>{isLoadingDlcs ? labels.loadingDlcs : labels.loadDlcs}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelectAllDlcs(true)}
                    className="text-slate-300 hover:text-emerald-400 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {labels.selectAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectAllDlcs(false)}
                    className="text-slate-400 hover:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {labels.deselectAll}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {app.dlcIds.length === 0 ? (
          <p className="text-xs text-slate-500">{labels.noDlcs}</p>
        ) : dlcs.length === 0 ? (
          <div className="text-xs text-slate-400 font-mono tabular-nums leading-relaxed">
            {app.dlcIds.slice(0, 12).join(', ')}
            {app.dlcIds.length > 12 ? ` (+${app.dlcIds.length - 12} more)` : ''}
          </div>
        ) : (
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/70 border border-slate-800 rounded-lg bg-[#0B0F17]">
            {dlcs.map((dlc) => (
              <label
                key={dlc.appid}
                className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-slate-900/70 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={dlc.included}
                    onChange={() => onToggleDlc(dlc.appid)}
                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40 shrink-0"
                  />
                  <span className="text-xs text-slate-200 truncate">{dlc.name}</span>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                  {dlc.appid}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
