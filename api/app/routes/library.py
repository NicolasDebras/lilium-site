"""Bibliothèque de compos : copie entre ses serveurs et modèles publics partagés entre tous les serveurs."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.auth import require_user
from app.compos import InvalidCompo
from app.images import compo_png
from app.library import plan_builds, public_summary, rebuild_template, snapshot
from app.permissions import Level, access_level, require_staff
from app.routes import builds as builds_routes
from app.routes.compos import check_new_compo_name
from app.validation import clean_compo_name

router = APIRouter(tags=["library"])

MAX_PUBLIC_PER_GUILD = 20   # modèles publiés par serveur
PUBLIC_PAGE_SIZE = 12


def _optional_name(v: str | None) -> str | None:
    return clean_compo_name(v) if v is not None and v.strip() else None


class CopyIn(BaseModel):
    source_guild_id: int = Field(gt=0, lt=2**63)
    name: str = Field(min_length=1, max_length=100)
    new_name: str | None = Field(default=None, max_length=100)

    @field_validator("new_name")
    @classmethod
    def _new(cls, v: str | None) -> str | None:
        return _optional_name(v)


class ImportPublicIn(BaseModel):
    public_id: int = Field(gt=0, lt=2**31)
    new_name: str | None = Field(default=None, max_length=100)

    @field_validator("new_name")
    @classmethod
    def _new(cls, v: str | None) -> str | None:
        return _optional_name(v)


async def _import(db, guild_id: int, snap: dict, name: str, user: dict) -> str:
    """Recrée la compo figée dans `guild_id` : builds identiques réutilisés, les autres recréés.
    Tout est vérifié AVANT d'écrire (pas de builds orphelins si la compo est refusée)."""
    try:
        name = clean_compo_name(name)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    await check_new_compo_name(db, guild_id, name)
    target = await db.get_builds(guild_id)
    reuse, create = plan_builds(snap, target)
    if len(target) + len(create) > builds_routes.MAX_BUILDS:
        raise HTTPException(status_code=409, detail=(
            f"Il faudrait créer {len(create)} build(s) : {builds_routes.MAX_BUILDS} maximum par serveur."
        ))

    by_id = {b["id"]: b for b in target}
    id_map: dict[str, int] = dict(reuse)
    # Essai à blanc avec des ids provisoires (négatifs) : la compo respecte-t-elle les règles ?
    trial_map = {**id_map, **{old: -i for i, (old, _) in enumerate(create, 1)}}
    trial_builds = {**by_id, **{-i: {**b, "id": -i} for i, (_, b) in enumerate(create, 1)}}
    try:
        entry = rebuild_template(snap, name, trial_map, trial_builds)
    except InvalidCompo as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not entry.get("pf_1"):
        raise HTTPException(status_code=422, detail="La compo doit contenir au moins un rôle en PF1.")

    for old, build in create:
        new_id = await db.add_build(guild_id, build, user["id"], user["username"])
        id_map[old] = new_id
        by_id[new_id] = {**build, "id": new_id}
    await db.save_custom_template(guild_id, name, rebuild_template(snap, name, id_map, by_id))
    return name


async def _guild_snapshot(db, guild_id: int, name: str) -> tuple[dict, dict]:
    templates = await db.get_custom_templates(guild_id)
    if name not in templates:
        raise HTTPException(status_code=404, detail="Compo introuvable.")
    builds_by_id = {b["id"]: b for b in await db.get_builds(guild_id)}
    return templates[name], snapshot(templates[name], builds_by_id)


# ── Copier vers un autre de mes serveurs ─────────────────────────────────────

@router.post("/guilds/{guild_id}/compos/import", status_code=201)
async def copy_compo(guild_id: int, body: CopyIn, request: Request, user: dict = Depends(require_staff)):
    """Copie une compo (et ses builds) d'un serveur où je suis staff vers celui-ci (staff aussi)."""
    state = request.app.state
    level = await access_level(state.db, state.discord, body.source_guild_id, int(user["id"]), state.levels)
    if level < Level.STAFF:
        raise HTTPException(status_code=403, detail="Tu dois être staff du serveur d'origine pour copier ses compos.")
    _, snap = await _guild_snapshot(state.db, body.source_guild_id, body.name)
    return {"name": await _import(state.db, guild_id, snap, body.new_name or body.name, user)}


