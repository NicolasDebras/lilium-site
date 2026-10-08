"""Bibliothèque de compos — logique pure, sans I/O.

Une compo référence des builds par id, mais les builds sont propres à chaque serveur.
Pour la copier vers un autre serveur ou la publier comme modèle, on la « fige » avec ses
builds (snapshot), puis on la recrée dans le serveur cible :
- un build identique (même nom, rôle et équipement) déjà présent est réutilisé ;
- sinon il est recréé ;
- la compo repasse par `build_template_entry` (mêmes règles que le formulaire : 50 joueurs
  max par ligne, un build par rôle et par party…), même si elle vient d'un /addtemplate du bot.
"""
from app.catalog import normalize_items
from app.compos import build_template_entry, template_to_compo

BUILD_FIELDS = ("name", "role", "type_acti", "weapon", "notes", "image")


def frozen_build(build: dict) -> dict:
    """Ce qu'on garde d'un build dans un snapshot (pas d'id ni d'auteur)."""
    return {**{k: build.get(k) or "" for k in BUILD_FIELDS}, "items": normalize_items(build.get("items"))}


def snapshot(template: dict, builds_by_id: dict[int, dict]) -> dict:
    """{"template": données de la compo, "builds": {id d'origine: build figé}}.
    Seuls les builds réellement utilisés et encore existants sont gardés."""
    used = {
        int(bid) for key in ("builds", "builds_pf2") for bid in (template.get(key) or {}).values()
    }
    return {
        "template": template,
        "builds": {str(bid): frozen_build(builds_by_id[bid]) for bid in sorted(used) if bid in builds_by_id},
    }


def _same_build(a: dict, b: dict) -> bool:
    return (a["name"].casefold() == (b.get("name") or "").casefold()
            and a["role"].upper() == (b.get("role") or "").upper()
            and a["items"] == normalize_items(b.get("items")))


def plan_builds(snap: dict, target_builds: list[dict]) -> tuple[dict[str, int], list[tuple[str, dict]]]:
    """→ (ids d'origine réutilisés → id cible, builds à créer [(id d'origine, build figé)])."""
    reuse: dict[str, int] = {}
    create: list[tuple[str, dict]] = []
    for old_id, build in (snap.get("builds") or {}).items():
        match = next((t for t in target_builds if _same_build(build, t)), None)
        if match:
            reuse[old_id] = match["id"]
        else:
            create.append((old_id, build))
    return reuse, create


def rebuild_template(snap: dict, name: str, id_map: dict[str, int], target_builds_by_id: dict[int, dict]) -> dict:
    """Template prêt à enregistrer dans le serveur cible (ids de builds remplacés, règles revalidées).
    Une ligne dont le build manque au snapshot redevient une ligne libre (rôle + arme en texte).
    Lève InvalidCompo si la compo ne respecte pas les règles."""
    compo = template_to_compo(name, snap.get("template") or {}, custom=True)
    for key in ("pf1", "pf2"):
        rows = []
        for row in compo[key]:
            old = row.get("build_id")
            new = id_map.get(str(old)) if old is not None else None
            rows.append({**row, "build_id": new} if new is not None else {**row, "build_id": None})
        compo[key] = rows
    return build_template_entry(compo, target_builds_by_id)


def public_summary(row: dict) -> dict:
    """Ligne de public_compos → carte de la bibliothèque (rôles × nombre, pas de détail des builds)."""
    snap = row["data"] or {}
    compo = template_to_compo(row["name"], snap.get("template") or {}, custom=True)
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "type_acti": row["type_acti"],
        "image": row["image"],
        "author_name": row["author_name"],
        "created_at": row["created_at"].isoformat(timespec="minutes"),
        "imports": row["imports"],
        "total": compo["total"],
        "pf1": [{"role": r["role"], "count": r["count"]} for r in compo["pf1"]],
        "pf2": [{"role": r["role"], "count": r["count"]} for r in compo["pf2"]],
        "builds": len(snap.get("builds") or {}),
    }
