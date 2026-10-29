"""Routes « divers » d'un serveur : sa BAL, la liste des rôles, la page Admin."""
import asyncio
from datetime import datetime, UTC
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.bal_stats import (
    BAL_ACTIONS, bal_operation, bal_operations_csv, compute_bal_stats, fetch_since, guild_operations_csv,
    my_bal_history, search_players,
)
from app.activity_stats import compute_activity_stats
from app.constants import ROLES
from app.i18n import tr
from app.payouts import (
    GLOBAL_MODES, MAX_AMOUNT, WEEKS_BACK, adjustment_deltas, dm_text, effective_amounts, payout_view, plan_adjustment,
    week_bounds,
)
from app.permissions import require_admin, require_member

router = APIRouter(prefix="/guilds/{guild_id}", tags=["guild"])

# « week » = semaine en cours (depuis lundi, heure de Paris) ; les autres sont glissantes.
Period = Literal["week", "7d", "30d", "90d", "180d"]
BalAction = Literal[BAL_ACTIONS]
OPS_PAGE_SIZE = 25
ERRORS_PAGE_SIZE = 25
MAX_PAGE = 10_000


@router.get("/bal/me")
async def my_bal(guild_id: int, request: Request, user: dict = Depends(require_member)):
    db, user_id = request.app.state.db, int(user["id"])
    profile, amount = await asyncio.gather(db.get_profile(guild_id, user_id), db.get_bal(guild_id, user_id))
    return {"amount": amount, "ig_name": (profile or {}).get("ig_name", "")}


@router.get("/bal/me/history")
async def my_bal_history_route(guild_id: int, request: Request, period: Period = "30d",
                               user: dict = Depends(require_member)):
    """Page « Ma BAL » : courbe du solde, gains par période, dernières opérations, rang.
    Uniquement les données de l'utilisateur connecté."""
    db, user_id = request.app.state.db, int(user["id"])
    now = datetime.now(UTC)
    events, rank = await asyncio.gather(
        db.get_my_bal_events(guild_id, user_id, fetch_since(period, now, with_previous=False)),
        db.get_bal_rank(guild_id, user_id),
    )
    return my_bal_history(events, rank["amount"], rank["rank"], rank["players"], period, now)


def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content="\ufeff" + content,  # BOM : accents corrects dans Excel
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _operations_page(db, guild_id: int, user_id: int, action: str | None, page: int) -> dict:
    rows, total = await db.get_bal_operations(guild_id, user_id, action, OPS_PAGE_SIZE, (page - 1) * OPS_PAGE_SIZE)
    return {"items": [bal_operation(r) for r in rows], "total": total, "page": page, "page_size": OPS_PAGE_SIZE}


@router.get("/bal/me/operations")
async def my_bal_operations(guild_id: int, request: Request, action: BalAction | None = None,
                            page: int = Query(1, ge=1, le=MAX_PAGE), user: dict = Depends(require_member)):
    """Historique complet de la BAL de l'utilisateur connecté (paginé, filtrable par type)."""
    return await _operations_page(request.app.state.db, guild_id, int(user["id"]), action, page)


@router.get("/bal/me/operations.csv")
async def my_bal_operations_csv(guild_id: int, request: Request, action: BalAction | None = None,
                                user: dict = Depends(require_member)):
    """Export CSV de l'historique BAL de l'utilisateur connecté (uniquement ses lignes)."""
    rows, _ = await request.app.state.db.get_bal_operations(guild_id, int(user["id"]), action)
    return _csv_response(bal_operations_csv(rows), "ma-bal.csv")


@router.get("/roles")
async def roles(guild_id: int, user: dict = Depends(require_member)):
    return [{"name": name, "emoji": emoji} for name, emoji in sorted(ROLES.items())]


@router.get("/admin/overview")
async def admin_overview(guild_id: int, request: Request, user: dict = Depends(require_admin)):
    """Chiffres clés de la page Admin."""
    return await request.app.state.db.get_admin_overview(guild_id)


