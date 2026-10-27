from fastapi import APIRouter, Depends, Response

from app.auth import require_user
from app.catalog import load_catalog, load_spell_names, shoe_spells

router = APIRouter(tags=["items"])


@router.get("/items")
async def items(response: Response, user: dict = Depends(require_user)):
    """Catalogue complet (~250 objets, ~60 Ko) : le site le charge une fois et
    filtre côté navigateur, la recherche est donc instantanée."""
    response.headers["Cache-Control"] = "private, max-age=3600"
    return list(load_catalog())


@router.get("/spells")
async def spells(response: Response, user: dict = Depends(require_user)):
    """Noms des sorts ({id: {name, name_en}}) — les sorts possibles de chaque objet sont dans
    /api/items — et sorts de toutes les bottes, pour « sort imposé, bottes au choix »."""
    response.headers["Cache-Control"] = "private, max-age=3600"
    return {"names": load_spell_names(), "shoes": shoe_spells()}
