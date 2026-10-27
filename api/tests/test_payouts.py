"""Payouts de la semaine (panel Admin) : calcul des corrections, routes, MP."""
from datetime import datetime, timedelta, UTC

import pytest

from app.payouts import (adjustment_deltas, dm_text, effective_amounts, payout_view, plan_adjustment,
                         week_bounds)
from tests.fakes import ADMIN_ID, GUILD, MEMBER_ID, OTHER_GUILD, STAFF_ID


# ── Logique pure ─────────────────────────────────────────────────────────────

def test_week_bounds_start_monday_paris():
    now = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)              # mercredi
    start, end = week_bounds(now)
    assert start == datetime(2026, 10, 25, 23, 0, tzinfo=UTC)    # lundi 26 00:00 Paris (heure d'hiver)
    assert end - start == timedelta(days=7)
    prev_start, prev_end = week_bounds(now, -1)
    assert prev_end == start and prev_start == datetime(2026, 10, 18, 22, 0, tzinfo=UTC)   # heure d'été


def test_effective_amounts_merge_adjustments():
    entries = [{"uid": "1", "name": "A", "delta": 100}, {"uid": "2", "name": "B", "delta": 200}]
    adjustments = [[{"uid": "2", "name": "B2", "delta": -200}], [{"uid": "3", "name": "C", "delta": 50}]]
    assert effective_amounts(entries, adjustments) == {
        "1": {"name": "A", "amount": 100}, "2": {"name": "B2", "amount": 0}, "3": {"name": "C", "amount": 50}}


def test_plan_adjustment_individual_changes():
    current = {"1": 100, "2": 200}
    new = plan_adjustment(current, {"2": 0, "3": 75})                # retirer 2, ajouter 3
    assert adjustment_deltas(current, new) == {"2": -200, "3": 75}
    assert adjustment_deltas(current, plan_adjustment(current, {"1": 100})) == {}


def test_plan_adjustment_total_is_prorata_and_exact():
    current = {"1": 1_000, "2": 2_000, "3": 0}                       # 3 : déjà retiré, reste à 0
    new = plan_adjustment(current, {}, ("total", 10_000))
    assert new == {"1": 3_333, "2": 6_667, "3": 0} and sum(new.values()) == 10_000
    odd = plan_adjustment({"1": 1, "2": 1, "3": 1}, {}, ("total", 100))
    assert sorted(odd.values()) == [33, 33, 34] and sum(odd.values()) == 100


def test_plan_adjustment_per_player_then_individual_override():
    new = plan_adjustment({"1": 100, "2": 300}, {"2": 50}, ("per_player", 500))
    assert new == {"1": 500, "2": 50}
    assert plan_adjustment({"1": 0}, {}, ("total", 100)) == {"1": 0}  # personne de payé : rien à répartir


def test_payout_view_hides_removed_players():
    row = {"id": 9, "ts": datetime(2026, 10, 27, 20, 0, tzinfo=UTC), "action": "finacti", "template": "ZvZ",
           "by_user": "Caller", "entries": [{"uid": "1", "name": "A", "delta": 100}, {"uid": "2", "name": "B", "delta": 100}]}
    view = payout_view(row, [[{"uid": "2", "name": "B", "delta": -100}]])
    assert view["total"] == 100 and view["adjusted"] is True
    assert [p["uid"] for p in view["players"]] == ["1"]


def test_dm_text():
    text = dm_text("ZvZ", datetime(2026, 10, 27, 20, 0, tzinfo=UTC), "Admin", 1_000_000, 1_500_000, 3_000_000)
    assert "**ZvZ** du 27/10" in text and "1 000 000 → **1 500 000** (+500 000)" in text
    assert "Nouveau solde BAL : **3 000 000**" in text
    assert "(-200)" in dm_text("", datetime(2026, 10, 27, tzinfo=UTC), "A", 300, 100, 0)


# ── Routes ───────────────────────────────────────────────────────────────────

@pytest.fixture
def payouts(fake_db):
    now = datetime.now(UTC)
    fake_db.payout_rows = [
        {"id": 50, "guild_id": GUILD, "ts": week_bounds(now)[0] + timedelta(seconds=1), "action": "finacti",
         "template": "ZvZ",
         "by_user": "Caller", "entries": [{"uid": str(MEMBER_ID), "name": "Membre", "delta": 1_000_000},
                                          {"uid": str(STAFF_ID), "name": "Staff", "delta": 2_000_000}]},
        {"id": 51, "guild_id": GUILD, "ts": now - timedelta(days=30), "action": "paybal", "template": "",
         "by_user": "x", "entries": [{"uid": str(MEMBER_ID), "name": "Membre", "delta": 5}]},
        {"id": 52, "guild_id": OTHER_GUILD, "ts": now, "action": "finacti", "template": "",
         "by_user": "x", "entries": [{"uid": "7", "name": "Autre", "delta": 5}]},
    ]
    fake_db.bal[(GUILD, STAFF_ID)] = 2_000_000
    return fake_db


def test_payouts_admin_only(login, payouts):
    assert login(STAFF_ID).get(f"/api/guilds/{GUILD}/admin/payouts").status_code == 403
    assert login(STAFF_ID).post(f"/api/guilds/{GUILD}/admin/payouts/50/adjust", json={}).status_code == 403


