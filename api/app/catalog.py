"""Catalogue des objets d'équipement Albion (armes, off-hands, casques, armures,
bottes, capes), généré depuis les dumps officiels du jeu :

    https://github.com/ao-data/ao-bin-dumps  (items.json + formatted/items.json)

Une entrée par *type* d'objet, tous tiers confondus (« Épée large », pas
« Épée large du sage ») : un build décrit quoi porter, le tier dépend du joueur.
Le fichier généré est versionné (app/data/items.json) ; pour le régénérer
après un patch du jeu :  python -m scripts.update_items
"""
import json
import os
import re
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "items.json"

SLOTS = ("mainhand", "offhand", "head", "armor", "shoes", "cape")

# (section du dump, @slottype, @shopcategory) → emplacement du build
_SLOT_RULES = {
    ("weapon", "mainhand", "weapons"): "mainhand",
    ("transformationweapon", "mainhand", "weapons"): "mainhand",  # bâtons de métamorphe
    ("equipmentitem", "offhand", "offhands"): "offhand",
    ("equipmentitem", "head", "head"): "head",
    ("equipmentitem", "armor", "armors"): "armor",
    ("equipmentitem", "shoes", "shoes"): "shoes",
    ("equipmentitem", "cape", "capes"): "cape",
}
_TIERED = re.compile(r"^T(\d)_(.+)$")

# Libellés FR des familles (@shopsubcategory1) — pour les filtres du site.
CATEGORY_LABELS = {
    "sword": "Épées", "axe": "Haches", "mace": "Masses", "hammer": "Marteaux", "spear": "Lances",
    "dagger": "Dagues", "quarterstaff": "Bâtons de combat", "knuckles": "Gantelets de combat",
    "bow": "Arcs", "crossbow": "Arbalètes", "firestaff": "Bâtons de feu", "froststaff": "Bâtons de givre",
    "arcanestaff": "Bâtons arcaniques", "holystaff": "Bâtons sacrés", "naturestaff": "Bâtons de nature",
    "cursestaff": "Bâtons maudits", "shapeshifterstaff": "Bâtons de métamorphe",
    "shieldtype": "Boucliers", "booktype": "Tomes", "torchtype": "Torches",
    "plate_helmet": "Plaque", "leather_helmet": "Cuir", "cloth_helmet": "Tissu",
    "plate_armor": "Plaque", "leather_armor": "Cuir", "cloth_armor": "Tissu",
    "plate_shoes": "Plaque", "leather_shoes": "Cuir", "cloth_shoes": "Tissu",
}


def category_label(category: str) -> str:
    if category.startswith("accessoires_capes"):
        return "Capes"
    return CATEGORY_LABELS.get(category, category)


def icon_url(unique_name: str, size: int = 64) -> str:
    return f"https://render.albiononline.com/v1/item/{unique_name}.png?size={size}"


def _shared_start(names: list[str]) -> str:
    """Partie commune des noms FR d'un même objet sur plusieurs tiers :
    « Épée large de l'adepte » / « Épée large du sage » → « Épée large »."""
    prefix = os.path.commonprefix(names)
    if len(set(names)) > 1:
        prefix = prefix[: prefix.rfind(" ")] if " " in prefix else prefix
    return prefix.strip()


def _shared_end(names: list[str]) -> str:
    """Pareil en anglais, où le tier est devant : « Elder's Broadsword » → « Broadsword »."""
    if len(set(names)) == 1:
        return names[0]
    suffix = os.path.commonprefix([n[::-1] for n in names])[::-1]
    return re.sub(r"^'s\s+", "", suffix.strip())


def build_catalog(raw_items: dict, localized: list[dict]) -> list[dict]:
    """raw_items = contenu de items.json["items"] ; localized = formatted/items.json."""
    names = {i["UniqueName"]: i.get("LocalizedNames") or {} for i in localized if i.get("UniqueName")}

    groups: dict[tuple[str, str], list[tuple[int, str, dict]]] = {}
    for section in ("weapon", "transformationweapon", "equipmentitem"):
        for item in raw_items.get(section, []):
            slot = _SLOT_RULES.get((section, item.get("@slottype"), item.get("@shopcategory")))
            match = _TIERED.match(item.get("@uniquename", ""))
            if not slot or not match:
                continue
            groups.setdefault((slot, match.group(2)), []).append((int(match.group(1)), match.group(0), item))

    catalog = []
    for (slot, base_id), variants in groups.items():
        variants.sort(key=lambda v: v[0])
        top_tier, top_name, top_item = variants[-1]
        category = top_item.get("@shopsubcategory1") or ""
        if category == "other":  # capes décoratives (sans stats)
            continue
        fr = [n for n in (names.get(u, {}).get("FR-FR") for _, u, _ in variants) if n]
        en = [n for n in (names.get(u, {}).get("EN-US") for _, u, _ in variants) if n]
        if not fr:
            continue
        catalog.append({
            "id":         base_id,
            "slot":       slot,
            "name":       _shared_start(fr),
            "name_en":    _shared_end(en) if en else "",
            "icon":       top_name,
            "tiers":      [t for t, _, _ in variants],
            "two_handed": top_item.get("@twohanded") == "true",
            "category":   category_label(category),
        })

    catalog.sort(key=lambda i: (SLOTS.index(i["slot"]), i["category"], i["name"]))
    return catalog


@lru_cache(maxsize=1)
def load_catalog() -> tuple[dict, ...]:
    return tuple(json.loads(DATA_FILE.read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def items_by_id() -> dict[str, dict]:
    return {i["id"]: i for i in load_catalog()}


class InvalidItems(ValueError):
    pass


def validate_build_items(items: dict[str, str], catalog: dict[str, dict] | None = None) -> dict[str, str]:
    """Nettoie l'équipement d'un build ({slot: id}) et refuse l'incohérent :
    emplacement inconnu, objet inconnu ou mis au mauvais endroit, off-hand
    avec une arme à deux mains."""
    catalog = items_by_id() if catalog is None else catalog
    cleaned: dict[str, str] = {}
    for slot, item_id in items.items():
        if not item_id:
            continue
        if slot not in SLOTS:
            raise InvalidItems(f"Emplacement inconnu : {slot}")
        item = catalog.get(item_id)
        if item is None:
            raise InvalidItems(f"Objet inconnu : {item_id}")
        if item["slot"] != slot:
            raise InvalidItems(f"« {item['name']} » ne se porte pas à cet emplacement.")
        cleaned[slot] = item_id

    main = catalog.get(cleaned.get("mainhand", ""))
    if main and main["two_handed"] and "offhand" in cleaned:
        raise InvalidItems(f"« {main['name']} » est une arme à deux mains : pas d'off-hand possible.")
    return {slot: cleaned[slot] for slot in SLOTS if slot in cleaned}
