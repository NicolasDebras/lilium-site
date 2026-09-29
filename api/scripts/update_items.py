"""Régénère app/data/items.json depuis les dumps officiels d'Albion (ao-bin-dumps).

À relancer après un patch du jeu qui ajoute des armes/armures :
    cd api
    .venv\\Scripts\\python -m scripts.update_items
"""
import asyncio
import json

import aiohttp

from app.catalog import DATA_FILE, build_catalog

BASE = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master"


async def _fetch_json(session: aiohttp.ClientSession, url: str):
    async with session.get(url) as resp:
        resp.raise_for_status()
        return json.loads(await resp.text(encoding="utf-8"))


async def main() -> None:
    async with aiohttp.ClientSession() as session:
        raw, localized = await asyncio.gather(
            _fetch_json(session, f"{BASE}/items.json"),
            _fetch_json(session, f"{BASE}/formatted/items.json"),
        )
    catalog = build_catalog(raw["items"], localized)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    counts: dict[str, int] = {}
    for item in catalog:
        counts[item["slot"]] = counts.get(item["slot"], 0) + 1
    print(f"{len(catalog)} objets écrits dans {DATA_FILE} : {counts}")


if __name__ == "__main__":
    asyncio.run(main())
