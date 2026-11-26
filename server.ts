import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CatalogAppEntry {
  appid: number;
  name: string;
  nameLower: string;
  aliases?: string[];
}

const appCache = new Map<number, CacheEntry<any>>();
const searchCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Classic & delisted Steam titles purged from Store Search / GetAppList
const CLASSIC_DELISTED_APPS: CatalogAppEntry[] = [
  {appid: 12120, name: 'Grand Theft Auto: San Andreas', nameLower: 'grand theft auto: san andreas', aliases: ['gta sa', 'gta san andreas', 'san andreas']},
  {appid: 12110, name: 'Grand Theft Auto: Vice City', nameLower: 'grand theft auto: vice city', aliases: ['gta vc', 'gta vice city', 'vice city']},
  {appid: 12100, name: 'Grand Theft Auto III', nameLower: 'grand theft auto iii', aliases: ['gta 3', 'gta iii']},
  {appid: 12210, name: 'Grand Theft Auto IV: The Complete Edition', nameLower: 'grand theft auto iv: the complete edition', aliases: ['gta 4', 'gta iv']},
  {appid: 33440, name: 'Driver: San Francisco', nameLower: 'driver: san francisco', aliases: ['driver sf']},
  {appid: 42640, name: 'Blur', nameLower: 'blur'},
  {appid: 50300, name: 'Spec Ops: The Line', nameLower: 'spec ops: the line'},
  {appid: 224060, name: 'Deadpool', nameLower: 'deadpool'},
  {appid: 252950, name: 'Rocket League', nameLower: 'rocket league'},
  {appid: 1097150, name: 'Fall Guys', nameLower: 'fall guys'},
  {appid: 1293830, name: 'Forza Horizon 4', nameLower: 'forza horizon 4', aliases: ['fh4']},
  {appid: 1259970, name: 'eFootball PES 2021 SEASON UPDATE', nameLower: 'efootball pes 2021 season update', aliases: ['pes 2021', 'pes21']},
  {appid: 1811260, name: 'EA SPORTS FIFA 23', nameLower: 'ea sports fifa 23', aliases: ['fifa 23']},
  {appid: 1506830, name: 'FIFA 22', nameLower: 'fifa 22'},
  {appid: 1313860, name: 'FIFA 21', nameLower: 'fifa 21'},
  {appid: 211420, name: 'DARK SOULS: Prepare To Die Edition', nameLower: 'dark souls: prepare to die edition', aliases: ['dark souls ptde']},
  {appid: 241560, name: 'The Crew', nameLower: 'the crew'},
  {appid: 376870, name: 'Minecraft: Story Mode - A Telltale Games Series', nameLower: 'minecraft: story mode'},
  {appid: 321040, name: 'DiRT 3 Complete Edition', nameLower: 'dirt 3 complete edition', aliases: ['dirt 3']},
  {appid: 44350, name: 'GRID 2', nameLower: 'grid 2'},
  {appid: 234630, name: 'Project CARS', nameLower: 'project cars'},
  {appid: 378860, name: 'Project CARS 2', nameLower: 'project cars 2'},
  {appid: 1080110, name: 'F1 2020', nameLower: 'f1 2020'},
  {appid: 1134570, name: 'F1 2021', nameLower: 'f1 2021'},
  {appid: 42650, name: 'Transformers: War for Cybertron', nameLower: 'transformers: war for cybertron'},
  {appid: 213120, name: 'Transformers: Fall of Cybertron', nameLower: 'transformers: fall of cybertron'},
  {appid: 237110, name: 'Mortal Kombat Komplete Edition', nameLower: 'mortal kombat komplete edition', aliases: ['mk9']},
  {appid: 3970, name: 'Prey (2006)', nameLower: 'prey (2006)', aliases: ['prey 2006']},
  {appid: 50130, name: 'Mafia II (Classic)', nameLower: 'mafia ii (classic)', aliases: ['mafia 2 classic']},
  {appid: 43110, name: 'Metro 2033', nameLower: 'metro 2033'},
  {appid: 43160, name: 'Metro: Last Light', nameLower: 'metro: last light'},
  {appid: 7670, name: 'BioShock', nameLower: 'bioshock'},
  {appid: 9930, name: 'Test Drive Unlimited 2', nameLower: 'test drive unlimited 2', aliases: ['tdu2']},
  {appid: 24870, name: 'Need for Speed: Shift', nameLower: 'need for speed: shift', aliases: ['nfs shift']},
  {appid: 10130, name: 'OutRun 2006: Coast 2 Coast', nameLower: 'outrun 2006: coast 2 coast'},
  {appid: 207210, name: "Tony Hawk's Pro Skater HD", nameLower: "tony hawk's pro skater hd"},
  {appid: 31280, name: 'Poker Night at the Inventory', nameLower: 'poker night at the inventory'},
  {appid: 234710, name: 'Poker Night 2', nameLower: 'poker night 2'},
  {appid: 19000, name: 'Silent Hill Homecoming', nameLower: 'silent hill homecoming'},
  {appid: 730, name: 'Counter-Strike 2 / CS:GO', nameLower: 'counter-strike 2 csgo', aliases: ['csgo', 'cs:go']},
  {appid: 300, name: 'Day of Defeat: Source', nameLower: 'day of defeat: source', aliases: ['dods']},
];

