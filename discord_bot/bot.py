import asyncio
import io
import json
import os
import re
import zipfile
from datetime import datetime, timezone
from typing import Any

import aiohttp
import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")

CLASSIC_DELISTED_APPS: list[dict[str, Any]] = [
    {"appid": 12120, "name": "Grand Theft Auto: San Andreas", "aliases": ["gta sa", "gta san andreas"]},
    {"appid": 12110, "name": "Grand Theft Auto: Vice City", "aliases": ["gta vc", "gta vice city"]},
    {"appid": 12100, "name": "Grand Theft Auto III", "aliases": ["gta 3", "gta iii"]},
    {"appid": 12210, "name": "Grand Theft Auto IV: The Complete Edition", "aliases": ["gta 4", "gta iv"]},
    {"appid": 33440, "name": "Driver: San Francisco", "aliases": ["driver sf"]},
    {"appid": 42640, "name": "Blur", "aliases": []},
    {"appid": 50300, "name": "Spec Ops: The Line", "aliases": []},
    {"appid": 224060, "name": "Deadpool", "aliases": []},
    {"appid": 252950, "name": "Rocket League", "aliases": []},
    {"appid": 1097150, "name": "Fall Guys", "aliases": []},
    {"appid": 1293830, "name": "Forza Horizon 4", "aliases": ["fh4"]},
    {"appid": 1259970, "name": "eFootball PES 2021 SEASON UPDATE", "aliases": ["pes 2021"]},
    {"appid": 1811260, "name": "EA SPORTS FIFA 23", "aliases": ["fifa 23"]},
    {"appid": 211420, "name": "DARK SOULS: Prepare To Die Edition", "aliases": ["dark souls ptde"]},
    {"appid": 300, "name": "Day of Defeat: Source", "aliases": ["dods"]},
    {"appid": 801800, "name": "Atomfall", "aliases": []},
]


def normalize_text(text: str) -> str:
    return re.sub(r"[:™®©\-–—_.,!?'\"()]+", " ", text.lower()).strip()


class WalftechBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        super().__init__(command_prefix="!", intents=intents)
        self.http_session: aiohttp.ClientSession | None = None
        self.catalog: list[dict[str, Any]] = list(CLASSIC_DELISTED_APPS)

    async def setup_hook(self) -> None:
        self.http_session = aiohttp.ClientSession(
            headers={"User-Agent": "Walftech-DiscordBot/1.0"}
        )
        asyncio.create_task(self.load_full_catalog())
        await self.tree.sync()

    async def close(self) -> None:
        if self.http_session and not self.http_session.closed:
            await self.http_session.close()
        await super().close()

    async def load_full_catalog(self) -> None:
        if not self.http_session:
            return
        url = "https://raw.githubusercontent.com/dgibbs64/SteamCMD-AppID-List/main/steamcmd_appid.json"
        try:
            async with self.http_session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    return
                data = await resp.json(content_type=None)
                apps = data.get("applist", {}).get("apps", data) if isinstance(data, dict) else data
                if not isinstance(apps, list):
                    return
                seen = {item["appid"] for item in CLASSIC_DELISTED_APPS}
                merged = list(CLASSIC_DELISTED_APPS)
                for entry in apps:
                    appid = entry.get("appid")
                    name = (entry.get("name") or "").strip()
                    if isinstance(appid, int) and name and appid not in seen:
                        seen.add(appid)
                        merged.append({"appid": appid, "name": name, "aliases": []})
                self.catalog = merged
                print(f"Loaded {len(self.catalog)} Steam apps into catalog.")
        except Exception as exc:
            print(f"Catalog load skipped: {exc}")


bot = WalftechBot()


def extract_appid(raw: str) -> int | None:
    text = raw.strip()
    if text.isdigit():
        return int(text)
    paren_match = re.search(r"\((\d+)\)\s*$", text)
    if paren_match:
        return int(paren_match.group(1))
    url_match = re.search(r"store\.steampowered\.com/app/(\d+)", text, re.IGNORECASE)
    if url_match:
        return int(url_match.group(1))
    return None


