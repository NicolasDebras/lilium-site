"""Les copies de app/shared/ doivent être identiques au bot (scripts/sync_from_bot.py).
Ignoré si le repo du bot n'est pas à côté ; la CI le clone pour que ce test tourne toujours."""
import pytest

from scripts.sync_from_bot import DEFAULT_BOT_DIR, SHARED, differences, sync


@pytest.mark.skipif(not DEFAULT_BOT_DIR.is_dir(), reason="repo botDiscord absent")
def test_shared_files_match_the_bot():
    assert differences(DEFAULT_BOT_DIR) == [], "copies du bot pas à jour : python -m scripts.sync_from_bot"


def test_shared_files_are_the_lilium_specific_ones():
    """Le rendu des images (et ses assets) vient de la lib AlbionCreateImageBuild, plus du bot."""
    assert set(SHARED) == {"roles_templates.py", "lilium_compo.py"}


def _fake_bot(root):
    root.mkdir(parents=True)
    (root / "roles_templates.py").write_text("ROLES = {}\n")
    (root / "lilium_compo.py").write_text("LIGNES = 1\n")
    (root / "assets" / "icons").mkdir(parents=True)      # pour les tests de dossier partagé
    (root / "assets" / "icons" / "A.png").write_bytes(b"png")
    return root


def test_differences_lists_missing_and_changed_files(tmp_path):
    bot, api = _fake_bot(tmp_path / "bot"), tmp_path / "api"
    assert len(differences(bot, api)) == len(SHARED)            # rien n'est encore copié
    sync(bot, api)
    assert differences(bot, api) == []
    (api / "app" / "shared" / "lilium_compo.py").write_text("LIGNES = 2\n")
    assert differences(bot, api) == ["app/shared/lilium_compo.py"]


def test_differences_in_a_copied_folder(tmp_path, monkeypatch):
    """Un dossier partagé (aucun aujourd'hui, mais géré) : fichier en trop signalé."""
    monkeypatch.setitem(SHARED, "assets", "app/assets")
    bot, api = _fake_bot(tmp_path / "bot"), tmp_path / "api"
    sync(bot, api)
    (api / "app" / "assets" / "icons" / "B.png").write_bytes(b"en trop")
    assert differences(bot, api) == ["app/assets/icons/B.png"]


def test_sync_replaces_a_copied_folder_entirely(tmp_path, monkeypatch):
    monkeypatch.setitem(SHARED, "assets", "app/assets")
    bot, api = _fake_bot(tmp_path / "bot"), tmp_path / "api"
    (api / "app" / "assets" / "icons").mkdir(parents=True)
    (api / "app" / "assets" / "icons" / "VIEUX.png").write_bytes(b"x")
    sync(bot, api)
    assert not (api / "app" / "assets" / "icons" / "VIEUX.png").exists()


def test_missing_bot_file_is_reported(tmp_path):
    bot = _fake_bot(tmp_path / "bot")
    (bot / "roles_templates.py").unlink()
    assert "roles_templates.py : introuvable dans le bot" in differences(bot, tmp_path / "api")
