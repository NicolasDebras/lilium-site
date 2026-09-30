"""Catalogue des objets d'équipement Albion (armes, off-hands, casques, armures,
bottes, capes, bouffe, potions), généré depuis les dumps officiels du jeu :

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

SLOTS = ("mainhand", "offhand", "head", "armor", "shoes", "cape", "food", "potion")

# Valeur spéciale d'une case : « au choix du joueur » (rien d'imposé).
FREE_CHOICE = "*"
MAX_CHOICES = 3

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
# Consommables : on regarde aussi la sous-catégorie (les « other » sont exclus).
_CONSUMABLE_RULES = {
    ("food", "food"): "food",
    ("potion", "potions"): "potion",
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
    "food": "Nourriture", "potions": "Potions",
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


_CONSUMABLE_TIER_WORDS = re.compile(r"\s+(mineure|majeure)$|^(minor|major)\s+", re.IGNORECASE)


def _consumable_name(name: str) -> str:
    """Bouffe/potions : l'aliment change selon le tier (« Ragoût de chèvre » T6,
    « Ragoût de bœuf » T8), donc pas de partie commune exploitable — on garde le
    nom du tier le plus haut, sans « mineure / majeure »."""
    return _CONSUMABLE_TIER_WORDS.sub("", name).strip()


def build_catalog(raw_items: dict, localized: list[dict]) -> list[dict]:
    """raw_items = contenu de items.json["items"] ; localized = formatted/items.json."""
    names = {i["UniqueName"]: i.get("LocalizedNames") or {} for i in localized if i.get("UniqueName")}

    def slot_of(section: str, item: dict) -> str | None:
        if section == "consumableitem":
            if item.get("@shopcategory") != "consumables":
                return None
            return _CONSUMABLE_RULES.get((item.get("@slottype"), item.get("@shopsubcategory1")))
        return _SLOT_RULES.get((section, item.get("@slottype"), item.get("@shopcategory")))

    groups: dict[tuple[str, str], list[tuple[int, str, dict]]] = {}
    for section in ("weapon", "transformationweapon", "equipmentitem", "consumableitem"):
        for item in raw_items.get(section, []):
            unique = item.get("@uniquename", "")
            slot = slot_of(section, item)
            match = _TIERED.match(unique)
            if "@" in unique:  # variantes enchantées : même objet
                continue
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
        if slot in ("food", "potion"):
            name, name_en = _consumable_name(fr[-1]), _consumable_name(en[-1]) if en else ""
        else:
            name, name_en = _shared_start(fr), _shared_end(en) if en else ""
        catalog.append({
            "id":         base_id,
            "slot":       slot,
            "name":       name,
            "name_en":    name_en,
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


def _choices(value) -> list[str]:
    """Une case = une chaîne (ancien format) ou une liste de choix → liste propre, sans doublon."""
    raw = [value] if isinstance(value, str) else list(value or [])
    out: list[str] = []
    for v in raw:
        v = str(v).strip()
        if v and v not in out:
            out.append(v)
    return out


def normalize_items(items: dict | None) -> dict[str, list[str]]:
    """Lecture tolérante (lignes écrites avant les choix multiples : {slot: "ID"})."""
    return {slot: c for slot, value in (items or {}).items() if (c := _choices(value))}


def validate_build_items(items: dict, catalog: dict[str, dict] | None = None) -> dict[str, list[str]]:
    """Nettoie l'équipement d'un build et refuse l'incohérent.

    Chaque case vaut 1 à 3 objets au choix (["2H_HOLYSTAFF", "2H_HOLYSTAFF_HELL"]),
    ou ["*"] = au choix du joueur. L'ancien format {slot: "ID"} est accepté.
    Refusé : emplacement ou objet inconnu, objet au mauvais endroit, plus de 3
    choix, "*" mélangé à des objets, main gauche alors que toutes les armes
    proposées sont à deux mains.
    """
    catalog = items_by_id() if catalog is None else catalog
    cleaned: dict[str, list[str]] = {}
    for slot, value in items.items():
        choices = _choices(value)
        if not choices:
            continue
        if slot not in SLOTS:
            raise InvalidItems(f"Emplacement inconnu : {slot}")
        if FREE_CHOICE in choices:
            if len(choices) > 1:
                raise InvalidItems("« Au choix du joueur » ne se combine pas avec des objets.")
            cleaned[slot] = [FREE_CHOICE]
            continue
        if len(choices) > MAX_CHOICES:
            raise InvalidItems(f"{MAX_CHOICES} choix maximum par case.")
        for item_id in choices:
            item = catalog.get(item_id)
            if item is None:
                raise InvalidItems(f"Objet inconnu : {item_id}")
            if item["slot"] != slot:
                raise InvalidItems(f"« {item['name']} » ne se porte pas à cet emplacement.")
        cleaned[slot] = choices

    if "offhand" in cleaned and all_two_handed(cleaned.get("mainhand", []), catalog):
        raise InvalidItems("Toutes les armes proposées sont à deux mains : pas de main gauche possible.")
    return {slot: cleaned[slot] for slot in SLOTS if slot in cleaned}


def all_two_handed(mainhand: list[str], catalog: dict[str, dict]) -> bool:
    """Vrai si la case arme propose au moins une arme et qu'elles sont TOUTES à deux mains."""
    weapons = [catalog.get(i) for i in mainhand if i != FREE_CHOICE]
    return bool(weapons) and len(weapons) == len(mainhand) and all(w and w["two_handed"] for w in weapons)