def search_local_catalog(query: str, limit: int = 10) -> list[dict[str, Any]]:
    q_norm = normalize_text(query)
    if not q_norm:
        return []
    tokens = [t for t in q_norm.split() if t]
    scored: list[tuple[int, dict[str, Any]]] = []

    for item in bot.catalog:
        name_norm = normalize_text(item["name"])
        aliases = [normalize_text(a) for a in item.get("aliases", [])]
        alias_hit = any(al == q_norm or q_norm in al or al in q_norm for al in aliases)
        if not alias_hit and not all(t in name_norm for t in tokens):
            continue

        score = 0
        if name_norm == q_norm or any(al == q_norm for al in aliases):
            score += 120
        elif alias_hit:
            score += 95
        elif name_norm.startswith(q_norm):
            score += 80
        elif q_norm in name_norm:
            score += 60
        else:
            score += 35

        if (
            "trailer" not in q_norm
            and "demo" not in q_norm
            and "server" not in q_norm
            and re.search(r"\b(trailer|demo|dedicated server|sdk|soundtrack|artbook)\b", item["name"], re.I)
        ):
            score -= 40

        score -= min(20, len(item["name"]) // 8)
        scored.append((score, item))

    scored.sort(key=lambda pair: (-pair[0], pair[1]["appid"]))
    return [pair[1] for pair in scored[:limit]]


async def search_steam_games(session: aiohttp.ClientSession, query: str, limit: int = 10) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    for hit in search_local_catalog(query, limit=limit):
        seen_ids.add(hit["appid"])
        results.append({"appid": hit["appid"], "name": hit["name"], "source": "Catalog"})

    try:
        url = f"https://store.steampowered.com/api/storesearch/?term={query}&l=english&cc=US"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=4.0)) as r:
            if r.status == 200:
                data = await r.json(content_type=None)
                for item in data.get("items", []):
                    aid = int(item["id"])
                    if aid not in seen_ids:
                        seen_ids.add(aid)
                        results.append(
                            {"appid": aid, "name": str(item["name"]), "source": "Steam Store"}
                        )
    except Exception:
        pass

    q_norm = normalize_text(query)
    results.sort(
        key=lambda x: (
            -(1 if normalize_text(x["name"]) == q_norm else 0),
            -(1 if normalize_text(x["name"]).startswith(q_norm) else 0),
        )
    )
    return results[:limit]


async def resolve_query_to_appid(session: aiohttp.ClientSession, raw_query: str) -> int | None:
    direct = extract_appid(raw_query)
    if direct:
        return direct
    matches = await search_steam_games(session, raw_query, limit=1)
    if matches:
        return int(matches[0]["appid"])
    return None


