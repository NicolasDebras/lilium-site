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
