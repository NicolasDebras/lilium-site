"""Catalogue des objets d'équipement Albion (armes, off-hands, casques, armures,
bottes, capes, bouffe, potions), généré depuis les dumps officiels du jeu :

    https://github.com/ao-data/ao-bin-dumps  (items.json + formatted/items.json)

Une entrée par *type* d'objet, tous tiers confondus (« Épée large », pas
« Épée large du sage »). Dans un build, chaque choix peut imposer un tier minimum
et un enchantement au format du jeu : « T8_MAIN_SWORD@1 » (8.1), « T7_MAIN_SWORD »
(7.0) ; l'id nu « MAIN_SWORD » (ancien format) = tier libre.
Le fichier généré est versionné (app/data/items.json) ; pour le régénérer
après un patch du jeu :  python -m scripts.update_items
"""
import json
import os
import re
from functools import lru_cache
from pathlib import Path

from app.i18n import current_lang, tr

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


# Objets dont les noms par tier n'ont aucune partie commune : nom générique fixé à la main.
NAME_FIXES = {
    "2H_FIRESTAFF": ("Grand bâton de feu", "Great Fire Staff"),
    "2H_AXE": ("Grande hache", "Greataxe"),
    "OFF_BOOK": ("Tome de sorts", "Tome of Spells"),
}
# Encore dans les dumps mais retirés du jeu (pas d'icône sur le CDN).
REMOVED_ITEMS = {"2H_IRONGAUNTLETS_HELL"}  # anciennes « Mains noires »


# ── Sorts et passifs (craftingspelllist des dumps) ──────────────────────────
# Emplacements de sort d'un build, dans l'ordre d'affichage : Q/W/E de l'arme, actif d'armure,
# passif, 2ᵉ passif (plastrons en plaque).
SPELL_KEYS = ("q", "w", "e", "a", "p", "p2")
SPELL_ITEM_SLOTS = ("mainhand", "head", "armor", "shoes")
SPELLS_FILE = Path(__file__).parent / "data" / "spells.json"
SHOES_ANY = "@shoes"   # clé de `spells` : sort imposé, bottes au choix


def spell_icon_url(spell_id: str, size: int = 64) -> str:
    return f"https://render.albiononline.com/v1/spell/{spell_id}.png?size={size}"


def _as_list(value) -> list:
    return value if isinstance(value, list) else [value] if value else []


def spell_resolver(raw_items: dict):
    """Fonction nom d'objet → [(sort, @slots)] : craftingspelllist résolue (`@reference` en
    chaîne, `removespell`, puis les `craftspell` propres à l'objet)."""
    by_name = {i.get("@uniquename"): i for section in raw_items.values() if isinstance(section, list)
               for i in section if isinstance(i, dict)}
    cache: dict[str, list[tuple[str, str | None]]] = {}

    def resolve(name: str, depth: int = 0) -> list[tuple[str, str | None]]:
        if name in cache:
            return cache[name]
        spell_list = (by_name.get(name) or {}).get("craftingspelllist") or {}
        ref = spell_list.get("@reference")
        out = list(resolve(ref, depth + 1)) if ref and ref != name and depth < 10 else []
        removed = {s.get("@uniquename") for s in _as_list(spell_list.get("removespell"))}
        out = [s for s in out if s[0] not in removed]
        for s in _as_list(spell_list.get("craftspell")):
            if s.get("@uniquename") and s["@uniquename"] not in (o[0] for o in out):
                out.append((s["@uniquename"], s.get("@slots")))
        cache[name] = out
        return out

    return resolve


def spell_slots(slot: str, spells: list[tuple[str, str | None]], passives: set[str]) -> dict[str, list[str]]:
    """Sorts d'un objet rangés par emplacement. Arme : @slots 1/2/3 = Q/W/E, sans @slots =
    passif. Armure : actif, passif, et 2ᵉ passif quand le dump numérote les passifs (@slots 2)."""
    out: dict[str, list[str]] = {}
    for spell, slots in spells:
        if spell in passives:
            key = "p2" if slots == "2" else "p"
        elif slot == "mainhand":
            key = {"1": "q", "2": "w", "3": "e"}.get(slots or "")
        else:
            key = "a"
        if key:
            out.setdefault(key, []).append(spell)
    return {k: out[k] for k in SPELL_KEYS if k in out}


