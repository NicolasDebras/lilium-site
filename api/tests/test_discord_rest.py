import pytest

from app.discord_rest import DiscordRest, DiscordUnavailable


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def make(responses):
    calls = []

    async def fetcher(path):
        calls.append(path)
        return responses[path]

    clock = Clock()
    return DiscordRest("tok", ttl=60, fetcher=fetcher, clock=clock), calls, clock


async def test_member_is_cached_for_ttl():
    rest, calls, clock = make({"/guilds/1/members/2": (200, {"roles": ["9"]})})
    assert await rest.get_member(1, 2) == {"roles": ["9"]}
    clock.now = 59
    assert await rest.get_member(1, 2) == {"roles": ["9"]}
    assert len(calls) == 1


async def test_cache_expires_after_ttl():
    rest, calls, clock = make({"/guilds/1/members/2": (200, {"roles": []})})
    await rest.get_member(1, 2)
    clock.now = 61
    await rest.get_member(1, 2)
    assert len(calls) == 2


async def test_404_means_not_member_and_is_cached():
    rest, calls, _ = make({"/guilds/1/members/2": (404, None)})
    assert await rest.get_member(1, 2) is None
    assert await rest.get_member(1, 2) is None
    assert len(calls) == 1


async def test_5xx_raises_unavailable_and_is_not_cached():
    rest, calls, _ = make({"/guilds/1/members/2": (502, None)})
    with pytest.raises(DiscordUnavailable):
        await rest.get_member(1, 2)
    with pytest.raises(DiscordUnavailable):
        await rest.get_member(1, 2)
    assert len(calls) == 2


async def test_rate_limit_is_unavailable_not_forbidden():
    rest, _, _ = make({"/guilds/1": (429, None)})
    with pytest.raises(DiscordUnavailable):
        await rest.get_guild(1)


def poster_for(script):
    """Faux POST : (path → réponses successives) ; enregistre les appels."""
    calls = []

    async def poster(path, payload):
        calls.append((path, payload))
        return script[path].pop(0)

    return poster, calls


async def test_send_dm_opens_channel_then_posts_without_mentions():
    rest = DiscordRest("tok")
    poster, calls = poster_for({"/users/@me/channels": [(200, {"id": "77"})],
                                "/channels/77/messages": [(200, {})]})
    assert await rest.send_dm(5, "salut @everyone", poster=poster) is True
    assert calls[0] == ("/users/@me/channels", {"recipient_id": "5"})
    assert calls[1][1] == {"content": "salut @everyone", "allowed_mentions": {"parse": []}}


async def test_send_dm_retries_once_after_rate_limit(monkeypatch):
    import app.discord_rest as mod
    waits = []

    async def no_sleep(s):
        waits.append(s)
    monkeypatch.setattr(mod.asyncio, "sleep", no_sleep)
    rest = DiscordRest("tok")
    poster, _ = poster_for({"/users/@me/channels": [(429, {"retry_after": 0.4}), (200, {"id": "1"})],
                            "/channels/1/messages": [(429, {"retry_after": 30}), (429, {})]})
    assert await rest.send_dm(5, "x", poster=poster) is False     # 2ᵉ 429 : abandon
    assert waits == [0.4, 5.0]                                     # attente bornée à 5 s


async def test_send_dm_closed_dms_or_discord_down():
    rest = DiscordRest("tok")
    poster, _ = poster_for({"/users/@me/channels": [(403, {"code": 50007})]})
    assert await rest.send_dm(5, "x", poster=poster) is False

    async def down(path, payload):
        raise DiscordUnavailable("réseau")
    assert await rest.send_dm(5, "x", poster=down) is False
