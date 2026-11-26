export interface SteamSearchResult {
  id: number;
  name: string;
  tiny_image: string;
  price?: {
    final_formatted?: string;
  } | null;
  platforms?: {
    windows?: boolean;
    mac?: boolean;
    linux?: boolean;
  };
}

export interface SteamDepotInfo {
  depotId: string;
  name: string;
  oslist: string;
  manifestId: string;
  sizeBytes: number;
  depotKey: string;
  included: boolean;
  branchManifests?: Record<string, {gid: string; sizeBytes: number}>;
}

export interface SteamDlcItem {
  appid: number;
  name: string;
  headerImage?: string;
  releaseDate?: string;
  priceFormatted?: string;
  included: boolean;
}

export interface DrmAnalysis {
  hasDenuvo: boolean;
  hasThirdPartyDrm: boolean;
  drmLabel: string;
  rawNotice: string | null;
  thirdPartyAccount: string | null;
  compatibilityStatus: 'compatible' | 'caution' | 'incompatible';
}

export interface SteamAppDetails {
  appid: number;
  name: string;
  type: string;
  headerImage: string;
  shortDescription: string;
  developers: string[];
  publishers: string[];
  releaseDate: string;
  genres: string[];
  platforms: {
    windows: boolean;
    mac: boolean;
    linux: boolean;
  };
  priceFormatted: string;
  buildId: string | null;
  lastUpdated: string | null;
  availableBranches?: string[];
  drm: DrmAnalysis;
  depots: SteamDepotInfo[];
  dlcIds: number[];
}

export interface LuaGenerationOptions {
  includeDlc: boolean;
  includeManifestCalls: boolean;
  includeComments: boolean;
  folderStructure: 'flat' | 'steamtools';
  customKeyOverride: string;
}

export interface HistoryEntry {
  appid: number;
  name: string;
  headerImage: string;
  hasDenuvo: boolean;
  depotCount: number;
  dlcCount: number;
  timestamp: number;
}
