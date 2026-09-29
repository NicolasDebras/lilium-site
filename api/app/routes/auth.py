from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse

from app import auth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login(request: Request):
    return RedirectResponse(auth.build_authorize_url(request.app.state.settings))


@router.get("/callback")
async def callback(request: Request, code: str | None = None, error: str | None = None):
    settings = request.app.state.settings
    if error or not code:
        return RedirectResponse(f"{settings.frontend_url}/login?error=1")
    oauth = request.app.state.oauth
    access_token = await oauth.exchange_code(settings, code)
    user = await oauth.fetch_discord_user(access_token)
    response = RedirectResponse(f"{settings.frontend_url}/")
    auth.set_session_cookie(settings, response, user)
    return response


@router.post("/logout", status_code=204)
async def logout():
    response = Response(status_code=204)
    auth.clear_session_cookie(response)
    return response
