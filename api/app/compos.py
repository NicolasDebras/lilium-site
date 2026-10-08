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


# Le bot affiche une ligne par place : un nombre géant le ferait générer des millions de lignes.
MAX_COUNT = 50


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
        if count > MAX_COUNT:
            raise InvalidCompo(f"{MAX_COUNT} joueurs maximum par ligne ({label}).")

        ids = row_build_ids(row)
        if ids:
            if len(ids) > MAX_BUILDS_PER_ROW:
                raise InvalidCompo(f"{MAX_BUILDS_PER_ROW} builds au choix maximum par ligne ({label}).")
            if len(set(ids)) != len(ids):
                raise InvalidCompo(f"Même build proposé deux fois sur une ligne ({label}).")
            chosen = []
            for bid in ids:
                build = builds_by_id.get(bid)
                if build is None:
                    raise InvalidCompo(f"Build introuvable (n°{bid}) : il a peut-être été supprimé.")
                chosen.append(build)
            roles = {b["role"].strip().upper() for b in chosen}
            if len(roles) > 1:
                raise InvalidCompo(f"Les builds au choix d'une ligne doivent avoir le même rôle ({label}).")
            role = roles.pop()
            # Plusieurs builds : le bot propose ce hint comme liste de choix à l'inscription /acti
            weapon = chosen[0]["name"] if len(chosen) == 1 else " · ".join(f"{b['name']} (×{count})" for b in chosen)
        else:
            role = str(row.get("role") or "").strip().upper()
            weapon = str(row.get("weapon") or "").strip()
        if not role:
            continue

        if role in counts:
            raise InvalidCompo(
                f"{role} est déjà sur une autre ligne en {label} : ajoute tes builds au choix sur la même ligne."
            )
        counts[role] = count
        if weapon:
            weapons[role] = weapon
        if ids:
            builds[role] = ids[0] if len(ids) == 1 else ids
    return counts, weapons, builds


MAX_BUILDS_PER_ROW = 10


def row_build_ids(row: dict) -> list[int]:
    """Builds d'une ligne : `build_ids` (plusieurs au choix) ou `build_id` (un seul, ancien format)."""
    ids = row.get("build_ids")
    if ids:
        return [int(i) for i in ids]
    return [int(row["build_id"])] if row.get("build_id") is not None else []


def stored_ids(value) -> list[int]:
    """Valeur de `builds[rôle]` en base : un id (ancien format) ou une liste d'ids."""
    if value is None:
        return []
    return [int(v) for v in (value if isinstance(value, list) else [value])]


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
        rows = []
        for role, count in (data.get(count_key) or {}).items():
            ids = stored_ids(builds.get(role))
            rows.append({"role": role, "count": count, "weapon": weapons.get(role, ""),
                         "build_id": ids[0] if ids else None, "build_ids": ids})
        compo[site_key] = rows
    compo["total"] = sum(r["count"] for r in compo["pf1"] + compo["pf2"])
    return compo


def build_ids_of(data: dict) -> set[int]:
    return {i for _, _, _, builds_key, _ in PARTIES for v in (data.get(builds_key) or {}).values() for i in stored_ids(v)}


def compos_using_build(templates: dict[str, dict], build_id: int) -> list[str]:
    return sorted(name for name, data in templates.items() if build_id in build_ids_of(data))


def rename_build(data: dict, build_id: int, new_name: str) -> dict:
    """Le hint affiché dans l'embed de /acti = nom du build : on le suit quand le build est renommé."""
    data = {**data}
    for _, count_key, weapon_key, builds_key, _ in PARTIES:
        for role, value in (data.get(builds_key) or {}).items():
            ids = stored_ids(value)
            if build_id not in ids:
                continue
            if len(ids) == 1:
                hint = new_name
            else:   # liste de choix « Nom (×N) · … » : on remplace la bonne entrée
                parts = str((data.get(weapon_key) or {}).get(role, "")).split(" · ")
                count = (data.get(count_key) or {}).get(role, 1)
                i = ids.index(build_id)
                if len(parts) != len(ids):
                    parts = [""] * len(ids)
                parts[i] = f"{new_name} (×{count})"
                hint = " · ".join(parts)
            data[weapon_key] = {**(data.get(weapon_key) or {}), role: hint}
    return data
