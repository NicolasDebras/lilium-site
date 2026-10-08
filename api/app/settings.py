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


# Valeurs d'exemple publiques (dépôt public) : avec elles, n'importe qui forgerait un cookie de session admin.
WEAK_SECRETS = {"change-moi", "changeme", "change-me", "secret", "session-secret"}
MIN_SECRET_LENGTH = 16


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
    # Front Angular compilé servi par l'API (prod : image Docker). Vide en local (ng serve + proxy).
    static_dir: str = ""


def load_settings(env: dict[str, str] | None = None) -> Settings:
    """Lit la config ; lève MissingSettings avec la liste exacte de ce qui manque,
    plutôt qu'un KeyError obscur au premier appel."""
    if env is None:
        # override=True : api/.env gagne sur une variable Windows du même nom
        # (ex. un vieux DISCORD_TOKEN système) — même choix que le bot.
        load_dotenv(ENV_FILE, override=True)
        env = dict(os.environ)

    missing = [k for k in REQUIRED if not env.get(k)]
    if missing:
        raise MissingSettings(
            "Variables d'environnement manquantes : " + ", ".join(missing)
            + " — en local : api/.env (voir api/.env.example) ; sur Railway : onglet Variables du service"
        )

    secret = env["SESSION_SECRET"]
    if secret.lower() in WEAK_SECRETS or len(secret) < MIN_SECRET_LENGTH:
        raise MissingSettings(
            f"SESSION_SECRET trop faible : au moins {MIN_SECRET_LENGTH} caractères aléatoires, jamais la valeur "
            "d'exemple (ex. python -c \"import secrets; print(secrets.token_urlsafe(48))\")"
        )

    static_dir = env.get("STATIC_DIR", "")
    # Prod (front servi par l'API, donc HTTPS) : cookie Secure sauf COOKIE_SECURE=false explicite
    cookie_secure = env.get("COOKIE_SECURE", "true" if static_dir else "false").lower() == "true"

    return Settings(
        database_url=env["DATABASE_URL"],
        discord_token=env["DISCORD_TOKEN"],
        discord_client_id=env["DISCORD_CLIENT_ID"],
        discord_client_secret=env["DISCORD_CLIENT_SECRET"],
        discord_redirect_uri=env["DISCORD_REDIRECT_URI"],
        session_secret=secret,
        frontend_url=env.get("FRONTEND_URL", "http://localhost:4200").rstrip("/"),
        cookie_secure=cookie_secure,
        static_dir=static_dir,
    )
