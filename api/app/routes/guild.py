"""Routes « divers » d'un serveur : sa BAL, la liste des rôles, la page Admin."""
from fastapi import APIRouter, Depends, Request

from app.constants import ROLES
from app.permissions import require_admin, require_member

router = APIRouter(prefix="/guilds/{guild_id}", tags=["guild"])


@router.get("/bal/me")
async def my_bal(guild_id: int, request: Request, user: dict = Depends(require_member)):
    db = request.app.state.db
    profile = await db.get_profile(guild_id, int(user["id"]))
    return {
        "amount":  await db.get_bal(guild_id, int(user["id"])),
        "ig_name": (profile or {}).get("ig_name", ""),
    }


@router.get("/roles")
async def roles(guild_id: int, user: dict = Depends(require_member)):
    return [{"name": name, "emoji": emoji} for name, emoji in sorted(ROLES.items())]


@router.get("/admin/overview")
async def admin_overview(guild_id: int, request: Request, user: dict = Depends(require_admin)):
    """Stats de la page Admin — point de départ, à enrichir au fil des besoins."""
    return await request.app.state.db.get_admin_overview(guild_id)
