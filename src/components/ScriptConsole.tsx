import React, {useEffect, useMemo, useState} from 'react';
import {Check, Copy, Download, FileArchive, FileCode2, FileText, RotateCcw} from 'lucide-react';
import type {LuaGenerationOptions, SteamAppDetails, SteamDepotInfo, SteamDlcItem} from '../types/steam';
import {
  buildBundleFiles,
  downloadTextFile,
  downloadZipBundle,
  formatBytes,
  generateLuaScript,
  generateManifestDescriptor,
  generateSteamCmdScript,
} from '../utils/luaGenerator';

interface ScriptConsoleProps {
  app: SteamAppDetails;
  depots: SteamDepotInfo[];
  dlcs: SteamDlcItem[];
  options: LuaGenerationOptions;
  onChangeOptions: (next: LuaGenerationOptions) => void;
  onSelectBranch?: (branch: string) => void;
  selectedBranch?: string;
  labels: {
    outputLua: string;
    outputFiles: string;
    outputManifest: string;
    outputSteamCmd: string;
    copyBtn: string;
    copiedBtn: string;
    downloadLua: string;
    downloadZip: string;
    optionsIncludeDlc: string;
    optionsManifestCalls: string;
    optionsComments: string;
    optionsFolderMode: string;
    layoutSteamtools: string;
    layoutFlat: string;
    customKeyLabel: string;
    customKeyPlaceholder: string;
  };
}

type OutputTab = 'files' | 'lua' | 'manifest' | 'steamcmd';

