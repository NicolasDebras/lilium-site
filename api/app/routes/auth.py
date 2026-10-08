from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse

from app import auth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login(request: Request):
    settings = request.app.state.settings
    state = auth.new_oauth_state()
    response = RedirectResponse(auth.build_authorize_url(settings, state))
    response.set_cookie(
        auth.STATE_COOKIE, state, max_age=auth.STATE_MAX_AGE, httponly=True, samesite="lax",
        secure=settings.cookie_secure, path="/api/auth",
    )
    return response


@router.get("/callback")
async def callback(request: Request, code: str | None = None, error: str | None = None,
                   state: str | None = None):
    settings = request.app.state.settings
    # Le state doit être celui posé par /login dans CE navigateur : sinon un lien piégé
    # (?code= de l'attaquant) connecterait la victime sur le compte de l'attaquant.
    if error or not code or not auth.state_matches(request.cookies.get(auth.STATE_COOKIE), state):
        response = RedirectResponse(f"{settings.frontend_url}/login?error=1")
    else:
        oauth = request.app.state.oauth
        access_token = await oauth.exchange_code(settings, code)
        user = await oauth.fetch_discord_user(access_token)
        response = RedirectResponse(f"{settings.frontend_url}/")
        auth.set_session_cookie(settings, response, user)
    response.delete_cookie(auth.STATE_COOKIE, path="/api/auth")
    return response


@router.post("/logout", status_code=204)
async def logout():
    response = Response(status_code=204)
    auth.clear_session_cookie(response)
    return response
