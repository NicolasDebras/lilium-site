"""Protections HTTP transverses (app/security.py), validation des entrées et accès."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.permissions import access_level
from app.security import content_security_policy, inline_script_hashes, origin_allowed
from tests.fakes import ADMIN_ID, GUILD, STAFF_ID, STRANGER_ID, FakeDB, FakeDiscord, FakeOAuth, make_settings

BUILD = {"name": "Tank", "role": "TANK", "type_acti": "PVP", "weapon": "", "notes": "", "image": ""}


# ── En-têtes, CSP, origine, taille des corps ─────────────────────────────────

def test_security_headers_on_api(client):
    h = client.get("/api/health").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert "strict-origin" in h["referrer-policy"]


def test_csp_allows_only_the_inline_scripts_of_index():
    html = '<script src="main.js"></script><script>document.x=1</script><script>  </script>'
    hashes = inline_script_hashes(html)
    assert len(hashes) == 1 and hashes[0].startswith("'sha256-")
    csp = content_security_policy(hashes)
    script_src = csp.split("script-src")[1].split(";")[0]
    assert "'sha256-" in script_src and "unsafe-inline" not in script_src
    assert "frame-ancestors 'none'" in csp


def test_prod_serves_csp_hsts_and_hides_docs(tmp_path):
    (tmp_path / "index.html").write_text("<script>boot()</script><app-root>index</app-root>", encoding="utf-8")
    settings = make_settings(static_dir=str(tmp_path), cookie_secure=True)
    with TestClient(create_app(settings, db=FakeDB(), discord=FakeDiscord(), oauth=FakeOAuth())) as c:
        r = c.get("/")
        assert "sha256-" in r.headers["content-security-policy"]
        assert r.headers["strict-transport-security"].startswith("max-age=")
        # /docs et /openapi.json ne sont plus servis : on retombe sur index.html (route Angular)
        assert "index" in c.get("/docs").text
        assert "index" in c.get("/openapi.json").text


def test_origin_check():
    assert origin_allowed(None, "https://lilium.fr")
    assert origin_allowed("https://lilium.fr", "https://lilium.fr/")
    assert not origin_allowed("https://evil.example", "https://lilium.fr")
    # même domaine que celui qui sert la requête (FRONTEND_URL mal réglée) : accepté
    assert origin_allowed("https://lilium.up.railway.app", "http://localhost:4200", "lilium.up.railway.app")
    assert not origin_allowed("https://evil.example", "http://localhost:4200", "lilium.up.railway.app")


def test_cross_origin_write_is_refused(login):
    c = login(STAFF_ID)
    r = c.post(f"/api/guilds/{GUILD}/builds", json=BUILD, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    ok = c.post(f"/api/guilds/{GUILD}/builds", json=BUILD, headers={"Origin": "http://localhost:4200"})
    assert ok.status_code == 201


def test_huge_body_is_refused_before_auth(client):
    r = client.post(f"/api/guilds/{GUILD}/builds", content=b"x" * (200 * 1024),
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 413


# ── Validation des builds / compos ───────────────────────────────────────────

def test_build_with_giant_item_list_is_rejected(login):
    c = login(STAFF_ID)
    body = {**BUILD, "items": {"head": [f"ID{i}" for i in range(5000)]}}
    assert c.post(f"/api/guilds/{GUILD}/builds", json=body).status_code in (413, 422)
    body = {**BUILD, "items": {"head": [f"ID{i}" for i in range(11)]}}
    assert c.post(f"/api/guilds/{GUILD}/builds", json=body).status_code == 422


def test_build_quota_per_guild(login, monkeypatch):
    from app.routes import builds
    monkeypatch.setattr(builds, "MAX_BUILDS", 2)
    c = login(STAFF_ID)
    assert c.post(f"/api/guilds/{GUILD}/builds", json=BUILD).status_code == 201
    assert c.post(f"/api/guilds/{GUILD}/builds", json=BUILD).status_code == 201
    assert c.post(f"/api/guilds/{GUILD}/builds", json=BUILD).status_code == 409


def _compo(name="ZvZ", rows=None):
    return {"name": name, "description": "", "type_acti": "PVP", "image": "",
            "pf1": rows if rows is not None else [{"role": "TANK", "count": 2, "weapon": ""}], "pf2": []}


def test_compo_limits(login):
    c = login(STAFF_ID)
    url = f"/api/guilds/{GUILD}/compos"
    too_many_rows = [{"role": f"R{i}", "count": 1, "weapon": ""} for i in range(21)]
    assert c.post(url, json=_compo(rows=too_many_rows)).status_code == 422
    assert c.post(url, json=_compo(rows=[{"role": "TANK", "count": 51, "weapon": ""}])).status_code == 422
    assert c.post(url, json=_compo(rows=[{"role": "TANK", "count": 1, "weapon": "x" * 201}])).status_code == 422
    assert c.post(url, json=_compo(rows=[{"role": "TANK", "count": 50, "weapon": ""}])).status_code == 201


@pytest.mark.parametrize("name", ["a/b", "a\\b", "a?b", "a#b", "50%", "ab​c", "   "])
def test_compo_name_rejects_url_breaking_chars(login, name):
    assert login(STAFF_ID).post(f"/api/guilds/{GUILD}/compos", json=_compo(name)).status_code == 422


def test_compo_name_collision_ignores_case(login):
    c = login(STAFF_ID)
    assert c.post(f"/api/guilds/{GUILD}/compos", json=_compo("ZvZ")).status_code == 201
    assert c.post(f"/api/guilds/{GUILD}/compos", json=_compo("zvz")).status_code == 409


def test_compo_quota_per_guild(login, monkeypatch):
    from app.routes import compos
    monkeypatch.setattr(compos, "MAX_COMPOS", 1)
    c = login(STAFF_ID)
    assert c.post(f"/api/guilds/{GUILD}/compos", json=_compo("A")).status_code == 201
    assert c.post(f"/api/guilds/{GUILD}/compos", json=_compo("B")).status_code == 409


# ── Accès ────────────────────────────────────────────────────────────────────

def test_guild_id_out_of_range_is_422(login):
    assert login(ADMIN_ID).get(f"/api/guilds/{2**64}/roles").status_code == 422
    assert login(ADMIN_ID).get("/api/guilds/0/roles").status_code == 422


async def test_no_discord_call_without_profile():
    """Un id de serveur au hasard ne doit pas consommer le quota du token du bot."""
    calls = []

    class CountingDiscord(FakeDiscord):
        async def get_member(self, guild_id, user_id):
            calls.append(guild_id)
            return await super().get_member(guild_id, user_id)

    discord = CountingDiscord()
    for gid in (123456, 654321):
        await access_level(FakeDB(), discord, gid, STRANGER_ID)
    assert calls == []
    await access_level(FakeDB(), discord, GUILD, STAFF_ID)
    assert calls == [GUILD]


@pytest.mark.parametrize("image,ok", [
    ("", True), ("https://i.imgur.com/x.png", True),
    ("http://i.imgur.com/x.png", False), ("javascript:alert(1)", False), ("data:image/png;base64,AA", False),
    ("https://a.com/x y.png", False),
])
def test_image_must_be_https(login, image, ok):
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/builds", json={**BUILD, "image": image})
    assert (r.status_code == 201) is ok
