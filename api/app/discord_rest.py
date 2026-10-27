"""Appels REST Discord avec le token du bot.

L'API tourne dans un process séparé du bot : elle n'a pas son cache live, donc
elle vérifie l'appartenance et les rôles via GET /guilds/{g}/members/{u}.
Résultats gardés en cache mémoire (60 s par défaut) pour ne pas se faire
rate-limiter à chaque requête du site.
"""
import asyncio
import time
from collections.abc import Awaitable, Callable

import aiohttp

API = "https://discord.com/api/v10"
TIMEOUT = aiohttp.ClientTimeout(total=10)
CACHE_MAX = 10_000  # entrées : au-delà, les entrées expirées sont purgées

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
            async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
                async with session.get(API + path, headers=headers) as resp:
                    body = await resp.json() if resp.status == 200 else None
                    return resp.status, body
        except (TimeoutError, aiohttp.ClientError) as e:
            raise DiscordUnavailable(str(e) or type(e).__name__) from e

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

        if len(self._cache) >= CACHE_MAX:
            self._cache = {k: v for k, v in self._cache.items() if now - v[0] < self._ttl}
        self._cache[path] = (now, value)
        return value

    async def get_member(self, guild_id: int, user_id: int) -> dict | None:
        """Membre (dict avec "roles": [ids en str]) ou None s'il n'est pas sur le serveur."""
        return await self._cached_get(f"/guilds/{guild_id}/members/{user_id}")

    async def get_guild(self, guild_id: int) -> dict | None:
        return await self._cached_get(f"/guilds/{guild_id}")

    # ── Envoi de MP (ajustement d'un payout depuis le panel Admin) ───────────
    async def _http_post(self, path: str, payload: dict) -> tuple[int, dict | None]:
        headers = {"Authorization": f"Bot {self._token}"}
        try:
            async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
                async with session.post(API + path, headers=headers, json=payload) as resp:
                    body = await resp.json() if resp.content_type == "application/json" else None
                    return resp.status, body
        except (TimeoutError, aiohttp.ClientError) as e:
            raise DiscordUnavailable(str(e) or type(e).__name__) from e

    async def _post(self, path: str, payload: dict, poster=None) -> tuple[int, dict | None]:
        """POST ; sur 429, attend le `retry_after` de Discord (5 s max) et réessaie une fois."""
        post = poster or self._http_post
        status, body = await post(path, payload)
        if status == 429:
            await asyncio.sleep(min(5.0, float((body or {}).get("retry_after") or 1)))
            status, body = await post(path, payload)
        return status, body

    async def send_dm(self, user_id: int | str, content: str, poster=None) -> bool:
        """MP au joueur (avec le token du bot) ; False si ses MP sont fermés ou si Discord refuse.
        Mentions désactivées : le texte contient des noms de joueurs et de compos."""
        try:
            status, channel = await self._post("/users/@me/channels", {"recipient_id": str(user_id)}, poster)
            if status != 200 or not channel or "id" not in channel:
                return False
            status, _ = await self._post(f"/channels/{channel['id']}/messages",
                                         {"content": content[:2000], "allowed_mentions": {"parse": []}}, poster)
            return status == 200
        except DiscordUnavailable:
            return False
