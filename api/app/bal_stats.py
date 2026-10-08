"""Statistiques BAL (page Admin et page « Ma BAL ») — fonctions pures, testables sans base.

Entrées : les mouvements du bal_log (un par joueur et par opération) et les soldes actuels.
Le bot écrit dans bal_log à chaque /finacti, /paybal, /addbal, /retirebal, /transferbal
(historique conservé 6 mois). Les jours sont comptés à l'heure de Paris.
"""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")

CREDIT_ACTIONS = {"finacti", "paybal", "addbal"}     # silver gagné par les joueurs
WITHDRAW_ACTIONS = {"retirebal"}                       # BAL payée (sortie)
ACTIVITY_ACTIONS = {"finacti", "paybal"}               # fins d'activités (par compo)
TOP_PLAYERS = 10
TOP_TEMPLATES = 8
TOP_CALLERS = 8
RECENT_OPS = 15
NO_TEMPLATE = "Sans compo"

# Périodes proposées : « week » = semaine en cours (depuis lundi, comme le récap du bot).
PERIODS = ("week", "7d", "30d", "90d", "180d")
_PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90, "180d": 180}


def _local_day(ts: datetime) -> date:
    return ts.astimezone(PARIS).date()


def bucket_start(day: date, bucket: str) -> date:
    return day - timedelta(days=day.weekday()) if bucket == "week" else day


def period_bounds(period: str, now: datetime) -> tuple[date, date, int]:
    """(premier jour, aujourd'hui, nombre de jours) de la période, à l'heure de Paris."""
    today = _local_day(now)
    if period == "week":
        first = today - timedelta(days=today.weekday())
    else:
        first = today - timedelta(days=_PERIOD_DAYS[period] - 1)
    return first, today, (today - first).days + 1


def previous_bounds(period: str, first: date, days: int) -> tuple[date, date]:
    """Période précédente de même durée (semaine : les mêmes jours de la semaine d'avant)."""
    shift = 7 if period == "week" else days
    prev_first = first - timedelta(days=shift)
    return prev_first, prev_first + timedelta(days=days - 1)


def fetch_since(period: str, now: datetime, with_previous: bool = True) -> datetime:
    """Date (UTC) à partir de laquelle lire le bal_log : début de la période
    (ou de la période précédente), avec une marge d'un jour pour le fuseau."""
    first, _, days = period_bounds(period, now)
    if with_previous:
        first, _ = previous_bounds(period, first, days)
    return datetime.combine(first - timedelta(days=1), time.min, tzinfo=PARIS)


def _flow(events: list[dict], first: date, today: date, bucket: str) -> list[dict]:
    """Crédité / retiré par jour ou par semaine, toutes les périodes même vides."""
    flow: dict[date, dict] = {}
    d = bucket_start(first, bucket)
    while d <= today:
        flow[d] = {"start": d.isoformat(), "credited": 0, "withdrawn": 0}
        d += timedelta(days=7 if bucket == "week" else 1)
    for e in events:
        slot = flow.get(bucket_start(_local_day(e["ts"]), bucket))
        delta = int(e["delta"] or 0)
        if not slot:
            continue
        if e["action"] in CREDIT_ACTIONS and delta > 0:
            slot["credited"] += delta
        elif e["action"] in WITHDRAW_ACTIONS and delta < 0:
            slot["withdrawn"] += -delta
    return list(flow.values())


def _curve(total_now: int, events: list[dict], first: date, today: date) -> list[dict]:
    """Solde jour par jour (fin de journée), reconstitué à rebours depuis le solde actuel."""
    delta_by_day: dict[date, int] = {}
    for e in events:
        day = _local_day(e["ts"])
        delta_by_day[day] = delta_by_day.get(day, 0) + int(e["delta"] or 0)
    out, running, d = [], total_now, today
    while d >= first:
        out.append({"date": d.isoformat(), "total": running})
        running -= delta_by_day.get(d, 0)
        d -= timedelta(days=1)
    out.reverse()
    return out


def _totals(events: list[dict]) -> dict:
    credited = withdrawn = 0
    activities: set[int] = set()
    for e in events:
        delta = int(e["delta"] or 0)
        if e["action"] in CREDIT_ACTIONS and delta > 0:
            credited += delta
        elif e["action"] in WITHDRAW_ACTIONS and delta < 0:
            withdrawn += -delta
        if e["action"] in ACTIVITY_ACTIONS and delta > 0:
            activities.add(e["id"])
    return {"credited": credited, "withdrawn": withdrawn, "activities": len(activities)}


