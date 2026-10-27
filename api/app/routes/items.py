import hashlib
import json
from functools import lru_cache

from fastapi import APIRouter, Depends, Request, Response

from app.auth import require_user
from app.catalog import load_catalog, load_spell_names, shoe_spells

router = APIRouter(tags=["items"])


@lru_cache(maxsize=4)
def _etag(kind: str) -> str:
    """Empreinte du contenu servi : change dès que le catalogue est régénéré (nouveau déploiement)."""
    data = list(load_catalog()) if kind == "items" else [load_spell_names(), shoe_spells()]
    return '"' + hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16] + '"'


def _revalidated(kind: str, request: Request, response: Response) -> bool:
    """Le navigateur garde la réponse mais revalide à chaque chargement (ETag) : 304 sans corps si
    rien n'a changé, sinon le nouveau catalogue tout de suite (pas d'heure de cache périmé)."""
    etag = _etag(kind)
    response.headers["Cache-Control"] = "private, no-cache"
    response.headers["ETag"] = etag
    return request.headers.get("if-none-match") == etag


@router.get("/items")
async def items(request: Request, response: Response, user: dict = Depends(require_user)):
    """Catalogue complet (~290 objets avec leurs sorts) : le site le charge une fois et
    filtre côté navigateur, la recherche est donc instantanée."""
    if _revalidated("items", request, response):
        return Response(status_code=304, headers=dict(response.headers))
    return list(load_catalog())


@router.get("/spells")
async def spells(request: Request, response: Response, user: dict = Depends(require_user)):
    """Noms des sorts ({id: {name, name_en}}) — les sorts possibles de chaque objet sont dans
    /api/items — et sorts de toutes les bottes, pour « sort imposé, bottes au choix »."""
    if _revalidated("spells", request, response):
        return Response(status_code=304, headers=dict(response.headers))
    return {"names": load_spell_names(), "shoes": shoe_spells()}
