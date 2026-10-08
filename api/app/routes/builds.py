from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.catalog import InvalidItems, normalize_items, validate_build_items
from app.compos import compos_using_build, rename_build
from app.images import build_png
from app.permissions import require_member, require_staff
from app.validation import duplicate_name, https_url_or_empty

router = APIRouter(prefix="/guilds/{guild_id}/builds", tags=["builds"])

MAX_BUILDS = 500  # builds par serveur (la base est partagée avec le bot)
ItemId = Annotated[str, Field(max_length=80)]


class BuildIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(min_length=1, max_length=50)
    type_acti: Literal["PVP", "PVE"] = "PVP"
    weapon: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=4000)
    image: str = Field(default="", max_length=500)
    # Équipement : {slot: [1 à 3 ids de /api/items]} ou {slot: ["*"]} = au choix du joueur.
    # Une chaîne seule (ancien format) est aussi acceptée.
    # Bornes avant tout traitement : un corps géant ne doit pas geler l'API (dédoublonnage).
    items: dict[Annotated[str, Field(max_length=20)], ItemId | list[ItemId]] = Field(default={}, max_length=12)

    @field_validator("items")
    @classmethod
    def _bounded_choices(cls, v: dict) -> dict:
        if any(isinstance(c, list) and len(c) > 10 for c in v.values()):
            raise ValueError("Trop de choix pour une case.")
        return v

    @field_validator("name", "weapon", "notes")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("image")
    @classmethod
    def _https_image(cls, v: str) -> str:
        return https_url_or_empty(v)

    @field_validator("role")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


def _data(body: BuildIn) -> dict:
    data = body.model_dump()
    try:
        data["items"] = validate_build_items(body.items)
    except InvalidItems as e:
        raise HTTPException(status_code=422, detail=str(e))
    return data


def _out(build: dict) -> dict:
    return {
        "id":              build["id"],
        "name":            build["name"],
        "role":            build["role"],
        "type_acti":       build["type_acti"],
        "weapon":          build["weapon"],
        "notes":           build["notes"],
        "image":           build["image"],
        "items":           normalize_items(build.get("items")),
        "created_by_name": build["created_by_name"],
    }


@router.get("")
async def list_builds(guild_id: int, request: Request, role: str = "", type_acti: str = "",
                      user: dict = Depends(require_member)):
    builds = await request.app.state.db.get_builds(guild_id, role=role or None, type_acti=type_acti or None)
    return [_out(b) for b in builds]


async def _build_or_404(db, guild_id: int, build_id: int) -> dict:
    build = await db.get_build(guild_id, build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build introuvable.")
    return build


@router.get("/{build_id}")
async def get_build(guild_id: int, build_id: int, request: Request, user: dict = Depends(require_member)):
    """Un build + les compos du serveur qui l'utilisent (page de partage)."""
    db = request.app.state.db
    build = await _build_or_404(db, guild_id, build_id)
    return {**_out(build), "used_by": compos_using_build(await db.get_custom_templates(guild_id), build_id)}


@router.get("/{build_id}/image.png")
async def build_image(guild_id: int, build_id: int, request: Request, user: dict = Depends(require_member)):
    """La même image que celle envoyée en MP par /massup."""
    build = await _build_or_404(request.app.state.db, guild_id, build_id)
    return Response(await build_png(build), media_type="image/png", headers={"Cache-Control": "private, max-age=60"})


async def _create(db, guild_id: int, data: dict, user: dict) -> int:
    if len(await db.get_builds(guild_id)) >= MAX_BUILDS:
        raise HTTPException(status_code=409, detail=f"{MAX_BUILDS} builds maximum par serveur : supprimes-en d'abord.")
    return await db.add_build(guild_id, data, user["id"], user["username"])


@router.post("", status_code=201)
async def create_build(guild_id: int, body: BuildIn, request: Request, user: dict = Depends(require_staff)):
    return {"id": await _create(request.app.state.db, guild_id, _data(body), user)}


@router.post("/{build_id}/duplicate", status_code=201)
async def duplicate_build(guild_id: int, build_id: int, request: Request, user: dict = Depends(require_staff)):
    """Copie « Nom (copie) » du build, que le staff ajuste ensuite."""
    db = request.app.state.db
    source = await _build_or_404(db, guild_id, build_id)
    data = {k: source.get(k) or "" for k in ("role", "type_acti", "weapon", "notes", "image")}
    data["name"] = duplicate_name(source["name"], {b["name"] for b in await db.get_builds(guild_id)})
    data["items"] = normalize_items(source.get("items"))
    return {"id": await _create(db, guild_id, data, user)}


@router.put("/{build_id}")
async def update_build(guild_id: int, build_id: int, body: BuildIn, request: Request,
                       user: dict = Depends(require_staff)):
    db = request.app.state.db
    current = await db.get_build(guild_id, build_id)
    if not current:
        raise HTTPException(status_code=404, detail="Build introuvable.")
    data = _data(body)
    old_name, old_role = current["name"], current["role"]

    templates = await db.get_custom_templates(guild_id)
    used_by = compos_using_build(templates, build_id)
    if used_by and data["role"] != old_role:
        raise HTTPException(status_code=409, detail=(
            f"Ce build est utilisé en {old_role} par : {', '.join(used_by)}. "
            "Retire-le de ces compos avant de changer son rôle."
        ))

    await db.update_build(guild_id, build_id, data)
    if data["name"] != old_name:
        for name in used_by:
            await db.save_custom_template(guild_id, name, rename_build(templates[name], build_id, data["name"]))
    return {"id": build_id}


@router.delete("/{build_id}", status_code=204)
async def delete_build(guild_id: int, build_id: int, request: Request, user: dict = Depends(require_staff)):
    db = request.app.state.db
    used_by = compos_using_build(await db.get_custom_templates(guild_id), build_id)
    if used_by:
        raise HTTPException(status_code=409, detail=f"Ce build est utilisé par : {', '.join(used_by)}. Retire-le de ces compos d'abord.")
    if not await db.delete_build(guild_id, build_id):
        raise HTTPException(status_code=404, detail="Build introuvable.")
