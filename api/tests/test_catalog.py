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


# ── Tier et enchantement par objet ───────────────────────────────────────────

def test_parse_choice():
    from app.catalog import parse_choice
    assert parse_choice("T8_MAIN_SWORD@1") == ("MAIN_SWORD", 8, 1)
    assert parse_choice("T7_2H_HOLYSTAFF_HELL") == ("2H_HOLYSTAFF_HELL", 7, 0)
    assert parse_choice("MAIN_SWORD") == ("MAIN_SWORD", None, 0)       # ancien format : tier libre


def test_validate_accepts_tier_and_enchant(catalog):
    items = {"mainhand": ["T8_MAIN_SWORD@3", "2H_HOLYSTAFF"], "food": ["T6_MEAL_STEW@2"], "swaps": ["T8_OFF_SHIELD@4"]}
    assert validate_build_items(items, catalog) == items
    assert validate_build_items({"mainhand": ["T4_MAIN_SWORD@2"]}, catalog)   # T4 et T5 acceptés aussi


def test_validate_rejects_tier_outside_t6_t8_or_missing_for_item(catalog):
    with pytest.raises(InvalidItems, match="T3"):
        validate_build_items({"mainhand": ["T3_MAIN_SWORD"]}, catalog)        # hors T4–T8
    with pytest.raises(InvalidItems, match="T5"):
        validate_build_items({"mainhand": ["T5_MAIN_SWORD"]}, catalog)        # l'épée du test n'existe qu'en T4/T8
    with pytest.raises(InvalidItems, match="T7"):
        validate_build_items({"food": ["T7_MEAL_STEW"]}, catalog)             # le ragoût n'existe qu'en T6/T8
    with pytest.raises(InvalidItems, match="T6"):
        validate_build_items({"swaps": ["T6_MAIN_SWORD"]}, catalog)


def test_validate_rejects_enchant_above_max(catalog):
    with pytest.raises(InvalidItems, match=r"\.3 maximum"):
        validate_build_items({"food": ["T8_MEAL_STEW@4"]}, catalog)           # bouffe : .3 max
    assert validate_build_items({"mainhand": ["T8_MAIN_SWORD@4"]}, catalog)  # équipement : .4


def test_validate_accepts_t3_potion_only():
    catalog = {
        "POTION_STONESKIN": {"id": "POTION_STONESKIN", "name": "Potion de résistance", "slot": "potion",
                             "tiers": [3, 5, 7], "two_handed": False},
        "MEAL_OMELETTE": {"id": "MEAL_OMELETTE", "name": "Omelette", "slot": "food", "tiers": [3, 5, 7], "two_handed": False},
    }
    assert validate_build_items({"potion": ["T3_POTION_STONESKIN@1"]}, catalog)
    with pytest.raises(InvalidItems, match="T3"):
        validate_build_items({"food": ["T3_MEAL_OMELETTE"]}, catalog)


def test_validate_tiered_item_in_wrong_slot_or_duplicated(catalog):
    with pytest.raises(InvalidItems, match="ne se porte pas"):
        validate_build_items({"head": ["T8_MAIN_SWORD@1"]}, catalog)
    with pytest.raises(InvalidItems, match="une fois"):
        validate_build_items({"mainhand": ["T8_MAIN_SWORD@1", "MAIN_SWORD"]}, catalog)
    with pytest.raises(InvalidItems, match="une fois"):
        validate_build_items({"swaps": ["T8_OFF_SHIELD", "T8_OFF_SHIELD@2"]}, catalog)


def test_validate_two_handed_with_tiered_weapons(catalog):
    with pytest.raises(InvalidItems, match="deux mains"):
        validate_build_items({"mainhand": ["T8_2H_HOLYSTAFF@2"], "offhand": ["T8_OFF_SHIELD"]}, catalog)


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


def test_swaps_any_slot_deduplicated_and_bounded():
    from app.catalog import InvalidItems, SWAPS_MAX, items_by_id, validate_build_items
    ids = list(items_by_id())
    ok = validate_build_items({"swaps": [ids[0], ids[-1], ids[0]]})
    assert ok == {"swaps": [ids[0], ids[-1]]}   # n'importe quel emplacement, doublon retiré
    for bad in ({"swaps": ["*"]}, {"swaps": ["INCONNU"]}, {"swaps": ids[: SWAPS_MAX + 1]}):
        with pytest.raises(InvalidItems):
            validate_build_items(bad)


