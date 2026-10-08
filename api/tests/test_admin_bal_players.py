"""Admin → BAL par joueur : recherche, historique d'un joueur, exports CSV."""
from datetime import datetime, timedelta, timezone

import pytest

from app.bal_stats import guild_operations_csv, search_players
from tests.fakes import ADMIN_ID, GUILD, MEMBER_ID, OTHER_GUILD, STAFF_ID

BASE = f"/api/guilds/{GUILD}/admin/bal"


# ── Logique pure ─────────────────────────────────────────────────────────────

PLAYERS = [
    {"uid": "10", "name": "Élise", "amount": 900},
    {"uid": "11", "name": "Coskko", "amount": 500},
    {"uid": "12", "name": "Ariia I", "amount": 0},
]


def test_search_players_ignores_case_and_accents():
    assert [p["name"] for p in search_players(PLAYERS, "elise")] == ["Élise"]
    assert [p["name"] for p in search_players(PLAYERS, "ARIIA")] == ["Ariia I"]


def test_search_players_by_discord_id_and_all_words():
    assert [p["uid"] for p in search_players(PLAYERS, "11")] == ["11"]
    assert search_players(PLAYERS, "ariia x") == []


def test_search_players_empty_query_keeps_order_and_limit():
    assert [p["uid"] for p in search_players(PLAYERS, "")] == ["10", "11", "12"]
    assert len(search_players(PLAYERS, "", limit=2)) == 2


def test_guild_csv_has_player_columns_and_neutralises_formulas():
    ts = datetime(2026, 10, 1, 18, 0, tzinfo=timezone.utc)
    events = [
        {"ts": ts, "action": "finacti", "template": "ZvZ", "uid": "1", "name": "=cmd()", "delta": 300, "by_user": "Off"},
        {"ts": ts + timedelta(hours=1), "action": "retirebal", "template": "", "uid": "2", "name": "Bob",
         "delta": -50, "by_user": "@Off"},
    ]
    lines = guild_operations_csv(events).strip().split("\r\n")
    assert lines[0] == "date;operation;compo;joueur;uid;montant;par"
    assert lines[1].startswith("2026-10-01T21:00+02:00;retirebal;;Bob;2;-50;'@Off")   # plus récente d'abord
    assert ";'=cmd();1;300;" in lines[2]


# ── Routes ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("path", ["/players", f"/players/{MEMBER_ID}/operations",
                                  f"/players/{MEMBER_ID}/operations.csv", "/operations.csv"])
def test_admin_only(login, path):
    assert login(MEMBER_ID).get(BASE + path).status_code == 403
    assert login(STAFF_ID).get(BASE + path).status_code == 403


def test_players_list_and_search(login):
    c = login(ADMIN_ID)
    players = c.get(f"{BASE}/players").json()
    assert players[0] == {"uid": str(MEMBER_ID), "name": f"Joueur{MEMBER_ID}", "amount": 1_500_000}
    assert {p["uid"] for p in players} == {str(MEMBER_ID), str(STAFF_ID)}   # soldes à 0 compris
    assert [p["uid"] for p in c.get(f"{BASE}/players?q=joueur{STAFF_ID}").json()] == [str(STAFF_ID)]


def test_player_operations_paginated_and_scoped_to_guild(login):
    body = login(ADMIN_ID).get(f"{BASE}/players/{MEMBER_ID}/operations?page=2").json()
    assert body["total"] == 35 and len(body["items"]) == 10
    assert all(op["delta"] != 777 for op in body["items"])   # ligne de l'autre serveur exclue


def test_player_operations_rejects_bad_uid(login):
    assert login(ADMIN_ID).get(f"{BASE}/players/abc/operations").status_code == 422
    assert login(ADMIN_ID).get(f"{BASE}/players/{'9' * 21}/operations").status_code == 422


def test_player_csv(login):
    r = login(ADMIN_ID).get(f"{BASE}/players/{MEMBER_ID}/operations.csv?action=retirebal")
    assert r.status_code == 200 and f"bal-{MEMBER_ID}.csv" in r.headers["content-disposition"]
    assert len(r.content.decode("utf-8-sig").strip().split("\r\n")) == 1 + 5


def test_guild_csv_only_this_guild_and_period(login, fake_db):
    now = datetime.now(timezone.utc)
    fake_db.bal_events = [
        {"guild_id": GUILD, "ts": now - timedelta(days=2), "action": "finacti", "template": "ZvZ",
         "uid": "1", "name": "Récent", "delta": 100, "by_user": "x"},
        {"guild_id": GUILD, "ts": now - timedelta(days=60), "action": "finacti", "template": "",
         "uid": "1", "name": "Ancien", "delta": 100, "by_user": "x"},
        {"guild_id": OTHER_GUILD, "ts": now, "action": "finacti", "template": "",
         "uid": "9", "name": "AutreServeur", "delta": 100, "by_user": "x"},
    ]
    r = login(ADMIN_ID).get(f"{BASE}/operations.csv?period=30d")
    text = r.content.decode("utf-8-sig")
    assert "bal-guilde-30d.csv" in r.headers["content-disposition"]
    assert "Récent" in text and "Ancien" not in text and "AutreServeur" not in text