async def fetch_steam_app_data(session: aiohttp.ClientSession, appid: int) -> dict[str, Any]:
    store_url = f"https://store.steampowered.com/api/appdetails?appids={appid}&l=english&cc=US"
    cmd_url = f"https://api.steamcmd.net/v1/info/{appid}"

    async def get_json(url: str, timeout_sec: float = 6.0) -> Any:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout_sec)) as r:
                if r.status == 200:
                    return await r.json(content_type=None)
        except Exception:
            return None
        return None

    store_json, cmd_json = await asyncio.gather(
        get_json(store_url),
        get_json(cmd_url),
    )

    store_data = None
    if isinstance(store_json, dict):
        entry = store_json.get(str(appid), {})
        if entry.get("success") and isinstance(entry.get("data"), dict):
            store_data = entry["data"]

    cmd_data = None
    if isinstance(cmd_json, dict):
        cmd_data = cmd_json.get("data", {}).get(str(appid))

    if not store_data and not cmd_data:
        raise ValueError(f"AppID `{appid}` was not found on Steam Store or SteamCMD.")

    name = (
        (store_data or {}).get("name")
        or ((cmd_data or {}).get("common") or {}).get("name")
        or f"App {appid}"
    )
    header_image = (store_data or {}).get(
        "header_image",
        f"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg",
    )

    drm_notice = re.sub(r"<[^>]+>", " ", (store_data or {}).get("drm_notice") or "").strip()
    ext_account = re.sub(
        r"<[^>]+>", " ", (store_data or {}).get("ext_user_account_notice") or ""
    ).strip()
    has_denuvo = "denuvo" in f"{drm_notice} {ext_account}".lower()

    depots_raw = ((cmd_data or {}).get("depots") or {}) if isinstance(cmd_data, dict) else {}
    branches = depots_raw.get("branches", {}) if isinstance(depots_raw, dict) else {}
    public_branch = branches.get("public", {}) if isinstance(branches, dict) else {}

    build_id = str(public_branch.get("buildid") or "N/A")
    time_updated = public_branch.get("timeupdated")
    if time_updated:
        updated_str = datetime.fromtimestamp(int(time_updated), tz=timezone.utc).strftime("%Y-%m-%d")
    else:
        updated_str = "N/A"

    depots: list[dict[str, Any]] = []
    for key, val in depots_raw.items():
        if not key.isdigit() or not isinstance(val, dict):
            continue
        manifests = val.get("manifests") or {}
        pub_manifest = manifests.get("public") or next(iter(manifests.values()), None)
        if not isinstance(pub_manifest, dict) or not pub_manifest.get("gid"):
            continue
        oslist = (val.get("config") or {}).get("oslist") or "all"
        depots.append(
            {
                "depotId": key,
                "name": val.get("name") or f"Depot {key}",
                "oslist": oslist,
                "manifestId": str(pub_manifest["gid"]),
                "sizeBytes": int(pub_manifest.get("size") or val.get("maxsize") or 0),
            }
        )

    if not depots:
        depots.append(
            {
                "depotId": str(appid + 1),
                "name": f"{name} Content Depot",
                "oslist": "windows",
                "manifestId": "",
                "sizeBytes": 0,
            }
        )

    dlc_ids: list[int] = []
    if store_data and isinstance(store_data.get("dlc"), list):
        dlc_ids = [int(x) for x in store_data["dlc"] if str(x).isdigit()]
    elif cmd_data:
        raw_dlc = (cmd_data.get("extended") or {}).get("listofdlc", "")
        if isinstance(raw_dlc, str) and raw_dlc.strip():
            dlc_ids = [int(x.strip()) for x in raw_dlc.split(",") if x.strip().isdigit()]

    return {
        "appid": appid,
        "name": name,
        "header_image": header_image,
        "has_denuvo": has_denuvo,
        "drm_notice": drm_notice or ext_account,
        "build_id": build_id,
        "updated": updated_str,
        "depots": depots,
        "dlc_ids": dlc_ids,
    }


def build_zip_bundle(app: dict[str, Any], check_dlc: bool) -> io.BytesIO:
    appid = app["appid"]
    lines = [
        "-- ============================================================",
        "-- Walftech Manifest & Lua Generator",
        f"-- Game: {app['name']}",
        f"-- AppID: {appid}",
        f"-- Public BuildID: {app['build_id']}",
        f"-- Last Updated: {app['updated']}",
        "-- ============================================================",
        "",
        f"addappid({appid})",
        "",
        "-- Depot Definitions",
    ]

    placeholder_key = "0" * 64
    for d in app["depots"]:
        lines.append(
            f'addappid({d["depotId"]}, 1, "{placeholder_key}") -- {d["name"]} ({d["oslist"]})'
        )

    manifest_depots = [d for d in app["depots"] if d["manifestId"]]
    if manifest_depots:
        lines.append("")
        lines.append("-- Depot Manifest Bindings")
        for d in manifest_depots:
            lines.append(f'setManifestid({d["depotId"]}, "{d["manifestId"]}", 0)')

    if check_dlc and app["dlc_ids"]:
        lines.append("")
        lines.append(f"-- DLC AppIDs ({len(app['dlc_ids'])} included)")
        for dlc_id in app["dlc_ids"]:
            lines.append(f"addappid({dlc_id})")

    lua_content = "\n".join(lines) + "\n"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{appid}.lua", lua_content)
        for d in app["depots"]:
            gid = d["manifestId"] or "0"
            manifest_filename = f"{d['depotId']}_{gid}.manifest"
            manifest_payload = json.dumps(
                {
                    "appid": appid,
                    "name": app["name"],
                    "depotId": d["depotId"],
                    "depotName": d["name"],
                    "oslist": d["oslist"],
                    "manifestId": d["manifestId"] or None,
                    "sizeBytes": d["sizeBytes"],
                    "buildId": app["build_id"],
                    "lastUpdated": app["updated"],
                },
                indent=2,
            )
            zf.writestr(manifest_filename, manifest_payload)

    buf.seek(0)
    return buf