let fullCatalog: CatalogAppEntry[] = [];
let catalogLoadingPromise: Promise<void> | null = null;
let catalogLastLoadedAt = 0;

async function ensureCatalogLoaded(): Promise<void> {
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  if (fullCatalog.length > 0 && Date.now() - catalogLastLoadedAt < TWELVE_HOURS) {
    return;
  }
  if (catalogLoadingPromise) {
    return catalogLoadingPromise;
  }

  catalogLoadingPromise = (async () => {
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/dgibbs64/SteamCMD-AppID-List/main/steamcmd_appid.json',
        {signal: AbortSignal.timeout(12000)}
      );
      if (!res.ok) return;
      const json: any = await res.json();
      const apps: any[] = Array.isArray(json?.applist?.apps)
        ? json.applist.apps
        : Array.isArray(json)
          ? json
          : [];

      const parsed: CatalogAppEntry[] = [];
      for (const a of apps) {
        const id = Number(a?.appid);
        const name = typeof a?.name === 'string' ? a.name.trim() : '';
        if (!id || !name) continue;
        parsed.push({
          appid: id,
          name,
          nameLower: name.toLowerCase(),
        });
      }
      fullCatalog = parsed;
      catalogLastLoadedAt = Date.now();
      console.log(`Loaded SteamCMD catalog: ${fullCatalog.length} apps`);
    } catch {
      // Non-fatal: fallback to storesearch + classic index
    } finally {
      catalogLoadingPromise = null;
    }
  })();

  return catalogLoadingPromise;
}

// Warm up full catalog in background on server start
void ensureCatalogLoaded();

