from fastapi import APIRouter, Depends, Request, Response

from app.auth import require_user
from app.market import market_gzip, market_json

router = APIRouter(tags=["market"])


@router.get("/market")
async def market(request: Request, user: dict = Depends(require_user)):
    """Noms FR/EN de tous les objets à tier + recettes de cuisine/potions (onglet Marché).
    Chargé une fois par le navigateur, qui fait ensuite la recherche et les calculs."""
    headers = {"Cache-Control": "private, max-age=86400", "Vary": "Accept-Encoding"}
    if "gzip" in request.headers.get("accept-encoding", ""):
        return Response(market_gzip(), media_type="application/json", headers={**headers, "Content-Encoding": "gzip"})
    return Response(market_json(), media_type="application/json", headers=headers)
