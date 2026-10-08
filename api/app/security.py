"""Protections HTTP transverses :

- taille maximale des corps de requête (lus par FastAPI AVANT l'authentification) ;
- contrôle d'origine sur les requêtes qui modifient (anti-CSRF, en plus de SameSite=Lax) ;
- en-têtes de sécurité, dont une CSP construite à partir de l'index.html compilé.
"""
import base64
import hashlib
import re
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

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
        "connect-src 'self'",
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
    response = JSONResponse(status_code=413, content={"detail": "Requête trop volumineuse."})
    await response(scope, receive, send)


def install_security(app: FastAPI, *, frontend_url: str, hsts: bool) -> None:
    app.add_middleware(BodyLimitMiddleware)

    @app.middleware("http")
    async def security(request: Request, call_next):
        if request.method in UNSAFE_METHODS and not origin_allowed(
            request.headers.get("origin"), frontend_url, request.headers.get("host")
        ):
            response = JSONResponse(status_code=403, content={"detail": "Origine de la requête refusée."})
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
