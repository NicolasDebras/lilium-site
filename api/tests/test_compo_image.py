"""Image d'une compo générée par le site (identique à celle postée sous /acti)."""
import io

import pytest
from PIL import Image

from app import images
from tests.fakes import GUILD, MEMBER_ID, OTHER_GUILD, STAFF_ID, STRANGER_ID

BUILD = {"name": "Tank Masse", "role": "TANK", "type_acti": "PVP", "weapon": "", "notes": "", "image": "",
         "items": {"mainhand": ["MAIN_MACE"]}}
URL = f"/api/guilds/{GUILD}/compos"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    async def fake_fetch(items, extra_ids=None):
        return {i: images.local_icon(i) for i in images.item_ids(items) + list(extra_ids or [])}
    monkeypatch.setattr(images, "fetch_icons", fake_fetch)
    images._png_cache.clear()


def _compo(build_id=None, name="ZvZ"):
    row = {"build_id": build_id, "count": 2} if build_id else {"role": "TANK", "count": 2, "weapon": "Masse"}
    return {"name": name, "description": "", "type_acti": "PVP", "image": "", "pf1": [row], "pf2": []}


def _setup(login, with_build=True) -> None:
    c = login(STAFF_ID)
    build_id = c.post(f"/api/guilds/{GUILD}/builds", json=BUILD).json()["id"] if with_build else None
    assert c.post(URL, json=_compo(build_id)).status_code == 201


def test_compo_image_png_for_members(login):
    _setup(login)
    r = login(MEMBER_ID).get(f"{URL}/ZvZ/image.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert Image.open(io.BytesIO(r.content)).width == images.COMPO_WIDTH


def test_compo_without_build_has_no_image(login):
    _setup(login, with_build=False)
    r = login(MEMBER_ID).get(f"{URL}/ZvZ/image.png")
    assert r.status_code == 404 and "n'a de build" in r.json()["detail"]


def test_compo_image_access_and_isolation(login):
    _setup(login)
    assert login(STRANGER_ID).get(f"{URL}/ZvZ/image.png").status_code == 403
    assert login(MEMBER_ID).get(f"{URL}/Inconnue/image.png").status_code == 404
    assert login(MEMBER_ID).get(f"/api/guilds/{OTHER_GUILD}/compos/ZvZ/image.png").status_code in (403, 404)


def test_preview_image_for_unsaved_compo(login):
    c = login(STAFF_ID)
    build_id = c.post(f"/api/guilds/{GUILD}/builds", json=BUILD).json()["id"]
    r = c.post(f"{URL}/preview-image", json=_compo(build_id, name="Brouillon"))
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert c.get(f"{URL}/Brouillon").status_code == 404   # rien n'a été enregistré


def test_preview_image_is_staff_only_and_validated(login):
    assert login(MEMBER_ID).post(f"{URL}/preview-image", json=_compo()).status_code == 403
    bad = {**_compo(), "pf1": [{"role": "TANK", "count": 999, "weapon": ""}]}
    assert login(STAFF_ID).post(f"{URL}/preview-image", json=bad).status_code == 422
