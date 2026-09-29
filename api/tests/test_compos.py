from app.compos import build_template_entry, template_to_compo


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


def test_template_to_compo_roundtrip():
    body = {"description": "d", "type_acti": "PVP", "image": "",
            "pf1": [{"role": "TANK", "count": 2, "weapon": "Masse"}],
            "pf2": [{"role": "DPS", "count": 5, "weapon": ""}]}
    compo = template_to_compo("ZvZ", build_template_entry(body), custom=True)
    assert compo["pf1"] == body["pf1"]
    assert compo["pf2"] == body["pf2"]
    assert compo["total"] == 7
    assert compo["custom"] is True


def test_template_to_compo_handles_bot_format_without_weapons():
    compo = template_to_compo("Donjon", {"pf_1": {"TANK": 1, "DPS": 3}}, custom=False)
    assert compo["pf1"][1] == {"role": "DPS", "count": 3, "weapon": ""}
    assert compo["pf2"] == [] and compo["description"] == ""