function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[:™®©\-–—_.,!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchCatalog(query: string, limit = 10): CatalogAppEntry[] {
  const qNorm = normalizeQuery(query);
  if (!qNorm) return [];
  const tokens = qNorm.split(' ').filter(Boolean);

  const scored: Array<{entry: CatalogAppEntry; score: number}> = [];

  const scoreCandidate = (entry: CatalogAppEntry, boost = 0) => {
    const nameNorm = normalizeQuery(entry.name);
    const aliasMatch = entry.aliases?.some((al) => {
      const alNorm = normalizeQuery(al);
      return alNorm === qNorm || alNorm.includes(qNorm) || qNorm.includes(alNorm);
    });

    const allTokensMatch = tokens.every((t) => nameNorm.includes(t));
    if (!allTokensMatch && !aliasMatch) return;

    let score = boost;
    if (nameNorm === qNorm || entry.aliases?.some((a) => normalizeQuery(a) === qNorm)) {
      score += 120;
    } else if (aliasMatch) {
      score += 95;
    } else if (nameNorm.startsWith(qNorm)) {
      score += 80;
    } else if (nameNorm.includes(qNorm)) {
      score += 60;
    } else {
      score += 35;
    }

    // Penalize trailers/demos/SDK/server tools unless explicitly searched
    if (
      !qNorm.includes('trailer') &&
      !qNorm.includes('demo') &&
      !qNorm.includes('server') &&
      !qNorm.includes('soundtrack') &&
      /\b(trailer|demo|dedicated server|sdk|soundtrack|artbook)\b/i.test(entry.name)
    ) {
      score -= 40;
    }

    // Prefer shorter/base titles
    score -= Math.min(20, Math.floor(entry.name.length / 8));
    scored.push({entry, score});
  };

  for (const c of CLASSIC_DELISTED_APPS) {
    scoreCandidate(c, 15);
  }
  for (const entry of fullCatalog) {
    scoreCandidate(entry, 0);
  }

  scored.sort((a, b) => b.score - a.score || a.entry.appid - b.entry.appid);

  const seen = new Set<number>();
  const out: CatalogAppEntry[] = [];
  for (const item of scored) {
    if (seen.has(item.entry.appid)) continue;
    seen.add(item.entry.appid);
    out.push(item.entry);
    if (out.length >= limit) break;
  }
  return out;
}

function getCached<T>(map: Map<any, CacheEntry<T>>, key: any): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(map: Map<any, CacheEntry<T>>, key: any, data: T): void {
  map.set(key, {data, expiresAt: Date.now() + CACHE_TTL_MS});
}

function analyzeDrm(rawNotice?: string, extAccount?: string) {
  const cleanNotice = rawNotice
    ? rawNotice.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : null;
  const cleanAccount = extAccount
    ? extAccount.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : null;

  const combined = `${cleanNotice ?? ''} ${cleanAccount ?? ''}`.toLowerCase();
  const hasDenuvo = combined.includes('denuvo');
  const hasThirdPartyDrm =
    Boolean(cleanNotice) ||
    combined.includes('ea app') ||
    combined.includes('ubisoft') ||
    combined.includes('rockstar') ||
    combined.includes('battle.net') ||
    combined.includes('securom');

  let compatibilityStatus: 'compatible' | 'caution' | 'incompatible' = 'compatible';
  let drmLabel = 'Standard Steam DRM';

  if (hasDenuvo) {
    compatibilityStatus = 'incompatible';
    drmLabel = 'Denuvo Anti-Tamper Detected';
  } else if (hasThirdPartyDrm) {
    compatibilityStatus = 'caution';
    drmLabel = cleanNotice || cleanAccount || '3rd-Party DRM / Launcher Required';
  }

  return {
    hasDenuvo,
    hasThirdPartyDrm,
    drmLabel,
    rawNotice: cleanNotice,
    thirdPartyAccount: cleanAccount,
    compatibilityStatus,
  };
}

async function fetchSteamCmdInfo(appid: number): Promise<{
  rawAppData: any | null;
  buildId: string | null;
  lastUpdated: string | null;
  availableBranches: string[];
  depots: Array<{
    depotId: string;
    name: string;
    oslist: string;
    manifestId: string;
    sizeBytes: number;
    branchManifests: Record<string, {gid: string; sizeBytes: number}>;
  }>;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.steamcmd.net/v1/info/${appid}`, {
      signal: controller.signal,
      headers: {'User-Agent': 'Walftech-LuaGen/1.0'},
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return {rawAppData: null, buildId: null, lastUpdated: null, availableBranches: [], depots: []};
    }

    const json: any = await res.json();
    const appData = json?.data?.[String(appid)];
    if (!appData) {
      return {rawAppData: null, buildId: null, lastUpdated: null, availableBranches: [], depots: []};
    }

    const branchesObj = appData?.depots?.branches ?? {};
    const availableBranches = Object.keys(branchesObj);
    const publicBranch = branchesObj?.public;
    const buildId = publicBranch?.buildid ? String(publicBranch.buildid) : null;
    const timeUpdatedSec = publicBranch?.timeupdated ? Number(publicBranch.timeupdated) : null;
    const lastUpdated = timeUpdatedSec
      ? new Date(timeUpdatedSec * 1000).toISOString().split('T')[0]
      : null;

    const depotsObj = appData?.depots ?? {};
    const parsedDepots: Array<{
      depotId: string;
      name: string;
      oslist: string;
      manifestId: string;
      sizeBytes: number;
      branchManifests: Record<string, {gid: string; sizeBytes: number}>;
    }> = [];

    for (const [key, val] of Object.entries<any>(depotsObj)) {
      if (!/^\d+$/.test(key)) continue;
      if (!val || typeof val !== 'object') continue;
      const manifestsObj = val?.manifests ?? {};
      const publicManifest = manifestsObj?.public ?? Object.values<any>(manifestsObj)[0];
      if (!publicManifest?.gid) continue;

      const branchManifests: Record<string, {gid: string; sizeBytes: number}> = {};
      for (const [bName, bVal] of Object.entries<any>(manifestsObj)) {
        if (bVal?.gid) {
          const bSize = Number(bVal?.size ?? val?.maxsize ?? 0);
          branchManifests[bName] = {
            gid: String(bVal.gid),
            sizeBytes: Number.isFinite(bSize) ? bSize : 0,
          };
        }
      }

      const oslist = val?.config?.oslist
        ? String(val.config.oslist)
        : val?.config?.lowviolence
          ? 'lowviolence'
          : 'all';
      const depotName = val?.name ? String(val.name) : `Depot ${key}`;
      const sizeBytes = Number(publicManifest?.size ?? val?.maxsize ?? 0);

      parsedDepots.push({
        depotId: key,
        name: depotName,
        oslist,
        manifestId: String(publicManifest.gid),
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
        branchManifests,
      });
    }

    return {
      rawAppData: appData,
      buildId,
      lastUpdated,
      availableBranches,
      depots: parsedDepots,
    };
  } catch {
    return {rawAppData: null, buildId: null, lastUpdated: null, availableBranches: [], depots: []};
  }
}

async function resolveSteamApp(appid: number) {
  const cached = getCached(appCache, appid);
  if (cached) return cached;

  const [storeRes, steamCmd] = await Promise.all([
    fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=US`, {
      headers: {'User-Agent': 'Walftech-LuaGen/1.0'},
    }).catch(() => null),
    fetchSteamCmdInfo(appid),
  ]);

  let storeEntry: any = null;
  if (storeRes && storeRes.ok) {
    const storeJson: any = await storeRes.json().catch(() => null);
    if (storeJson?.[String(appid)]?.success && storeJson?.[String(appid)]?.data) {
      storeEntry = storeJson[String(appid)].data;
    }
  }

  const cmd = steamCmd.rawAppData;
  if (!storeEntry && !cmd) {
    throw new Error(`AppID ${appid} was not found on Steam Store or SteamCMD.`);
  }

  // Fallback to SteamCMD common/extended metadata for delisted/purged classic apps
  const cmdName = cmd?.common?.name ? String(cmd.common.name) : null;
  const cmdOsList = String(cmd?.common?.oslist ?? 'windows').toLowerCase();
  const cmdReleaseUnix = Number(cmd?.common?.original_release_date ?? 0);
  const cmdReleaseDate =
    cmdReleaseUnix > 0 ? new Date(cmdReleaseUnix * 1000).toISOString().split('T')[0] : 'Delisted / Classic';
  const cmdAssociations = Object.values<any>(cmd?.common?.associations ?? {});
  const cmdDevs = cmdAssociations.filter((a) => a?.type === 'developer').map((a) => String(a.name));
  const cmdPubs = cmdAssociations.filter((a) => a?.type === 'publisher').map((a) => String(a.name));
  const cmdDlcIds =
    typeof cmd?.extended?.listofdlc === 'string'
      ? cmd.extended.listofdlc
          .split(',')
          .map((s: string) => Number(s.trim()))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

  const d = storeEntry;
  const drm = d
    ? analyzeDrm(d.drm_notice, d.ext_user_account_notice)
    : analyzeDrm(
        cmd?.extended?.thirdpartycdkey ? '3rd-Party Key / Legacy Launcher' : undefined,
        undefined
      );

  const appName = String(d?.name ?? cmdName ?? `App ${appid}`);

  const depots =
    steamCmd.depots.length > 0
      ? steamCmd.depots.map((dep) => ({
          ...dep,
          depotKey: '',
          included: true,
        }))
      : [
          {
            depotId: String(appid + 1),
            name: `${appName} Content Depot`,
            oslist: d?.platforms?.windows || cmdOsList.includes('windows') ? 'windows' : 'all',
            manifestId: '',
            sizeBytes: 0,
            depotKey: '',
            included: true,
          },
        ];

  const dlcIds = Array.isArray(d?.dlc)
    ? d.dlc.map((id: any) => Number(id)).filter(Number.isFinite)
    : cmdDlcIds;

  const payload = {
    appid,
    name: appName,
    type: String(d?.type ?? cmd?.common?.type ?? 'game'),
    headerImage: String(
      d?.header_image ??
        `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`
    ),
    shortDescription: String(d?.short_description ?? ''),
    developers: Array.isArray(d?.developers) ? d.developers : cmdDevs,
    publishers: Array.isArray(d?.publishers) ? d.publishers : cmdPubs,
    releaseDate: d?.release_date?.date ? String(d.release_date.date) : cmdReleaseDate,
    genres: Array.isArray(d?.genres) ? d.genres.map((g: any) => String(g.description)) : [],
    platforms: {
      windows: Boolean(d?.platforms?.windows ?? cmdOsList.includes('windows')),
      mac: Boolean(d?.platforms?.mac ?? cmdOsList.includes('macos')),
      linux: Boolean(d?.platforms?.linux ?? cmdOsList.includes('linux')),
    },
    priceFormatted: d
      ? d.is_free
        ? 'Free to Play'
        : d.price_overview?.final_formatted
          ? String(d.price_overview.final_formatted)
          : 'Delisted / N/A'
      : 'Delisted / Classic',
    buildId: steamCmd.buildId,
    lastUpdated: steamCmd.lastUpdated,
    availableBranches: steamCmd.availableBranches,
    drm,
    depots,
    dlcIds,
  };

  setCached(appCache, appid, payload);
  return payload;
}

