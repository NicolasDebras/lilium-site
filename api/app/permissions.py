"""Niveaux d'accès au site, par serveur :

    none   < member < staff < admin

- member : a un profil (/register) sur ce serveur ET y est toujours membre
- staff  : member + rôle configuré via /config → 🌐 Rôle staff du site web
- admin  : member + nommé via /webadmin (table web_admins) — inclut les droits staff
"""
import time
from enum import IntEnum
from typing import Callable

from fastapi import Depends, HTTPException, Path, Request

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

    MAX_ENTRIES = 10_000

    def set(self, guild_id: int, user_id: int, level: Level) -> None:
        now = self._clock()
        if len(self._data) >= self.MAX_ENTRIES:  # purge des entrées expirées : pas de croissance sans fin
            self._data = {k: v for k, v in self._data.items() if now - v[0] < self._ttl}
        self._data[(guild_id, user_id)] = (now, level)


async def access_level(db, discord, guild_id: int, user_id: int, cache: LevelCache | None = None) -> Level:
    if cache and (cached := cache.get(guild_id, user_id)) is not None:
        return cached

    # Base d'abord (profil + rôle staff + admin en une requête) ; Discord seulement si le
    # joueur a un profil sur ce serveur. Sinon n'importe quel compte pourrait, avec des ids
    # de serveurs au hasard, faire consommer le quota du token du bot (partagé avec le bot).
    info = await db.get_access_info(guild_id, user_id)
    member = await discord.get_member(guild_id, user_id) if info["has_profile"] else None
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
    async def dependency(request: Request, guild_id: int = Path(gt=0, lt=2**63),
                         user: dict = Depends(require_user)) -> dict:
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
