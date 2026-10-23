"""Données de l'onglet Marché : noms FR/EN de tous les objets à tier du jeu et recettes
de cuisine / potions, extraits des mêmes dumps que le catalogue des builds :

    https://github.com/ao-data/ao-bin-dumps  (items.json + formatted/items.json)

Les prix ne passent pas par ici : le navigateur les demande directement à l'Albion
Online Data Project (limite par IP, donc répartie entre les joueurs).
Le fichier généré est versionné (app/data/market.json) ; pour le régénérer :
    python -m scripts.update_items
"""
import gzip
import json
import re
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "market.json"

_TIERED = re.compile(r"^T\d_")
_ENCHANTED = re.compile(r"^(.+)@(\d)$")
_RECIPE = re.compile(r"^T(\d)_(POTION|MEAL)_")
# Ressources brutes/raffinées : la version enchantée s'appelle T4_FIBER_LEVEL1@1
_RAW_RESOURCE = re.compile(r"^T\d_(FIBER|HIDE|ORE|WOOD|ROCK|CLOTH|LEATHER|METALBAR|PLANKS|STONEBLOCK)$")


def _as_list(value) -> list:
    return [] if value is None else value if isinstance(value, list) else [value]


def _requirements(req) -> dict | None:
    """Première recette d'un objet → {y: quantité produite, r: [[id, nombre], ...]}."""
    first = (_as_list(req) or [None])[0]
    if not first:
        return None
    resources = []
    for res in _as_list(first.get("craftresource")):
        unique = res.get("@uniquename")
        if not unique:
            continue
        level = int(res.get("@enchantmentlevel") or 0)
        if level:
            unique = f"{unique}_LEVEL{level}@{level}" if _RAW_RESOURCE.match(unique) else f"{unique}@{level}"
        resources.append([unique, int(res.get("@count") or 1)])
    return {"y": int(first.get("@amountcrafted") or 0), "r": resources} if resources else None


def extract_recipes(raw_items: dict) -> list[dict]:
    """Recettes de cuisine et de potions, enchantements compris (« T6_POTION_HEAL@1 »)."""
    recipes = []
    for section in raw_items.values():
        for item in section if isinstance(section, list) else []:
            unique = item.get("@uniquename", "")
            match = _RECIPE.match(unique)
            if not match or "@" in unique or not item.get("craftingrequirements"):
                continue
            tier, cat = int(match.group(1)), "potion" if match.group(2) == "POTION" else "meal"
            default_yield = int(item.get("@amountcrafted") or 0)
            base = _requirements(item["craftingrequirements"])
            if base:
                recipes.append({"id": unique, "tier": tier, "ench": 0, "cat": cat,
                                "y": base["y"] or default_yield or 1, "r": base["r"]})
            for ench in _as_list((item.get("enchantments") or {}).get("enchantment")):
                level = int(ench.get("@enchantmentlevel") or 0)
                req = _requirements(ench.get("craftingrequirements")) if level else None
                if req:
                    recipes.append({"id": f"{unique}@{level}", "tier": tier, "ench": level, "cat": cat,
                                    "y": req["y"] or default_yield or 1, "r": req["r"]})
    recipes.sort(key=lambda r: r["id"])
    return recipes


def build_market(raw_items: dict, localized: list[dict]) -> dict:
    """items = [[id, nom FR, nom EN, enchantement max]] : « T4_MAIN_SWORD@1 » à « @4 »
    portent le nom de T4_MAIN_SWORD, ils sont donc repliés dessus (enchantement max = 4).
    Une variante sans objet de base (« T4_FIBER_LEVEL1@1 ») reste une ligne à part.
    Les ingrédients des recettes sans tier (« QUESTITEM_TOKEN_AVALON ») sont ajoutés
    pour pouvoir afficher leur nom."""
    recipes = extract_recipes(raw_items)
    wanted = {res[0] for r in recipes for res in r["r"]}
    names = {}
    for entry in localized:
        unique, loc = entry.get("UniqueName") or "", entry.get("LocalizedNames") or {}
        fr, en = loc.get("FR-FR") or loc.get("EN-US"), loc.get("EN-US") or ""
        if fr and (_TIERED.match(unique) or unique in wanted):
            names[unique] = (fr, en)

    max_ench: dict[str, int] = {}
    for unique in names:
        match = _ENCHANTED.match(unique)
        if match and match.group(1) in names:
            base = match.group(1)
            max_ench[base] = max(max_ench.get(base, 0), int(match.group(2)))
    items = [
        [unique, fr, en, max_ench.get(unique, 0)]
        for unique, (fr, en) in sorted(names.items())
        if not ((m := _ENCHANTED.match(unique)) and m.group(1) in names)
    ]
    return {"items": items, "recipes": recipes}


@lru_cache(maxsize=1)
def load_market() -> dict:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def market_json() -> bytes:
    """Corps de la réponse, sérialisé une seule fois (environ 400 Ko)."""
    return json.dumps(load_market(), ensure_ascii=False, separators=(",", ":")).encode()


@lru_cache(maxsize=1)
def market_gzip() -> bytes:
    """Même corps compressé une seule fois (environ 5 fois plus léger)."""
    return gzip.compress(market_json(), compresslevel=9, mtime=0)
