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
            {"@uniquename": "T8_MEAT", "@count": "10"}, {"@uniquename": "QUESTITEM_TOKEN_AVALON", "@count": "1"}]}},
        {"@uniquename": "T4_FISH_COMMON"},
        {"@uniquename": "T6_POTION_HEAL@1"},
    ],
    "weapon": [
        # ressource enchantée désignée par un attribut : nom du jeu « T4_PLANKS_LEVEL1@1 »
        {"@uniquename": "T4_POTION_TEST", "craftingrequirements": {"craftresource": [
            {"@uniquename": "T4_PLANKS", "@count": "2", "@enchantmentlevel": "1"},
            {"@uniquename": "T4_MAIN_SWORD", "@count": "1", "@enchantmentlevel": "2"}]}},
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
    assert "T4_FISH_COMMON" not in by_id


def test_enchanted_resource_ids():
    r = {x["id"]: x for x in extract_recipes(RAW)}["T4_POTION_TEST"]["r"]
    assert r == [["T4_PLANKS_LEVEL1@1", 2], ["T4_MAIN_SWORD@2", 1]]


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
    assert len(data["recipes"]) == 5


def test_generated_market_file_is_coherent():
    data = load_market()
    ids = {i[0] for i in data["items"]}
    assert len(ids) > 3000 and len(data["recipes"]) > 100
    assert "T4_MAIN_SWORD" in ids and "T6_POTION_HEAL" in {r["id"] for r in data["recipes"]}
    assert all(r["y"] >= 1 and r["r"] for r in data["recipes"])


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