async def appid_autocomplete(
    interaction: discord.Interaction, current: str
) -> list[app_commands.Choice[str]]:
    q = current.strip()
    if not q:
        picks = [
            {"appid": 1245620, "name": "Elden Ring"},
            {"appid": 801800, "name": "Atomfall"},
            {"appid": 12120, "name": "Grand Theft Auto: San Andreas"},
            {"appid": 1091500, "name": "Cyberpunk 2077"},
            {"appid": 300, "name": "Day of Defeat: Source"},
        ]
        return [
            app_commands.Choice(name=f"{p['name']} ({p['appid']})", value=str(p["appid"]))
            for p in picks
        ]

    matches: list[app_commands.Choice[str]] = []
    if q.isdigit():
        matches.append(app_commands.Choice(name=f"AppID ({q})", value=q))

    seen_vals = {m.value for m in matches}
    for item in search_local_catalog(q, limit=20):
        val = str(item["appid"])
        if val not in seen_vals:
            seen_vals.add(val)
            label = f"{item['name']} ({val})"[:100]
            matches.append(app_commands.Choice(name=label, value=val))

    if len(matches) < 5 and bot.http_session:
        try:
            url = f"https://store.steampowered.com/api/storesearch/?term={q}&l=english&cc=US"
            async with bot.http_session.get(url, timeout=aiohttp.ClientTimeout(total=2.5)) as r:
                if r.status == 200:
                    data = await r.json(content_type=None)
                    for item in data.get("items", []):
                        val = str(item.get("id"))
                        if val not in seen_vals:
                            seen_vals.add(val)
                            label = f"{item.get('name')} ({val})"[:100]
                            matches.append(app_commands.Choice(name=label, value=val))
                            if len(matches) >= 25:
                                break
        except Exception:
            pass

    return matches[:25]