def build_spell_names(spell_ids: set[str], raw_spells: dict, localization: dict) -> dict[str, dict]:
    """{id: {name, name_en}} des sorts utilisés ; raw_spells = spells.json["spells"],
    localization = localization.json (tmx). Nom via @namelocatag, sinon « @SPELLS_<id> »."""
    tags = {}
    for kind in ("activespell", "passivespell", "togglespell"):
        for s in _as_list(raw_spells.get(kind)):
            if s.get("@uniquename") in spell_ids:
                tags[s["@uniquename"]] = s.get("@namelocatag") or f"@SPELLS_{s['@uniquename']}"
    wanted = set(tags.values())
    texts: dict[str, dict[str, str]] = {}
    for tu in _as_list(localization.get("tmx", {}).get("body", {}).get("tu")):
        if tu.get("@tuid") in wanted:
            texts[tu["@tuid"]] = {t.get("@xml:lang"): t.get("seg") for t in _as_list(tu.get("tuv"))}
    out = {}
    for spell_id in sorted(spell_ids):
        names = texts.get(tags.get(spell_id, ""), {})
        fr = names.get("FR-FR") or names.get("EN-US") or spell_id
        out[spell_id] = {"name": fr, "name_en": names.get("EN-US") or fr}
    return out


def build_catalog(raw_items: dict, localized: list[dict], passives: set[str] | None = None) -> list[dict]:
    """raw_items = contenu de items.json["items"] ; localized = formatted/items.json ;
    passives = ids des passivespell de spells.json (None : catalogue sans sorts)."""
    resolve = spell_resolver(raw_items) if passives is not None else None
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
        if base_id in REMOVED_ITEMS:
            continue
        variants.sort(key=lambda v: v[0])
        _top_tier, top_name, top_item = variants[-1]
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
        # Noms par tier sans partie commune (« Grande hache »/« Hache de guerre »…) → nom fixé à la main
        name, name_en = NAME_FIXES.get(base_id, (name, name_en)) if not name else (name, name_en)
        entry = {
            "id":         base_id,
            "slot":       slot,
            "name":       name,
            "name_en":    name_en,
            "icon":       top_name,
            "tiers":      [t for t, _, _ in variants],
            "two_handed": top_item.get("@twohanded") == "true",
            "category":   category_label(category),
        }
        if resolve and slot in SPELL_ITEM_SLOTS and (spells := spell_slots(slot, resolve(top_name), passives)):
            entry["spells"] = spells
        catalog.append(entry)

    catalog.sort(key=lambda i: (SLOTS.index(i["slot"]), i["category"], i["name"]))
    return catalog


