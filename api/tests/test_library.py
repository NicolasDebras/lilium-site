"""Bibliothèque de compos : moteur de copie (pur) + routes copie / publication / import / retrait."""
import pytest

from app import images
from app.compos import InvalidCompo
from app.library import plan_builds, rebuild_template, snapshot
from tests.fakes import ADMIN_ID, GUILD, MEMBER_ID, OTHER_GUILD, STAFF_ID, STAFF_ROLE

TANK = {"id": 1, "name": "Tank Masse", "role": "TANK", "type_acti": "PVP", "weapon": "", "notes": "", "image": "",
        "items": {"mainhand": ["MAIN_MACE"]}}
TEMPLATE = {"description": "", "type_acti": "PVP", "image": "",
            "pf_1": {"TANK": 2, "DPS": 3}, "weapon": {"TANK": "Tank Masse", "DPS": "Arc"}, "builds": {"TANK": 1}}


# ── Logique pure ─────────────────────────────────────────────────────────────

def test_snapshot_keeps_only_used_existing_builds():
    snap = snapshot({**TEMPLATE, "builds": {"TANK": 1, "DPS": 99}}, {1: TANK})
    assert list(snap["builds"]) == ["1"] and "id" not in snap["builds"]["1"]


def test_plan_reuses_identical_build_and_creates_others():
    snap = snapshot(TEMPLATE, {1: TANK})
    assert plan_builds(snap, [{**TANK, "id": 50, "name": "tank masse"}]) == ({"1": 50}, [])
    reuse, create = plan_builds(snap, [{**TANK, "id": 50, "items": {}}])
    assert reuse == {} and [old for old, _ in create] == ["1"]


def test_rebuild_remaps_ids_and_turns_missing_builds_into_free_rows():
    snap = snapshot(TEMPLATE, {1: TANK})
    entry = rebuild_template(snap, "ZvZ", {"1": 7}, {7: {**TANK, "id": 7}})
    assert entry["builds"] == {"TANK": 7} and entry["pf_1"] == {"TANK": 2, "DPS": 3}
    assert entry["weapon"]["DPS"] == "Arc"


def test_rebuild_revalidates_bot_templates():
    bad = {**TEMPLATE, "pf_1": {"TANK": 999}}
    with pytest.raises(InvalidCompo):
        rebuild_template(snapshot(bad, {1: TANK}), "X", {"1": 7}, {7: {**TANK, "id": 7}})


# ── Routes ───────────────────────────────────────────────────────────────────

@pytest.fixture
def two_guilds(fake_db, fake_discord):
    """STAFF_ID est staff des deux serveurs ; une compo « ZvZ » avec un build existe dans GUILD."""
    fake_db.profiles.add((OTHER_GUILD, STAFF_ID))
    fake_db.staff_roles[OTHER_GUILD] = STAFF_ROLE
    fake_discord.members[(OTHER_GUILD, STAFF_ID)] = {"roles": [str(STAFF_ROLE)]}
    fake_db.builds[1] = {**TANK, "guild_id": GUILD, "created_by": "2", "created_by_name": "Lily"}
    fake_db._next_id = 2
    fake_db.templates[GUILD] = {"ZvZ": TEMPLATE}
    return fake_db


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    async def fake_fetch(items, extra_ids=None):
        return {}
    monkeypatch.setattr(images, "fetch_icons", fake_fetch)


def test_copy_to_another_guild_recreates_builds(login, two_guilds):
    r = login(STAFF_ID).post(f"/api/guilds/{OTHER_GUILD}/compos/import",
                             json={"source_guild_id": GUILD, "name": "ZvZ", "new_name": "ZvZ copie"})
    assert r.status_code == 201 and r.json() == {"name": "ZvZ copie"}
    copied = two_guilds.templates[OTHER_GUILD]["ZvZ copie"]
    new_id = copied["builds"]["TANK"]
    assert new_id != 1 and two_guilds.builds[new_id]["guild_id"] == OTHER_GUILD


def test_copy_requires_staff_on_source(login, two_guilds):
    two_guilds.staff_roles.pop(GUILD)   # plus staff du serveur d'origine
    r = login(STAFF_ID).post(f"/api/guilds/{OTHER_GUILD}/compos/import", json={"source_guild_id": GUILD, "name": "ZvZ"})
    assert r.status_code == 403


def test_copy_name_conflict_and_bad_name(login, two_guilds):
    c = login(STAFF_ID)
    assert c.post(f"/api/guilds/{GUILD}/compos/import", json={"source_guild_id": GUILD, "name": "ZvZ"}).status_code == 409
    bad = {"source_guild_id": GUILD, "name": "ZvZ", "new_name": "a/b"}
    assert c.post(f"/api/guilds/{OTHER_GUILD}/compos/import", json=bad).status_code == 422


def test_publish_list_image_import_and_count(login, two_guilds):
    c = login(STAFF_ID)
    pid = c.post(f"/api/guilds/{GUILD}/compos/ZvZ/publish").json()["id"]
    listing = c.get("/api/public/compos").json()
    assert listing["total"] == 1 and listing["items"][0]["total"] == 5 and listing["items"][0]["builds"] == 1
    assert c.get(f"/api/public/compos/{pid}/image.png").headers["content-type"] == "image/png"
    r = c.post(f"/api/guilds/{OTHER_GUILD}/compos/import-public", json={"public_id": pid})
    assert r.status_code == 201 and "ZvZ" in two_guilds.templates[OTHER_GUILD]
    assert two_guilds.public[pid]["imports"] == 1


def test_public_list_needs_no_login(client, fake_db):
    assert client.get("/api/public/compos").status_code == 200
    assert client.get("/api/public/compos/9").status_code == 404


def test_publish_is_staff_only_and_capped(login, two_guilds, monkeypatch):
    from app.routes import library
    assert login(MEMBER_ID).post(f"/api/guilds/{GUILD}/compos/ZvZ/publish").status_code == 403
    monkeypatch.setattr(library, "MAX_PUBLIC_PER_GUILD", 1)
    c = login(STAFF_ID)
    assert c.post(f"/api/guilds/{GUILD}/compos/ZvZ/publish").status_code == 201
    assert c.post(f"/api/guilds/{GUILD}/compos/ZvZ/publish").status_code == 409


def test_delete_public_by_author_admin_or_owner_only(login, two_guilds):
    pid = login(STAFF_ID).post(f"/api/guilds/{GUILD}/compos/ZvZ/publish").json()["id"]
    assert login(MEMBER_ID).delete(f"/api/public/compos/{pid}").status_code == 403
    assert login(ADMIN_ID).delete(f"/api/public/compos/{pid}").status_code == 204   # admin du serveur d'origine
    pid = login(STAFF_ID).post(f"/api/guilds/{GUILD}/compos/ZvZ/publish").json()["id"]
    assert login(STAFF_ID).delete(f"/api/public/compos/{pid}").status_code == 204   # auteur


def test_public_info_gives_invite_url_without_login(client):
    from urllib.parse import parse_qs, urlparse
    url = client.get("/api/public/info").json()["invite_url"]
    q = parse_qs(urlparse(url).query)
    assert q["client_id"] == ["client-id"] and q["scope"] == ["bot applications.commands"]
    perms = int(q["permissions"][0])
    assert perms & (1 << 28) and perms & (1 << 4)        # gérer rôles + salons
    assert not perms & (1 << 3)                           # jamais administrateur