def _in(events: list[dict], first: date, last: date) -> list[dict]:
    return [e for e in events if first <= _local_day(e["ts"]) <= last]


def compute_bal_stats(events: list[dict], balances: list[dict], period: str, now: datetime) -> dict:
    """Tableau de bord BAL de la page Admin. `events` doit couvrir la période ET la précédente."""
    first, today, days = period_bounds(period, now)
    prev_first, prev_last = previous_bounds(period, first, days)
    bucket = "day" if days <= 31 else "week"
    current = _in(events, first, today)
    previous = _in(events, prev_first, prev_last)

    totals = _totals(current)
    activity_events = [e for e in current if e["action"] in ACTIVITY_ACTIONS and int(e["delta"] or 0) > 0]
    activity_ids = {e["id"] for e in activity_events}
    activity_silver = sum(int(e["delta"]) for e in activity_events)
    activity_seats = len({(e["id"], e["uid"]) for e in activity_events})

    # ── Par compo, par caller, par joueur, jour × heure ──────────────────────
    by_template: dict[str, dict] = {}
    callers: dict[str, dict] = {}
    heat_ids: dict[tuple[int, int], set] = {}
    for e in activity_events:
        t = by_template.setdefault(e["template"] or NO_TEMPLATE, {"silver": 0, "ids": set()})
        t["silver"] += int(e["delta"])
        t["ids"].add(e["id"])
        c = callers.setdefault(e.get("by_user") or "?", {"silver": 0, "ids": set()})
        c["silver"] += int(e["delta"])
        c["ids"].add(e["id"])
        local = e["ts"].astimezone(PARIS)
        heat_ids.setdefault((local.weekday(), local.hour), set()).add(e["id"])

    earners: dict[str, dict] = {}
    for e in current:
        delta = int(e["delta"] or 0)
        if e["action"] in CREDIT_ACTIONS and delta > 0:
            p = earners.setdefault(e["uid"], {"name": e.get("name") or e["uid"], "amount": 0})
            p["amount"] += delta
            p["name"] = e.get("name") or p["name"]   # événements triés par date : dernier nom connu

    heatmap = [[len(heat_ids.get((d, h), ())) for h in range(24)] for d in range(7)]
    total_due = sum(int(b["amount"]) for b in balances)

    def ranked(groups: dict, key: str, limit: int) -> list[dict]:
        rows = [{key: name, "silver": g["silver"], "activities": len(g["ids"])} for name, g in groups.items()]
        return sorted(rows, key=lambda r: (-r["silver"], r[key]))[:limit]

    return {
        "period": period,
        "days": days,
        "start": first.isoformat(),
        "bucket": bucket,
        "totals": {
            "due": total_due,
            "players": len(balances),
            **totals,
            "avg_per_activity": round(activity_silver / len(activity_ids)) if activity_ids else 0,
            "avg_players_per_activity": round(activity_seats / len(activity_ids), 1) if activity_ids else 0,
        },
        "previous": _totals(previous),
        "flow": _flow(current, first, today, bucket),
        "due": _curve(total_due, current, first, today),
        "top_players": [{"name": b["name"], "amount": int(b["amount"])} for b in balances[:TOP_PLAYERS]],
        "top_earners": sorted(earners.values(), key=lambda p: (-p["amount"], p["name"]))[:TOP_PLAYERS],
        "top_callers": ranked(callers, "name", TOP_CALLERS),
        "by_template": ranked(by_template, "template", TOP_TEMPLATES),
        "heatmap": heatmap,
    }


def my_bal_history(events: list[dict], amount: int, rank: int | None, players: int,
                   period: str, now: datetime) -> dict:
    """Page « Ma BAL » : les mouvements du joueur (déjà filtrés sur son id) sur la période."""
    first, today, days = period_bounds(period, now)
    bucket = "day" if days <= 31 else "week"
    current = _in(events, first, today)
    recent = sorted(current, key=lambda e: e["ts"], reverse=True)[:RECENT_OPS]
    return {
        "period": period,
        "days": days,
        "start": first.isoformat(),
        "bucket": bucket,
        "amount": amount,
        "rank": rank,
        "players": players,
        "totals": _totals(current),
        "flow": _flow(current, first, today, bucket),
        "curve": _curve(amount, current, first, today),
        "recent": [
            {
                "ts": e["ts"].astimezone(PARIS).isoformat(timespec="minutes"),
                "action": e["action"],
                "template": e["template"] or "",
                "delta": int(e["delta"] or 0),
                "by": e.get("by_user") or "",
            }
            for e in recent
        ],
    }
