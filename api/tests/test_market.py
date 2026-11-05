import gzip
import json

from app.market import build_market, extract_recipes, load_market, market_gzip
from tests.fakes import MEMBER_ID

# Extrait minimal au format des dumps ao-bin-dumps
RAW = {
    "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "consumableitem": [
        {"@uniquename": "T6_POTION_HEAL", "@amountcrafted": "5",
         "craftingrequirements": {"@amountcrafted": "5", "craftresource": [
             {"@uniquename": "T6_FOXGLOVE", "@count": "72"}, {"@uniquename": "T5_EGG", "@count": "18"}]},
         "enchantments": {"enchantment": [
             {"@enchantmentlevel": "1", "craftingrequirements": {"craftresource": [
                 {"@uniquename": "T6_FOXGLOVE", "@count": "72"},
                 {"@uniquename": "T1_ALCHEMY_EXTRACT_LEVEL1", "@count": "45"}]}},
             {"@enchantmentlevel": "2"},   # sans recette : ignoré
         ]}},
        # une seule recette « craftresource » (dict, pas liste) et plusieurs recettes : on prend la 1re
        {"@uniquename": "T1_MEAL_SEAWEEDSALAD", "craftingrequirements": [
            {"@amountcrafted": "10", "craftresource": {"@uniquename": "T1_SEAWEED", "@count": "8"}},
            {"@amountcrafted": "1", "craftresource": {"@uniquename": "T1_CARROT", "@count": "99"}}]},
        {"@uniquename": "T8_MEAL_STEW_AVALON", "craftingrequirements": {"craftresource": [
            {"@uniquename": "T8_MEAT", "@count": "10"},
            {"@uniquename": "QUESTITEM_TOKEN_AVALON", "@count": "1", "@maxreturnamount": "0"}]}},
        {"@uniquename": "T4_FISH_COMMON"},
        {"@uniquename": "T6_POTION_HEAL@1"},
    ],
    "weapon": [
        # ressource enchantée désignée par un attribut : nom du jeu « T4_PLANKS_LEVEL1@1 »
        {"@uniquename": "T4_POTION_TEST", "craftingrequirements": {"craftresource": [
            {"@uniquename": "T4_PLANKS", "@count": "2", "@enchantmentlevel": "1"},
            {"@uniquename": "T4_MAIN_SWORD", "@count": "1", "@enchantmentlevel": "2"}]}},
        # équipement : recette de base + enchantements (ressources « T4_METALBAR_LEVEL1@1 »)
        {"@uniquename": "T4_MAIN_SWORD", "craftingrequirements": {"craftresource": [
            {"@uniquename": "T4_METALBAR", "@count": "16"}, {"@uniquename": "T4_LEATHER", "@count": "8"}]},
         "enchantments": {"enchantment": {"@enchantmentlevel": "1", "craftingrequirements": {"craftresource": [
             {"@uniquename": "T4_METALBAR_LEVEL1", "@enchantmentlevel": "1", "@count": "16"},
             {"@uniquename": "T4_LEATHER_LEVEL1", "@enchantmentlevel": "1", "@count": "8"}]}}}},
        {"@uniquename": "T4_2H_BOW_KEEPER", "craftingrequirements": [
            {"craftresource": [{"@uniquename": "T4_PLANKS", "@count": "32"},
                               {"@uniquename": "T4_ARTEFACT_2H_BOW_KEEPER", "@count": "1", "@maxreturnamount": "0"}]},
            {"craftresource": {"@uniquename": "T4_ARTEFACT_TOKEN_FAVOR_3", "@count": "1"}}]},
    ],
    "equipmentitem": [
        # prototype sans nom en jeu : écarté du marché
        {"@uniquename": "T8_ARMOR_CLOTH_PROTOTYPE", "craftingrequirements": {"craftresource": {"@uniquename": "T8_CLOTH", "@count": "16"}}},
        # objet sans tier : pas une recette du marché ; ressource sans id : ignorée
        {"@uniquename": "UNIQUE_GVGTOKEN", "craftingrequirements": {"craftresource": {"@uniquename": "T4_CLOTH", "@count": "1"}}},
        {"@uniquename": "T4_BAG", "craftingrequirements": {"craftresource": [{"@count": "3"}, {"@uniquename": "T4_CLOTH", "@count": "8"}]}},
    ],
    "simpleitem": [
        {"@uniquename": "T4_LEATHER", "@shopsubcategory1": "refinedresources", "craftingrequirements": [
            {"@amountcrafted": "1", "craftresource": [{"@uniquename": "T4_HIDE", "@count": "2", "@enchantmentlevel": "0"},
                                                      {"@uniquename": "T3_LEATHER", "@count": "1", "@enchantmentlevel": "0"}]},
            {"@amountcrafted": "1", "craftresource": [{"@uniquename": "T4_HIDE", "@count": "1"}]}]},
        # ressource raffinée enchantée : objet à part dans les dumps
        {"@uniquename": "T4_LEATHER_LEVEL1", "@enchantmentlevel": "1", "@shopsubcategory1": "refinedresources",
         "craftingrequirements": {"@amountcrafted": "1", "craftresource": [
             {"@uniquename": "T4_HIDE_LEVEL1", "@enchantmentlevel": "1", "@count": "2"},
             {"@uniquename": "T3_LEATHER", "@count": "1", "@enchantmentlevel": "0"}]}},
        # transmutation d'une ressource brute, artefact : pas des recettes du marché
        {"@uniquename": "T4_HIDE_LEVEL1", "@shopsubcategory1": "resources", "craftingrequirements": {"craftresource": {"@uniquename": "T4_HIDE", "@count": "1"}}},
        {"@uniquename": "T4_ARTEFACT_2H_BOW_KEEPER", "craftingrequirements": {"craftresource": {"@uniquename": "T4_RUNE", "@count": "5"}}},
    ],
    "furnitureitem": [
        {"@uniquename": "T4_FURNITUREITEM_BED", "craftingrequirements": {"craftresource": {"@uniquename": "T4_PLANKS", "@count": "5"}}},
    ],
}


