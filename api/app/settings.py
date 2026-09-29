"""Configuration lue depuis les variables d'environnement (fichier api/.env en local)."""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"  # api/.env

REQUIRED = (
    "DATABASE_URL",
    "DISCORD_TOKEN",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_REDIRECT_URI",
    "SESSION_SECRET",
)


class MissingSettings(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    database_url: str
    discord_token: str
    discord_client_id: str
    discord_client_secret: str
    discord_redirect_uri: str
    session_secret: str
    frontend_url: str = "http://localhost:4200"
    cookie_secure: bool = False


def load_settings(env: dict[str, str] | None = None) -> Settings:
    """Lit la config ; lève MissingSettings avec la liste exacte de ce qui manque,
    plutôt qu'un KeyError obscur au premier appel."""
    if env is None:
        load_dotenv(ENV_FILE)
        env = dict(os.environ)

    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise MissingSettings(
            "Variables manquantes dans api/.env : " + ", ".join(missing)
            + " (voir api/.env.example)"
        )

    return Settings(
        database_url=env["DATABASE_URL"],
        discord_token=env["DISCORD_TOKEN"],
        discord_client_id=env["DISCORD_CLIENT_ID"],
        discord_client_secret=env["DISCORD_CLIENT_SECRET"],
        discord_redirect_uri=env["DISCORD_REDIRECT_URI"],
        session_secret=env["SESSION_SECRET"],
        frontend_url=env.get("FRONTEND_URL", "http://localhost:4200").rstrip("/"),
        cookie_secure=env.get("COOKIE_SECURE", "false").lower() == "true",
    )