@router.get("/admin/bal")
async def admin_bal(guild_id: int, request: Request, period: Period = "30d",
                    user: dict = Depends(require_admin)):
    """Tableau de bord BAL de la page Admin (période + période précédente pour les variations)."""
    db = request.app.state.db
    now = datetime.now(UTC)
    events, balances = await asyncio.gather(
        db.get_bal_events(guild_id, fetch_since(period, now)), db.get_bal_balances(guild_id)
    )
    return compute_bal_stats(events, balances, period, now)


# ── Admin → BAL par joueur ────────────────────────────────────────────────────

PLAYER_ID = r"^[0-9]{1,20}$"  # id Discord


@router.get("/admin/bal/players")
async def admin_bal_players(guild_id: int, request: Request, q: str = Query("", max_length=100),
                            user: dict = Depends(require_admin)):
    """Joueurs de la BAL de ce serveur (soldes à 0 compris), filtrés par nom ou id Discord."""
    return search_players(await request.app.state.db.get_bal_players(guild_id), q)


@router.get("/admin/bal/players/{uid}/operations")
async def admin_player_operations(guild_id: int, request: Request, uid: str = Path(pattern=PLAYER_ID),
                                  action: BalAction | None = None, page: int = Query(1, ge=1, le=MAX_PAGE),
                                  user: dict = Depends(require_admin)):
    """Historique BAL complet d'un joueur de ce serveur."""
    return await _operations_page(request.app.state.db, guild_id, int(uid), action, page)


@router.get("/admin/bal/players/{uid}/operations.csv")
async def admin_player_operations_csv(guild_id: int, request: Request, uid: str = Path(pattern=PLAYER_ID),
                                      action: BalAction | None = None, user: dict = Depends(require_admin)):
    rows, _ = await request.app.state.db.get_bal_operations(guild_id, int(uid), action)
    return _csv_response(bal_operations_csv(rows), f"bal-{uid}.csv")


@router.get("/admin/bal/operations.csv")
async def admin_guild_operations_csv(guild_id: int, request: Request, period: Period = "30d",
                                     user: dict = Depends(require_admin)):
    """Tout le bal_log de la guilde sur la période (une ligne par joueur et par opération)."""
    since = fetch_since(period, datetime.now(UTC), with_previous=False)
    events = await request.app.state.db.get_bal_events(guild_id, since)
    return _csv_response(guild_operations_csv(events), f"bal-guilde-{period}.csv")


@router.get("/admin/activity")
async def admin_activity(guild_id: int, request: Request, period: Period = "30d",
                         user: dict = Depends(require_admin)):
    """Stats d'activité : actis par jour, remplissage, rôles qui manquent, joueurs et callers les plus présents."""
    db = request.app.state.db
    now = datetime.now(UTC)
    rows, names = await asyncio.gather(
        db.get_activity_log(guild_id, fetch_since(period, now, with_previous=False)), db.get_player_names(guild_id)
    )
    return compute_activity_stats(rows, names, period, now)


def _error_row(row: dict) -> dict:
    return {**row, "ts": row["ts"].isoformat(timespec="seconds")}


@router.get("/admin/errors")
async def admin_errors(guild_id: int, request: Request, command: str | None = Query(None, max_length=100),
                       page: int = Query(1, ge=1, le=MAX_PAGE), user: dict = Depends(require_admin)):
    """Erreurs du bot sur ce serveur (équivalent de /errors), sans traceback."""
    rows, total, commands = await request.app.state.db.get_error_logs(
        guild_id, command, ERRORS_PAGE_SIZE, (page - 1) * ERRORS_PAGE_SIZE
    )
    return {"items": [_error_row(r) for r in rows], "total": total, "page": page,
            "page_size": ERRORS_PAGE_SIZE, "commands": commands}