def loc(unique, fr, en=""):
    return {"UniqueName": unique, "LocalizedNames": {"FR-FR": fr, "EN-US": en}}


LOCALIZED = [
    loc("T4_MAIN_SWORD", "Épée large de l'adepte", "Adept's Broadsword"),
    loc("T4_MAIN_SWORD@1", "Épée large de l'adepte", "Adept's Broadsword"),
    loc("T4_MAIN_SWORD@3", "Épée large de l'adepte", "Adept's Broadsword"),
    loc("T4_FIBER_LEVEL1@1", "Chanvre peu commun", "Uncommon Hemp"),
    loc("T6_POTION_HEAL", "Potion de soin majeure", "Major Healing Potion"),
    loc("QUESTITEM_TOKEN_AVALON", "Énergie avalonienne", "Avalonian Energy"),
    loc("UNIQUE_HIDEOUT", "Repaire", "Hideout"),          # sans tier ni recette : écarté
    {"UniqueName": "T4_SKILLBOOK_NONTRADABLE"},           # sans nom : écarté
    loc("T5_EGG", "Œuf d'oie"),                           # sans nom anglais
    loc("T4_2H_BOW_KEEPER", "Arc à marée haute de l'adepte", "Adept's Bow of Badon"),
    loc("T4_LEATHER", "Cuir travaillé", "Worked Leather"),
    loc("T4_LEATHER_LEVEL1@1", "Cuir travaillé peu commun", "Uncommon Worked Leather"),
]


def test_recipes_with_enchantments_and_yield():
    by_id = {r["id"]: r for r in extract_recipes(RAW)}
    assert by_id["T6_POTION_HEAL"] == {"id": "T6_POTION_HEAL", "tier": 6, "ench": 0, "cat": "potion", "y": 5,
                                       "r": [["T6_FOXGLOVE", 72], ["T5_EGG", 18]]}
    # la recette enchantée n'a pas d'@amountcrafted : on reprend celui de l'objet
    assert by_id["T6_POTION_HEAL@1"]["ench"] == 1 and by_id["T6_POTION_HEAL@1"]["y"] == 5
    assert ["T1_ALCHEMY_EXTRACT_LEVEL1", 45] in by_id["T6_POTION_HEAL@1"]["r"]
    assert "T6_POTION_HEAL@2" not in by_id
    assert by_id["T1_MEAL_SEAWEEDSALAD"]["cat"] == "meal" and by_id["T1_MEAL_SEAWEEDSALAD"]["y"] == 10
    assert by_id["T1_MEAL_SEAWEEDSALAD"]["r"] == [["T1_SEAWEED", 8]]
    assert by_id["T8_MEAL_STEW_AVALON"]["y"] == 1   # aucune quantité indiquée : 1
    # ressource jamais rendue par le jeu : marquée pour ignorer le retour de ressources
    assert by_id["T8_MEAL_STEW_AVALON"]["r"] == [["T8_MEAT", 10], ["QUESTITEM_TOKEN_AVALON", 1, 0]]
    assert "T4_FISH_COMMON" not in by_id


def test_enchanted_resource_ids():
    r = {x["id"]: x for x in extract_recipes(RAW)}["T4_POTION_TEST"]["r"]
    assert r == [["T4_PLANKS_LEVEL1@1", 2], ["T4_MAIN_SWORD@2", 1]]


