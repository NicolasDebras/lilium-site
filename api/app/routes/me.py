import asyncio

from fastapi import APIRouter, Depends, Request

from app.auth import require_user
from app.discord_rest import DiscordUnavailable
from app.permissions import Level, access_level

router = APIRouter(tags=["me"])


def _guild_icon(guild: dict) -> str | None:
    if guild.get("icon"):
        return f"https://cdn.discordapp.com/icons/{guild['id']}/{guild['icon']}.png"
    return None


@router.get("/me")
async def me(request: Request, user: dict = Depends(require_user)):
    """Utilisateur connecté + serveurs où il a fait /register, avec son niveau
    d'accès sur chacun (seuls ceux où il est au moins membre sont renvoyés)."""
    db, discord = request.app.state.db, request.app.state.discord
    user_id = int(user["id"])

    async def describe(guild_id: int) -> dict | None:
        try:
            level = await access_level(db, discord, guild_id, user_id, request.app.state.levels)
            if level == Level.NONE:
                return None
            guild = await discord.get_guild(guild_id) or {}
        except DiscordUnavailable:
            return None
        return {
            "id":    str(guild_id),
            "name":  guild.get("name") or f"Serveur {guild_id}",
            "icon":  _guild_icon(guild),
            "level": level.label,
        }

    guild_ids = await db.get_user_guild_ids(user_id)
    guilds = [g for g in await asyncio.gather(*(describe(gid) for gid in guild_ids)) if g]
    return {"user": user, "guilds": guilds}
