"""Protections HTTP transverses :

- taille maximale des corps de requête (lus par FastAPI AVANT l'authentification) ;
- contrôle d'origine sur les requêtes qui modifient (anti-CSRF, en plus de SameSite=Lax) ;
- limite de débit par utilisateur connecté (sinon par IP) sur /api ;
- en-têtes de sécurité, dont une CSP construite à partir de l'index.html compilé.
"""
import base64
import hashlib
import math
import re
import time
from collections.abc import Callable
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import auth
from app.i18n import tr

MAX_BODY_BYTES = 128 * 1024  # un build ou une compo pèse quelques Ko
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

_INLINE_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)


def inline_script_hashes(html: str) -> list[str]:
    """Empreintes CSP des scripts en ligne de l'index.html (le build Angular en ajoute un
    pour charger le CSS) : autorisés nommément, sans ouvrir à tout script en ligne."""
    return [
        "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
        for body in _INLINE_SCRIPT.findall(html) if body.strip()
    ]


def content_security_policy(script_hashes: list[str]) -> str:
    return "; ".join([
        "default-src 'self'",
        "script-src " + " ".join(["'self'", *script_hashes]),
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",  # styles des composants Angular
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",  # icônes Albion, avatars Discord, images des builds/compos
        # prix du marché : demandés par le navigateur (limite par IP répartie entre joueurs)
        "connect-src 'self' " + " ".join(f"https://{s}.albion-online-data.com" for s in ("europe", "west", "east")),
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ])


def origin_allowed(origin: str | None, frontend_url: str, host: str | None = None) -> bool:
    """Requête qui modifie : refusée si le navigateur annonce une autre origine que le site
    (FRONTEND_URL, ou le domaine même qui reçoit la requête). Pas d'en-tête Origin (client
    non navigateur) : laissé passer — le cookie SameSite=Lax protège déjà ce cas."""
    if origin is None or origin.rstrip("/") == frontend_url.rstrip("/"):
        return True
    return bool(host) and urlparse(origin).netloc.lower() == host.lower()


# (requêtes, secondes) par règle. Larges pour un joueur (le front charge une image par build ou compo
# affichée), bloquants pour un script : le rendu Pillow (2 à la fois) et OAuth sont les plus coûteux.
RATE_LIMITS: dict[str, tuple[int, int]] = {
    "auth":   (20, 60),     # /api/auth/* : login + callback = 2 requêtes par connexion
    "render": (60, 60),     # images PNG et aperçu de compo
    "api":    (600, 60),    # tout le reste de /api
}


def rate_rule(method: str, path: str) -> str | None:
    """Règle de débit d'une requête, ou None (front statique : non limité)."""
    if not path.startswith("/api/"):
        return None
    if path.startswith("/api/auth/"):
        return "auth"
    if path.endswith(".png") or (method == "POST" and path.endswith("/preview-image")):
        return "render"
    return "api"


def client_ip(headers, peer: str | None) -> str:
    """IP vue par le proxy HTTPS (Railway) : DERNIÈRE entrée de X-Forwarded-For, ajoutée par le proxy.
    Les premières sont fournies par le client et ne servent pas de clé (sinon contournement)."""
    forwarded = [h.strip() for h in (headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    return forwarded[-1] if forwarded else (peer or "?")


class RateLimiter:
    """Fenêtres fixes par (règle, clé) en mémoire — l'API tourne en un seul process.
    Mémoire bornée : au-delà de `max_keys` clés, les fenêtres terminées sont oubliées."""

    def __init__(self, limits: dict[str, tuple[int, int]] = RATE_LIMITS,
                 clock: Callable[[], float] = time.monotonic, max_keys: int = 50_000):
        self._limits = limits
        self._clock = clock
        self._max_keys = max_keys
        self._windows: dict[tuple[str, str], tuple[float, int]] = {}

    def hit(self, rule: str, key: str) -> int:
        """0 si la requête passe, sinon le nombre de secondes à attendre (Retry-After)."""
        limit, period = self._limits[rule]
        now = self._clock()
        start, count = self._windows.get((rule, key), (now, 0))
        if now - start >= period:
            start, count = now, 0
        if count >= limit:
            return max(1, math.ceil(start + period - now))
        if len(self._windows) >= self._max_keys:
            self._windows = {k: v for k, v in self._windows.items() if now - v[0] < self._limits[k[0]][1]}
        self._windows[(rule, key)] = (start, count + 1)
        return 0


def _rate_key(request: Request) -> str:
    """Utilisateur connecté (cookie signé : non falsifiable) ; sinon son IP."""
    user = auth.decode_session(request.app.state.settings, request.cookies.get(auth.SESSION_COOKIE))
    if user and user.get("id"):
        return "u:" + str(user["id"])
    return "ip:" + client_ip(request.headers, request.client.host if request.client else None)


class _TooLarge(Exception):
    pass


class BodyLimitMiddleware:
    """Refuse (413) un corps plus gros que `max_bytes`, annoncé (Content-Length) ou non (chunked)."""

    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in UNSAFE_METHODS:
            return await self.app(scope, receive, send)

        length = dict(scope["headers"]).get(b"content-length")
        if length is not None and (not length.isdigit() or int(length) > self.max_bytes):
            return await _too_large(scope, receive, send)

        received = 0
        started = False

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _TooLarge
            return message

        async def tracking_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _TooLarge:
            if not started:
                await _too_large(scope, receive, send)


async def _too_large(scope, receive, send):
    response = JSONResponse(status_code=413, content={"detail": tr("too_large")})
    await response(scope, receive, send)


def install_security(app: FastAPI, *, frontend_url: str, hsts: bool) -> None:
    app.add_middleware(BodyLimitMiddleware)
    app.state.rate_limiter = RateLimiter()

    @app.middleware("http")
    async def security(request: Request, call_next):
        rule = rate_rule(request.method, request.url.path)
        wait = request.app.state.rate_limiter.hit(rule, _rate_key(request)) if rule else 0
        if wait:
            response = JSONResponse(status_code=429, content={"detail": tr("too_many_requests")},
                                    headers={"Retry-After": str(wait)})
        elif request.method in UNSAFE_METHODS and not origin_allowed(
            request.headers.get("origin"), frontend_url, request.headers.get("host")
        ):
            response = JSONResponse(status_code=403, content={"detail": tr("bad_origin")})
        else:
            response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        csp = getattr(request.app.state, "csp", None)
        if csp:
            headers.setdefault("Content-Security-Policy", csp)
        if hsts:
            headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        return response
