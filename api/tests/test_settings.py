import pytest

from app.settings import MissingSettings, load_settings

FULL = {
    "DATABASE_URL": "postgresql://x", "DISCORD_TOKEN": "t", "DISCORD_CLIENT_ID": "c",
    "DISCORD_CLIENT_SECRET": "s", "DISCORD_REDIRECT_URI": "http://localhost:4200/api/auth/callback",
    "SESSION_SECRET": "secret",
}


def test_load_settings_ok_with_defaults():
    s = load_settings(FULL)
    assert s.frontend_url == "http://localhost:4200"
    assert s.cookie_secure is False


def test_load_settings_lists_every_missing_variable():
    env = {k: v for k, v in FULL.items() if k not in ("DATABASE_URL", "SESSION_SECRET")}
    with pytest.raises(MissingSettings) as exc:
        load_settings(env)
    assert "DATABASE_URL" in str(exc.value) and "SESSION_SECRET" in str(exc.value)


def test_empty_value_counts_as_missing():
    with pytest.raises(MissingSettings):
        load_settings({**FULL, "DISCORD_TOKEN": ""})


def test_frontend_url_trailing_slash_removed_and_cookie_secure_parsed():
    s = load_settings({**FULL, "FRONTEND_URL": "https://lilium.fr/", "COOKIE_SECURE": "TRUE"})
    assert s.frontend_url == "https://lilium.fr"
    assert s.cookie_secure is True


def test_env_file_wins_over_system_variable(tmp_path, monkeypatch):
    """Une vieille variable Windows DISCORD_TOKEN ne doit pas masquer api/.env."""
    from app import settings as settings_module

    env_file = tmp_path / ".env"
    env_file.write_text("\n".join(f"{k}={v}" for k, v in {**FULL, "DISCORD_TOKEN": "token-du-fichier"}.items()))
    monkeypatch.setattr(settings_module, "ENV_FILE", env_file)
    monkeypatch.setenv("DISCORD_TOKEN", "vieux-token-systeme")

    assert settings_module.load_settings().discord_token == "token-du-fichier"
