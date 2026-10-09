"""Stats d'activité (page Admin) : calculs purs + route."""
from datetime import datetime, timedelta, timezone

from app.activity_stats import compute_activity_stats
from tests.fakes import ADMIN_ID, GUILD, MEMBER_ID, OTHER_GUILD, STAFF_ID

NOW = datetime(2026, 10, 8, 20, 0, tzinfo=timezone.utc)   # jeudi


def row(days_ago=0, outcome="finacti", slots=None, capacity=None, template="ZvZ", creator="42", hour=19):
    return {"ended_at": (NOW - timedelta(days=days_ago)).replace(hour=hour), "template": template, "creator_id": creator,
            "slots": slots if slots is not None else {"TANK": ["1"], "TANK · Main tank": ["2"], "DPS": ["3"]},
            "capacity": capacity if capacity is not None else {"TANK": 1, "TANK · Main tank": 1, "DPS": 3},
            "outcome": outcome}


def test_totals_fill_rate_and_missing_roles():
    stats = compute_activity_stats([row(), row(1), row(2, outcome="annulée")], {"1": "Bnkiller"}, "7d", NOW)
    t = stats["totals"]
    assert t["activities"] == 2 and t["cancelled"] == 1 and t["players"] == 3 and t["avg_players"] == 3.0
    assert t["fill_rate"] == 60                               # 3 inscrits / 5 places, sur les 2 actis jouées
    assert stats["missing_roles"] == [{"name": "DPS", "count": 4}]   # 2 places DPS vides × 2
    assert {"name": "Bnkiller", "count": 2} in stats["top_players"]     # pseudo IG à la place de l'id
    assert stats["top_templates"] == [{"name": "ZvZ", "count": 2}]


def test_two_tank_lines_are_read_as_tank():
    stats = compute_activity_stats([row(slots={"TANK": []}, capacity={"TANK": 1, "TANK · Main tank": 1})], {}, "7d", NOW)
    assert stats["missing_roles"] == [{"name": "TANK", "count": 2}]


def test_timeline_heatmap_and_period_filter():
    stats = compute_activity_stats([row(0), row(0, outcome="fin"), row(40)], {}, "30d", NOW)
    assert stats["bucket"] == "day" and len(stats["timeline"]) == 30
    assert stats["timeline"][-1] == {"start": "2026-10-08", "finacti": 1, "fin": 1, "annulée": 0}
    assert stats["totals"]["activities"] == 2                  # celle d'il y a 40 jours est hors période
    assert stats["heatmap"][3][21] == 2                        # jeudi 21h, heure de Paris


def test_empty_history():
    stats = compute_activity_stats([], {}, "week", NOW)
    assert stats["totals"] == {"activities": 0, "cancelled": 0, "players": 0, "avg_players": 0, "fill_rate": None}


def test_route_admin_only_and_scoped(login, fake_db):
    now = datetime.now(timezone.utc)
    fake_db.activity = [{**row(), "ended_at": now - timedelta(hours=1), "guild_id": GUILD},
                        {**row(), "ended_at": now - timedelta(hours=1), "guild_id": OTHER_GUILD}]
    assert login(MEMBER_ID).get(f"/api/guilds/{GUILD}/admin/activity").status_code == 403
    assert login(STAFF_ID).get(f"/api/guilds/{GUILD}/admin/activity").status_code == 403
    body = login(ADMIN_ID).get(f"/api/guilds/{GUILD}/admin/activity?period=7d").json()
    assert body["totals"]["activities"] == 1
    assert login(ADMIN_ID).get(f"/api/guilds/{GUILD}/admin/activity?period=1y").status_code == 422
