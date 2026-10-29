"""Conversion entre le format du site (lignes build/rôle/nombre/arme) et le
format des templates du bot (table custom_templates, même format que /addtemplate) :

    {"description", "type_acti", "image",
     "pf_1": {rôle: nb}, "weapon": {rôle: hint}, "builds": {rôle: build_id},
     "pf_2": {rôle: nb}, "weapon_pf2": {rôle: hint}, "builds_pf2": {rôle: build_id}}
    (les clés *_pf2 seulement si la PF2 n'est pas vide)
    + "role_multipliers": {clé: parts} (clés PF2 préfixées « PF2: ») si les parts sont personnalisées
    + pf_1["LEACHER PVP"] = nb et "zero_pay_roles": ["LEACHER PVP"] si la compo accepte des leachers

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
LEACHER_ROLE = "LEACHER PVP"   # même clé que le bot (roles_templates.py, massup.py)


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


MAX_ALT_BUILDS = 24  # builds « au choix » en plus du principal : un menu Discord a 25 options au plus
BUILDS_SEPARATOR = " / "   # hint d'une ligne à plusieurs builds : « Ardent / Aria »


def _party(rows: list[dict], builds_by_id: dict[int, dict], label: str, with_shares: bool = False
           ) -> tuple[dict[str, int], dict[str, str], dict[str, int | list[int]], dict[str, float]]:
    """Lignes du formulaire → (places, hints, builds, parts) par clé de ligne, triées par rôle.
    Plusieurs lignes du même rôle sont permises (ex. 2 tanks avec des builds différents) :
    la 1re garde la clé « TANK », les autres deviennent « TANK · Nom du build » (ou « TANK 2 »
    pour une ligne libre), car le bot range les inscriptions par clé.
    Une ligne peut proposer jusqu'à MAX_ALT_BUILDS builds au choix en plus (`alt_build_ids`, même rôle) :
    ils partagent les places de la ligne ({clé: [principal, autres…]}) et le joueur choisit le sien
    à l'inscription."""
    parsed = []   # (rôle de base, [build_ids], nombre, hint, parts)
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
        ids: list[int] = []
        if build_id is not None:
            alts = [int(a) for a in (row.get("alt_build_ids") or []) if a is not None]
            if len(alts) > MAX_ALT_BUILDS:
                raise InvalidCompo(tr("max_alt_builds", max=MAX_ALT_BUILDS + 1))
            names = []
            for bid in [int(build_id), *alts]:
                build = builds_by_id.get(bid)
                if build is None:
                    raise InvalidCompo(tr("compo_build_missing", id=bid))
                if bid in used_builds:
                    raise InvalidCompo(tr("build_twice", name=build['name'], label=label))
                used_builds.add(bid)
                ids.append(bid)
                names.append(build["name"])
            role = base_role(builds_by_id[ids[0]]["role"].strip().upper())
            for bid in ids[1:]:
                if base_role(builds_by_id[bid]["role"].strip().upper()) != role:
                    raise InvalidCompo(tr("alt_build_role", name=builds_by_id[bid]["name"], role=role))
            weapon = BUILDS_SEPARATOR.join(names)
        else:
            role = base_role(str(row.get("role") or "").strip().upper())
            weapon = str(row.get("weapon") or "").strip()
        if role:
            parsed.append((role, ids, count, weapon, _share(row.get("share", 1)) if with_shares else 1.0))

    parsed.sort(key=lambda p: role_rank(p[0]))   # tri stable : ordre de saisie gardé à rôle égal
    counts: dict[str, int] = {}
    weapons: dict[str, str] = {}
    builds: dict[str, int | list[int]] = {}
    shares: dict[str, float] = {}
    for role, ids, count, weapon, share in parsed:
        if role not in counts:
            key = role
        else:
            first = weapon.split(BUILDS_SEPARATOR)[0] if ids else ""
            wanted = f"{role} · {first}" if first else f"{role} 2"
            key = _unique_key(role, wanted, set(counts))
        counts[key] = count
        shares[key] = share
        if weapon:
            weapons[key] = weapon
        if ids:
            builds[key] = ids if len(ids) > 1 else ids[0]
    return counts, weapons, builds, shares


def stored_ids(value) -> list[int]:
    """Valeur de `builds[clé]` en base : un id, ou une liste = builds au choix de la ligne (le premier
    est le principal), qui partagent ses places."""
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
    # Leachers : places en PF1, non payés à /finacti (zero_pay_roles, lu par le bot)
    if body.get("accept_leachers"):
        count = _leacher_count(body.get("leacher_count"))
        entry["pf_1"][LEACHER_ROLE] = count
        entry["zero_pay_roles"] = [LEACHER_ROLE]
        if with_shares:
            multipliers.pop(LEACHER_ROLE, None)
    return entry


def _leacher_count(value) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError):
        count = 0
    if not 1 <= count <= MAX_COUNT:
        raise InvalidCompo(tr("bad_leacher_count", max=MAX_COUNT))
    return count


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
    leachers = (data.get("pf_1") or {}).get(LEACHER_ROLE)
    compo["accept_leachers"] = bool(leachers)
    compo["leacher_count"] = leachers or 1
    for site_key, count_key, weapon_key, builds_key, _ in PARTIES:
        weapons = data.get(weapon_key) or {}
        builds = data.get(builds_key) or {}
        rows = []
        for key, count in (data.get(count_key) or {}).items():
            if site_key == "pf1" and key == LEACHER_ROLE:
                continue   # affiché par le switch « leachers », pas comme une ligne
            ids = stored_ids(builds.get(key))
            # role = rôle de base (formulaire) ; slot_key = clé réelle (« TANK · Main tank »), pour l'affichage
            rows.append({"role": base_role(key), "slot_key": key, "count": count, "weapon": weapons.get(key, ""),
                         "build_id": ids[0] if ids else None, "alt_build_ids": ids[1:],
                         "share": _row_share(multipliers, key, site_key == "pf2")})
        compo[site_key] = sorted(rows, key=lambda r: role_rank(r["role"]))
    compo["total"] = sum(r["count"] for r in compo["pf1"] + compo["pf2"]) + (leachers or 0)
    return compo


def build_ids_of(data: dict) -> set[int]:
    return {i for _, _, _, builds_key, _ in PARTIES for v in (data.get(builds_key) or {}).values() for i in stored_ids(v)}


def compos_using_build(templates: dict[str, dict], build_id: int) -> list[str]:
    return sorted(name for name, data in templates.items() if build_id in build_ids_of(data))


def rename_build(data: dict, build_id: int, new_name: str, names: dict[int, str] | None = None) -> dict:
    """Le hint affiché dans l'embed de /acti = nom du build (« Ardent / Aria » pour une ligne à
    plusieurs builds, `names` = {id: nom} des builds du serveur) : on le suit quand le build est renommé.
    La clé de la ligne (« TANK · Ancien nom ») ne change pas : une acti en cours garde ses inscrits."""
    data = {**data}
    names = {**(names or {}), build_id: new_name}
    for _, _, weapon_key, builds_key, _ in PARTIES:
        for key, value in (data.get(builds_key) or {}).items():
            ids = stored_ids(value)
            if build_id in ids:
                hint = BUILDS_SEPARATOR.join(names.get(i, "?") for i in ids)
                data[weapon_key] = {**(data.get(weapon_key) or {}), key: hint}
    return data
