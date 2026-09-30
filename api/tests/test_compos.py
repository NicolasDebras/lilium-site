import pytest

from app.compos import (
    InvalidCompo, build_ids_of, build_template_entry, compos_using_build, rename_build, template_to_compo,
)

BUILDS = {
    12: {"id": 12, "name": "Tank Masse", "role": "TANK"},
    15: {"id": 15, "name": "Heal Sacré", "role": "heal"},
    20: {"id": 20, "name": "DPS Arc", "role": "DPS"},
}


# ── Lignes libres (ancien mode) ──────────────────────────────────────────────

def test_entry_pf1_only_has_no_pf2_keys():
    entry = build_template_entry({
        "description": "  Compo  ", "type_acti": "PVE", "image": "",
        "pf1": [{"role": "tank", "count": "2", "weapon": " Masse "}, {"role": "DPS", "count": 3}],
    })
    assert entry == {
        "description": "Compo", "type_acti": "PVE", "image": "",
        "pf_1": {"TANK": 2, "DPS": 3}, "weapon": {"TANK": "Masse"},
    }


def test_entry_skips_empty_and_invalid_rows():
    entry = build_template_entry({"pf1": [
        {"role": "", "count": 2},
        {"role": "HEAL", "count": ""},
        {"role": "HEAL", "count": "abc"},
        {"role": "HEAL", "count": 0},
        {"role": "SUPPORT", "count": None},
        {"role": "DPS", "count": 1},
    ]})
    assert entry["pf_1"] == {"DPS": 1}


def test_entry_with_pf2():
    entry = build_template_entry({
        "pf1": [{"role": "TANK", "count": 1}],
        "pf2": [{"role": "HEAL", "count": 2, "weapon": "Sancti"}],
    })
    assert entry["pf_2"] == {"HEAL": 2}
    assert entry["weapon_pf2"] == {"HEAL": "Sancti"}
    assert entry["type_acti"] == "PVP"


def test_same_role_twice_in_a_party_is_rejected():
    with pytest.raises(InvalidCompo, match="TANK en double en PF1"):
        build_template_entry({"pf1": [{"role": "TANK", "count": 1}, {"role": "tank", "count": 2}]})


def test_same_role_in_pf1_and_pf2_is_fine():
    entry = build_template_entry({"pf1": [{"role": "TANK", "count": 1}], "pf2": [{"role": "TANK", "count": 1}]})
    assert entry["pf_1"] == {"TANK": 1} and entry["pf_2"] == {"TANK": 1}


# ── Lignes avec build ────────────────────────────────────────────────────────

def test_build_row_takes_role_and_hint_from_build():
    entry = build_template_entry({"pf1": [
        {"build_id": 12, "count": 2, "role": "IGNORÉ", "weapon": "ignoré"},
        {"build_id": 15, "count": 3},
    ]}, BUILDS)
    assert entry["pf_1"] == {"TANK": 2, "HEAL": 3}
    assert entry["weapon"] == {"TANK": "Tank Masse", "HEAL": "Heal Sacré"}
    assert entry["builds"] == {"TANK": 12, "HEAL": 15}


def test_build_rows_in_pf2():
    entry = build_template_entry({"pf1": [{"build_id": 12, "count": 1}], "pf2": [{"build_id": 20, "count": 4}]}, BUILDS)
    assert entry["builds_pf2"] == {"DPS": 20}
    assert entry["weapon_pf2"] == {"DPS": "DPS Arc"}


def test_mixed_build_and_free_rows():
    entry = build_template_entry({"pf1": [{"build_id": 12, "count": 1}, {"role": "CALLER", "count": 1}]}, BUILDS)
    assert entry["pf_1"] == {"TANK": 1, "CALLER": 1}
    assert entry["builds"] == {"TANK": 12}


def test_two_builds_with_same_role_rejected():
    builds = {**BUILDS, 13: {"id": 13, "name": "Tank Hallebarde", "role": "TANK"}}
    with pytest.raises(InvalidCompo, match="TANK en double"):
        build_template_entry({"pf1": [{"build_id": 12, "count": 1}, {"build_id": 13, "count": 1}]}, builds)


def test_unknown_build_rejected():
    with pytest.raises(InvalidCompo, match="Build introuvable"):
        build_template_entry({"pf1": [{"build_id": 999, "count": 1}]}, BUILDS)


def test_no_builds_key_without_build_rows():
    assert "builds" not in build_template_entry({"pf1": [{"role": "TANK", "count": 1}]})


# ── Relecture / cohérence ────────────────────────────────────────────────────

def test_template_to_compo_roundtrip_with_builds():
    body = {"description": "d", "type_acti": "PVP", "image": "",
            "pf1": [{"build_id": 12, "count": 2}, {"role": "CALLER", "count": 1, "weapon": "Libre"}],
            "pf2": [{"build_id": 20, "count": 5}]}
    compo = template_to_compo("ZvZ", build_template_entry(body, BUILDS), custom=True)
    assert compo["pf1"] == [
        {"role": "TANK", "count": 2, "weapon": "Tank Masse", "build_id": 12},
        {"role": "CALLER", "count": 1, "weapon": "Libre", "build_id": None},
    ]
    assert compo["pf2"] == [{"role": "DPS", "count": 5, "weapon": "DPS Arc", "build_id": 20}]
    assert compo["total"] == 8
    assert compo["custom"] is True


def test_template_to_compo_handles_bot_format_without_weapons():
    compo = template_to_compo("Donjon", {"pf_1": {"TANK": 1, "DPS": 3}}, custom=False)
    assert compo["pf1"][1] == {"role": "DPS", "count": 3, "weapon": "", "build_id": None}
    assert compo["pf2"] == [] and compo["description"] == ""


def test_compos_using_build():
    templates = {
        "ZvZ": build_template_entry({"pf1": [{"build_id": 12, "count": 1}]}, BUILDS),
        "Donjon": build_template_entry({"pf1": [{"role": "TANK", "count": 1}], "pf2": [{"build_id": 12, "count": 1}]}, BUILDS),
        "Autre": build_template_entry({"pf1": [{"build_id": 15, "count": 1}]}, BUILDS),
    }
    assert compos_using_build(templates, 12) == ["Donjon", "ZvZ"]
    assert build_ids_of(templates["Autre"]) == {15}
    assert compos_using_build(templates, 999) == []


def test_rename_build_updates_hint_in_both_parties():
    data = build_template_entry({"pf1": [{"build_id": 12, "count": 1}], "pf2": [{"build_id": 12, "count": 1}]}, BUILDS)
    renamed = rename_build(data, 12, "Tank Nouveau")
    assert renamed["weapon"]["TANK"] == "Tank Nouveau"
    assert renamed["weapon_pf2"]["TANK"] == "Tank Nouveau"
    assert data["weapon"]["TANK"] == "Tank Masse"  # l'original n'est pas modifié
