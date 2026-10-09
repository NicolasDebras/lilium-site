"""Stats d'activité (page Admin) — fonctions pures, testables sans base.

Entrée : les lignes de `activity_log` (écrites par le bot à chaque fin d'activité : /finacti,
fin libre, annulation) avec les inscrits par rôle et les places prévues. Jours à l'heure de Paris,
mêmes périodes que la BAL (`bal_stats.PERIODS`). L'historique ne commence qu'au déploiement du bot.
"""
from datetime import date, datetime, timedelta

from app.bal_stats import PARIS, _local_day, bucket_start, period_bounds
from app.compos import base_role

TOP = 8
NO_TEMPLATE = "Sans compo"
OUTCOMES = ("finacti", "fin", "annulée")


def _role_label(key: str) -> str:
    """« PF2:TANK · Main tank » → « TANK » : les stats se lisent par rôle de base."""
    return base_role(key[4:] if key.startswith("PF2:") else key)


def compute_activity_stats(rows: list[dict], names: dict[str, str], period: str, now: datetime) -> dict:
    """`rows` = activity_log de la période ; `names` = {id Discord: pseudo} pour les classements."""
    first, today, days = period_bounds(period, now)
    bucket = "day" if days <= 31 else "week"
    rows = [r for r in rows if first <= _local_day(r["ended_at"]) <= today]

    timeline: dict[date, dict] = {}
    d = bucket_start(first, bucket)
    while d <= today:
        timeline[d] = {"start": d.isoformat(), **{o: 0 for o in OUTCOMES}}
        d += timedelta(days=7 if bucket == "week" else 1)

    heat = [[0] * 24 for _ in range(7)]
    players: dict[str, int] = {}
    callers: dict[str, int] = {}
    templates: dict[str, int] = {}
    missing: dict[str, int] = {}
    filled = capacity_total = 0

    for r in rows:
        slot = timeline.get(bucket_start(_local_day(r["ended_at"]), bucket))
        if slot is not None and r["outcome"] in OUTCOMES:
            slot[r["outcome"]] += 1
        if r["outcome"] == "annulée":
            continue   # une annulation ne compte ni dans le remplissage ni dans la présence
        local = r["ended_at"].astimezone(PARIS)
        heat[local.weekday()][local.hour] += 1
        slots = r.get("slots") or {}
        capacity = r.get("capacity") or {}
        for uids in slots.values():
            for uid in uids:
                players[uid] = players.get(uid, 0) + 1
        if r.get("creator_id"):
            callers[r["creator_id"]] = callers.get(r["creator_id"], 0) + 1
        name = r.get("template") or NO_TEMPLATE
        templates[name] = templates.get(name, 0) + 1
        for key, places in capacity.items():
            taken = len(slots.get(key, []))
            filled += min(taken, places)
            capacity_total += places
            if places > taken:
                label = _role_label(key)
                missing[label] = missing.get(label, 0) + (places - taken)

    played = [r for r in rows if r["outcome"] != "annulée"]

    def ranked(counts: dict[str, int], label=lambda k: k) -> list[dict]:
        top = sorted(counts.items(), key=lambda kv: (-kv[1], label(kv[0])))[:TOP]
        return [{"name": label(k), "count": v} for k, v in top]

    def named(uid: str) -> str:
        return names.get(uid) or uid

    return {
        "period": period,
        "days": days,
        "start": first.isoformat(),
        "bucket": bucket,
        "totals": {
            "activities": len(played),
            "cancelled": sum(1 for r in rows if r["outcome"] == "annulée"),
            "players": len(players),
            "avg_players": round(sum(len(u) for r in played for u in (r.get("slots") or {}).values()) / len(played), 1)
            if played else 0,
            "fill_rate": round(100 * filled / capacity_total) if capacity_total else None,
        },
        "timeline": list(timeline.values()),
        "heatmap": heat,
        "top_players": ranked(players, named),
        "top_callers": ranked(callers, named),
        "top_templates": ranked(templates),
        "missing_roles": ranked(missing),
    }