@router.get("/admin/errors/{error_id}")
async def admin_error(guild_id: int, error_id: int, request: Request, user: dict = Depends(require_admin)):
    """Détail d'une erreur avec son traceback — 404 si elle appartient à un autre serveur."""
    row = await request.app.state.db.get_error_log(guild_id, error_id)
    if not row:
        raise HTTPException(404, tr("error_not_found"))
    return _error_row(row)


# ── Admin → payouts de la semaine (correction, MP aux joueurs) ────────────────

class PayoutChange(BaseModel):
    uid: str = Field(pattern=PLAYER_ID)
    amount: int = Field(ge=0, le=MAX_AMOUNT)     # nouveau montant effectif (0 = joueur retiré)


class PayoutGlobal(BaseModel):
    mode: Literal[GLOBAL_MODES]
    amount: int = Field(ge=0, le=MAX_AMOUNT)


class PayoutAdjustIn(BaseModel):
    changes: list[PayoutChange] = Field(default=[], max_length=100)
    global_change: PayoutGlobal | None = None


def _member_name(member: dict, uid: str) -> str:
    user = member.get("user") or {}
    return member.get("nick") or user.get("global_name") or user.get("username") or uid


@router.get("/admin/payouts")
async def admin_payouts(guild_id: int, request: Request, week: int = Query(0, ge=-WEEKS_BACK, le=0),
                        user: dict = Depends(require_admin)):
    """Payouts (finacti / paybal) de la semaine en cours ou de la précédente, ajustements fusionnés."""
    since, until = week_bounds(datetime.now(UTC), week)
    rows = await request.app.state.db.get_payouts(guild_id, since, until)
    return {"week": week, "start": since.isoformat(), "payouts": [payout_view(r, r["adjustments"]) for r in rows]}


@router.post("/admin/payouts/{log_id}/adjust")
async def admin_adjust_payout(guild_id: int, log_id: int, body: PayoutAdjustIn, request: Request,
                              user: dict = Depends(require_admin)):
    """Corrige un payout : ligne « ajustbal » liée, soldes mis à jour, MP à chaque joueur concerné."""
    db, discord = request.app.state.db, request.app.state.discord
    now = datetime.now(UTC)
    since, until = week_bounds(now, -WEEKS_BACK)[0], week_bounds(now, 0)[1]
    rows = await db.get_payouts(guild_id, since, until, log_id)
    if not rows:
        raise HTTPException(404, tr("payout_not_found"))
    row = rows[0]
    players = effective_amounts(row["entries"], row["adjustments"])
    current = {uid: p["amount"] for uid, p in players.items()}
    glob = (body.global_change.mode, body.global_change.amount) if body.global_change else None
    deltas = adjustment_deltas(current, plan_adjustment(current, {c.uid: c.amount for c in body.changes}, glob))
    if not deltas:
        raise HTTPException(422, tr("payout_no_change"))

    names = {uid: p["name"] for uid, p in players.items()}
    for uid in deltas:
        if uid not in names:     # joueur ajouté : doit être sur le serveur
            member = await discord.get_member(guild_id, int(uid))
            if not member:
                raise HTTPException(422, tr("payout_not_member", uid=uid))
            names[uid] = _member_name(member, uid)

    applied = await db.apply_payout_adjustment(
        guild_id, log_id, row["template"], user["username"], [(uid, names[uid], d) for uid, d in deltas.items()],
        by_id=int(user["id"]),
    )
    sent, failed = 0, []
    for e in applied:            # en série : le token est partagé avec le bot (rate limit)
        if not e["delta"]:
            continue
        before = current.get(e["uid"], 0)
        text = dm_text(row["template"], row["ts"], user["username"], before, before + e["delta"], e["total"])
        if await discord.send_dm(e["uid"], text):
            sent += 1
        else:
            failed.append(e["name"])
    updated = (await db.get_payouts(guild_id, since, until, log_id))[0]
    return {"payout": payout_view(updated, updated["adjustments"]), "dm_sent": sent, "dm_failed": failed}