# ── Modèles publics ──────────────────────────────────────────────────────────

@router.post("/guilds/{guild_id}/compos/{name}/publish", status_code=201)
async def publish_compo(guild_id: int, name: str, request: Request, user: dict = Depends(require_staff)):
    """Publie une compo de ce serveur comme modèle public (instantané : les modifications
    ultérieures de la compo ne changent pas le modèle)."""
    db = request.app.state.db
    template, snap = await _guild_snapshot(db, guild_id, name)
    if await db.count_public_compos(guild_id) >= MAX_PUBLIC_PER_GUILD:
        raise HTTPException(status_code=409, detail=f"{MAX_PUBLIC_PER_GUILD} modèles publiés maximum par serveur.")
    public_id = await db.add_public_compo(
        name, str(template.get("description") or "")[:2000], template.get("type_acti") or "PVP",
        str(template.get("image") or "")[:500], snap, guild_id, str(user["id"]), user.get("username") or "",
    )
    return {"id": public_id}


@router.get("/public/compos")
async def list_public(request: Request, q: str = Query("", max_length=100),
                      type_acti: Literal["PVP", "PVE"] | None = None, page: int = Query(1, ge=1, le=1000)):
    """Modèles publics (sans connexion : visibles aussi sur la page d'accueil)."""
    rows, total = await request.app.state.db.list_public_compos(
        q.strip(), type_acti, PUBLIC_PAGE_SIZE, (page - 1) * PUBLIC_PAGE_SIZE
    )
    return {"items": [public_summary(r) for r in rows], "total": total, "page": page, "page_size": PUBLIC_PAGE_SIZE}


async def _public_or_404(db, public_id: int) -> dict:
    row = await db.get_public_compo(public_id)
    if not row:
        raise HTTPException(status_code=404, detail="Modèle introuvable.")
    return row


@router.get("/public/compos/{public_id}")
async def get_public(request: Request, public_id: int = Path(gt=0, lt=2**31)):
    row = await _public_or_404(request.app.state.db, public_id)
    builds = (row["data"] or {}).get("builds") or {}
    return {**public_summary(row), "build_list": [
        {"name": b["name"], "role": b["role"], "items": b["items"]} for b in builds.values()
    ]}


@router.get("/public/compos/{public_id}/image.png")
async def public_image(request: Request, public_id: int = Path(gt=0, lt=2**31)):
    row = await _public_or_404(request.app.state.db, public_id)
    snap = row["data"] or {}
    builds_by_id = {int(k): v for k, v in (snap.get("builds") or {}).items()}
    png = await compo_png(row["name"], snap.get("template") or {}, builds_by_id)
    if png is None:
        raise HTTPException(status_code=404, detail="Ce modèle n'a aucun build : pas d'image.")
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=300"})


@router.post("/guilds/{guild_id}/compos/import-public", status_code=201)
async def import_public(guild_id: int, body: ImportPublicIn, request: Request, user: dict = Depends(require_staff)):
    """Importe un modèle public dans ce serveur (compo + builds)."""
    db = request.app.state.db
    row = await _public_or_404(db, body.public_id)
    name = await _import(db, guild_id, row["data"] or {}, body.new_name or row["name"], user)
    await db.count_public_import(body.public_id)
    return {"name": name}


@router.delete("/public/compos/{public_id}", status_code=204)
async def delete_public(request: Request, public_id: int = Path(gt=0, lt=2**31), user: dict = Depends(require_user)):
    """Retrait d'un modèle : son auteur, un admin du serveur d'origine, ou un propriétaire du site (SITE_OWNER_IDS)."""
    state = request.app.state
    row = await _public_or_404(state.db, public_id)
    allowed = str(user["id"]) == row["author_id"] or str(user["id"]) in state.settings.site_owner_ids
    if not allowed:
        level = await access_level(state.db, state.discord, row["source_guild_id"], int(user["id"]), state.levels)
        allowed = level >= Level.ADMIN
    if not allowed:
        raise HTTPException(status_code=403, detail="Seul l'auteur, un admin du serveur d'origine ou le propriétaire du site peut retirer ce modèle.")
    await state.db.delete_public_compo(public_id)
