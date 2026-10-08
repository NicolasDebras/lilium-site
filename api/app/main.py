"""API du site Lilium (builds, compos, BAL, admin).

Lancement local (depuis api/) :
    uvicorn app.main:create_app --factory --reload --port 8000
"""
import re
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from app import auth
from app.db import Database
from app.discord_rest import DiscordRest, DiscordUnavailable
from app.permissions import LevelCache
from app.routes import auth as auth_routes, builds, compos, guild, items, me
from app.security import content_security_policy, inline_script_hashes, install_security
from app.settings import Settings, load_settings


def create_app(settings: Settings | None = None, *, db=None, discord=None, oauth=None) -> FastAPI:
    """Les dépendances externes (base, Discord, OAuth) sont injectables pour les tests."""
    settings = settings or load_settings()
    owns_db = db is None
    db = db or Database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if owns_db:
            await db.connect()
        yield
        if owns_db:
            await db.close()

    # Prod (front servi par l'API) : pas de /docs ni /openapi.json publics
    docs = {} if not settings.static_dir else {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app = FastAPI(title="Lilium API", lifespan=lifespan, **docs)
    install_security(app, frontend_url=settings.frontend_url, hsts=settings.cookie_secure)
    app.state.settings = settings
    app.state.db = db
    app.state.discord = discord or DiscordRest(settings.discord_token)
    app.state.levels = LevelCache()
    app.state.oauth = oauth or SimpleNamespace(
        exchange_code=auth.exchange_code, fetch_discord_user=auth.fetch_discord_user,
    )

    @app.exception_handler(DiscordUnavailable)
    async def discord_down(request: Request, exc: DiscordUnavailable):
        return JSONResponse(status_code=503, content={"detail": "Discord ne répond pas, réessaie dans un instant."})

    api = APIRouter(prefix="/api")

    @api.get("/health")
    async def health(request: Request):
        return {"status": "ok", "database": await request.app.state.db.ping()}

    for module in (auth_routes, me, items, builds, compos, guild):
        api.include_router(module.router)
    app.include_router(api)
    if settings.static_dir:
        mount_frontend(app, Path(settings.static_dir))
    return app


def mount_frontend(app: FastAPI, static_dir: Path) -> None:
    """Sert le front Angular compilé (même origine que l'API : pas de CORS, cookie simple).
    Un fichier existant est servi tel quel ; toute autre URL hors /api renvoie index.html
    (routes Angular : /g/123/builds…). Une URL /api inconnue reste un 404 JSON."""
    root = static_dir.resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"STATIC_DIR={static_dir} : index.html introuvable (front non compilé ?)")
    app.state.csp = content_security_policy(inline_script_hashes(index.read_text(encoding="utf-8")))

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        file = (root / path).resolve()
        if path and file.is_file() and file.is_relative_to(root):
            # Fichiers à nom haché (main-XXXX.js…) : cache long ; le reste revalidé.
            cache = "public, max-age=31536000, immutable" if _HASHED.search(file.name) else "no-cache"
            return FileResponse(file, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


_HASHED = re.compile(r"-[A-Za-z0-9_]{8,}\.(js|css)$")   # ex. main-QXSL2V3G.js, chunk-Dy9_9D9O.js
