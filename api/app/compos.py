"""Conversion entre le format du site (lignes build/rôle/nombre/arme) et le
format des templates du bot (table custom_templates, même format que /addtemplate) :

    {"description", "type_acti", "image",
     "pf_1": {rôle: nb}, "weapon": {rôle: hint}, "builds": {rôle: build_id},
     "pf_2": {rôle: nb}, "weapon_pf2": {rôle: hint}, "builds_pf2": {rôle: build_id}}
    (les clés *_pf2 seulement si la PF2 n'est pas vide)
    + "role_multipliers": {clé: parts} (clés PF2 préfixées « PF2: ») si les parts sont personnalisées

Une ligne peut pointer vers un build (le rôle et le hint viennent alors du
build : un seul build par rôle et par party, le joueur choisit son rôle et le
build lui est imposé) ou rester libre (rôle + arme en texte, comme avant).
Logique pure, sans I/O.
"""
from app.i18n import tr

PARTIES = (
    # (clé du site, clé nombres, clé hints, clé builds, libellé)
    ("pf1", "pf_1", "weapon", "builds", "PF1"),
    ("pf2", "pf_2", "weapon_pf2", "builds_pf2", "PF2"),
)


# Le bot affiche une ligne par place : un nombre géant le ferait générer des millions de lignes.
MAX_COUNT = 50
MAX_SHARE = 10   # parts de paie max d'une ligne (/finacti : role_multipliers)


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


def _share(value) -> float:
    """Parts de paie d'une ligne (1 par défaut), bornées à [0, MAX_SHARE]."""
    try:
        share = round(float(value), 2)
    except (TypeError, ValueError):
        return 1.0
    if not 0 <= share <= MAX_SHARE:
        raise InvalidCompo(tr("bad_share", max=f"{MAX_SHARE:g}"))
    return share


def _party(rows: list[dict], builds_by_id: dict[int, dict], label: str, with_shares: bool = False
           ) ->tuple[dict[str, int], dict[str, str], dict[str, int], dict[str, float]]:
    """Lignes du formulaire → (places, hints, builds, parts) par clé de ligne, triées par rôle.
    Plusieurs lignes du même rôle sont permises (ex. 2 tanks avec des builds différents) :
    la 1re garde la clé « TANK », les autres deviennent « TANK · Nom du build » (ou « TANK 2 »
    pour une ligne libre), car le bot range les inscriptions par clé."""
    parsed = []   # (rôle de base, build_id | None, nombre, hint, parts)
    used_builds: set[int] = set()
    for row in rows:
        try:
            count = int(row.get("count"))
        except (TypeError, ValueError):
            continue
        if count <= 0:
            continue
        if count > MAX_COUNT:
            raise InvalidCompo(tr("max_count", max=MAX_COUNT, label=label))

        build_id = row.get("build_id")
        if build_id is not None:
            build_id = int(build_id)
            build = builds_by_id.get(build_id)
            if build is None:
                raise InvalidCompo(tr("compo_build_missing", id=build_id))
            if build_id in used_builds:
                raise InvalidCompo(tr("build_twice", name=build['name'], label=label))
            used_builds.add(build_id)
            role, weapon = base_role(build["role"].strip().upper()), build["name"]
        else:
            role = base_role(str(row.get("role") or "").strip().upper())
            weapon = str(row.get("weapon") or "").strip()
        if role:
            parsed.append((role, build_id, count, weapon, _share(row.get("share", 1)) if with_shares else 1.0))

    parsed.sort(key=lambda p: role_rank(p[0]))   # tri stable : ordre de saisie gardé à rôle égal
    counts: dict[str, int] = {}
    weapons: dict[str, str] = {}
    builds: dict[str, int] = {}
    shares: dict[str, float] = {}
    for role, build_id, count, weapon, share in parsed:
        if role not in counts:
            key = role
        else:
            wanted = f"{role} · {weapon}" if build_id is not None and weapon else f"{role} 2"
            key = _unique_key(role, wanted, set(counts))
        counts[key] = count
        shares[key] = share
        if weapon:
            weapons[key] = weapon
        if build_id is not None:
            builds[key] = build_id
    return counts, weapons, builds, shares


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
    multipliers: dict[str, float] = {}
    with_shares = bool(body.get("custom_shares"))
    for site_key, count_key, weapon_key, builds_key, label in PARTIES:
        counts, weapons, builds, shares = _party(body.get(site_key) or [], builds_by_id, label, with_shares)
        if site_key == "pf2" and not counts:
            continue
        entry[count_key] = counts
        entry[weapon_key] = weapons
        if builds:
            entry[builds_key] = builds
        prefix = "PF2:" if site_key == "pf2" else ""
        multipliers.update({prefix + key: share for key, share in shares.items()})
    # Parts de paie (/finacti) : chaque clé de ligne, 1 comprise, pour qu'une ligne PF2 ne
    # retombe pas sur la part du rôle de base PF1 (le bot cherche la clé exacte, puis le rôle).
    if with_shares:
        entry["role_multipliers"] = multipliers
    return entry


def _row_share(multipliers: dict, key: str, pf2: bool) -> float:
    """Même recherche que le bot (/finacti) : clé exacte (« PF2:… » en PF2), puis rôle de base."""
    exact = f"PF2:{key}" if pf2 else key
    return float(multipliers.get(exact, multipliers.get(base_role(key), 1)))


def template_to_compo(name: str, data: dict, *, custom: bool) -> dict:
    compo = {
        "name":        name,
        "description": data.get("description", ""),
        "type_acti":   data.get("type_acti", "PVP"),
        "image":       data.get("image", ""),
        "custom":      custom,
    }
    multipliers = data.get("role_multipliers") or {}
    compo["custom_shares"] = bool(multipliers)
    for site_key, count_key, weapon_key, builds_key, _ in PARTIES:
        weapons = data.get(weapon_key) or {}
        builds = data.get(builds_key) or {}
        rows = []
        for key, count in (data.get(count_key) or {}).items():
            ids = stored_ids(builds.get(key))
            # role = rôle de base (formulaire) ; slot_key = clé réelle (« TANK · Main tank »), pour l'affichage
            rows.append({"role": base_role(key), "slot_key": key, "count": count, "weapon": weapons.get(key, ""),
                         "build_id": ids[0] if ids else None,
                         "share": _row_share(multipliers, key, site_key == "pf2")})
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
