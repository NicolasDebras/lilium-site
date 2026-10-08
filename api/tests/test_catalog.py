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
    "consumableitem": [
        {"@uniquename": "T6_MEAL_STEW", "@slottype": "food", "@shopcategory": "consumables",
         "@shopsubcategory1": "food"},
        {"@uniquename": "T8_MEAL_STEW", "@slottype": "food", "@shopcategory": "consumables",
         "@shopsubcategory1": "food"},
        {"@uniquename": "T8_MEAL_STEW@1", "@slottype": "food", "@shopcategory": "consumables",
         "@shopsubcategory1": "food"},
        {"@uniquename": "T4_POTION_HEAL", "@slottype": "potion", "@shopcategory": "consumables",
         "@shopsubcategory1": "potions"},
        {"@uniquename": "T6_POTION_HEAL", "@slottype": "potion", "@shopcategory": "consumables",
         "@shopsubcategory1": "potions"},
        {"@uniquename": "T4_FISH_COMMON", "@slottype": "food", "@shopcategory": "crafting",
         "@shopsubcategory1": "fish"},
        {"@uniquename": "T4_SHOP_POTION", "@slottype": "potion", "@shopcategory": "consumables",
         "@shopsubcategory1": "other"},
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
    loc("T6_MEAL_STEW", "Ragoût de chèvre", "Goat Stew"),
    loc("T8_MEAL_STEW", "Ragoût de bœuf", "Beef Stew"),
    loc("T4_POTION_HEAL", "Potion de soin mineure", "Minor Healing Potion"),
    loc("T6_POTION_HEAL", "Potion de soin", "Healing Potion"),
    loc("T4_FISH_COMMON", "Poisson", "Fish"),
    loc("T4_SHOP_POTION", "Potion boutique", "Shop Potion"),
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


# ── Bouffe & potions ─────────────────────────────────────────────────────────

def test_food_and_potions_are_included_with_top_tier_name(catalog):
    assert catalog["MEAL_STEW"]["slot"] == "food"
    assert catalog["MEAL_STEW"]["name"] == "Ragoût de bœuf"
    assert catalog["MEAL_STEW"]["category"] == "Nourriture"
    assert catalog["POTION_HEAL"]["slot"] == "potion"
    assert catalog["POTION_HEAL"]["name"] == "Potion de soin"
    assert catalog["POTION_HEAL"]["name_en"] == "Healing Potion"


def test_consumables_exclude_enchanted_raw_fish_and_shop_items(catalog):
    assert "MEAL_STEW@1" not in catalog
    assert "FISH_COMMON" not in catalog
    assert "SHOP_POTION" not in catalog
    assert catalog["MEAL_STEW"]["tiers"] == [6, 8]


# ── validate_build_items ─────────────────────────────────────────────────────

def test_validate_accepts_old_string_format(catalog):
    assert validate_build_items({"mainhand": "MAIN_SWORD"}, catalog) == {"mainhand": ["MAIN_SWORD"]}


def test_validate_keeps_known_items_in_slot_order(catalog):
    items = {"head": ["HEAD_PLATE_SET1"], "mainhand": ["MAIN_SWORD"], "offhand": ["OFF_SHIELD"]}
    assert list(validate_build_items(items, catalog)) == ["mainhand", "offhand", "head"]


def test_validate_drops_empty_slots_and_duplicates(catalog):
    items = {"mainhand": ["MAIN_SWORD", "MAIN_SWORD"], "head": [], "cape": ""}
    assert validate_build_items(items, catalog) == {"mainhand": ["MAIN_SWORD"]}


def test_validate_up_to_three_choices(catalog):
    items = {"mainhand": ["MAIN_SWORD", "2H_HOLYSTAFF", "2H_SHAPESHIFTER_SET1"]}
    assert validate_build_items(items, catalog)["mainhand"] == ["MAIN_SWORD", "2H_HOLYSTAFF", "2H_SHAPESHIFTER_SET1"]


def test_validate_rejects_more_than_three_choices(catalog):
    extra = {**catalog, "X": {**catalog["MAIN_SWORD"], "id": "X"}}
    with pytest.raises(InvalidItems, match="3 choix maximum"):
        validate_build_items({"mainhand": ["MAIN_SWORD", "2H_HOLYSTAFF", "2H_SHAPESHIFTER_SET1", "X"]}, extra)


def test_validate_free_choice(catalog):
    assert validate_build_items({"cape": ["*"], "food": "*"}, catalog) == {"cape": ["*"], "food": ["*"]}


def test_validate_free_choice_cannot_be_mixed(catalog):
    with pytest.raises(InvalidItems, match="Au choix du joueur"):
        validate_build_items({"mainhand": ["*", "MAIN_SWORD"]}, catalog)


def test_validate_rejects_unknown_item(catalog):
    with pytest.raises(InvalidItems, match="Objet inconnu"):
        validate_build_items({"mainhand": ["T8_FAKE"]}, catalog)


def test_validate_rejects_unknown_slot(catalog):
    with pytest.raises(InvalidItems, match="Emplacement inconnu"):
        validate_build_items({"ring": ["MAIN_SWORD"]}, catalog)


def test_validate_rejects_item_in_wrong_slot(catalog):
    with pytest.raises(InvalidItems, match="ne se porte pas"):
        validate_build_items({"head": ["MAIN_SWORD"]}, catalog)


def test_validate_rejects_offhand_when_all_weapons_two_handed(catalog):
    with pytest.raises(InvalidItems, match="deux mains"):
        validate_build_items({"mainhand": ["2H_HOLYSTAFF", "2H_SHAPESHIFTER_SET1"], "offhand": ["OFF_SHIELD"]}, catalog)


def test_validate_offhand_ok_when_one_weapon_is_one_handed(catalog):
    items = {"mainhand": ["2H_HOLYSTAFF", "MAIN_SWORD"], "offhand": ["OFF_SHIELD"]}
    assert validate_build_items(items, catalog)["offhand"] == ["OFF_SHIELD"]


def test_validate_offhand_ok_when_weapon_is_free_or_empty(catalog):
    assert validate_build_items({"mainhand": ["*"], "offhand": ["OFF_SHIELD"]}, catalog)["offhand"] == ["OFF_SHIELD"]
    assert validate_build_items({"offhand": ["OFF_SHIELD"]}, catalog) == {"offhand": ["OFF_SHIELD"]}


# ── Fichier versionné ────────────────────────────────────────────────────────

def test_shipped_catalog_is_complete():
    items = load_catalog()
    slots = {i["slot"] for i in items}
    assert slots == {"mainhand", "offhand", "head", "armor", "shoes", "cape", "food", "potion"}
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids))
    assert {"MAIN_SWORD", "2H_HOLYSTAFF", "OFF_SHIELD"} <= set(ids)


def test_shipped_catalog_has_a_name_for_every_item_and_no_removed_item():
    from app.catalog import REMOVED_ITEMS, load_catalog
    items = load_catalog()
    assert [i["id"] for i in items if not i["name"].strip()] == []
    assert not {i["id"] for i in items} & REMOVED_ITEMS
