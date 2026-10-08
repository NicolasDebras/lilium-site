"""Routes « divers » d'un serveur : sa BAL, la liste des rôles, la page Admin."""
import asyncio
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Request

from app.bal_stats import compute_bal_stats, fetch_since, my_bal_history
from app.constants import ROLES
from app.permissions import require_admin, require_member

router = APIRouter(prefix="/guilds/{guild_id}", tags=["guild"])

# « week » = semaine en cours (depuis lundi, heure de Paris) ; les autres sont glissantes.
Period = Literal["week", "7d", "30d", "90d", "180d"]


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
    now = datetime.now(timezone.utc)
    events, rank = await asyncio.gather(
        db.get_my_bal_events(guild_id, user_id, fetch_since(period, now, with_previous=False)),
        db.get_bal_rank(guild_id, user_id),
    )
    return my_bal_history(events, rank["amount"], rank["rank"], rank["players"], period, now)


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
    now = datetime.now(timezone.utc)
    events, balances = await asyncio.gather(
        db.get_bal_events(guild_id, fetch_since(period, now)), db.get_bal_balances(guild_id)
    )
    return compute_bal_stats(events, balances, period, now)