def test_gear_and_refining_recipes():
    by_id = {r["id"]: r for r in extract_recipes(RAW)}
    assert by_id["T4_MAIN_SWORD"] == {"id": "T4_MAIN_SWORD", "tier": 4, "ench": 0, "cat": "gear", "y": 1,
                                      "r": [["T4_METALBAR", 16], ["T4_LEATHER", 8]]}
    assert by_id["T4_MAIN_SWORD@1"]["r"] == [["T4_METALBAR_LEVEL1@1", 16], ["T4_LEATHER_LEVEL1@1", 8]]
    # artefact : jamais rendu ; 1re recette seulement (pas celle au jeton de faveur)
    assert by_id["T4_2H_BOW_KEEPER"]["r"] == [["T4_PLANKS", 32], ["T4_ARTEFACT_2H_BOW_KEEPER", 1, 0]]
    # raffinage : 1re recette (sans jeton de faction), version enchantée = objet à part
    assert by_id["T4_LEATHER"] == {"id": "T4_LEATHER", "tier": 4, "ench": 0, "cat": "refine", "y": 1,
                                   "r": [["T4_HIDE", 2], ["T3_LEATHER", 1]]}
    assert by_id["T4_LEATHER_LEVEL1@1"] == {"id": "T4_LEATHER_LEVEL1@1", "tier": 4, "ench": 1, "cat": "refine", "y": 1,
                                            "r": [["T4_HIDE_LEVEL1@1", 2], ["T3_LEATHER", 1]]}
    assert by_id["T4_BAG"]["r"] == [["T4_CLOTH", 8]]
    # transmutation, artefact, meuble, objet sans tier : pas des recettes du marché
    assert not {"T4_HIDE_LEVEL1", "T4_HIDE_LEVEL1@1", "T4_ARTEFACT_2H_BOW_KEEPER", "T4_FURNITUREITEM_BED", "UNIQUE_GVGTOKEN"} & set(by_id)


def test_market_items_fold_enchantments_and_keep_recipe_ingredients():
    data = build_market(RAW, LOCALIZED)
    items = {i[0]: i for i in data["items"]}
    assert items["T4_MAIN_SWORD"] == ["T4_MAIN_SWORD", "Épée large de l'adepte", "Adept's Broadsword", 3]
    assert "T4_MAIN_SWORD@1" not in items
    assert items["T4_FIBER_LEVEL1@1"][3] == 0           # pas d'objet de base : ligne à part
    assert items["QUESTITEM_TOKEN_AVALON"][1] == "Énergie avalonienne"
    assert items["T5_EGG"] == ["T5_EGG", "Œuf d'oie", "", 0]
    assert "UNIQUE_HIDEOUT" not in items and "T4_SKILLBOOK_NONTRADABLE" not in items
    assert [i[0] for i in data["items"]] == sorted(items)
    recipes = {r["id"] for r in data["recipes"]}
    # équipement et raffinage nommés gardés, prototype sans nom écarté
    assert {"T4_MAIN_SWORD", "T4_MAIN_SWORD@1", "T4_2H_BOW_KEEPER", "T4_LEATHER", "T4_LEATHER_LEVEL1@1"} <= recipes
    assert "T8_ARMOR_CLOTH_PROTOTYPE" not in recipes
    assert len(data["recipes"]) == 10


def test_generated_market_file_is_coherent():
    data = load_market()
    ids = {i[0] for i in data["items"]}
    assert len(ids) > 3000 and len(data["recipes"]) > 5000
    recipes = {r["id"]: r for r in data["recipes"]}
    assert "T4_MAIN_SWORD" in ids and "T6_POTION_HEAL" in recipes
    assert {"potion", "meal", "refine", "gear"} == {r["cat"] for r in data["recipes"]}
    assert recipes["T4_LEATHER_LEVEL1@1"]["r"] == [["T4_HIDE_LEVEL1@1", 2], ["T3_LEATHER", 1]]
    assert recipes["T4_MAIN_SWORD@2"]["r"] == [["T4_METALBAR_LEVEL2@2", 16], ["T4_LEATHER_LEVEL2@2", 8]]
    assert all(r["y"] >= 1 and r["r"] for r in data["recipes"])
    no_return = {res[0] for r in data["recipes"] for res in r["r"] if res[2:] == [0]}
    assert "QUESTITEM_TOKEN_AVALON" in no_return and "T1_ALCHEMY_EXTRACT_LEVEL1" not in no_return


def test_market_requires_login(client):
    assert client.get("/api/market").status_code == 401


def test_market_is_served_gzipped_and_cached(login):
    r = login(MEMBER_ID).get("/api/market", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers["content-encoding"] == "gzip" and r.headers["cache-control"] == "private, max-age=86400"
    assert r.json()["items"]  # le client de test décompresse
    assert json.loads(gzip.decompress(market_gzip())) == r.json()


def test_market_plain_without_gzip(login):
    r = login(MEMBER_ID).get("/api/market", headers={"Accept-Encoding": "identity"})
    assert "content-encoding" not in r.headers
    assert r.json()["recipes"]
