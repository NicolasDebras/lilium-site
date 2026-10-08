from datetime import date, datetime, timezone

import pytest

from app.bal_stats import (
    NO_TEMPLATE, PARIS, TOP_PLAYERS, compute_bal_stats, fetch_since, my_bal_history, period_bounds,
    previous_bounds,
)

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)   # jeudi 1er octobre


def ev(id, day, action, delta, template="", uid="1", hour=12, by="Chef", month=9):
    return {"id": id, "ts": datetime(2026, month, day, hour, 0, tzinfo=timezone.utc), "action": action,
            "template": template, "uid": uid, "name": f"J{uid}", "delta": delta, "by_user": by}


BALANCES = [{"uid": "1", "name": "Alice", "amount": 700}, {"uid": "2", "name": "Bob", "amount": 300}]
EVENTS = [
    ev(1, 25, "finacti", 400, "STATIK", uid="1"), ev(1, 25, "finacti", 400, "STATIK", uid="2"),
    ev(2, 26, "finacti", 100, "", uid="1", by="Cal"),
    ev(3, 27, "addbal", 50),
    ev(4, 28, "retirebal", -150, uid="2"),
    ev(5, 29, "transferbal", -20, uid="1"), ev(5, 29, "transferbal", 20, uid="2"),
]


# ── Périodes ─────────────────────────────────────────────────────────────────

def test_period_bounds():
    assert period_bounds("7d", NOW) == (date(2026, 9, 25), date(2026, 10, 1), 7)
    assert period_bounds("30d", NOW) == (date(2026, 9, 2), date(2026, 10, 1), 30)
    assert period_bounds("week", NOW) == (date(2026, 9, 28), date(2026, 10, 1), 4)   # depuis lundi


def test_week_uses_paris_time_on_sunday_night():
    """Dimanche 23h30 UTC = lundi 1h30 à Paris : c'est déjà la nouvelle semaine."""
    sunday_night = datetime(2026, 10, 4, 23, 30, tzinfo=timezone.utc)
    assert period_bounds("week", sunday_night) == (date(2026, 10, 5), date(2026, 10, 5), 1)


def test_previous_bounds():
    assert previous_bounds("30d", date(2026, 9, 2), 30) == (date(2026, 8, 3), date(2026, 9, 1))
    # semaine : les mêmes jours (lundi → jeudi) de la semaine d'avant
    assert previous_bounds("week", date(2026, 9, 28), 4) == (date(2026, 9, 21), date(2026, 9, 24))


def test_fetch_since_covers_previous_period_with_margin():
    since = fetch_since("7d", NOW)
    assert since.tzinfo == PARIS and since.date() == date(2026, 9, 17)
    assert fetch_since("7d", NOW, with_previous=False).date() == date(2026, 9, 24)


# ── Tableau de bord Admin ────────────────────────────────────────────────────

def test_totals_and_averages():
    s = compute_bal_stats(EVENTS, BALANCES, "30d", NOW)
    t = s["totals"]
    assert (t["due"], t["players"], t["credited"], t["withdrawn"], t["activities"]) == (1000, 2, 950, 150, 2)
    assert t["avg_per_activity"] == 450           # (800 + 100) / 2 actis
    assert t["avg_players_per_activity"] == 1.5   # (2 + 1) / 2


def test_transfers_are_neither_credit_nor_withdrawal():
    s = compute_bal_stats([ev(5, 29, "transferbal", -20), ev(5, 29, "transferbal", 20, uid="2")], BALANCES, "30d", NOW)
    assert s["totals"]["credited"] == 0 and s["totals"]["withdrawn"] == 0


def test_previous_period_totals():
    events = EVENTS + [ev(9, 20, "finacti", 70), ev(10, 21, "retirebal", -30)]   # semaine d'avant (7d)
    s = compute_bal_stats(events, BALANCES, "7d", NOW)
    assert s["previous"] == {"credited": 70, "withdrawn": 30, "activities": 1}
    assert s["totals"]["credited"] == 950   # la période précédente n'est pas comptée


def test_week_period():
    s = compute_bal_stats(EVENTS, BALANCES, "week", NOW)   # lundi 28 → jeudi 1er
    assert (s["period"], s["days"], s["start"], s["bucket"]) == ("week", 4, "2026-09-28", "day")
    assert [f["start"] for f in s["flow"]] == ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]
    assert s["totals"]["credited"] == 0 and s["totals"]["withdrawn"] == 150
    # précédente = lundi 21 → jeudi 24 : rien
    assert s["previous"] == {"credited": 0, "withdrawn": 0, "activities": 0}


def test_daily_flow_covers_whole_period_including_empty_days():
    s = compute_bal_stats(EVENTS, BALANCES, "30d", NOW)
    assert s["bucket"] == "day" and len(s["flow"]) == 30
    by_day = {f["start"]: f for f in s["flow"]}
    assert by_day["2026-09-25"] == {"start": "2026-09-25", "credited": 800, "withdrawn": 0}
    assert by_day["2026-09-28"]["withdrawn"] == 150
    assert by_day["2026-09-30"] == {"start": "2026-09-30", "credited": 0, "withdrawn": 0}


def test_weekly_flow_for_long_periods_starts_on_monday():
    s = compute_bal_stats(EVENTS, BALANCES, "90d", NOW)
    assert s["bucket"] == "week"
    assert {datetime.fromisoformat(f["start"]).weekday() for f in s["flow"]} == {0}
    assert next(f for f in s["flow"] if f["start"] == "2026-09-21")["credited"] == 950


