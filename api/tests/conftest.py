import pytest
from fastapi.testclient import TestClient

from app import auth
from app.main import create_app
from tests.fakes import FakeDB, FakeDiscord, FakeOAuth, make_settings


@pytest.fixture
def settings():
    return make_settings()


@pytest.fixture
def fake_db():
    return FakeDB()


@pytest.fixture
def fake_discord():
    return FakeDiscord()


@pytest.fixture
def client(settings, fake_db, fake_discord):
    app = create_app(settings, db=fake_db, discord=fake_discord, oauth=FakeOAuth())
    with TestClient(app) as c:
        yield c


@pytest.fixture
def login(client, settings):
    """login(user_id) → pose le cookie de session de cet utilisateur sur le client."""
    def _login(user_id: int, username: str = "testeur"):
        token = auth.encode_session(settings, {"id": str(user_id), "username": username})
        client.cookies.set(auth.SESSION_COOKIE, token)
        return client
    return _login
