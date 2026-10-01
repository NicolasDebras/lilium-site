from datetime import datetime, timezone

from app.bal_stats import NO_TEMPLATE, TOP_PLAYERS, compute_bal_stats

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)   # jeudi


def ev(id, day, action, delta, template="", uid="1", hour=12):
    return {"id": id, "ts": datetime(2026, 9, day, hour, 0, tzinfo=timezone.utc), "action": action,
            "template": template, "uid": uid, "name": f"J{uid}", "delta": delta}


BALANCES = [{"uid": "1", "name": "Alice", "amount": 700}, {"uid": "2", "name": "Bob", "amount": 300}]
EVENTS = [
    ev(1, 25, "finacti", 400, "STATIK", uid="1"), ev(1, 25, "finacti", 400, "STATIK", uid="2"),
    ev(2, 26, "finacti", 100, "", uid="1"),
    ev(3, 27, "addbal", 50),
    ev(4, 28, "retirebal", -150, uid="2"),
    ev(5, 29, "transferbal", -20, uid="1"), ev(5, 29, "transferbal", 20, uid="2"),
]


def test_totals():
    s = compute_bal_stats(EVENTS, BALANCES, 30, NOW)
    assert s["totals"] == {"due": 1000, "players": 2, "credited": 950, "withdrawn": 150, "activities": 2}


def test_transfers_are_neither_credit_nor_withdrawal():
    s = compute_bal_stats([ev(5, 29, "transferbal", -20), ev(5, 29, "transferbal", 20, uid="2")], BALANCES, 30, NOW)
    assert s["totals"]["credited"] == 0 and s["totals"]["withdrawn"] == 0


def test_daily_flow_covers_whole_period_including_empty_days():
    s = compute_bal_stats(EVENTS, BALANCES, 30, NOW)
    assert s["bucket"] == "day"
    assert len(s["flow"]) == 30
    assert s["flow"][-1]["start"] == "2026-10-01"
    by_day = {f["start"]: f for f in s["flow"]}
    assert by_day["2026-09-25"] == {"start": "2026-09-25", "credited": 800, "withdrawn": 0}
    assert by_day["2026-09-28"]["withdrawn"] == 150
    assert by_day["2026-09-30"] == {"start": "2026-09-30", "credited": 0, "withdrawn": 0}


def test_weekly_flow_for_long_periods_starts_on_monday():
    s = compute_bal_stats(EVENTS, BALANCES, 90, NOW)
    assert s["bucket"] == "week"
    starts = [datetime.fromisoformat(f["start"]).weekday() for f in s["flow"]]
    assert set(starts) == {0}
    week = next(f for f in s["flow"] if f["start"] == "2026-09-21")   # lundi 21 → dimanche 27
    assert week["credited"] == 950
    assert next(f for f in s["flow"] if f["start"] == "2026-09-28")["withdrawn"] == 150


def test_due_is_rebuilt_backwards_from_current_total():
    s = compute_bal_stats(EVENTS, BALANCES, 30, NOW)
    due = {d["date"]: d["total"] for d in s["due"]}
    assert len(s["due"]) == 30
    assert due["2026-10-01"] == 1000
    assert due["2026-09-28"] == 1000 - 0 + 150 - 150   # fin du 28 : avant transfert (net 0)
    assert due["2026-09-27"] == 1150                   # avant le retrait du 28
    assert due["2026-09-24"] == 1150 - 50 - 100 - 800  # avant tout crédit = 200


def test_paris_day_boundary():
    """23h30 UTC le 25 = 1h30 le 26 à Paris : compté le 26."""
    s = compute_bal_stats([ev(9, 25, "addbal", 10, hour=23)], BALANCES, 30, NOW)
    by_day = {f["start"]: f["credited"] for f in s["flow"]}
    assert by_day["2026-09-26"] == 10 and by_day["2026-09-25"] == 0


def test_events_before_period_are_ignored():
    s = compute_bal_stats([ev(9, 1, "addbal", 10)], BALANCES, 7, NOW)
    assert s["totals"]["credited"] == 0
    assert s["due"][0]["total"] == 1000


def test_templates_ranked_by_silver_with_activity_count():
    s = compute_bal_stats(EVENTS, BALANCES, 30, NOW)
    assert s["by_template"] == [
        {"template": "STATIK", "silver": 800, "activities": 1},
        {"template": NO_TEMPLATE, "silver": 100, "activities": 1},
    ]


def test_top_players_limited():
    balances = [{"uid": str(i), "name": f"P{i}", "amount": 100 - i} for i in range(15)]
    s = compute_bal_stats([], balances, 30, NOW)
    assert len(s["top_players"]) == TOP_PLAYERS
    assert s["top_players"][0] == {"name": "P0", "amount": 100}
