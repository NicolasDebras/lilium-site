from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.permissions import require_member, require_staff

router = APIRouter(prefix="/guilds/{guild_id}/builds", tags=["builds"])


class BuildIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(min_length=1, max_length=50)
    type_acti: Literal["PVP", "PVE"] = "PVP"
    weapon: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=4000)
    image: str = Field(default="", max_length=500)

    @field_validator("name", "weapon", "notes", "image")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("role")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


def _out(build: dict) -> dict:
    return {
        "id":              build["id"],
        "name":            build["name"],
        "role":            build["role"],
        "type_acti":       build["type_acti"],
        "weapon":          build["weapon"],
        "notes":           build["notes"],
        "image":           build["image"],
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
    build_id = await request.app.state.db.add_build(guild_id, body.model_dump(), user["id"], user["username"])
    return {"id": build_id}


@router.put("/{build_id}")
async def update_build(guild_id: int, build_id: int, body: BuildIn, request: Request,
                       user: dict = Depends(require_staff)):
    if not await request.app.state.db.update_build(guild_id, build_id, body.model_dump()):
        raise HTTPException(status_code=404, detail="Build introuvable.")
    return {"id": build_id}


@router.delete("/{build_id}", status_code=204)
async def delete_build(guild_id: int, build_id: int, request: Request, user: dict = Depends(require_staff)):
    if not await request.app.state.db.delete_build(guild_id, build_id):
        raise HTTPException(status_code=404, detail="Build introuvable.")
