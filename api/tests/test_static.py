"""Front Angular compilé servi par l'API (déploiement : un seul service, même origine)."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.fakes import FakeDB, FakeDiscord, FakeOAuth, make_settings


@pytest.fixture
def static(tmp_path):
    (tmp_path / "index.html").write_text("<app-root>index</app-root>", encoding="utf-8")
    (tmp_path / "main-QXSL2V3G.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "favicon.ico").write_bytes(b"ico")
    (tmp_path.parent / "secret.txt").write_text("secret", encoding="utf-8")
    app = create_app(make_settings(static_dir=str(tmp_path)), db=FakeDB(), discord=FakeDiscord(), oauth=FakeOAuth())
    with TestClient(app) as c:
        yield c


def test_root_serves_index(static):
    r = static.get("/")
    assert r.status_code == 200 and "index" in r.text
    assert r.headers["cache-control"] == "no-cache"


def test_angular_routes_fall_back_to_index(static):
    assert "index" in static.get("/g/123/builds").text
    assert "index" in static.get("/login?error=1").text


def test_hashed_assets_are_cached_long(static):
    r = static.get("/main-QXSL2V3G.js")
    assert r.text == "console.log(1)"
    assert "immutable" in r.headers["cache-control"]
    assert static.get("/favicon.ico").headers["cache-control"] == "no-cache"


def test_api_still_works_and_unknown_api_is_json_404(static):
    assert static.get("/api/health").json()["status"] == "ok"
    r = static.get("/api/nope")
    assert r.status_code == 404 and r.json() == {"detail": "Not Found"}


def test_no_path_traversal(static):
    r = static.get("/..%2Fsecret.txt")
    assert "secret" not in r.text


def test_missing_build_fails_fast(tmp_path):
    with pytest.raises(RuntimeError, match="index.html"):
        create_app(make_settings(static_dir=str(tmp_path)), db=FakeDB(), discord=FakeDiscord(), oauth=FakeOAuth())


def test_without_static_dir_nothing_is_served(client):
    assert client.get("/").status_code == 404