function extractAppId(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return id > 0 ? id : null;
  }
  const urlMatch = trimmed.match(/store\.steampowered\.com\/app\/(\d+)/i);
  if (urlMatch?.[1]) {
    return Number(urlMatch[1]);
  }
  const steamDbMatch = trimmed.match(/steamdb\.info\/app\/(\d+)/i);
  if (steamDbMatch?.[1]) {
    return Number(steamDbMatch[1]);
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '1mb'}));

  app.get('/api/health', (_req, res) => {
    res.json({ok: true, catalogSize: fullCatalog.length});
  });

  app.get('/api/steam/search', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      return res.json({items: []});
    }

    const cacheKey = q.toLowerCase();
    const cached = getCached(searchCache, cacheKey);
    if (cached) {
      return res.json({items: cached});
    }

    try {
      await ensureCatalogLoaded().catch(() => {});
      const items: any[] = [];
      const seenIds = new Set<number>();
      const directId = extractAppId(q);

      if (directId) {
        try {
          const appData = await resolveSteamApp(directId);
          seenIds.add(appData.appid);
          items.push({
            id: appData.appid,
            name: appData.name,
            tiny_image: appData.headerImage,
            price: {final_formatted: appData.priceFormatted},
            platforms: appData.platforms,
          });
        } catch {
          // Fall through to store search
        }
      }

      // 1. Search classic/delisted index + full 165k SteamCMD catalog
      const catalogHits = searchCatalog(q, 8);
      for (const hit of catalogHits) {
        if (seenIds.has(hit.appid)) continue;
        seenIds.add(hit.appid);
        items.push({
          id: hit.appid,
          name: hit.name,
          tiny_image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${hit.appid}/capsule_231x87.jpg`,
          price: hit.aliases ? {final_formatted: 'Classic / Archive'} : null,
          platforms: {},
        });
      }

      // 2. Also query live Steam Store Search for currently listed titles & pricing
      const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`;
      const storeRes = await fetch(searchUrl, {
        headers: {'User-Agent': 'Walftech-LuaGen/1.0'},
        signal: AbortSignal.timeout(4000),
      }).catch(() => null);

      if (storeRes && storeRes.ok) {
        const json: any = await storeRes.json().catch(() => null);
        const found = Array.isArray(json?.items) ? json.items : [];
        for (const item of found) {
          const id = Number(item.id);
          if (seenIds.has(id)) {
            // Enrich existing entry with live Steam Store thumbnail & price
            const existing = items.find((x) => x.id === id);
            if (existing) {
              if (item.tiny_image) existing.tiny_image = String(item.tiny_image);
              if (item.price) existing.price = item.price;
              if (item.platforms) existing.platforms = item.platforms;
            }
            continue;
          }
          seenIds.add(id);
          items.push({
            id,
            name: String(item.name),
            tiny_image: String(item.tiny_image ?? ''),
            price: item.price ?? null,
            platforms: item.platforms ?? {},
          });
        }
      }

      // Re-rank merged results so exact classic matches stay near top alongside live store hits
      const qNorm = normalizeQuery(q);
      items.sort((a, b) => {
        const aNorm = normalizeQuery(a.name);
        const bNorm = normalizeQuery(b.name);
        const aExact = aNorm === qNorm ? 1 : 0;
        const bExact = bNorm === qNorm ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        const aPrefix = aNorm.startsWith(qNorm) ? 1 : 0;
        const bPrefix = bNorm.startsWith(qNorm) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        return 0;
      });

      const finalItems = items.slice(0, 15);
      setCached(searchCache, cacheKey, finalItems);
      return res.json({items: finalItems});
    } catch (err: any) {
      return res.status(502).json({error: err?.message || 'Steam search failed'});
    }
  });

  app.get('/api/steam/app/:appid', async (req, res) => {
    const rawId = String(req.params.appid ?? '');
    if (!/^\d+$/.test(rawId)) {
      return res.status(400).json({error: 'Invalid AppID format. Provide a numeric Steam AppID.'});
    }
    const appid = Number(rawId);
    try {
      const data = await resolveSteamApp(appid);
      return res.json(data);
    } catch (err: any) {
      return res.status(404).json({error: err?.message || 'App not found'});
    }
  });

  app.post('/api/steam/dlcs', async (req, res) => {
    const rawIds = Array.isArray(req.body?.appids) ? req.body.appids : [];
    const ids: number[] = rawIds
      .map((x: any) => Number(x))
      .filter((n: number) => Number.isInteger(n) && n > 0)
      .slice(0, 50);

    if (ids.length === 0) {
      return res.json({dlcs: []});
    }

    const results: any[] = [];
    const concurrency = 5;
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency);
      const resolved = await Promise.all(
        batch.map(async (id) => {
          const cached = getCached(appCache, id);
          if (cached) {
            return {
              appid: id,
              name: cached.name,
              headerImage: cached.headerImage,
              releaseDate: cached.releaseDate,
              priceFormatted: cached.priceFormatted,
              included: true,
            };
          }
          try {
            const r = await fetch(
              `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic,price_overview,release_date&l=english&cc=US`,
              {headers: {'User-Agent': 'Walftech-LuaGen/1.0'}}
            );
            if (r.ok) {
              const json: any = await r.json();
              const d = json?.[String(id)]?.data;
              if (d) {
                return {
                  appid: id,
                  name: String(d.name ?? `DLC #${id}`),
                  headerImage: d.header_image ? String(d.header_image) : undefined,
                  releaseDate: d.release_date?.date ? String(d.release_date.date) : undefined,
                  priceFormatted: d.is_free
                    ? 'Free'
                    : d.price_overview?.final_formatted
                      ? String(d.price_overview.final_formatted)
                      : undefined,
                  included: true,
                };
              }
            }
          } catch {
            // Fall through to SteamCMD name fallback
          }

          // Fallback to SteamCMD info for delisted DLC names
          try {
            const cmdRes = await fetch(`https://api.steamcmd.net/v1/info/${id}`, {
              signal: AbortSignal.timeout(3000),
            });
            if (cmdRes.ok) {
              const cmdJson: any = await cmdRes.json();
              const cmdName = cmdJson?.data?.[String(id)]?.common?.name;
              if (cmdName) {
                return {appid: id, name: String(cmdName), included: true};
              }
            }
          } catch {
            // Ignore
          }

          return {appid: id, name: `DLC #${id}`, included: true};
        })
      );
      results.push(...resolved);
    }

    return res.json({dlcs: results});
  });

  app.post('/api/steam/batch', async (req, res) => {
    const inputs: string[] = Array.isArray(req.body?.inputs)
      ? req.body.inputs.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 15)
      : [];

    const results: any[] = [];
    for (const input of inputs) {
      const appid = extractAppId(input);
      if (!appid) {
        results.push({
          input,
          appid: null,
          status: 'error',
          error: 'Could not extract a valid Steam AppID',
        });
        continue;
      }
      try {
        const appData = await resolveSteamApp(appid);
        results.push({
          input,
          appid,
          status: 'resolved',
          app: appData,
        });
      } catch (err: any) {
        results.push({
          input,
          appid,
          status: 'error',
          error: err?.message || 'Lookup failed',
        });
      }
    }
    return res.json({results});
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
