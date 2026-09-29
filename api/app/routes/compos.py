from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.compos import build_template_entry, template_to_compo
from app.constants import DEFAULT_TEMPLATES, default_templates_for
from app.permissions import require_member, require_staff

router = APIRouter(prefix="/guilds/{guild_id}/compos", tags=["compos"])


class SlotRow(BaseModel):
    role: str = ""
    count: int | str | None = None
    weapon: str = ""


class CompoIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    type_acti: Literal["PVP", "PVE"] = "PVP"
    image: str = Field(default="", max_length=500)
    pf1: list[SlotRow] = []
    pf2: list[SlotRow] = []


def _entry(body: CompoIn) -> dict:
    entry = build_template_entry(body.model_dump())
    if not entry["pf_1"]:
        raise HTTPException(status_code=422, detail="La compo doit contenir au moins un rôle en PF1.")
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
        raise HTTPException(status_code=404, detail="Compo introuvable.")
    return template_to_compo(name, custom[name], custom=True)


@router.post("", status_code=201)
async def create_compo(guild_id: int, body: CompoIn, request: Request, user: dict = Depends(require_staff)):
    name = body.name.strip()
    if name in DEFAULT_TEMPLATES:
        raise HTTPException(status_code=409, detail=f"« {name} » est un template par défaut, choisis un autre nom.")
    db = request.app.state.db
    if name in await db.get_custom_templates(guild_id):
        raise HTTPException(status_code=409, detail=f"Une compo « {name} » existe déjà.")
    await db.save_custom_template(guild_id, name, _entry(body))
    return {"name": name}


@router.put("/{name}")
async def update_compo(guild_id: int, name: str, body: CompoIn, request: Request,
                       user: dict = Depends(require_staff)):
    db = request.app.state.db
    if name not in await db.get_custom_templates(guild_id):
        raise HTTPException(status_code=404, detail="Compo introuvable.")
    # Le nom sert de clé côté bot (/acti) : on ne le renomme pas ici.
    await db.save_custom_template(guild_id, name, _entry(body))
    return {"name": name}


@router.delete("/{name}", status_code=204)
async def delete_compo(guild_id: int, name: str, request: Request, user: dict = Depends(require_staff)):
    if not await request.app.state.db.delete_custom_template(guild_id, name):
        raise HTTPException(status_code=404, detail="Compo introuvable.")