# ── Sorts et passifs ────────────────────────────────────────────────────────
from app.catalog import (SHOES_ANY, build_spell_names, shoe_spells, spell_resolver, spell_slots,  # noqa: E402
                         validate_build_spells)

SPELL_RAW = {
    "weapon": [
        {"@uniquename": "T4_2H_BOW", "craftingspelllist": {"craftspell": [
            {"@uniquename": "MULTISHOT2", "@slots": "1"}, {"@uniquename": "GROUNDARROW", "@slots": "2"},
            {"@uniquename": "SPEEDARCHER_KITE", "@slots": "3"}, {"@uniquename": "PASSIVE_SLOWPOISON"}]}},
        {"@uniquename": "T4_2H_LONGBOW", "craftingspelllist": {
            "@reference": "T4_2H_BOW", "removespell": {"@uniquename": "SPEEDARCHER_KITE"},
            "craftspell": {"@uniquename": "ARROWRAIN", "@slots": "3"}}},
        {"@uniquename": "T8_2H_LONGBOW", "craftingspelllist": {"@reference": "T4_2H_LONGBOW"}},
    ],
    "equipmentitem": [
        {"@uniquename": "T8_ARMOR_PLATE_SET1", "craftingspelllist": {"craftspell": [
            {"@uniquename": "TAUNT"}, {"@uniquename": "PASSIVE_MR_AR", "@slots": "1"},
            {"@uniquename": "PASSIVE_THREAT", "@slots": "2"}]}},
    ],
}
PASSIVES = {"PASSIVE_SLOWPOISON", "PASSIVE_MR_AR", "PASSIVE_THREAT"}


def test_spell_resolver_follows_references_and_removals():
    resolve = spell_resolver(SPELL_RAW)
    assert [s for s, _ in resolve("T8_2H_LONGBOW")] == ["MULTISHOT2", "GROUNDARROW", "PASSIVE_SLOWPOISON", "ARROWRAIN"]
    assert resolve("INCONNU") == []


def test_spell_slots_weapon_and_armor():
    resolve = spell_resolver(SPELL_RAW)
    assert spell_slots("mainhand", resolve("T8_2H_LONGBOW"), PASSIVES) == {
        "q": ["MULTISHOT2"], "w": ["GROUNDARROW"], "e": ["ARROWRAIN"], "p": ["PASSIVE_SLOWPOISON"]}
    assert spell_slots("armor", resolve("T8_ARMOR_PLATE_SET1"), PASSIVES) == {
        "a": ["TAUNT"], "p": ["PASSIVE_MR_AR"], "p2": ["PASSIVE_THREAT"]}


def test_build_spell_names_from_localization():
    raw_spells = {"activespell": [{"@uniquename": "SPRINTHOT"}, {"@uniquename": "X", "@namelocatag": "@SPELLS_Y"}],
                  "passivespell": {"@uniquename": "PASSIVE_MR_AR"}}
    loc = {"tmx": {"body": {"tu": [
        {"@tuid": "@SPELLS_SPRINTHOT", "tuv": [{"@xml:lang": "EN-US", "seg": "Rejuvenating Sprint"},
                                              {"@xml:lang": "FR-FR", "seg": "Sprint rafraîchissant"}]},
        {"@tuid": "@SPELLS_Y", "tuv": {"@xml:lang": "EN-US", "seg": "Why"}},
    ]}}}
    names = build_spell_names({"SPRINTHOT", "X", "PASSIVE_MR_AR"}, raw_spells, loc)
    assert names["SPRINTHOT"] == {"name": "Sprint rafraîchissant", "name_en": "Rejuvenating Sprint"}
    assert names["X"] == {"name": "Why", "name_en": "Why"}                 # pas de FR : anglais
    assert names["PASSIVE_MR_AR"]["name"] == "PASSIVE_MR_AR"               # pas traduit : id


