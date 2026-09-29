from app.permissions import Level, LevelCache, access_level, compute_level
from tests.fakes import (
    ADMIN_ID, GHOST_ID, GUILD, MEMBER_ID, OTHER_GUILD, STAFF_ID, STAFF_ROLE, STRANGER_ID, FakeDB, FakeDiscord,
)


# ── compute_level (logique pure) ─────────────────────────────────────────────

def test_no_profile_is_none_even_if_on_server():
    assert compute_level(has_profile=False, member={"roles": []}, staff_role_id=None, is_admin=True) == Level.NONE


def test_profile_but_left_server_is_none():
    assert compute_level(has_profile=True, member=None, staff_role_id=None, is_admin=True) == Level.NONE


def test_plain_member():
    assert compute_level(has_profile=True, member={"roles": ["42"]}, staff_role_id=STAFF_ROLE,
                         is_admin=False) == Level.MEMBER


def test_staff_role_gives_staff():
    assert compute_level(has_profile=True, member={"roles": [str(STAFF_ROLE)]}, staff_role_id=STAFF_ROLE,
                         is_admin=False) == Level.STAFF


def test_no_staff_role_configured_means_nobody_is_staff():
    assert compute_level(has_profile=True, member={"roles": ["0"]}, staff_role_id=None,
                         is_admin=False) == Level.MEMBER


def test_admin_without_staff_role_is_admin():
    assert compute_level(has_profile=True, member={"roles": []}, staff_role_id=STAFF_ROLE,
                         is_admin=True) == Level.ADMIN


def test_levels_are_ordered():
    assert Level.NONE < Level.MEMBER < Level.STAFF < Level.ADMIN
    assert Level.ADMIN.label == "admin"


# ── access_level (avec faux db/discord) ──────────────────────────────────────

async def test_access_level_for_each_kind_of_user():
    db, discord = FakeDB(), FakeDiscord()
    assert await access_level(db, discord, GUILD, MEMBER_ID) == Level.MEMBER
    assert await access_level(db, discord, GUILD, STAFF_ID) == Level.STAFF
    assert await access_level(db, discord, GUILD, ADMIN_ID) == Level.ADMIN
    assert await access_level(db, discord, GUILD, GHOST_ID) == Level.NONE
    assert await access_level(db, discord, GUILD, STRANGER_ID) == Level.NONE
    assert await access_level(db, discord, OTHER_GUILD, ADMIN_ID) == Level.NONE


async def test_missing_web_admins_table_means_no_admin():
    db, discord = FakeDB(), FakeDiscord()
    db.admin_table_exists = False
    assert await access_level(db, discord, GUILD, ADMIN_ID) == Level.MEMBER


# ── LevelCache ───────────────────────────────────────────────────────────────

class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_level_cache_expires_after_ttl():
    clock = Clock()
    cache = LevelCache(ttl=60, clock=clock)
    cache.set(GUILD, MEMBER_ID, Level.STAFF)
    clock.now = 59
    assert cache.get(GUILD, MEMBER_ID) == Level.STAFF
    clock.now = 61
    assert cache.get(GUILD, MEMBER_ID) is None


def test_level_cache_is_per_guild_and_user():
    cache = LevelCache()
    cache.set(GUILD, MEMBER_ID, Level.ADMIN)
    assert cache.get(OTHER_GUILD, MEMBER_ID) is None
    assert cache.get(GUILD, STAFF_ID) is None


async def test_access_level_uses_one_db_query_then_cache():
    db, discord, cache = FakeDB(), FakeDiscord(), LevelCache()
    assert await access_level(db, discord, GUILD, ADMIN_ID, cache) == Level.ADMIN
    assert await access_level(db, discord, GUILD, ADMIN_ID, cache) == Level.ADMIN
    assert db.access_queries == 1


async def test_none_level_is_cached_too():
    db, discord, cache = FakeDB(), FakeDiscord(), LevelCache()
    await access_level(db, discord, GUILD, STRANGER_ID, cache)
    await access_level(db, discord, GUILD, STRANGER_ID, cache)
    assert db.access_queries == 1
