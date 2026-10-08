import time
from urllib.parse import parse_qs, urlparse

from app import auth
from tests.fakes import MEMBER_ID, make_settings


def test_session_roundtrip():
    s = make_settings()
    token = auth.encode_session(s, {"id": 42, "username": "bob", "avatar": "abc"})
    data = auth.decode_session(s, token)
    assert data == {"id": "42", "username": "bob", "avatar_url": "https://cdn.discordapp.com/avatars/42/abc.png"}


def test_session_prefers_global_name_and_default_avatar():
    data = auth.session_payload({"id": "1", "username": "bob", "global_name": "Bobby"})
    assert data["username"] == "Bobby"
    assert data["avatar_url"].endswith("/embed/avatars/0.png")


def test_tampered_session_is_rejected():
    s = make_settings()
    token = auth.encode_session(s, {"id": 1, "username": "a"})
    assert auth.decode_session(s, token[:-2] + "xx") is None


def test_session_signed_with_other_secret_is_rejected():
    token = auth.encode_session(make_settings(session_secret="autre"), {"id": 1, "username": "a"})
    assert auth.decode_session(make_settings(), token) is None


def test_expired_session_is_rejected():
    s = make_settings()
    token = auth.encode_session(s, {"id": 1, "username": "a"})
    time.sleep(1.1)
    assert auth.decode_session(s, token, max_age=0) is None


def test_missing_session_is_none():
    assert auth.decode_session(make_settings(), None) is None


def test_authorize_url_uses_identify_scope_only():
    url = auth.build_authorize_url(make_settings(), "etat123")
    q = parse_qs(urlparse(url).query)
    assert q["scope"] == ["identify"]
    assert q["state"] == ["etat123"]
    assert q["client_id"] == ["client-id"]
    assert q["redirect_uri"] == ["http://localhost:4200/api/auth/callback"]


def test_login_redirects_to_discord(client):
    r = client.get("/api/auth/login", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"].startswith("https://discord.com/oauth2/authorize")


def _login_state(client) -> str:
    """Passe par /login (pose le cookie de state) et renvoie le state envoyé à Discord."""
    r = client.get("/api/auth/login", follow_redirects=False)
    return parse_qs(urlparse(r.headers["location"]).query)["state"][0]


def test_callback_sets_cookie_and_redirects_to_front(client, settings):
    state = _login_state(client)
    r = client.get(f"/api/auth/callback?code=abc&state={state}", follow_redirects=False)
    assert r.headers["location"] == "http://localhost:4200/"
    assert auth.decode_session(settings, r.cookies.get(auth.SESSION_COOKIE))["id"] == str(MEMBER_ID)


def test_callback_without_state_is_refused(client):
    """Lien piégé ?code= de l'attaquant ouvert par la victime : pas de connexion."""
    r = client.get("/api/auth/callback?code=abc", follow_redirects=False)
    assert r.headers["location"] == "http://localhost:4200/login?error=1"
    assert auth.SESSION_COOKIE not in r.cookies


def test_callback_with_forged_state_is_refused(client):
    _login_state(client)
    r = client.get("/api/auth/callback?code=abc&state=autre", follow_redirects=False)
    assert r.headers["location"] == "http://localhost:4200/login?error=1"


def test_state_cookie_is_httponly_and_short_lived(client):
    cookie = client.get("/api/auth/login", follow_redirects=False).headers["set-cookie"]
    assert auth.STATE_COOKIE in cookie and "HttpOnly" in cookie and "Max-Age=600" in cookie


def test_callback_error_redirects_to_login(client):
    r = client.get("/api/auth/callback?error=access_denied", follow_redirects=False)
    assert r.headers["location"] == "http://localhost:4200/login?error=1"


def test_logout_clears_cookie(login):
    c = login(MEMBER_ID)
    r = c.post("/api/auth/logout")
    assert r.status_code == 204
    assert auth.SESSION_COOKIE in r.headers.get("set-cookie", "")
