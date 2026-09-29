"""Conversion entre le format du site (lignes rôle/nombre/arme) et le format
des templates du bot (table custom_templates, même format que /addtemplate) :

    {"description", "type_acti", "image",
     "pf_1": {rôle: nb}, "weapon": {rôle: hint},
     "pf_2": {rôle: nb}, "weapon_pf2": {rôle: hint}}   ← pf_2 seulement si non vide

Logique pure, portée de _build_template_entry (botDiscord/web/routes_compos.py).
"""


def _rows_to_maps(rows: list[dict]) -> tuple[dict[str, int], dict[str, str]]:
    counts: dict[str, int] = {}
    weapons: dict[str, str] = {}
    for row in rows:
        role = str(row.get("role") or "").strip().upper()
        raw_count = row.get("count")
        if not role or raw_count in (None, ""):
            continue
        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            continue
        if count <= 0:
            continue
        counts[role] = count
        weapon = str(row.get("weapon") or "").strip()
        if weapon:
            weapons[role] = weapon
    return counts, weapons


def build_template_entry(body: dict) -> dict:
    pf_1, weapon = _rows_to_maps(body.get("pf1") or [])
    pf_2, weapon_pf2 = _rows_to_maps(body.get("pf2") or [])
    entry = {
        "description": str(body.get("description") or "").strip(),
        "type_acti":   body.get("type_acti") or "PVP",
        "image":       str(body.get("image") or "").strip(),
        "pf_1":        pf_1,
        "weapon":      weapon,
    }
    if pf_2:
        entry["pf_2"] = pf_2
        entry["weapon_pf2"] = weapon_pf2
    return entry


def _maps_to_rows(counts: dict | None, weapons: dict | None) -> list[dict]:
    weapons = weapons or {}
    return [
        {"role": role, "count": count, "weapon": weapons.get(role, "")}
        for role, count in (counts or {}).items()
    ]


def template_to_compo(name: str, data: dict, *, custom: bool) -> dict:
    pf1 = _maps_to_rows(data.get("pf_1"), data.get("weapon"))
    pf2 = _maps_to_rows(data.get("pf_2"), data.get("weapon_pf2"))
    return {
        "name":        name,
        "description": data.get("description", ""),
        "type_acti":   data.get("type_acti", "PVP"),
        "image":       data.get("image", ""),
        "pf1":         pf1,
        "pf2":         pf2,
        "total":       sum(r["count"] for r in pf1 + pf2),
        "custom":      custom,
    }
