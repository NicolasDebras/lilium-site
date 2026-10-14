"""
app/images.py — Images PNG d'un build et d'une compo, IDENTIQUES à celles du bot.

Le rendu vient de app/shared/build_image.py, copie exacte de botDiscord/Service/build_image.py
(resynchronisée par `python -m scripts.sync_from_bot`, vérifiée par la CI). Ce module
le ré-exporte et ajoute ce qui n'existe que côté API : rendu dans un thread, sémaphore, cache.
"""
import asyncio
import hashlib
import json
from collections import OrderedDict

from app.shared.build_image import *  # noqa: F401,F403 — API publique du rendu (WIDTH, local_icon…)
from app.shared.build_image import (
    COMPO_MAX_ROWS, compo_rows, fetch_icons, item_ids, normalize_items, render_build_image, render_compo_image,
)

# ══════════════════════════════════════════════════════════════════════════════
# SPÉCIFIQUE À L'API (n'existe pas côté bot) : rendu sans bloquer le serveur web
# ══════════════════════════════════════════════════════════════════════════════
RENDER_CONCURRENCY = 2      # rendus Pillow simultanés max (CPU)
PNG_CACHE_MAX = 200         # images gardées en mémoire (~50 à 200 Ko chacune)
_render_sem: asyncio.Semaphore | None = None
_png_cache: "OrderedDict[str, bytes | None]" = OrderedDict()


def _cache_key(kind: str, payload) -> str:
    """Clé = contenu exact de ce qu'on dessine : une modification du build/de la compo change l'image."""
    raw = json.dumps([kind, payload], sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


async def _cached(key: str, make) -> bytes | None:
    global _render_sem
    if key in _png_cache:
        _png_cache.move_to_end(key)
        return _png_cache[key]
    if _render_sem is None:
        _render_sem = asyncio.Semaphore(RENDER_CONCURRENCY)
    async with _render_sem:
        png = await make()
    _png_cache[key] = png
    while len(_png_cache) > PNG_CACHE_MAX:
        _png_cache.popitem(last=False)
    return png


def _build_payload(build: dict) -> dict:
    keys = ("name", "role", "type_acti", "weapon", "notes")
    return {**{k: build.get(k) or "" for k in keys}, "items": normalize_items(build.get("items"))}


async def build_png(build: dict) -> bytes:
    """PNG d'un build (comme le MP de /massup) : icônes téléchargées, rendu dans un thread."""
    payload = _build_payload(build)

    async def make() -> bytes:
        icons = await fetch_icons(payload["items"])
        return await asyncio.to_thread(render_build_image, payload, icons)

    return await _cached(_cache_key("build", payload), make)


async def compo_png(name: str, template_data: dict, builds_by_id: dict[int, dict]) -> bytes | None:
    """PNG d'une compo (comme sous /acti), ou None si aucun rôle n'a de build."""
    rows = [(party, role, count, _build_payload(builds_by_id[bid]))
            for party, role, count, bid in compo_rows(template_data) if bid in builds_by_id][:COMPO_MAX_ROWS]
    if not rows:
        return None

    async def make() -> bytes:
        ids: list[str] = []
        for *_, build in rows:
            ids.extend(i for i in item_ids(build["items"]) if i not in ids)
        icons = await fetch_icons(None, ids)
        return await asyncio.to_thread(render_compo_image, name, rows, icons)

    return await _cached(_cache_key("compo", rows), make)
