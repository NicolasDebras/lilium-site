"""Régénère app/data/items.json (builds, avec les sorts de chaque objet), app/data/spells.json
(noms des sorts) et app/data/market.json (onglet Marché) depuis les dumps officiels d'Albion
(ao-bin-dumps).

À relancer après un patch du jeu qui ajoute des objets, des sorts ou change des recettes :
    cd api
    .venv\\Scripts\\python -m scripts.update_items
"""
import asyncio
import json

import aiohttp

from app import market
from app.catalog import DATA_FILE, SPELLS_FILE, build_catalog, build_spell_names

BASE = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master"


async def _fetch_json(session: aiohttp.ClientSession, url: str):
    async with session.get(url) as resp:
        resp.raise_for_status()
        return json.loads(await resp.text(encoding="utf-8"))


async def main() -> None:
    async with aiohttp.ClientSession() as session:
        raw, localized, raw_spells, localization = await asyncio.gather(
            _fetch_json(session, f"{BASE}/items.json"),
            _fetch_json(session, f"{BASE}/formatted/items.json"),
            _fetch_json(session, f"{BASE}/spells.json"),
            _fetch_json(session, f"{BASE}/localization.json"),
        )
    spells = raw_spells["spells"]
    passives = {s["@uniquename"] for s in spells.get("passivespell", []) if s.get("@uniquename")}
    catalog = build_catalog(raw["items"], localized, passives)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    counts: dict[str, int] = {}
    for item in catalog:
        counts[item["slot"]] = counts.get(item["slot"], 0) + 1
    print(f"{len(catalog)} objets écrits dans {DATA_FILE} : {counts}")

    used = {s for item in catalog for ids in item.get("spells", {}).values() for s in ids}
    names = build_spell_names(used, spells, localization)
    SPELLS_FILE.write_text(json.dumps(names, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(names)} sorts écrits dans {SPELLS_FILE}")

    data = market.build_market(raw["items"], localized)
    market.DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(data['items'])} objets et {len(data['recipes'])} recettes écrits dans {market.DATA_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
