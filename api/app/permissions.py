"""Niveaux d'accès au site, par serveur :

    none   < member < staff < admin

- member : a un profil (/register) sur ce serveur ET y est toujours membre
- staff  : member + rôle configuré via /config → 🌐 Rôle staff du site web
- admin  : member + nommé via /webadmin (table web_admins) — inclut les droits staff
"""
import asyncio
import time
from enum import IntEnum
from typing import Callable

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


class LevelCache:
    """Niveau d'accès mémorisé par (serveur, utilisateur) pendant `ttl` secondes.

    Chaque vérification coûte un aller-retour base (~300 ms en local vers
    Railway) : sans cache, chaque clic du site le repayait. Contrepartie : un
    /webadmin ou un changement de rôle met jusqu'à `ttl` secondes à s'appliquer.
    """

    def __init__(self, ttl: float = 60.0, clock: Callable[[], float] = time.monotonic):
        self._ttl = ttl
        self._clock = clock
        self._data: dict[tuple[int, int], tuple[float, Level]] = {}

    def get(self, guild_id: int, user_id: int) -> Level | None:
        hit = self._data.get((guild_id, user_id))
        if hit and self._clock() - hit[0] < self._ttl:
            return hit[1]
        return None

    def set(self, guild_id: int, user_id: int, level: Level) -> None:
        self._data[(guild_id, user_id)] = (self._clock(), level)


async def access_level(db, discord, guild_id: int, user_id: int, cache: LevelCache | None = None) -> Level:
    if cache and (cached := cache.get(guild_id, user_id)) is not None:
        return cached

    # Base et Discord interrogés en parallèle : une seule requête SQL pour
    # profil + rôle staff + admin, et l'appel Discord a son propre cache.
    info, member = await asyncio.gather(
        db.get_access_info(guild_id, user_id),
        discord.get_member(guild_id, user_id),
    )
    level = compute_level(
        has_profile=info["has_profile"],
        member=member,
        staff_role_id=info["staff_role_id"],
        is_admin=info["is_admin"],
    )
    if cache:
        cache.set(guild_id, user_id, level)
    return level


def _require(minimum: Level):
    async def dependency(guild_id: int, request: Request, user: dict = Depends(require_user)) -> dict:
        state = request.app.state
        level = await access_level(state.db, state.discord, guild_id, int(user["id"]), state.levels)
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