@lru_cache(maxsize=1)
def load_catalog() -> tuple[dict, ...]:
    return tuple(json.loads(DATA_FILE.read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def items_by_id() -> dict[str, dict]:
    return {i["id"]: i for i in load_catalog()}


@lru_cache(maxsize=1)
def load_spell_names() -> dict[str, dict]:
    return json.loads(SPELLS_FILE.read_text(encoding="utf-8")) if SPELLS_FILE.exists() else {}


def shoe_spells(catalog: dict[str, dict] | None = None) -> dict[str, list[dict]]:
    """Sorts de toutes les bottes (actif et passif), pour « sort imposé, bottes au choix » :
    {"a": [{"id", "category"}], "p": [...]}, dans l'ordre du catalogue (Plaque, Cuir, Tissu…)."""
    catalog = items_by_id() if catalog is None else catalog
    out: dict[str, list[dict]] = {"a": [], "p": []}
    for item in catalog.values():
        if item["slot"] != "shoes":
            continue
        for key in out:
            for spell in item.get("spells", {}).get(key, []):
                if all(s["id"] != spell for s in out[key]):
                    out[key].append({"id": spell, "category": item["category"]})
    return out


class InvalidItems(ValueError):
    pass


def item_name(item: dict) -> str:
    """Nom d'un objet dans la langue de la requête (le catalogue a les noms FR et EN)."""
    return (item.get("name_en") or item["name"]) if current_lang() == "en" else item["name"]


# Tier + enchantement d'un choix : « T8_MAIN_SWORD@1 ». Aucun id de base ne commence par « T<n>_ ».
_CHOICE = re.compile(r"^T([1-8])_([A-Z0-9_]+?)(?:@([1-4]))?$")
BUILD_TIERS = (4, 5, 6, 7, 8)
POTION_TIERS = (3, *BUILD_TIERS)   # potions T3 : résistance, gigantisme, purification…


def parse_choice(value: str) -> tuple[str, int | None, int]:
    """« T8_MAIN_SWORD@1 » → ("MAIN_SWORD", 8, 1) ; « MAIN_SWORD » → ("MAIN_SWORD", None, 0)."""
    match = _CHOICE.match(value)
    if not match:
        return value, None, 0
    return match.group(2), int(match.group(1)), int(match.group(3) or 0)


def allowed_tiers(item: dict) -> list[int]:
    tiers = POTION_TIERS if item.get("slot") == "potion" else BUILD_TIERS
    return [t for t in tiers if t in item.get("tiers", [])]


def max_enchant(item: dict) -> int:
    """Équipement : .0 à .4 ; bouffe et potions : .0 à .3."""
    return 3 if item["slot"] in ("food", "potion") else 4


def _check_choice(choice: str, catalog: dict[str, dict]) -> dict:
    """Objet du catalogue désigné par le choix ; refuse un tier ou un enchantement impossible."""
    base, tier, enchant = parse_choice(choice)
    item = catalog.get(base)
    if item is None:
        raise InvalidItems(tr("unknown_item", choice=choice))
    if tier is not None and tier not in allowed_tiers(item):
        raise InvalidItems(tr("bad_tier", name=item_name(item), tier=tier))
    if enchant > max_enchant(item):
        raise InvalidItems(tr("max_enchant", name=item_name(item), max=max_enchant(item)))
    return item


def _no_duplicate(choices: list[str]) -> None:
    bases = [parse_choice(c)[0] for c in choices]
    if len(set(bases)) != len(bases):
        raise InvalidItems(tr("duplicate_item"))


def _choices(value) -> list[str]:
    """Une case = une chaîne (ancien format) ou une liste de choix → liste propre, sans doublon."""
    raw = [value] if isinstance(value, str) else list(value or [])
    out: list[str] = []
    for v in raw:
        v = str(v).strip()
        if v and v not in out:
            out.append(v)
    return out


def normalize_spells(spells) -> dict[str, dict[str, str]]:
    """Lecture tolérante des sorts d'un build (colonne JSONB, éventuellement en texte brut)."""
    if isinstance(spells, str):
        spells = json.loads(spells or "{}")
    return {key: {k: v for k, v in chosen.items() if v} for key, chosen in (spells or {}).items()
            if isinstance(chosen, dict) and any(chosen.values())}


def normalize_items(items: dict | None) -> dict[str, list[str]]:
    """Lecture tolérante (lignes écrites avant les choix multiples : {slot: "ID"})."""
    return {slot: c for slot, value in (items or {}).items() if (c := _choices(value))}


def validate_build_items(items: dict, catalog: dict[str, dict] | None = None) -> dict[str, list[str]]:
    """Nettoie l'équipement d'un build et refuse l'incohérent.

    Chaque case vaut 1 à 3 objets au choix (["T8_2H_HOLYSTAFF@1", "2H_HOLYSTAFF_HELL"]),
    ou ["*"] = au choix du joueur. L'ancien format {slot: "ID"} est accepté.
    Refusé : emplacement ou objet inconnu, objet au mauvais endroit, plus de 3
    choix, "*" mélangé à des objets, même objet deux fois, tier hors T4–T8 (ou
    inexistant pour l'objet), enchantement trop haut, main gauche alors que
    toutes les armes proposées sont à deux mains.
    """
    catalog = items_by_id() if catalog is None else catalog
    cleaned: dict[str, list[str]] = {}
    for slot, value in items.items():
        choices = _choices(value)
        if not choices:
            continue
        if slot == SWAPS_KEY:
            cleaned[slot] = _validate_swaps(choices, catalog)
            continue
        if slot not in SLOTS:
            raise InvalidItems(tr("unknown_slot", slot=slot))
        if FREE_CHOICE in choices:
            if len(choices) > 1:
                raise InvalidItems(tr("free_with_items"))
            cleaned[slot] = [FREE_CHOICE]
            continue
        if len(choices) > MAX_CHOICES:
            raise InvalidItems(tr("max_choices", max=MAX_CHOICES))
        _no_duplicate(choices)
        for choice in choices:
            item = _check_choice(choice, catalog)
            if item["slot"] != slot:
                raise InvalidItems(tr("wrong_slot", name=item_name(item)))
        cleaned[slot] = choices

    if "offhand" in cleaned and all_two_handed(cleaned.get("mainhand", []), catalog):
        raise InvalidItems(tr("two_handed"))
    out = {slot: cleaned[slot] for slot in SLOTS if slot in cleaned}
    if cleaned.get(SWAPS_KEY):
        out[SWAPS_KEY] = cleaned[SWAPS_KEY]
    return out


SWAPS_KEY = "swaps"   # objets de rechange, n'importe quel emplacement (affichés à droite du build)
SWAPS_MAX = 6


def _validate_swaps(choices: list[str], catalog: dict[str, dict]) -> list[str]:
    if FREE_CHOICE in choices:
        raise InvalidItems(tr("free_swap"))
    if len(choices) > SWAPS_MAX:
        raise InvalidItems(tr("max_swaps", max=SWAPS_MAX))
    _no_duplicate(choices)
    for choice in choices:
        _check_choice(choice, catalog)
    return choices


def validate_build_spells(spells: dict | None, items: dict[str, list[str]],
                          catalog: dict[str, dict] | None = None) -> dict[str, dict[str, str]]:
    """Nettoie les sorts d'un build (équipement déjà validé) : {id de base: {emplacement: sort}},
    plus SHOES_ANY = sort de bottes imposé quand la case Bottes est vide ou « au choix ».
    Refusé : objet absent du build, emplacement ou sort que l'objet n'a pas."""
    catalog = items_by_id() if catalog is None else catalog
    in_build = {parse_choice(c)[0] for slot in SPELL_ITEM_SLOTS for c in items.get(slot, []) if c != FREE_CHOICE}
    cleaned: dict[str, dict[str, str]] = {}
    for key, chosen in (spells or {}).items():
        chosen = {k: str(v).strip() for k, v in (chosen or {}).items() if v and str(v).strip()}
        if not chosen:
            continue
        if key == SHOES_ANY:
            if any(c != FREE_CHOICE for c in items.get("shoes", [])):
                raise InvalidItems(tr("shoes_spell_with_item"))
            allowed = {k: [s["id"] for s in v] for k, v in shoe_spells(catalog).items()}
            name = tr("shoes_any")
        else:
            item = catalog.get(key)
            if item is None or key not in in_build:
                raise InvalidItems(tr("spell_item_missing", item=key))
            allowed, name = item.get("spells", {}), item_name(item)
        for slot_key, spell in chosen.items():
            if spell not in allowed.get(slot_key, []):
                raise InvalidItems(tr("bad_spell", name=name, spell=spell))
        cleaned[key] = {k: chosen[k] for k in SPELL_KEYS if k in chosen}
    return cleaned


def all_two_handed(mainhand: list[str], catalog: dict[str, dict]) -> bool:
    """Vrai si la case arme propose au moins une arme et qu'elles sont TOUTES à deux mains."""
    weapons = [catalog.get(parse_choice(i)[0]) for i in mainhand if i != FREE_CHOICE]
    return bool(weapons) and len(weapons) == len(mainhand) and all(w and w["two_handed"] for w in weapons)