def test_due_is_rebuilt_backwards_from_current_total():
    due = {d["date"]: d["total"] for d in compute_bal_stats(EVENTS, BALANCES, "30d", NOW)["due"]}
    assert due["2026-10-01"] == 1000
    assert due["2026-09-27"] == 1150                   # avant le retrait du 28
    assert due["2026-09-24"] == 1150 - 50 - 100 - 800  # avant tout crédit


def test_paris_day_boundary():
    s = compute_bal_stats([ev(9, 25, "addbal", 10, hour=23)], BALANCES, "30d", NOW)
    by_day = {f["start"]: f["credited"] for f in s["flow"]}
    assert by_day["2026-09-26"] == 10 and by_day["2026-09-25"] == 0


def test_templates_and_callers_ranked_by_silver():
    s = compute_bal_stats(EVENTS, BALANCES, "30d", NOW)
    assert s["by_template"] == [
        {"template": "STATIK", "silver": 800, "activities": 1},
        {"template": NO_TEMPLATE, "silver": 100, "activities": 1},
    ]
    assert s["top_callers"] == [
        {"name": "Chef", "silver": 800, "activities": 1},
        {"name": "Cal", "silver": 100, "activities": 1},
    ]


def test_top_earners_of_the_period():
    s = compute_bal_stats(EVENTS, BALANCES, "30d", NOW)
    assert s["top_earners"] == [{"name": "J1", "amount": 550}, {"name": "J2", "amount": 400}]


def test_heatmap_counts_activities_by_paris_weekday_and_hour():
    s = compute_bal_stats(EVENTS, BALANCES, "30d", NOW)
    heat = s["heatmap"]
    assert len(heat) == 7 and all(len(row) == 24 for row in heat)
    # 25/09 (vendredi) 12h UTC = 14h Paris, 2 joueurs mais 1 seule acti
    assert heat[4][14] == 1
    assert heat[5][14] == 1   # 26/09 samedi
    assert sum(map(sum, heat)) == 2


def test_top_players_limited():
    balances = [{"uid": str(i), "name": f"P{i}", "amount": 100 - i} for i in range(15)]
    s = compute_bal_stats([], balances, "30d", NOW)
    assert len(s["top_players"]) == TOP_PLAYERS and s["top_players"][0] == {"name": "P0", "amount": 100}
    assert s["totals"]["avg_per_activity"] == 0 and s["heatmap"][0][0] == 0


# ── Ma BAL ───────────────────────────────────────────────────────────────────

MINE = [
    ev(1, 25, "finacti", 400, "STATIK"),
    ev(2, 26, "finacti", 100),
    ev(4, 28, "retirebal", -150, by="Trésorier"),
    ev(6, 1, "addbal", 50, month=10, hour=8),
]


def test_my_history_curve_and_totals():
    h = my_bal_history(MINE, 700, 1, 2, "30d", NOW)
    assert (h["amount"], h["rank"], h["players"]) == (700, 1, 2)
    assert h["totals"] == {"credited": 550, "withdrawn": 150, "activities": 2}
    curve = {c["date"]: c["total"] for c in h["curve"]}
    # 700 aujourd'hui ; avant le +50 du 1er : 650 ; avant le −150 du 28 : 800 ; avant +100 et +400 : 300
    assert curve["2026-10-01"] == 700 and curve["2026-09-30"] == 650
    assert curve["2026-09-27"] == 800 and curve["2026-09-24"] == 300


def test_my_history_recent_ops_newest_first_in_paris_time():
    h = my_bal_history(MINE, 700, 1, 2, "30d", NOW)
    first = h["recent"][0]
    assert first["action"] == "addbal" and first["delta"] == 50
    assert first["ts"].startswith("2026-10-01T10:00")   # 8h UTC = 10h Paris
    assert [r["delta"] for r in h["recent"]] == [50, -150, 100, 400]
    assert h["recent"][1]["by"] == "Trésorier"


def test_my_history_week_period():
    h = my_bal_history(MINE, 700, None, 0, "week", NOW)
    assert h["days"] == 4 and h["rank"] is None
    assert h["totals"] == {"credited": 50, "withdrawn": 150, "activities": 0}


@pytest.mark.parametrize("period", ["week", "7d", "30d", "90d", "180d"])
def test_every_period_works(period):
    s = compute_bal_stats(EVENTS, BALANCES, period, NOW)
    assert s["period"] == period and s["flow"] and s["due"]


# ── Export CSV ───────────────────────────────────────────────────────────────

def test_bal_operations_csv_neutralises_formulas():
    from datetime import datetime, timezone
    from app.bal_stats import bal_operations_csv
    rows = [{"ts": datetime(2026, 10, 1, 18, 0, tzinfo=timezone.utc), "action": "finacti",
             "template": "=HYPERLINK(\"http://x\")", "by_user": "@Officier", "delta": -5, "total": 10}]
    lines = bal_operations_csv(rows).strip().split("\r\n")
    assert lines[1].split(";")[:2] == ["2026-10-01T20:00+02:00", "finacti"]
    assert "'=HYPERLINK" in lines[1] and "'@Officier" in lines[1]
    assert ";-5;10;" in lines[1]  # les nombres négatifs restent des nombres
