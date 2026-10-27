"""Payouts de la semaine (panel Admin) — logique pure, sans I/O.

Un payout = une ligne `finacti` ou `paybal` du bal_log (écrite par le bot). L'admin peut le corriger
depuis le site : ajouter ou retirer un joueur, changer le montant d'un joueur, ou tout le payout
(nouveau total réparti au prorata, ou même montant pour tous). L'original n'est jamais réécrit :
chaque correction est une ligne `ajustbal` liée au payout par `ref_id`. Le montant « effectif »
d'un joueur = son delta d'origine + ses ajustements.
"""
from collections import Counter
from datetime import datetime, time, timedelta, UTC

from app.bal_stats import PARIS

PAYOUT_ACTIONS = ("finacti", "paybal")
ADJUST_ACTION = "ajustbal"
WEEKS_BACK = 1                 # semaine en cours (0) et la précédente (-1)
MAX_AMOUNT = 100_000_000_000   # 100 milliards : garde-fou contre une faute de frappe
GLOBAL_MODES = ("total", "per_player")


def fmt_silver(n: int) -> str:
    """Comme le bot : espaces comme séparateur de milliers."""
    return f"{n:,}".replace(",", " ")


def week_bounds(now: datetime, week: int = 0) -> tuple[datetime, datetime]:
    """[lundi 00:00, lundi suivant 00:00[ heure de Paris, en UTC ; week = 0 (en cours) ou -1."""
    today = now.astimezone(PARIS).date()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=week)
    start = datetime.combine(monday, time.min, tzinfo=PARIS)
    end = datetime.combine(monday + timedelta(weeks=1), time.min, tzinfo=PARIS)
    return start.astimezone(UTC), end.astimezone(UTC)


def effective_amounts(entries: list[dict], adjustments: list[list[dict]]) -> dict[str, dict]:
    """{uid: {"name", "amount"}} : delta d'origine + ajustements, dans l'ordre d'origine
    (joueurs ajoutés ensuite à la fin). Dernier nom connu."""
    out: dict[str, dict] = {}
    for batch in [entries, *adjustments]:
        for e in batch or []:
            uid = str(e.get("uid") or "")
            if not uid:
                continue
            p = out.setdefault(uid, {"name": e.get("name") or uid, "amount": 0})
            p["amount"] += int(e.get("delta") or 0)
            p["name"] = e.get("name") or p["name"]
    return out


def _prorata(current: dict[str, int], total: int) -> dict[str, int]:
    """`total` réparti au prorata des montants actuels (parts par rôle conservées), à l'unité près :
    plus forts restes, la somme vaut exactement `total`. Tout à 0 : parts égales."""
    uids = list(current)
    weights = [max(0, current[u]) for u in uids]
    if not sum(weights):
        weights = [1] * len(uids)
    base = sum(weights)
    raw = [total * w / base for w in weights]
    shares = [int(r) for r in raw]
    order = sorted(range(len(uids)), key=lambda i: (-(raw[i] - shares[i]), i))
    for i in order[: total - sum(shares)]:
        shares[i] += 1
    return dict(zip(uids, shares))


def plan_adjustment(current: dict[str, int], changes: dict[str, int],
                    global_change: tuple[str, int] | None = None) -> dict[str, int]:
    """Nouveaux montants effectifs. Le changement global (si donné) s'applique d'abord aux joueurs
    payés (montant > 0), puis chaque changement individuel l'emporte (0 = joueur retiré)."""
    new = dict(current)
    if global_change:
        mode, amount = global_change
        paid = {u: a for u, a in current.items() if a > 0}
        if paid:
            new.update(_prorata(paid, amount) if mode == "total" else dict.fromkeys(paid, amount))
    new.update(changes)
    return new


def adjustment_deltas(current: dict[str, int], new: dict[str, int]) -> dict[str, int]:
    """{uid: delta} des joueurs dont le montant change."""
    return {u: new[u] - current.get(u, 0) for u in new if new[u] != current.get(u, 0)}


def original_shares(entries: list[dict]) -> dict[str, dict]:
    """{uid: {"role", "share", "inferred"}} du payout d'origine. Le bot écrit le rôle et les parts
    de chaque joueur depuis la 2026.10.27 ; avant, les parts sont déduites (inferred) du rapport au
    montant le plus fréquent (= 1 part), arrondi au centième. Scoot : montant fixe, sans parts."""
    deltas = [int(e.get("delta") or 0) for e in entries if int(e.get("delta") or 0) > 0]
    base = Counter(deltas).most_common(1)[0][0] if deltas else 0
    out: dict[str, dict] = {}
    for e in entries:
        uid = str(e.get("uid") or "")
        if not uid:
            continue
        role = e.get("role") or ""
        if role == "SCOOT":
            out[uid] = {"role": role, "share": None, "inferred": False}
        elif e.get("share") is not None:
            out[uid] = {"role": role, "share": float(e["share"]), "inferred": False}
        elif base:
            out[uid] = {"role": role, "share": round(int(e.get("delta") or 0) / base, 2), "inferred": True}
    return out


def payout_view(row: dict, adjustments: list[list[dict]]) -> dict:
    """Payout tel qu'affiché dans le panel : joueurs encore payés (montant > 0) avec leur rôle et leurs
    parts d'origine (absents pour un joueur ajouté depuis le site), et total effectif."""
    players = effective_amounts(row["entries"], adjustments)
    shares = original_shares(row["entries"])
    empty = {"role": "", "share": None, "inferred": False}
    paid = [{"uid": u, **p, **shares.get(u, empty)} for u, p in players.items() if p["amount"] > 0]
    return {
        "id": row["id"],
        "ts": row["ts"].isoformat(timespec="minutes"),
        "action": row["action"],
        "template": row.get("template") or "",
        "by_user": row.get("by_user") or "",
        "total": sum(p["amount"] for p in paid),
        "adjusted": bool(adjustments),
        "players": paid,
    }


def dm_text(template: str, ts: datetime, admin: str, before: int, after: int, balance: int) -> str:
    """MP envoyé à chaque joueur dont le payout change."""
    label = template or "activité"
    day = ts.astimezone(PARIS).strftime("%d/%m")
    diff = after - before
    sign = "+" if diff > 0 else "-"
    return (
        f"💰 Ton payout **{label}** du {day} a été modifié par **{admin}** : "
        f"{fmt_silver(before)} → **{fmt_silver(after)}** ({sign}{fmt_silver(abs(diff))}).\n"
        f"Nouveau solde BAL : **{fmt_silver(balance)}**."
    )
