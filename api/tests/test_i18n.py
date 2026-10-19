"""Messages d'erreur de l'API en français (défaut) ou en anglais (Accept-Language)."""
import re

import pytest

from app.i18n import MESSAGES, LANGS, lang_from_header, tr
from tests.fakes import GUILD, STAFF_ID, STRANGER_ID
from tests.test_routes import BUILD


@pytest.mark.parametrize("header, lang", [
    (None, "fr"), ("", "fr"), ("en", "en"), ("fr", "fr"), ("en-GB,en;q=0.9", "en"),
    ("de-DE,en;q=0.8", "en"), ("fr-CA,fr;q=0.9,en;q=0.5", "fr"), ("de-DE", "fr"), ("english", "fr"),
])
def test_lang_from_header(header, lang):
    assert lang_from_header(header) == lang


def test_every_message_exists_in_every_language_with_the_same_placeholders():
    for key, texts in MESSAGES.items():
        assert set(texts) == set(LANGS), key
        fields = {lang: set(re.findall(r"\{(\w+)\}", text)) for lang, text in texts.items()}
        assert fields["fr"] == fields["en"], key


def test_tr_defaults_to_french_outside_a_request():
    assert tr("build_not_found") == "Build introuvable."
    assert tr("max_builds", max=50) == "50 builds maximum par serveur : supprimes-en d'abord."


def test_without_header_errors_stay_in_french(login):
    r = login(STAFF_ID).get(f"/api/guilds/{GUILD}/builds/999")
    assert r.status_code == 404 and r.json()["detail"] == "Build introuvable."


def test_accept_language_en_translates_route_errors(login):
    c = login(STAFF_ID)
    r = c.get(f"/api/guilds/{GUILD}/builds/999", headers={"Accept-Language": "en"})
    assert r.json()["detail"] == "Build not found."
    r = c.get(f"/api/guilds/{GUILD}/builds", headers={"Accept-Language": "en"})
    assert r.status_code == 200


def test_accept_language_en_translates_permission_and_validation_errors(login):
    r = login(STRANGER_ID).get(f"/api/guilds/{GUILD}/builds", headers={"Accept-Language": "en-GB"})
    assert r.status_code == 403 and r.json()["detail"].startswith("You are not a member")
    # Objet porté au mauvais emplacement : le nom de l'objet suit aussi la langue
    body = {**BUILD, "items": {"head": ["MAIN_SWORD"]}}
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/builds", json=body, headers={"Accept-Language": "en"})
    assert r.status_code == 422
    assert r.json()["detail"] == "“Broadsword” can't be worn in this slot."


def test_login_required_is_translated(client):
    r = client.get(f"/api/guilds/{GUILD}/builds", headers={"Accept-Language": "en"})
    assert r.status_code == 401 and r.json()["detail"] == "Login required."
