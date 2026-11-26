import JSZip from 'jszip';
import type {LuaGenerationOptions, SteamAppDetails, SteamDepotInfo, SteamDlcItem} from '../types/steam';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx >= 2 ? 2 : 0)} ${units[idx]}`;
}

export function generateLuaScript(
  app: SteamAppDetails,
  depots: SteamDepotInfo[],
  dlcs: SteamDlcItem[],
  options: LuaGenerationOptions
): string {
  const lines: string[] = [];
  const activeDepots = depots.filter((d) => d.included);
  const activeDlcs = dlcs.filter((d) => d.included);

  if (options.includeComments) {
    lines.push(`-- ============================================================`);
    lines.push(`-- Walftech Manifest & Lua Generator`);
    lines.push(`-- Game: ${app.name}`);
    lines.push(`-- AppID: ${app.appid}`);
    if (app.buildId) lines.push(`-- Public BuildID: ${app.buildId}`);
    if (app.lastUpdated) lines.push(`-- Last Updated: ${app.lastUpdated}`);
    lines.push(`-- ============================================================`);
    lines.push('');
  }

  lines.push(`addappid(${app.appid})`);

  if (activeDepots.length > 0) {
    lines.push('');
    if (options.includeComments) {
      lines.push(`-- Depot Definitions`);
    }
    for (const depot of activeDepots) {
      const key =
        options.customKeyOverride.trim() ||
        depot.depotKey.trim() ||
        '0000000000000000000000000000000000000000000000000000000000000000';
      const label = options.includeComments ? ` -- ${depot.name} (${depot.oslist})` : '';
      lines.push(`addappid(${depot.depotId}, 1, "${key}")${label}`);
    }
  }

  if (options.includeManifestCalls) {
    const manifestDepots = activeDepots.filter((d) => d.manifestId.trim() !== '');
    if (manifestDepots.length > 0) {
      lines.push('');
      if (options.includeComments) {
        lines.push(`-- Depot Manifest Bindings`);
      }
      for (const depot of manifestDepots) {
        lines.push(`setManifestid(${depot.depotId}, "${depot.manifestId.trim()}", 0)`);
      }
    }
  }

  if (options.includeDlc && activeDlcs.length > 0) {
    lines.push('');
    if (options.includeComments) {
      lines.push(`-- DLC AppIDs (${activeDlcs.length} selected)`);
    }
    for (const dlc of activeDlcs) {
      const comment = options.includeComments ? ` -- ${dlc.name}` : '';
      lines.push(`addappid(${dlc.appid})${comment}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function getManifestFilename(depot: SteamDepotInfo): string {
  const gid = depot.manifestId.trim() || '0';
  return `${depot.depotId}_${gid}.manifest`;
}

export function generateSingleManifestContent(
  app: SteamAppDetails,
  depot: SteamDepotInfo
): string {
  return JSON.stringify(
    {
      appid: app.appid,
      name: app.name,
      depotId: depot.depotId,
      depotName: depot.name,
      oslist: depot.oslist,
      manifestId: depot.manifestId.trim() || null,
      sizeBytes: depot.sizeBytes,
      buildId: app.buildId ?? null,
      lastUpdated: app.lastUpdated ?? null,
    },
    null,
    2
  );
}

export function generateManifestDescriptor(
  app: SteamAppDetails,
  depots: SteamDepotInfo[]
): string {
  const activeDepots = depots.filter((d) => d.included);
  const manifestObj = {
    appid: app.appid,
    name: app.name,
    buildId: app.buildId ?? 'unknown',
    lastUpdated: app.lastUpdated ?? new Date().toISOString().split('T')[0],
    drm: app.drm.drmLabel,
    depots: activeDepots.map((d) => ({
      depotId: d.depotId,
      name: d.name,
      oslist: d.oslist,
      manifestId: d.manifestId || 'PENDING_MANIFEST_GID',
      manifestFilename: getManifestFilename(d),
      sizeBytes: d.sizeBytes,
    })),
  };
  return JSON.stringify(manifestObj, null, 2);
}

export function generateSteamCmdScript(
  app: SteamAppDetails,
  depots: SteamDepotInfo[]
): string {
  const activeDepots = depots.filter((d) => d.included);
  const lines = [
    `// SteamCMD Depot Manifest Script for ${app.name} (${app.appid})`,
    `@ShutdownOnFailedCommand 1`,
    `@NoPromptForPassword 1`,
    `login anonymous`,
  ];
  for (const d of activeDepots) {
    if (d.manifestId) {
      lines.push(`download_depot ${app.appid} ${d.depotId} ${d.manifestId}`);
    } else {
      lines.push(`download_depot ${app.appid} ${d.depotId}`);
    }
  }
  lines.push(`quit`);
  return lines.join('\n') + '\n';
}

export interface BundleFileEntry {
  filename: string;
  archivePath: string;
  type: 'lua' | 'manifest';
  sizeBytes: number;
  content: string;
  depot?: SteamDepotInfo;
}

export function buildBundleFiles(
  app: SteamAppDetails,
  depots: SteamDepotInfo[],
  dlcs: SteamDlcItem[],
  options: LuaGenerationOptions,
  luaContentOverride?: string
): BundleFileEntry[] {
  const activeDepots = depots.filter((d) => d.included);
  const luaContent = luaContentOverride ?? generateLuaScript(app, depots, dlcs, options);
  const luaName = `${app.appid}.lua`;

  const files: BundleFileEntry[] = [
    {
      filename: luaName,
      archivePath:
        options.folderStructure === 'steamtools' ? `config/stplug-in/${luaName}` : luaName,
      type: 'lua',
      sizeBytes: new Blob([luaContent]).size,
      content: luaContent,
    },
  ];

  for (const depot of activeDepots) {
    const manifestName = getManifestFilename(depot);
    const manifestContent = generateSingleManifestContent(app, depot);
    files.push({
      filename: manifestName,
      archivePath:
        options.folderStructure === 'steamtools'
          ? `config/depotcache/${manifestName}`
          : manifestName,
      type: 'manifest',
      sizeBytes: depot.sizeBytes || new Blob([manifestContent]).size,
      content: manifestContent,
      depot,
    });
  }

  return files;
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadZipBundle(
  app: SteamAppDetails,
  depots: SteamDepotInfo[],
  dlcs: SteamDlcItem[],
  options: LuaGenerationOptions,
  luaContentOverride?: string
): Promise<void> {
  const zip = new JSZip();
  const files = buildBundleFiles(app, depots, dlcs, options, luaContentOverride);

  for (const file of files) {
    zip.file(file.archivePath, file.content);
  }

  const blob = await zip.generateAsync({type: 'blob'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${app.appid}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