@bot.tree.command(
    name="gen",
    description="Generate Steam .lua and .manifest bundle by game name or AppID",
)
@app_commands.describe(
    appid="Game name or AppID (e.g. Elden Ring or 1245620)",
    check_dlc="True = include DLCs in .lua, False = base game only",
)
@app_commands.autocomplete(appid=appid_autocomplete)
async def gen_command(
    interaction: discord.Interaction,
    appid: str,
    check_dlc: bool = True,
) -> None:
    await interaction.response.defer(thinking=True)

    if not bot.http_session:
        await interaction.followup.send("Bot HTTP session is not ready yet.", ephemeral=True)
        return

    resolved_id = await resolve_query_to_appid(bot.http_session, appid)
    if not resolved_id:
        await interaction.followup.send(
            f"No Steam game found matching `{appid}`.",
            ephemeral=True,
        )
        return

    try:
        app = await fetch_steam_app_data(bot.http_session, resolved_id)
    except ValueError as err:
        await interaction.followup.send(str(err), ephemeral=True)
        return

    manifest_count = sum(1 for d in app["depots"] if d["manifestId"])
    dlc_display = (
        str(len(app["dlc_ids"]))
        if check_dlc
        else f"0 (Excluded · {len(app['dlc_ids'])} available)"
    )

    if app["has_denuvo"]:
        status_emoji = "🚨"
        embed_color = discord.Color.red()
    else:
        status_emoji = "✅"
        embed_color = discord.Color.from_rgb(87, 242, 135)

    embed = discord.Embed(
        title=f"{status_emoji} {app['name']}",
        color=embed_color,
    )
    embed.set_thumbnail(url=app["header_image"])
    embed.add_field(name="🎮 AppID", value=f"`{app['appid']}`", inline=True)
    embed.add_field(name="📦 Depots", value=str(len(app["depots"])), inline=True)
    embed.add_field(name="📋 Manifests", value=str(manifest_count), inline=True)
    embed.add_field(name="🔨 BuildID", value=f"`{app['build_id']}`", inline=True)
    embed.add_field(name="📅 Updated", value=app["updated"], inline=True)
    embed.add_field(name="🎁 DLC", value=dlc_display, inline=True)

    if app["drm_notice"]:
        embed.set_footer(text=f"DRM Notice: {app['drm_notice']}")

    zip_buffer = build_zip_bundle(app, check_dlc=check_dlc)
    zip_file = discord.File(fp=zip_buffer, filename=f"{app['appid']}.zip")

    await interaction.followup.send(embed=embed, file=zip_file)


@bot.tree.command(name="search", description="Search Steam games and show their AppIDs only")
@app_commands.describe(query="Game title to search for (e.g. Elden Ring)")
async def search_command(interaction: discord.Interaction, query: str) -> None:
    await interaction.response.defer(thinking=True)

    if not bot.http_session:
        await interaction.followup.send("Bot HTTP session is not ready yet.", ephemeral=True)
        return

    matches = await search_steam_games(bot.http_session, query, limit=10)
    if not matches:
        await interaction.followup.send(
            f"No Steam games found for `{query}`.",
            ephemeral=True,
        )
        return

    lines = [f"`{m['appid']}` — **{m['name']}**" for m in matches]
    embed = discord.Embed(
        title=f"🔎 Search Results: {query}",
        description="\n".join(lines),
        color=discord.Color.from_rgb(87, 242, 135),
    )
    embed.set_footer(text="Use /gen <AppID> to generate the .lua and .manifest bundle.")
    await interaction.followup.send(embed=embed)


@bot.tree.command(name="help", description="Show available bot commands and usage examples")
async def help_command(interaction: discord.Interaction) -> None:
    embed = discord.Embed(
        title="📘 Bot Commands & Usage",
        description="Steam Manifest & Lua Generator Bot",
        color=discord.Color.from_rgb(87, 242, 135),
    )
    embed.add_field(
        name="`/gen appid:<name_or_id> [check_dlc:True/False]`",
        value=(
            "يبحث عن اللعبة أو يستخدم رقم AppID مباشرة لتوليد ملف `.lua` وملفات `.manifest` داخل `.zip`.\n"
            "• `/gen Elden Ring` — يبحث ويولد مباشرة مع DLC\n"
            "• `/gen 1245620` — بالـ AppID مباشرة\n"
            "• `/gen appid:Atomfall (801800) check_dlc:False` — اللعبة بدون DLC"
        ),
        inline=False,
    )
    embed.add_field(
        name="`/search query:<game_name>`",
        value="يبحث عن اللعبة ويعرض أرقام **AppID** المطابقة فقط.\n• `/search Grand Theft Auto: San Andreas`",
        inline=False,
    )
    embed.add_field(
        name="`/help`",
        value="يعرض قائمة الأوامر وطريقة الاستخدام.",
        inline=False,
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)


if __name__ == "__main__":
    if not DISCORD_TOKEN:
        raise RuntimeError("Missing DISCORD_BOT_TOKEN environment variable.")
    bot.run(DISCORD_TOKEN)
