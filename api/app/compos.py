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


ROLE_ORDER = ("TANK", "HEAL", "DPS", "SUPPORT")
MAX_KEY = 100


def base_role(key: str) -> str:
    """Rôle de base d'une clé de ligne : « TANK · Main tank » → « TANK », « DPS 2 » → « DPS »
    (même règle que le bot, Service/activites.py → base_role)."""
    role = key.split(" · ", 1)[0].strip()
    parts = role.rsplit(" ", 1)
    if len(parts) == 2 and parts[1].isdigit() and parts[0] in ROLE_ORDER:
        return parts[0]
    return role


def role_rank(role: str) -> int:
    base = base_role(role)
    return ROLE_ORDER.index(base) if base in ROLE_ORDER else len(ROLE_ORDER)


def _unique_key(base: str, wanted: str, taken: set[str]) -> str:
    key = wanted[:MAX_KEY].rstrip()
    n = 2
    while key in taken:
        suffix = f" {n}"
        key = wanted[: MAX_KEY - len(suffix)].rstrip() + suffix
        n += 1
    return key


def _party(rows: list[dict], builds_by_id: dict[int, dict], label: str
           ) -> tuple[dict[str, int], dict[str, str], dict[str, int]]:
    """Lignes du formulaire → (places, hints, builds) par clé de ligne, triées par rôle.
    Plusieurs lignes du même rôle sont permises (ex. 2 tanks avec des builds différents) :
    la 1re garde la clé « TANK », les autres deviennent « TANK · Nom du build » (ou « TANK 2 »
    pour une ligne libre), car le bot range les inscriptions par clé."""
    parsed = []   # (rôle de base, build_id | None, nombre, hint)
    used_builds: set[int] = set()
    for row in rows:
        try:
            count = int(row.get("count"))
        except (TypeError, ValueError):
            continue
        if count <= 0:
            continue
        if count > MAX_COUNT:
            raise InvalidCompo(f"{MAX_COUNT} joueurs maximum par ligne ({label}).")

        build_id = row.get("build_id")
        if build_id is not None:
            build_id = int(build_id)
            build = builds_by_id.get(build_id)
            if build is None:
                raise InvalidCompo(f"Build introuvable (n°{build_id}) : il a peut-être été supprimé.")
            if build_id in used_builds:
                raise InvalidCompo(
                    f"« {build['name']} » est deux fois en {label} : augmente plutôt le nombre de joueurs de sa ligne."
                )
            used_builds.add(build_id)
            role, weapon = base_role(build["role"].strip().upper()), build["name"]
        else:
            role = base_role(str(row.get("role") or "").strip().upper())
            weapon = str(row.get("weapon") or "").strip()
        if role:
            parsed.append((role, build_id, count, weapon))

    parsed.sort(key=lambda p: role_rank(p[0]))   # tri stable : ordre de saisie gardé à rôle égal
    counts: dict[str, int] = {}
    weapons: dict[str, str] = {}
    builds: dict[str, int] = {}
    for role, build_id, count, weapon in parsed:
        if role not in counts:
            key = role
        else:
            wanted = f"{role} · {weapon}" if build_id is not None and weapon else f"{role} 2"
            key = _unique_key(role, wanted, set(counts))
        counts[key] = count
        if weapon:
            weapons[key] = weapon
        if build_id is not None:
            builds[key] = build_id
    return counts, weapons, builds


def stored_ids(value) -> list[int]:
    """Valeur de `builds[clé]` en base : un id, ou une liste (format éphémère « builds au choix » :
    seul le premier compte)."""
    if value is None:
        return []
    return [int(v) for v in (value if isinstance(value, list) else [value])][:1]


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
        for key, count in (data.get(count_key) or {}).items():
            ids = stored_ids(builds.get(key))
            # role = rôle de base (formulaire) ; slot_key = clé réelle (« TANK · Main tank »), pour l'affichage
            rows.append({"role": base_role(key), "slot_key": key, "count": count, "weapon": weapons.get(key, ""),
                         "build_id": ids[0] if ids else None})
        compo[site_key] = sorted(rows, key=lambda r: role_rank(r["role"]))
    compo["total"] = sum(r["count"] for r in compo["pf1"] + compo["pf2"])
    return compo


def build_ids_of(data: dict) -> set[int]:
    return {i for _, _, _, builds_key, _ in PARTIES for v in (data.get(builds_key) or {}).values() for i in stored_ids(v)}


def compos_using_build(templates: dict[str, dict], build_id: int) -> list[str]:
    return sorted(name for name, data in templates.items() if build_id in build_ids_of(data))


def rename_build(data: dict, build_id: int, new_name: str) -> dict:
    """Le hint affiché dans l'embed de /acti = nom du build : on le suit quand le build est renommé.
    La clé de la ligne (« TANK · Ancien nom ») ne change pas : une acti en cours garde ses inscrits."""
    data = {**data}
    for _, _, weapon_key, builds_key, _ in PARTIES:
        for key, value in (data.get(builds_key) or {}).items():
            if build_id in stored_ids(value):
                data[weapon_key] = {**(data.get(weapon_key) or {}), key: new_name}
    return data
