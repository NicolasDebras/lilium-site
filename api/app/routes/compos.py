from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.compos import InvalidCompo, build_template_entry, template_to_compo
from app.constants import DEFAULT_TEMPLATES, default_templates_for
from app.i18n import tr
from app.images import compo_png
from app.permissions import require_member, require_staff
from app.validation import clean_compo_name, https_url_or_empty

router = APIRouter(prefix="/guilds/{guild_id}/compos", tags=["compos"])

MAX_ROWS = 20          # lignes par party (au-delà : embed Discord et image de compo ingérables)
MAX_COMPOS = 100       # compos par serveur (la base est partagée avec le bot)


class SlotRow(BaseModel):
    # build_id renseigné → rôle et arme viennent du build ; sinon ligne libre (rôle + arme en texte).
    build_id: int | None = None
    # Autres builds au choix de la ligne (même rôle, places partagées) : le joueur choisit le sien
    alt_build_ids: list[int] = Field(default=[], max_length=30)
    role: str = Field(default="", max_length=50)
    count: int | Annotated[str, Field(max_length=6)] | None = None
    weapon: str = Field(default="", max_length=200)
    # Parts de paie à /finacti (prises en compte seulement si CompoIn.custom_shares)
    share: float | None = None


class CompoIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    type_acti: Literal["PVP", "PVE"] = "PVP"
    image: str = Field(default="", max_length=500)
    custom_shares: bool = False
    # Places « LEACHER PVP » en PF1, non payées à /finacti
    accept_leachers: bool = False
    leacher_count: int | None = None
    pf1: list[SlotRow] = Field(default=[], max_length=MAX_ROWS)
    pf2: list[SlotRow] = Field(default=[], max_length=MAX_ROWS)

    @field_validator("image")
    @classmethod
    def _https_image(cls, v: str) -> str:
        return https_url_or_empty(v)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        return clean_compo_name(v)


async def _entry(db, guild_id: int, body: CompoIn) -> dict:
    builds_by_id = {b["id"]: b for b in await db.get_builds(guild_id)}
    try:
        entry = build_template_entry(body.model_dump(), builds_by_id)
    except InvalidCompo as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    if not entry["pf_1"]:
        raise HTTPException(status_code=422, detail=tr("compo_needs_pf1"))
    return entry


@router.get("")
async def list_compos(guild_id: int, request: Request, user: dict = Depends(require_member)):
    custom = await request.app.state.db.get_custom_templates(guild_id)
    return {
        "custom":   [template_to_compo(n, d, custom=True) for n, d in custom.items()],
        "defaults": [template_to_compo(n, d, custom=False) for n, d in default_templates_for(guild_id).items()],
    }


@router.get("/{name}")
async def get_compo(guild_id: int, name: str, request: Request, user: dict = Depends(require_member)):
    custom = await request.app.state.db.get_custom_templates(guild_id)
    if name not in custom:
        raise HTTPException(status_code=404, detail=tr("compo_not_found"))
    return template_to_compo(name, custom[name], custom=True)




async def _png_response(db, guild_id: int, name: str, entry: dict) -> Response:
    builds_by_id = {b["id"]: b for b in await db.get_builds(guild_id)}
    png = await compo_png(name, entry, builds_by_id)
    if png is None:
        raise HTTPException(status_code=404, detail=tr("no_build_image"))
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, no-cache"})


@router.get("/{name}/image.png")
async def compo_image(guild_id: int, name: str, request: Request, user: dict = Depends(require_member)):
    """La même image que celle postée sous /acti (seulement les rôles qui ont un build)."""
    db = request.app.state.db
    custom = await db.get_custom_templates(guild_id)
    if name not in custom:
        raise HTTPException(status_code=404, detail=tr("compo_not_found"))
    return await _png_response(db, guild_id, name, custom[name])


@router.post("/preview-image")
async def preview_compo_image(guild_id: int, body: CompoIn, request: Request, user: dict = Depends(require_staff)):
    """Aperçu de l'image d'une compo en cours d'édition (rien n'est enregistré)."""
    db = request.app.state.db
    return await _png_response(db, guild_id, body.name, await _entry(db, guild_id, body))


def _check_name_free(name: str, existing: dict, current: str | None = None) -> None:
    """Nom libre (casse ignorée, templates par défaut compris) ; `current` = compo renommée."""
    if name.casefold() in {n.casefold() for n in DEFAULT_TEMPLATES}:
        raise HTTPException(status_code=409, detail=tr("default_template_name", name=name))
    if name.casefold() in {n.casefold() for n in existing if n != current}:
        raise HTTPException(status_code=409, detail=tr("compo_exists", name=name))


async def check_new_compo_name(db, guild_id: int, name: str) -> None:
    """Nouvelle compo : nom libre et quota non atteint."""
    existing = await db.get_custom_templates(guild_id)
    _check_name_free(name, existing)
    if len(existing) >= MAX_COMPOS:
        raise HTTPException(status_code=409, detail=tr("max_compos", max=MAX_COMPOS))


@router.post("", status_code=201)
async def create_compo(guild_id: int, body: CompoIn, request: Request, user: dict = Depends(require_staff)):
    db = request.app.state.db
    await check_new_compo_name(db, guild_id, body.name)
    await db.save_custom_template(guild_id, body.name, await _entry(db, guild_id, body))
    return {"name": body.name}


@router.put("/{name}")
async def update_compo(guild_id: int, name: str, body: CompoIn, request: Request,
                       user: dict = Depends(require_staff)):
    db = request.app.state.db
    existing = await db.get_custom_templates(guild_id)
    if name not in existing:
        raise HTTPException(status_code=404, detail=tr("compo_not_found"))
    entry = await _entry(db, guild_id, body)
    if body.name == name:
        await db.save_custom_template(guild_id, name, entry)
    else:
        # Renommage : le nom est la clé côté bot (/acti), l'image et la description du bot suivent.
        _check_name_free(body.name, existing, current=name)
        await db.rename_custom_template(guild_id, name, body.name, entry)
    return {"name": body.name}


@router.delete("/{name}", status_code=204)
async def delete_compo(guild_id: int, name: str, request: Request, user: dict = Depends(require_staff)):
    if not await request.app.state.db.delete_custom_template(guild_id, name):
        raise HTTPException(status_code=404, detail=tr("compo_not_found"))
