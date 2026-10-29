"""Protections HTTP transverses (app/security.py), validation des entrées et accès."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.permissions import access_level
from app.security import RateLimiter, client_ip, content_security_policy, inline_script_hashes, origin_allowed, rate_rule
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
    # onglet Marché : le navigateur demande les prix aux trois serveurs de l'Albion Online Data Project, rien d'autre
    connect_src = csp.split("connect-src")[1].split(";")[0].split()
    assert connect_src == ["'self'", "https://europe.albion-online-data.com",
                           "https://west.albion-online-data.com", "https://east.albion-online-data.com"]


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


@pytest.mark.parametrize("image", ["javascript:alert(1)", "data:image/png;base64,AA", "http://i.imgur.com/x.png"])
def test_build_image_url_is_ignored_and_never_served(login, image):
    """Champ « Image (URL) » retiré des builds : une URL envoyée quand même n'est ni gardée ni renvoyée."""
    client = login(STAFF_ID)
    r = client.post(f"/api/guilds/{GUILD}/builds", json={**BUILD, "image": image, "notes": "<script>"})
    assert r.status_code == 201
    build = client.get(f"/api/guilds/{GUILD}/builds/{r.json()['id']}").json()
    assert "image" not in build and "notes" not in build


# ── Limite de débit ──────────────────────────────────────────────────────────

def test_rate_rule():
    assert rate_rule("GET", "/api/auth/login") == "auth"
    assert rate_rule("GET", f"/api/guilds/{GUILD}/builds/1/image.png") == "render"
    assert rate_rule("GET", "/api/public/compos/3/image.png") == "render"
    assert rate_rule("POST", f"/api/guilds/{GUILD}/compos/preview-image") == "render"
    assert rate_rule("GET", f"/api/guilds/{GUILD}/compos/preview-image") == "api"   # nom de compo, pas l'aperçu
    assert rate_rule("GET", "/api/me") == "api"
    assert rate_rule("GET", "/main-QXSL2V3G.js") is None   # front statique : non limité
    assert rate_rule("GET", "/g/1/builds") is None


def test_client_ip_uses_the_entry_added_by_the_proxy():
    # le client peut écrire X-Forwarded-For : seule la dernière entrée (ajoutée par le proxy) compte
    assert client_ip({"x-forwarded-for": "1.1.1.1, 9.9.9.9"}, "10.0.0.1") == "9.9.9.9"
    assert client_ip({"x-forwarded-for": " 9.9.9.9 "}, "10.0.0.1") == "9.9.9.9"
    assert client_ip({}, "10.0.0.1") == "10.0.0.1"
    assert client_ip({"x-forwarded-for": ""}, None) == "?"


def test_rate_limiter_window():
    now = [0.0]
    limiter = RateLimiter({"api": (2, 60)}, clock=lambda: now[0])
    assert limiter.hit("api", "u:1") == 0
    assert limiter.hit("api", "u:1") == 0
    now[0] = 15.2
    assert limiter.hit("api", "u:1") == 45          # Retry-After : fin de la fenêtre
    assert limiter.hit("api", "u:2") == 0           # chaque clé a son compteur
    now[0] = 60.0
    assert limiter.hit("api", "u:1") == 0           # nouvelle fenêtre


def test_rate_limiter_memory_is_bounded():
    now = [0.0]
    limiter = RateLimiter({"api": (5, 60)}, clock=lambda: now[0], max_keys=3)
    for key in ("a", "b", "c"):
        limiter.hit("api", key)
    now[0] = 61.0                                   # fenêtres terminées : oubliées à la prochaine clé
    limiter.hit("api", "d")
    assert len(limiter._windows) == 1


def test_too_many_requests_returns_429_per_user(login, client):
    client.app.state.rate_limiter = RateLimiter({"auth": (20, 60), "render": (60, 60), "api": (2, 60)})
    c = login(STAFF_ID)
    assert c.get("/api/me").status_code == 200
    assert c.get("/api/me").status_code == 200
    r = c.get("/api/me", headers={"Accept-Language": "en"})
    assert r.status_code == 429
    assert 1 <= int(r.headers["retry-after"]) <= 60
    assert r.json()["detail"] == "Too many requests: try again in a moment."
    assert r.headers["x-content-type-options"] == "nosniff"   # en-têtes de sécurité aussi sur le refus
    # un autre utilisateur, même machine : son propre compteur
    assert login(ADMIN_ID).get("/api/me").status_code == 200


def test_anonymous_requests_are_limited_by_proxy_ip(client):
    client.app.state.rate_limiter = RateLimiter({"auth": (1, 60), "render": (60, 60), "api": (600, 60)})
    assert client.get("/api/auth/login", follow_redirects=False,
                      headers={"X-Forwarded-For": "6.6.6.6, 1.2.3.4"}).status_code == 307
    # changer la première entrée (écrite par le client) ne contourne pas la limite
    assert client.get("/api/auth/login", follow_redirects=False,
                      headers={"X-Forwarded-For": "7.7.7.7, 1.2.3.4"}).status_code == 429
    assert client.get("/api/auth/login", follow_redirects=False,
                      headers={"X-Forwarded-For": "5.6.7.8"}).status_code == 307
