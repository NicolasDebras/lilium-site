"""Build partageable : détail (compos qui l'utilisent), image PNG, duplication."""
import asyncio
import io

import pytest
from PIL import Image

from app import images
from app.validation import duplicate_name
from tests.fakes import ADMIN_ID, GUILD, MEMBER_ID, OTHER_GUILD, STAFF_ID, STRANGER_ID

BUILD = {"name": "Tank Masse", "role": "TANK", "type_acti": "PVP", "weapon": "1H Masse", "notes": "T8 mini",
         "image": "", "items": {"mainhand": ["MAIN_MACE"], "cape": ["*"]}}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Pas de CDN dans les tests : icônes locales (copiées du bot) ou « ? »."""
    async def fake_fetch(items, extra_ids=None):
        return {i: images.local_icon(i) for i in images.item_ids(items) + list(extra_ids or [])}
    monkeypatch.setattr(images, "fetch_icons", fake_fetch)
    images._png_cache.clear()


def _create(login, body=BUILD) -> int:
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/builds", json=body)
    assert r.status_code == 201
    return r.json()["id"]


# ── Nom de copie ─────────────────────────────────────────────────────────────

def test_duplicate_name_avoids_collisions_and_respects_length():
    assert duplicate_name("Tank", {"Tank"}) == "Tank (copie)"
    assert duplicate_name("Tank", {"Tank", "tank (COPIE)"}) == "Tank (copie 2)"
    long = duplicate_name("x" * 100, set())
    assert len(long) == 100 and long.endswith(" (copie)")


# ── Détail ───────────────────────────────────────────────────────────────────

def test_detail_lists_compos_using_the_build(login):
    build_id = _create(login)
    compo = {"name": "ZvZ", "description": "", "type_acti": "PVP", "image": "",
             "pf1": [{"build_id": build_id, "count": 2}], "pf2": []}
    assert login(STAFF_ID).post(f"/api/guilds/{GUILD}/compos", json=compo).status_code == 201
    body = login(MEMBER_ID).get(f"/api/guilds/{GUILD}/builds/{build_id}").json()
    assert body["used_by"] == ["ZvZ"] and body["name"] == "Tank Masse"


# ── Image ────────────────────────────────────────────────────────────────────

def test_build_image_is_a_png_for_members(login):
    build_id = _create(login)
    r = login(MEMBER_ID).get(f"/api/guilds/{GUILD}/builds/{build_id}/image.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(r.content))
    assert img.format == "PNG" and img.width == images.WIDTH


def test_build_image_access_and_isolation(login):
    build_id = _create(login)
    assert login(STRANGER_ID).get(f"/api/guilds/{GUILD}/builds/{build_id}/image.png").status_code == 403
    # même id, autre serveur : introuvable
    assert login(ADMIN_ID).get(f"/api/guilds/{OTHER_GUILD}/builds/{build_id}/image.png").status_code in (403, 404)


def test_png_cache_follows_content():
    build = {**BUILD, "items": {"cape": ["*"]}}
    first = asyncio.run(images.build_png(build))
    assert asyncio.run(images.build_png(dict(build))) is first          # même contenu → servi par le cache
    assert asyncio.run(images.build_png({**build, "name": "Autre"})) is not first


def test_compo_png_none_without_builds_and_capped():
    assert asyncio.run(images.compo_png("X", {"pf_1": {"TANK": 1}}, {})) is None
    data = {"pf_1": {f"R{i}": 1 for i in range(60)}, "builds": {f"R{i}": 1 for i in range(60)}}
    png = asyncio.run(images.compo_png("X", data, {1: {"name": "B", "items": {}}}))
    capped = asyncio.run(images.compo_png("X", {**data, "pf_1": {f"R{i}": 1 for i in range(images.COMPO_MAX_ROWS)},
                                                "builds": {f"R{i}": 1 for i in range(images.COMPO_MAX_ROWS)}},
                                          {1: {"name": "B", "items": {}}}))
    assert Image.open(io.BytesIO(png)).height == Image.open(io.BytesIO(capped)).height


# ── Duplication ──────────────────────────────────────────────────────────────

def test_duplicate_build_for_staff(login, fake_db):
    build_id = _create(login)
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/builds/{build_id}/duplicate")
    assert r.status_code == 201
    copy = fake_db.builds[r.json()["id"]]
    assert copy["name"] == "Tank Masse (copie)" and copy["items"] == {"mainhand": ["MAIN_MACE"], "cape": ["*"]}
    assert copy["guild_id"] == GUILD


def test_duplicate_forbidden_for_members_and_404_elsewhere(login):
    build_id = _create(login)
    assert login(MEMBER_ID).post(f"/api/guilds/{GUILD}/builds/{build_id}/duplicate").status_code == 403
    assert login(STAFF_ID).post(f"/api/guilds/{GUILD}/builds/9999/duplicate").status_code == 404


def test_duplicate_respects_quota(login, monkeypatch):
    from app.routes import builds
    build_id = _create(login)
    monkeypatch.setattr(builds, "MAX_BUILDS", 1)
    assert login(STAFF_ID).post(f"/api/guilds/{GUILD}/builds/{build_id}/duplicate").status_code == 409
