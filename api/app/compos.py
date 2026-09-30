"""Conversion entre le format du site (lignes build/rôle/nombre/arme) et le
format des templates du bot (table custom_templates, même format que /addtemplate) :

    {"description", "type_acti", "image",
     "pf_1": {rôle: nb}, "weapon": {rôle: hint}, "builds": {rôle: build_id},
     "pf_2": {rôle: nb}, "weapon_pf2": {rôle: hint}, "builds_pf2": {rôle: build_id}}
    (les clés *_pf2 seulement si la PF2 n'est pas vide)

Une ligne peut pointer vers un build (le rôle et le hint viennent alors du
build : un seul build par rôle et par party, le joueur choisit son rôle et le
build lui est imposé) ou rester libre (rôle + arme en texte, comme avant).
Logique pure, sans I/O.
"""

PARTIES = (
    # (clé du site, clé nombres, clé hints, clé builds, libellé)
    ("pf1", "pf_1", "weapon", "builds", "PF1"),
    ("pf2", "pf_2", "weapon_pf2", "builds_pf2", "PF2"),
)


class InvalidCompo(ValueError):
    pass


def _party(rows: list[dict], builds_by_id: dict[int, dict], label: str
           ) -> tuple[dict[str, int], dict[str, str], dict[str, int]]:
    counts: dict[str, int] = {}
    weapons: dict[str, str] = {}
    builds: dict[str, int] = {}
    for row in rows:
        raw_count = row.get("count")
        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            continue
        if count <= 0:
            continue

        build_id = row.get("build_id")
        if build_id is not None:
            build = builds_by_id.get(int(build_id))
            if build is None:
                raise InvalidCompo(f"Build introuvable (n°{build_id}) : il a peut-être été supprimé.")
            role, weapon = build["role"].strip().upper(), build["name"]
        else:
            role = str(row.get("role") or "").strip().upper()
            weapon = str(row.get("weapon") or "").strip()
        if not role:
            continue

        if role in counts:
            raise InvalidCompo(f"Un seul build par rôle et par party : {role} en double en {label}.")
        counts[role] = count
        if weapon:
            weapons[role] = weapon
        if build_id is not None:
            builds[role] = int(build_id)
    return counts, weapons, builds


def build_template_entry(body: dict, builds_by_id: dict[int, dict] | None = None) -> dict:
    builds_by_id = builds_by_id or {}
    entry = {
        "description": str(body.get("description") or "").strip(),
        "type_acti":   body.get("type_acti") or "PVP",
        "image":       str(body.get("image") or "").strip(),
    }
    for site_key, count_key, weapon_key, builds_key, label in PARTIES:
        counts, weapons, builds = _party(body.get(site_key) or [], builds_by_id, label)
        if site_key == "pf2" and not counts:
            continue
        entry[count_key] = counts
        entry[weapon_key] = weapons
        if builds:
            entry[builds_key] = builds
    return entry


def template_to_compo(name: str, data: dict, *, custom: bool) -> dict:
    compo = {
        "name":        name,
        "description": data.get("description", ""),
        "type_acti":   data.get("type_acti", "PVP"),
        "image":       data.get("image", ""),
        "custom":      custom,
    }
    for site_key, count_key, weapon_key, builds_key, _ in PARTIES:
        weapons = data.get(weapon_key) or {}
        builds = data.get(builds_key) or {}
        compo[site_key] = [
            {"role": role, "count": count, "weapon": weapons.get(role, ""), "build_id": builds.get(role)}
            for role, count in (data.get(count_key) or {}).items()
        ]
    compo["total"] = sum(r["count"] for r in compo["pf1"] + compo["pf2"])
    return compo


def build_ids_of(data: dict) -> set[int]:
    return {int(b) for _, _, _, builds_key, _ in PARTIES for b in (data.get(builds_key) or {}).values()}


def compos_using_build(templates: dict[str, dict], build_id: int) -> list[str]:
    return sorted(name for name, data in templates.items() if build_id in build_ids_of(data))


def rename_build(data: dict, build_id: int, new_name: str) -> dict:
    """Le hint affiché dans l'embed de /acti = nom du build : on le suit quand le build est renommé."""
    data = {**data}
    for _, _, weapon_key, builds_key, _ in PARTIES:
        for role, bid in (data.get(builds_key) or {}).items():
            if int(bid) == build_id:
                data[weapon_key] = {**(data.get(weapon_key) or {}), role: new_name}
    return data
