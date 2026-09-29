"""Niveaux d'accès au site, par serveur :

    none   < member < staff < admin

- member : a un profil (/register) sur ce serveur ET y est toujours membre
- staff  : member + rôle configuré via /config → 🌐 Rôle staff du site web
- admin  : member + nommé via /webadmin (table web_admins) — inclut les droits staff
"""
from enum import IntEnum

from fastapi import Depends, HTTPException, Request

from app.auth import require_user


class Level(IntEnum):
    NONE = 0
    MEMBER = 1
    STAFF = 2
    ADMIN = 3

    @property
    def label(self) -> str:
        return self.name.lower()


def compute_level(*, has_profile: bool, member: dict | None, staff_role_id: int | None, is_admin: bool) -> Level:
    """Logique pure (testée unitairement) — aucune I/O."""
    if not has_profile or member is None:
        return Level.NONE
    if is_admin:
        return Level.ADMIN
    if staff_role_id and str(staff_role_id) in member.get("roles", []):
        return Level.STAFF
    return Level.MEMBER


async def access_level(db, discord, guild_id: int, user_id: int) -> Level:
    if not await db.has_profile(guild_id, user_id):
        return Level.NONE
    member = await discord.get_member(guild_id, user_id)
    if member is None:
        return Level.NONE
    return compute_level(
        has_profile=True,
        member=member,
        staff_role_id=await db.get_web_staff_role(guild_id),
        is_admin=await db.is_web_admin(guild_id, user_id),
    )


def _require(minimum: Level):
    async def dependency(guild_id: int, request: Request, user: dict = Depends(require_user)) -> dict:
        level = await access_level(request.app.state.db, request.app.state.discord, guild_id, int(user["id"]))
        if level < minimum:
            detail = {
                Level.MEMBER: "Tu n'es pas membre de ce serveur (ou tu n'as pas fait /register).",
                Level.STAFF:  "Réservé au staff du site (rôle configuré via /config).",
                Level.ADMIN:  "Réservé aux admins du site (/webadmin).",
            }[minimum]
            raise HTTPException(status_code=403, detail=detail)
        return {**user, "level": level}
    return dependency


require_member = _require(Level.MEMBER)
require_staff  = _require(Level.STAFF)
require_admin  = _require(Level.ADMIN)
