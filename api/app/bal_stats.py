"""Statistiques BAL de la page Admin — fonctions pures (testables sans base).

Entrées : les mouvements du bal_log sur la période (un par joueur et par opération)
et les soldes actuels. Le bot écrit dans bal_log à chaque /finacti, /paybal,
/addbal, /retirebal, /transferbal (historique conservé 6 mois).
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")

CREDIT_ACTIONS = {"finacti", "paybal", "addbal"}     # silver gagné par les joueurs
WITHDRAW_ACTIONS = {"retirebal"}                       # BAL payée (sortie)
ACTIVITY_ACTIONS = {"finacti", "paybal"}               # fins d'activités (par compo)
TOP_PLAYERS = 10
TOP_TEMPLATES = 8
NO_TEMPLATE = "Sans compo"


def _local_day(ts: datetime) -> date:
    return ts.astimezone(PARIS).date()


def bucket_start(day: date, bucket: str) -> date:
    return day - timedelta(days=day.weekday()) if bucket == "week" else day


def compute_bal_stats(events: list[dict], balances: list[dict], days: int, now: datetime) -> dict:
    today = _local_day(now)
    first_day = today - timedelta(days=days - 1)
    bucket = "day" if days <= 31 else "week"

    # ── Flux crédité / retiré par jour ou par semaine (toutes les périodes, même vides) ──
    flow: dict[date, dict] = {}
    d = bucket_start(first_day, bucket)
    while d <= today:
        flow[d] = {"start": d.isoformat(), "credited": 0, "withdrawn": 0}
        d += timedelta(days=7 if bucket == "week" else 1)

    credited = withdrawn = 0
    activities: set[int] = set()
    by_template: dict[str, dict] = {}
    delta_by_day: dict[date, int] = {}

    for e in events:
        day = _local_day(e["ts"])
        if day < first_day:
            continue
        delta = int(e["delta"] or 0)
        delta_by_day[day] = delta_by_day.get(day, 0) + delta
        slot = flow.get(bucket_start(day, bucket))
        if e["action"] in CREDIT_ACTIONS and delta > 0:
            credited += delta
            if slot:
                slot["credited"] += delta
        elif e["action"] in WITHDRAW_ACTIONS and delta < 0:
            withdrawn += -delta
            if slot:
                slot["withdrawn"] += -delta
        if e["action"] in ACTIVITY_ACTIONS and delta > 0:
            activities.add(e["id"])
            t = by_template.setdefault(e["template"] or NO_TEMPLATE, {"silver": 0, "ids": set()})
            t["silver"] += delta
            t["ids"].add(e["id"])

    # ── BAL due jour par jour, reconstituée à rebours depuis le total actuel ──
    total_due = sum(int(b["amount"]) for b in balances)
    due = []
    running = total_due
    d = today
    while d >= first_day:
        due.append({"date": d.isoformat(), "total": running})
        running -= delta_by_day.get(d, 0)
        d -= timedelta(days=1)
    due.reverse()

    templates = sorted(
        ({"template": name, "silver": t["silver"], "activities": len(t["ids"])} for name, t in by_template.items()),
        key=lambda t: t["silver"], reverse=True,
    )
    return {
        "days": days,
        "bucket": bucket,
        "totals": {
            "due": total_due,
            "players": len(balances),
            "credited": credited,
            "withdrawn": withdrawn,
            "activities": len(activities),
        },
        "flow": list(flow.values()),
        "due": due,
        "top_players": [{"name": b["name"], "amount": int(b["amount"])} for b in balances[:TOP_PLAYERS]],
        "by_template": templates[:TOP_TEMPLATES],
    }
