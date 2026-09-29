import pytest

from app.catalog import InvalidItems, build_catalog, category_label, load_catalog, validate_build_items

# Extrait minimal au format des dumps ao-bin-dumps
RAW = {
    "weapon": [
        {"@uniquename": "T4_MAIN_SWORD", "@slottype": "mainhand", "@shopcategory": "weapons",
         "@shopsubcategory1": "sword", "@twohanded": "false"},
        {"@uniquename": "T8_MAIN_SWORD", "@slottype": "mainhand", "@shopcategory": "weapons",
         "@shopsubcategory1": "sword", "@twohanded": "false"},
        {"@uniquename": "T8_2H_HOLYSTAFF", "@slottype": "mainhand", "@shopcategory": "weapons",
         "@shopsubcategory1": "holystaff", "@twohanded": "true"},
        {"@uniquename": "T4_2H_TOOL_PICK", "@slottype": "mainhand", "@shopcategory": "gathering"},
    ],
    "transformationweapon": [
        {"@uniquename": "T8_2H_SHAPESHIFTER_SET1", "@slottype": "mainhand", "@shopcategory": "weapons",
         "@shopsubcategory1": "shapeshifterstaff", "@twohanded": "true"},
    ],
    "equipmentitem": [
        {"@uniquename": "T8_OFF_SHIELD", "@slottype": "offhand", "@shopcategory": "offhands",
         "@shopsubcategory1": "shieldtype"},
        {"@uniquename": "T6_CAPE_PLATE_UNDEAD", "@slottype": "cape", "@shopcategory": "capes",
         "@shopsubcategory1": "other"},
        {"@uniquename": "T8_HEAD_PLATE_SET1", "@slottype": "head", "@shopcategory": "head",
         "@shopsubcategory1": "plate_helmet"},
        {"@uniquename": "UNIQUE_HIDEOUT", "@slottype": "head", "@shopcategory": "head"},
    ],
}


def loc(unique, fr, en):
    return {"UniqueName": unique, "LocalizedNames": {"FR-FR": fr, "EN-US": en}}


LOCALIZED = [
    loc("T4_MAIN_SWORD", "Épée large de l'adepte", "Adept's Broadsword"),
    loc("T8_MAIN_SWORD", "Épée large du sage", "Elder's Broadsword"),
    loc("T8_2H_HOLYSTAFF", "Grand bâton béni du sage", "Elder's Great Holy Staff"),
    loc("T8_2H_SHAPESHIFTER_SET1", "Bâton primitif du sage", "Elder's Prowling Staff"),
    loc("T8_OFF_SHIELD", "Bouclier du sage", "Elder's Shield"),
    loc("T6_CAPE_PLATE_UNDEAD", "Cape décorative", "Decorative Cape"),
    loc("T8_HEAD_PLATE_SET1", "Casque de soldat du sage", "Elder's Soldier Helmet"),
]


@pytest.fixture
def catalog():
    return {i["id"]: i for i in build_catalog(RAW, LOCALIZED)}


def test_one_entry_per_item_type_with_highest_tier_icon(catalog):
    sword = catalog["MAIN_SWORD"]
    assert sword["tiers"] == [4, 8]
    assert sword["icon"] == "T8_MAIN_SWORD"
    assert sword["slot"] == "mainhand"


def test_tier_is_removed_from_names(catalog):
    assert catalog["MAIN_SWORD"]["name"] == "Épée large"
    assert catalog["MAIN_SWORD"]["name_en"] == "Broadsword"


def test_single_tier_keeps_full_name(catalog):
    assert catalog["2H_HOLYSTAFF"]["name"] == "Grand bâton béni du sage"


def test_two_handed_flag_and_category_label(catalog):
    assert catalog["2H_HOLYSTAFF"]["two_handed"] is True
    assert catalog["MAIN_SWORD"]["two_handed"] is False
    assert catalog["MAIN_SWORD"]["category"] == "Épées"
    assert catalog["HEAD_PLATE_SET1"]["category"] == "Plaque"


def test_shapeshifter_staffs_are_included(catalog):
    assert catalog["2H_SHAPESHIFTER_SET1"]["category"] == "Bâtons de métamorphe"


def test_excludes_tools_decorative_capes_and_untiered(catalog):
    assert "2H_TOOL_PICK" not in catalog
    assert "CAPE_PLATE_UNDEAD" not in catalog
    assert all(not i.startswith("UNIQUE") for i in catalog)


def test_category_label_capes_and_unknown():
    assert category_label("accessoires_capes_martlock") == "Capes"
    assert category_label("inconnue") == "inconnue"


# ── validate_build_items ─────────────────────────────────────────────────────

def test_validate_keeps_known_items_in_slot_order(catalog):
    items = {"head": "HEAD_PLATE_SET1", "mainhand": "MAIN_SWORD", "offhand": "OFF_SHIELD"}
    assert list(validate_build_items(items, catalog)) == ["mainhand", "offhand", "head"]


def test_validate_drops_empty_slots(catalog):
    assert validate_build_items({"mainhand": "MAIN_SWORD", "head": ""}, catalog) == {"mainhand": "MAIN_SWORD"}


def test_validate_rejects_unknown_item(catalog):
    with pytest.raises(InvalidItems, match="Objet inconnu"):
        validate_build_items({"mainhand": "T8_FAKE"}, catalog)


def test_validate_rejects_unknown_slot(catalog):
    with pytest.raises(InvalidItems, match="Emplacement inconnu"):
        validate_build_items({"ring": "MAIN_SWORD"}, catalog)


def test_validate_rejects_item_in_wrong_slot(catalog):
    with pytest.raises(InvalidItems, match="ne se porte pas"):
        validate_build_items({"head": "MAIN_SWORD"}, catalog)


def test_validate_rejects_offhand_with_two_handed_weapon(catalog):
    with pytest.raises(InvalidItems, match="deux mains"):
        validate_build_items({"mainhand": "2H_HOLYSTAFF", "offhand": "OFF_SHIELD"}, catalog)


# ── Fichier versionné ────────────────────────────────────────────────────────

def test_shipped_catalog_is_complete():
    items = load_catalog()
    slots = {i["slot"] for i in items}
    assert slots == {"mainhand", "offhand", "head", "armor", "shoes", "cape"}
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids))
    assert {"MAIN_SWORD", "2H_HOLYSTAFF", "OFF_SHIELD"} <= set(ids)
