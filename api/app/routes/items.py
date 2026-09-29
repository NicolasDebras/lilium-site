from fastapi import APIRouter, Depends, Response

from app.auth import require_user
from app.catalog import load_catalog

router = APIRouter(tags=["items"])


@router.get("/items")
async def items(response: Response, user: dict = Depends(require_user)):
    """Catalogue complet (~250 objets, ~60 Ko) : le site le charge une fois et
    filtre côté navigateur, la recherche est donc instantanée."""
    response.headers["Cache-Control"] = "private, max-age=3600"
    return list(load_catalog())