def test_build_catalog_adds_spells_only_when_passives_given():
    raw = {"weapon": [dict(RAW["weapon"][1], craftingspelllist={"craftspell": [
        {"@uniquename": "HEROIC", "@slots": "1"}, {"@uniquename": "PASSIVE_BLEED"}]})]}
    loc_ = [loc("T8_MAIN_SWORD", "Épée large du sage", "Elder's Broadsword")]
    assert "spells" not in build_catalog(raw, loc_)[0]
    assert build_catalog(raw, loc_, {"PASSIVE_BLEED"})[0]["spells"] == {"q": ["HEROIC"], "p": ["PASSIVE_BLEED"]}


SPELL_CATALOG = {
    "2H_LONGBOW": {"id": "2H_LONGBOW", "slot": "mainhand", "name": "Arc long", "category": "Arcs", "tiers": [8],
                   "two_handed": True, "spells": {"q": ["MULTISHOT2"], "e": ["ARROWRAIN"], "p": ["PASSIVE_SLOWPOISON"]}},
    "SHOES_LEATHER_SET1": {"id": "SHOES_LEATHER_SET1", "slot": "shoes", "name": "Bottes de mercenaire",
                           "category": "Cuir", "tiers": [8], "two_handed": False,
                           "spells": {"a": ["SPRINT_CD_REDUCTION", "DODGE"], "p": ["PASSIVE_BALANCE"]}},
    "SHOES_PLATE_SET1": {"id": "SHOES_PLATE_SET1", "slot": "shoes", "name": "Bottes de soldat",
                         "category": "Plaque", "tiers": [8], "two_handed": False,
                         "spells": {"a": ["DODGE", "SPRINTHOT"]}},
}


def test_shoe_spells_union_keeps_first_family():
    assert shoe_spells(SPELL_CATALOG) == {
        "a": [{"id": "SPRINT_CD_REDUCTION", "category": "Cuir"}, {"id": "DODGE", "category": "Cuir"},
              {"id": "SPRINTHOT", "category": "Plaque"}],
        "p": [{"id": "PASSIVE_BALANCE", "category": "Cuir"}]}


def test_validate_build_spells_per_item():
    items = {"mainhand": ["T8_2H_LONGBOW@1"]}
    spells = {"2H_LONGBOW": {"p": "PASSIVE_SLOWPOISON", "q": "MULTISHOT2", "e": ""}, "SHOES_PLATE_SET1": {}}
    assert validate_build_spells(spells, items, SPELL_CATALOG) == {"2H_LONGBOW": {"q": "MULTISHOT2", "p": "PASSIVE_SLOWPOISON"}}
    with pytest.raises(InvalidItems):
        validate_build_spells({"2H_LONGBOW": {"w": "MULTISHOT2"}}, items, SPELL_CATALOG)       # mauvais emplacement
    with pytest.raises(InvalidItems):
        validate_build_spells({"2H_LONGBOW": {"q": "ARROWRAIN"}}, items, SPELL_CATALOG)       # sort d'un autre emplacement
    with pytest.raises(InvalidItems):
        validate_build_spells({"SHOES_PLATE_SET1": {"a": "DODGE"}}, items, SPELL_CATALOG)     # objet absent du build


def test_validate_build_spells_shoes_any():
    ok = {SHOES_ANY: {"a": "SPRINTHOT"}}
    assert validate_build_spells(ok, {}, SPELL_CATALOG) == ok
    assert validate_build_spells(ok, {"shoes": ["*"]}, SPELL_CATALOG) == ok
    with pytest.raises(InvalidItems):
        validate_build_spells(ok, {"shoes": ["T8_SHOES_PLATE_SET1"]}, SPELL_CATALOG)          # bottes précises
    with pytest.raises(InvalidItems):
        validate_build_spells({SHOES_ANY: {"a": "MULTISHOT2"}}, {}, SPELL_CATALOG)            # pas un sort de bottes


def test_generated_spell_names_cover_catalog():
    from app.catalog import load_spell_names
    names = load_spell_names()
    used = {s for i in load_catalog() for ids in i.get("spells", {}).values() for s in ids}
    assert used and used <= set(names)
    assert names["SPRINT_CD_REDUCTION"]["name"] == "Sprint rafraîchissant"
