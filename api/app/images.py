"""
app/images.py — Images PNG d'un build et d'une compo, IDENTIQUES à celles du bot.

Le rendu vient de la lib AlbionCreateImageBuild (api/requirements.txt, même tag que le bot) ;
les lignes d'une compo viennent de app/shared/lilium_compo.py (copie du bot). Ce module ajoute
ce qui n'existe que côté API : rendu dans un thread, sémaphore, cache des PNG.
"""
import asyncio
import hashlib
import json
from collections import OrderedDict

from albion_create_image_build import (  # noqa: F401 — WIDTH, COMPO_WIDTH, local_icon : utilisés par les tests
    COMPO_MAX_ROWS, COMPO_WIDTH, WIDTH, IconFetcher, default_fetcher, item_ids, local_icon, normalize_items,
    normalize_spells, render_build_image, render_compo_image, shoes_spell_id, spell_ids,
)

from app.shared.lilium_compo import compo_rows

RENDER_CONCURRENCY = 2      # rendus Pillow simultanés max (CPU)
PNG_CACHE_MAX = 200         # images gardées en mémoire (~50 à 200 Ko chacune)
_render_sem: asyncio.Semaphore | None = None
_png_cache: "OrderedDict[str, bytes | None]" = OrderedDict()

# None = IconFetcher partagé de la lib ; les tests y mettent un faux (aucun réseau).
fetcher: IconFetcher | None = None


def _cache_key(kind: str, payload) -> str:
    """Clé = contenu exact de ce qu'on dessine : une modification du build/de la compo change l'image."""
    raw = json.dumps([kind, payload], sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


async def _cached(key: str, make) -> bytes | None:
    """`make()` → (png, complet). Une image dessinée avec des icônes en échec (CDN lent ou qui refuse,
    « ? » à la place) n'est PAS gardée : le prochain affichage redemande les icônes manquantes (celles
    déjà reçues sont dans le cache du fetcher) au lieu de servir l'image ratée jusqu'au redémarrage."""
    global _render_sem
    if key in _png_cache:
        _png_cache.move_to_end(key)
        return _png_cache[key]
    if _render_sem is None:
        _render_sem = asyncio.Semaphore(RENDER_CONCURRENCY)
    async with _render_sem:
        png, complete = await make()
    if not complete:
        return png
    _png_cache[key] = png
    while len(_png_cache) > PNG_CACHE_MAX:
        _png_cache.popitem(last=False)
    return png


async def _icons(ids: list[str]) -> tuple[dict[str, bytes | None], bool]:
    """(icônes, complet) : complet = chaque icône a une réponse sûre du CDN (reçue, ou absente : 404),
    aucune n'a échoué sur un délai ou une erreur passagère."""
    f = fetcher or default_fetcher()
    icons = await f.fetch(ids)
    cache = getattr(f, "cache", None)
    complete = cache is None or all(i in cache for i in ids)
    return icons, complete


def _build_payload(build: dict) -> dict:
    keys = ("name", "role", "type_acti", "weapon")
    return {**{k: build.get(k) or "" for k in keys}, "items": normalize_items(build.get("items")),
            "spells": normalize_spells(build.get("spells"))}


async def build_png(build: dict) -> bytes:
    """PNG d'un build (comme le MP de /massup) : icônes téléchargées, rendu dans un thread."""
    payload = _build_payload(build)

    async def make() -> bytes:
        icons, complete = await _icons(item_ids(payload["items"]) + spell_ids(payload["items"], payload["spells"]))
        return await asyncio.to_thread(render_build_image, payload, icons), complete

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
            row_ids = item_ids(build["items"]) + shoes_spell_id(build["items"], build["spells"])
            ids.extend(i for i in row_ids if i not in ids)
        icons, complete = await _icons(ids)
        return await asyncio.to_thread(render_compo_image, rows, icons), complete

    return await _cached(_cache_key("compo", rows), make)
