from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.catalog import InvalidItems, normalize_items, validate_build_items
from app.compos import compos_using_build, rename_build
from app.permissions import require_member, require_staff

router = APIRouter(prefix="/guilds/{guild_id}/builds", tags=["builds"])


class BuildIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(min_length=1, max_length=50)
    type_acti: Literal["PVP", "PVE"] = "PVP"
    weapon: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=4000)
    image: str = Field(default="", max_length=500)
    # Équipement : {slot: [1 à 3 ids de /api/items]} ou {slot: ["*"]} = au choix du joueur.
    # Une chaîne seule (ancien format) est aussi acceptée.
    items: dict[str, str | list[str]] = {}

    @field_validator("name", "weapon", "notes", "image")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

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


@router.get("/{build_id}")
async def get_build(guild_id: int, build_id: int, request: Request, user: dict = Depends(require_member)):
    build = await request.app.state.db.get_build(guild_id, build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build introuvable.")
    return _out(build)


@router.post("", status_code=201)
async def create_build(guild_id: int, body: BuildIn, request: Request, user: dict = Depends(require_staff)):
    build_id = await request.app.state.db.add_build(guild_id, _data(body), user["id"], user["username"])
    return {"id": build_id}


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