export const ScriptConsole: React.FC<ScriptConsoleProps> = ({
  app,
  depots,
  dlcs,
  options,
  onChangeOptions,
  onSelectBranch,
  selectedBranch = 'public',
  labels,
}) => {
  const [activeTab, setActiveTab] = useState<OutputTab>('files');
  const [customLuaEdit, setCustomLuaEdit] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);

  const generatedLua = useMemo(
    () => generateLuaScript(app, depots, dlcs, options),
    [app, depots, dlcs, options]
  );

  const generatedManifest = useMemo(
    () => generateManifestDescriptor(app, depots),
    [app, depots]
  );

  const generatedSteamCmd = useMemo(
    () => generateSteamCmdScript(app, depots),
    [app, depots]
  );

  const bundleFiles = useMemo(
    () => buildBundleFiles(app, depots, dlcs, options, customLuaEdit ?? generatedLua),
    [app, depots, dlcs, options, customLuaEdit, generatedLua]
  );

  useEffect(() => {
    setCustomLuaEdit(null);
  }, [app.appid, depots, dlcs, options]);

  const activeContent =
    activeTab === 'lua'
      ? customLuaEdit ?? generatedLua
      : activeTab === 'manifest'
        ? generatedManifest
        : generatedSteamCmd;

  const lineCount = activeContent.split('\n').length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeTab === 'files' ? customLuaEdit ?? generatedLua : activeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  const handleDownloadLua = () => {
    downloadTextFile(`${app.appid}.lua`, customLuaEdit ?? generatedLua);
  };

  const handleDownloadZip = async () => {
    setZipping(true);
    try {
      await downloadZipBundle(app, depots, dlcs, options, customLuaEdit ?? generatedLua);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden flex flex-col">
      {/* Tab Header & Copy Action */}
      <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#0B0F17] rounded-lg border border-slate-800/80 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'files'
                ? 'bg-slate-800 text-slate-50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {labels.outputFiles} ({bundleFiles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lua')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'lua'
                ? 'bg-slate-800 text-slate-50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {labels.outputLua}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manifest')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'manifest'
                ? 'bg-slate-800 text-slate-50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {labels.outputManifest}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('steamcmd')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'steamcmd'
                ? 'bg-slate-800 text-slate-50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {labels.outputSteamCmd}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'lua' && customLuaEdit !== null && (
            <button
              type="button"
              onClick={() => setCustomLuaEdit(null)}
              className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Reset manual edits"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{copied ? labels.copiedBtn : labels.copyBtn}</span>
          </button>
        </div>
      </div>

      {/* Configuration Controls */}
      <div className="px-4 py-3 border-b border-slate-800/80 bg-[#0D131F] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeDlc}
                onChange={(e) => onChangeOptions({...options, includeDlc: e.target.checked})}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
              />
              <span>{labels.optionsIncludeDlc}</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeManifestCalls}
                onChange={(e) =>
                  onChangeOptions({...options, includeManifestCalls: e.target.checked})
                }
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
              />
              <span>{labels.optionsManifestCalls}</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeComments}
                onChange={(e) => onChangeOptions({...options, includeComments: e.target.checked})}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
              />
              <span>{labels.optionsComments}</span>
            </label>
          </div>

          {app.availableBranches && app.availableBranches.length > 1 && onSelectBranch && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Branch:</span>
              <select
                value={selectedBranch}
                onChange={(e) => onSelectBranch(e.target.value)}
                className="h-7 px-2 rounded bg-[#111827] border border-slate-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/60"
              >
                {app.availableBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">{labels.customKeyLabel}</label>
            <input
              type="text"
              value={options.customKeyOverride}
              onChange={(e) => onChangeOptions({...options, customKeyOverride: e.target.value})}
              placeholder={labels.customKeyPlaceholder}
              className="w-full h-8 px-2.5 rounded bg-[#111827] border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              {labels.optionsFolderMode}
            </label>
            <select
              value={options.folderStructure}
              onChange={(e) =>
                onChangeOptions({
                  ...options,
                  folderStructure: e.target.value as 'flat' | 'steamtools',
                })
              }
              className="w-full h-8 px-2.5 rounded bg-[#111827] border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/60"
            >
              <option value="flat">{labels.layoutFlat}</option>
              <option value="steamtools">{labels.layoutSteamtools}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Viewer: Individual Bundle Files OR Code Editor */}
      {activeTab === 'files' ? (
        <div className="flex-1 min-h-[380px] bg-[#080B11] flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-start border-collapse" dir="ltr">
              <thead>
                <tr className="border-b border-slate-800/90 text-[11px] text-slate-500 bg-[#0A0E16]">
                  <th className="py-2.5 px-4 text-start font-medium">File Name</th>
                  <th className="py-2.5 px-4 text-start font-medium">Type</th>
                  <th className="py-2.5 px-4 text-end font-medium">Depot Size</th>
                  <th className="py-2.5 px-4 text-end font-medium">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                {bundleFiles.map((file) => (
                  <tr key={file.archivePath} className="hover:bg-slate-900/60">
                    <td className="py-2.5 px-4 text-slate-100">
                      <div className="flex items-center gap-2.5">
                        {file.type === 'lua' ? (
                          <FileCode2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{file.archivePath}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {file.type === 'lua' ? 'Lua Source File' : 'MANIFEST File'}
                    </td>
                    <td className="py-2.5 px-4 text-end tabular-nums text-slate-400">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="py-2.5 px-4 text-end">
                      <button
                        type="button"
                        onClick={() => downloadTextFile(file.filename, file.content)}
                        className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Get</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="relative flex-1 min-h-[380px] bg-[#080B11] flex font-mono text-xs leading-6" dir="ltr">
          <div
            aria-hidden="true"
            className="py-4 px-3 select-none text-end text-slate-600 border-r border-slate-800/70 bg-[#0A0E16] min-w-[3rem] tabular-nums"
          >
            {Array.from({length: lineCount}, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          {activeTab === 'lua' ? (
            <textarea
              value={activeContent}
              onChange={(e) => setCustomLuaEdit(e.target.value)}
              spellCheck={false}
              aria-label="Generated Lua script editor"
              className="flex-1 w-full p-4 bg-transparent text-emerald-300/95 focus:outline-none resize-none overflow-x-auto whitespace-pre"
            />
          ) : (
            <pre className="flex-1 p-4 text-slate-200 overflow-auto whitespace-pre">
              {activeContent}
            </pre>
          )}
        </div>
      )}

      {/* Export Footer Bar */}
      <div className="px-4 py-3.5 border-t border-slate-800 bg-[#111827] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
          <FileCode2 className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <span>{app.appid}.zip</span>
          <span aria-hidden="true">·</span>
          <span>
            1 .lua + {Math.max(0, bundleFiles.length - 1)} .manifest
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadLua}
            className="h-9 px-4 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{labels.downloadLua}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={zipping}
            className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>{labels.downloadZip}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