def test_list_week_payouts(login, payouts):
    c = login(ADMIN_ID)
    data = c.get(f"/api/guilds/{GUILD}/admin/payouts").json()
    assert [p["id"] for p in data["payouts"]] == [50]                  # ni l'ancien, ni l'autre serveur
    assert data["payouts"][0]["total"] == 3_000_000
    assert c.get(f"/api/guilds/{GUILD}/admin/payouts?week=-1").json()["payouts"] == []
    assert c.get(f"/api/guilds/{GUILD}/admin/payouts?week=-2").status_code == 422


def test_adjust_payout_updates_bal_logs_and_dms(login, payouts, fake_discord):
    fake_discord.members[(GUILD, 6)] = {"roles": [], "nick": "Nouveau", "user": {"username": "nouveau"}}
    fake_discord.closed_dms = {str(STAFF_ID)}
    body = {"changes": [{"uid": str(MEMBER_ID), "amount": 1_500_000},
                        {"uid": str(STAFF_ID), "amount": 0},
                        {"uid": "6", "amount": 400_000}]}
    r = login(ADMIN_ID, "Admin").post(f"/api/guilds/{GUILD}/admin/payouts/50/adjust", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["payout"]["total"] == 1_900_000
    assert {p["uid"]: p["amount"] for p in out["payout"]["players"]} == {str(MEMBER_ID): 1_500_000, "6": 400_000}
    assert payouts.bal[(GUILD, MEMBER_ID)] == 2_000_000 and payouts.bal[(GUILD, STAFF_ID)] == 0
    assert payouts.bal[(GUILD, 6)] == 400_000
    assert payouts.adjust_rows[0]["ref_id"] == 50 and payouts.adjust_rows[0]["by_user"] == "Admin"
    assert out["dm_sent"] == 2 and out["dm_failed"] == ["Staff"]
    dm = dict(fake_discord.dms)[str(MEMBER_ID)]
    assert "1 000 000 → **1 500 000** (+500 000)" in dm and "**Admin**" in dm


def test_adjust_payout_global_total(login, payouts):
    r = login(ADMIN_ID).post(f"/api/guilds/{GUILD}/admin/payouts/50/adjust",
                             json={"global_change": {"mode": "total", "amount": 6_000_000}})
    assert r.status_code == 200
    assert {p["uid"]: p["amount"] for p in r.json()["payout"]["players"]} == {str(MEMBER_ID): 2_000_000,
                                                                             str(STAFF_ID): 4_000_000}


def test_adjust_payout_refusals(login, payouts):
    c = login(ADMIN_ID)
    url = f"/api/guilds/{GUILD}/admin/payouts"
    assert c.post(f"{url}/51/adjust", json={"changes": [{"uid": "1", "amount": 1}]}).status_code == 404   # trop ancien
    assert c.post(f"{url}/52/adjust", json={"changes": [{"uid": "7", "amount": 1}]}).status_code == 404   # autre serveur
    assert c.post(f"{url}/50/adjust", json={"changes": []}).status_code == 422                           # rien ne change
    assert c.post(f"{url}/50/adjust", json={"changes": [{"uid": "1", "amount": -5}]}).status_code == 422  # négatif
    assert c.post(f"{url}/50/adjust", json={"changes": [{"uid": "x", "amount": 5}]}).status_code == 422   # id invalide
    stranger = c.post(f"{url}/50/adjust", json={"changes": [{"uid": "999", "amount": 5}]})
    assert stranger.status_code == 422 and "999" in stranger.json()["detail"]                            # pas membre
    assert not getattr(payouts, "adjust_rows", [])


def test_original_shares_from_bot_or_inferred():
    from app.payouts import original_shares
    logged = [{"uid": "1", "delta": 2_000, "role": "TANK", "share": 2.0},
              {"uid": "2", "delta": 1_000, "role": "DPS", "share": 1.0},
              {"uid": "3", "delta": 500, "role": "SCOOT"}]
    assert original_shares(logged) == {"1": {"role": "TANK", "share": 2.0, "inferred": False},
                                       "2": {"role": "DPS", "share": 1.0, "inferred": False},
                                       "3": {"role": "SCOOT", "share": None, "inferred": False}}
    old = [{"uid": "1", "delta": 1_000}, {"uid": "2", "delta": 1_000}, {"uid": "3", "delta": 1_500}]
    assert original_shares(old)["3"] == {"role": "", "share": 1.5, "inferred": True}
    assert original_shares(old)["1"]["share"] == 1.0
    assert original_shares([]) == {}


def test_payout_view_players_carry_shares():
    row = {"id": 1, "ts": datetime(2026, 10, 27, tzinfo=UTC), "action": "finacti",
           "entries": [{"uid": "1", "name": "A", "delta": 200, "role": "TANK", "share": 2.0}]}
    view = payout_view(row, [[{"uid": "9", "name": "Ajouté", "delta": 50}]])
    assert view["players"][0] == {"uid": "1", "name": "A", "amount": 200, "role": "TANK", "share": 2.0, "inferred": False}
    assert view["players"][1]["share"] is None and view["players"][1]["role"] == ""   # ajouté depuis le site
