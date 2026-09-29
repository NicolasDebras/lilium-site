"""Connexion Discord OAuth2 (scope "identify" uniquement) + session signée par
cookie (rien stocké côté serveur). Repris de botDiscord/web/auth.py."""
from urllib.parse import urlencode

import aiohttp
from fastapi import HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.settings import Settings

SESSION_COOKIE = "lilium_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 jours


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="lilium-session")


def build_authorize_url(settings: Settings) -> str:
    query = urlencode({
        "client_id":     settings.discord_client_id,
        "redirect_uri":  settings.discord_redirect_uri,
        "response_type": "code",
        "scope":         "identify",
    })
    return f"https://discord.com/oauth2/authorize?{query}"


async def exchange_code(settings: Settings, code: str) -> str:
    """Échange le code OAuth2 contre un access_token."""
    data = {
        "client_id":     settings.discord_client_id,
        "client_secret": settings.discord_client_secret,
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  settings.discord_redirect_uri,
    }
    async with aiohttp.ClientSession() as session:
        async with session.post("https://discord.com/api/oauth2/token", data=data) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="Échec de l'authentification Discord.")
            payload = await resp.json()
    return payload["access_token"]


async def fetch_discord_user(access_token: str) -> dict:
    headers = {"Authorization": f"Bearer {access_token}"}
    async with aiohttp.ClientSession() as session:
        async with session.get("https://discord.com/api/users/@me", headers=headers) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=400, detail="Impossible de récupérer le profil Discord.")
            return await resp.json()


def session_payload(user: dict) -> dict:
    if user.get("avatar"):
        avatar_url = f"https://cdn.discordapp.com/avatars/{user['id']}/{user['avatar']}.png"
    else:
        avatar_url = "https://cdn.discordapp.com/embed/avatars/0.png"
    return {
        "id":         str(user["id"]),
        "username":   user.get("global_name") or user["username"],
        "avatar_url": avatar_url,
    }


def encode_session(settings: Settings, user: dict) -> str:
    return _serializer(settings).dumps(session_payload(user))


def decode_session(settings: Settings, token: str | None, max_age: int = SESSION_MAX_AGE) -> dict | None:
    if not token:
        return None
    try:
        return _serializer(settings).loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None


def set_session_cookie(settings: Settings, response, user: dict) -> None:
    response.set_cookie(
        SESSION_COOKIE, encode_session(settings, user),
        max_age=SESSION_MAX_AGE, httponly=True, samesite="lax", secure=settings.cookie_secure, path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def require_user(request: Request) -> dict:
    user = decode_session(request.app.state.settings, request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=401, detail="Connexion requise.")
    return user
