"""API du site Lilium (builds, compos, BAL, admin).

Lancement local (depuis api/) :
    uvicorn app.main:create_app --factory --reload --port 8000
"""
from contextlib import asynccontextmanager
from types import SimpleNamespace

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse

from app import auth
from app.db import Database
from app.discord_rest import DiscordRest, DiscordUnavailable
from app.permissions import LevelCache
from app.routes import auth as auth_routes, builds, compos, guild, items, me
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

    app = FastAPI(title="Lilium API", lifespan=lifespan)
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
    return app
