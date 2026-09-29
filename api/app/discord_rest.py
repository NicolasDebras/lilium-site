"""Appels REST Discord avec le token du bot.

L'API tourne dans un process séparé du bot : elle n'a pas son cache live, donc
elle vérifie l'appartenance et les rôles via GET /guilds/{g}/members/{u}.
Résultats gardés en cache mémoire (60 s par défaut) pour ne pas se faire
rate-limiter à chaque requête du site.
"""
import time
from typing import Awaitable, Callable

import aiohttp

API = "https://discord.com/api/v10"

# (status, json | None)
Fetcher = Callable[[str], Awaitable[tuple[int, dict | None]]]


class DiscordUnavailable(RuntimeError):
    """Discord ne répond pas correctement (5xx, rate limit, réseau) — ce n'est
    PAS « pas membre » : on ne doit pas refuser l'accès sur cette base."""


class DiscordRest:
    def __init__(self, bot_token: str, ttl: float = 60.0, fetcher: Fetcher | None = None,
                 clock: Callable[[], float] = time.monotonic):
        self._token = bot_token
        self._ttl = ttl
        self._fetch = fetcher or self._http_get
        self._clock = clock
        self._cache: dict[str, tuple[float, dict | None]] = {}

    async def _http_get(self, path: str) -> tuple[int, dict | None]:
        headers = {"Authorization": f"Bot {self._token}"}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(API + path, headers=headers) as resp:
                    body = await resp.json() if resp.status == 200 else None
                    return resp.status, body
        except aiohttp.ClientError as e:
            raise DiscordUnavailable(str(e)) from e

    async def _cached_get(self, path: str) -> dict | None:
        now = self._clock()
        hit = self._cache.get(path)
        if hit and now - hit[0] < self._ttl:
            return hit[1]

        status, body = await self._fetch(path)
        if status == 200:
            value = body
        elif status in (403, 404):
            value = None  # pas membre / serveur inconnu du bot
        else:
            raise DiscordUnavailable(f"Discord a répondu {status} sur {path}")

        self._cache[path] = (now, value)
        return value

    async def get_member(self, guild_id: int, user_id: int) -> dict | None:
        """Membre (dict avec "roles": [ids en str]) ou None s'il n'est pas sur le serveur."""
        return await self._cached_get(f"/guilds/{guild_id}/members/{user_id}")

    async def get_guild(self, guild_id: int) -> dict | None:
        return await self._cached_get(f"/guilds/{guild_id}")
