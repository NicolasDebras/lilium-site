from tests.fakes import ADMIN_ID, GHOST_ID, GUILD, MEMBER_ID, STAFF_ID, STRANGER_ID

BUILD = {"name": "Tank Masse", "role": "tank", "type_acti": "PVP", "weapon": "1H Masse", "notes": "", "image": ""}
COMPO = {"name": "ZvZ", "description": "", "type_acti": "PVP", "image": "",
         "pf1": [{"role": "TANK", "count": 2, "weapon": ""}], "pf2": []}


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok", "database": True}


def test_me_requires_login(client):
    assert client.get("/api/me").status_code == 401


def test_me_lists_guilds_with_level(login):
    r = login(ADMIN_ID).get("/api/me")
    assert r.status_code == 200
    assert r.json()["guilds"] == [{"id": str(GUILD), "name": "Lilium", "icon": None, "level": "admin"}]


def test_me_hides_guild_user_has_left(login):
    assert login(GHOST_ID).get("/api/me").json()["guilds"] == []


def test_me_when_discord_down_returns_no_guild_instead_of_crashing(login, fake_discord):
    fake_discord.down = True
    assert login(MEMBER_ID).get("/api/me").json()["guilds"] == []


def test_member_endpoints_forbidden_without_profile(login):
    assert login(STRANGER_ID).get(f"/api/guilds/{GUILD}/builds").status_code == 403


def test_discord_down_on_guarded_route_is_503(login, fake_discord):
    fake_discord.down = True
    assert login(MEMBER_ID).get(f"/api/guilds/{GUILD}/builds").status_code == 503


# ── Builds ───────────────────────────────────────────────────────────────────

def test_member_can_read_but_not_write_builds(login):
    c = login(MEMBER_ID)
    assert c.get(f"/api/guilds/{GUILD}/builds").json() == []
    assert c.post(f"/api/guilds/{GUILD}/builds", json=BUILD).status_code == 403


def test_staff_build_crud(login):
    c = login(STAFF_ID, "Chef")
    r = c.post(f"/api/guilds/{GUILD}/builds", json=BUILD)
    assert r.status_code == 201
    build_id = r.json()["id"]

    listed = c.get(f"/api/guilds/{GUILD}/builds").json()
    assert listed[0]["role"] == "TANK" and listed[0]["created_by_name"] == "Chef"

    assert c.put(f"/api/guilds/{GUILD}/builds/{build_id}", json={**BUILD, "name": "Nouveau"}).status_code == 200
    assert c.get(f"/api/guilds/{GUILD}/builds/{build_id}").json()["name"] == "Nouveau"

    assert c.delete(f"/api/guilds/{GUILD}/builds/{build_id}").status_code == 204
    assert c.get(f"/api/guilds/{GUILD}/builds/{build_id}").status_code == 404


def test_build_filters(login):
    c = login(STAFF_ID)
    c.post(f"/api/guilds/{GUILD}/builds", json=BUILD)
    c.post(f"/api/guilds/{GUILD}/builds", json={**BUILD, "role": "HEAL", "type_acti": "PVE"})
    assert len(c.get(f"/api/guilds/{GUILD}/builds?role=HEAL").json()) == 1
    assert len(c.get(f"/api/guilds/{GUILD}/builds?type_acti=PVP").json()) == 1


def test_build_validation(login):
    c = login(STAFF_ID)
    assert c.post(f"/api/guilds/{GUILD}/builds", json={**BUILD, "name": ""}).status_code == 422
    assert c.post(f"/api/guilds/{GUILD}/builds", json={**BUILD, "type_acti": "RAID"}).status_code == 422


def test_admin_inherits_staff_rights(login):
    assert login(ADMIN_ID).post(f"/api/guilds/{GUILD}/builds", json=BUILD).status_code == 201


def test_update_unknown_build_is_404(login):
    assert login(STAFF_ID).put(f"/api/guilds/{GUILD}/builds/999", json=BUILD).status_code == 404


# ── Compos ───────────────────────────────────────────────────────────────────

def test_compos_list_contains_defaults(login):
    data = login(MEMBER_ID).get(f"/api/guilds/{GUILD}/compos").json()
    assert data["custom"] == []
    assert data["defaults"][0]["name"] == "Donjon Groupe 5"


def test_member_cannot_create_compo(login):
    assert login(MEMBER_ID).post(f"/api/guilds/{GUILD}/compos", json=COMPO).status_code == 403


def test_staff_compo_crud_writes_bot_format(login, fake_db):
    c = login(STAFF_ID)
    assert c.post(f"/api/guilds/{GUILD}/compos", json=COMPO).status_code == 201
    assert fake_db.templates[GUILD]["ZvZ"]["pf_1"] == {"TANK": 2}

    updated = {**COMPO, "pf2": [{"role": "DPS", "count": 4, "weapon": "Arc"}]}
    assert c.put(f"/api/guilds/{GUILD}/compos/ZvZ", json=updated).status_code == 200
    assert fake_db.templates[GUILD]["ZvZ"]["weapon_pf2"] == {"DPS": "Arc"}
    assert c.get(f"/api/guilds/{GUILD}/compos/ZvZ").json()["total"] == 6

    assert c.delete(f"/api/guilds/{GUILD}/compos/ZvZ").status_code == 204
    assert c.delete(f"/api/guilds/{GUILD}/compos/ZvZ").status_code == 404


def test_compo_cannot_use_default_template_name(login):
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/compos", json={**COMPO, "name": "Donjon Groupe 5"})
    assert r.status_code == 409


def test_compo_duplicate_name_rejected(login):
    c = login(STAFF_ID)
    c.post(f"/api/guilds/{GUILD}/compos", json=COMPO)
    assert c.post(f"/api/guilds/{GUILD}/compos", json=COMPO).status_code == 409


def test_compo_without_pf1_rejected(login):
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/compos", json={**COMPO, "pf1": []})
    assert r.status_code == 422


# ── BAL / rôles / admin ──────────────────────────────────────────────────────

def test_my_bal(login):
    assert login(MEMBER_ID).get(f"/api/guilds/{GUILD}/bal/me").json() == {"amount": 1_500_000, "ig_name": "Joueur1"}


def test_roles_list(login):
    roles = login(MEMBER_ID).get(f"/api/guilds/{GUILD}/roles").json()
    assert {"name": "TANK", "emoji": "🛡️"} in roles


def test_admin_overview_forbidden_for_staff(login):
    assert login(STAFF_ID).get(f"/api/guilds/{GUILD}/admin/overview").status_code == 403


def test_admin_overview_for_admin(login):
    r = login(ADMIN_ID).get(f"/api/guilds/{GUILD}/admin/overview")
    assert r.status_code == 200
    assert r.json()["profiles"] == 4


def test_admin_bal_stats(login, fake_db):
    r = login(ADMIN_ID).get(f"/api/guilds/{GUILD}/admin/bal?period=90d")
    assert r.status_code == 200
    body = r.json()
    assert body["days"] == 90 and body["bucket"] == "week"
    assert body["totals"]["due"] == 1_500_000
    assert body["top_players"] == [{"name": "Joueur1", "amount": 1_500_000}]
    assert len(body["heatmap"]) == 7 and "previous" in body


def test_admin_bal_week_period(login):
    body = login(ADMIN_ID).get(f"/api/guilds/{GUILD}/admin/bal?period=week").json()
    assert body["period"] == "week" and 1 <= body["days"] <= 7


def test_admin_bal_rejects_unknown_period(login):
    assert login(ADMIN_ID).get(f"/api/guilds/{GUILD}/admin/bal?period=400d").status_code == 422


def test_my_bal_history_only_reads_my_own_data(login, fake_db):
    r = login(MEMBER_ID).get(f"/api/guilds/{GUILD}/bal/me/history?period=week")
    assert r.status_code == 200
    body = r.json()
    assert (body["amount"], body["rank"], body["players"]) == (1_500_000, 1, 1)
    assert fake_db.my_events_query == (GUILD, MEMBER_ID)


def test_my_bal_history_without_balance_has_no_rank(login):
    body = login(STAFF_ID).get(f"/api/guilds/{GUILD}/bal/me/history").json()
    assert body["amount"] == 0 and body["rank"] is None and body["period"] == "30d"


def test_my_bal_history_requires_membership(login):
    assert login(STRANGER_ID).get(f"/api/guilds/{GUILD}/bal/me/history").status_code == 403


def test_admin_bal_forbidden_for_staff(login):
    assert login(STAFF_ID).get(f"/api/guilds/{GUILD}/admin/bal").status_code == 403


def test_permission_check_is_cached_between_requests(login, fake_db):
    c = login(MEMBER_ID)
    c.get(f"/api/guilds/{GUILD}/builds")
    c.get(f"/api/guilds/{GUILD}/compos")
    c.get(f"/api/guilds/{GUILD}/roles")
    assert fake_db.access_queries == 1


# ── Équipement (objets Albion) ───────────────────────────────────────────────

def test_items_catalog_requires_login(client):
    assert client.get("/api/items").status_code == 401


def test_items_catalog(login):
    items = login(MEMBER_ID).get("/api/items").json()
    assert any(i["id"] == "MAIN_SWORD" and i["slot"] == "mainhand" for i in items)


def test_build_with_items_roundtrip(login):
    c = login(STAFF_ID)
    items = {"head": ["HEAD_PLATE_SET1"], "mainhand": ["MAIN_SWORD", "2H_HOLYSTAFF"], "offhand": ["OFF_SHIELD"],
             "cape": ["*"], "food": ["MEAL_STEW"], "potion": ["POTION_HEAL"]}
    build_id = c.post(f"/api/guilds/{GUILD}/builds", json={**BUILD, "items": items}).json()["id"]
    got = c.get(f"/api/guilds/{GUILD}/builds/{build_id}").json()["items"]
    assert got == {"mainhand": ["MAIN_SWORD", "2H_HOLYSTAFF"], "offhand": ["OFF_SHIELD"], "head": ["HEAD_PLATE_SET1"],
                   "cape": ["*"], "food": ["MEAL_STEW"], "potion": ["POTION_HEAL"]}


def test_build_old_string_items_are_read_as_lists(login, fake_db):
    c = login(STAFF_ID)
    build_id = c.post(f"/api/guilds/{GUILD}/builds", json=BUILD).json()["id"]
    fake_db.builds[build_id]["items"] = {"mainhand": "MAIN_SWORD"}  # ligne écrite avant les choix multiples
    assert c.get(f"/api/guilds/{GUILD}/builds/{build_id}").json()["items"] == {"mainhand": ["MAIN_SWORD"]}


def test_build_without_items_defaults_to_empty(login):
    c = login(STAFF_ID)
    build_id = c.post(f"/api/guilds/{GUILD}/builds", json=BUILD).json()["id"]
    assert c.get(f"/api/guilds/{GUILD}/builds/{build_id}").json()["items"] == {}


def test_build_rejects_offhand_with_two_handed(login):
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/builds",
                             json={**BUILD, "items": {"mainhand": ["2H_HOLYSTAFF"], "offhand": ["OFF_SHIELD"]}})
    assert r.status_code == 422
    assert "deux mains" in r.json()["detail"]


def test_build_rejects_unknown_item(login):
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/builds", json={**BUILD, "items": {"head": ["PAS_UN_OBJET"]}})
    assert r.status_code == 422


# ── Compos composées de builds ───────────────────────────────────────────────

def _make_build(c, name, role):
    return c.post(f"/api/guilds/{GUILD}/builds", json={**BUILD, "name": name, "role": role}).json()["id"]


def test_compo_with_builds(login, fake_db):
    c = login(STAFF_ID)
    tank, heal = _make_build(c, "Tank Masse", "TANK"), _make_build(c, "Heal Sacre", "HEAL")
    body = {**COMPO, "pf1": [{"build_id": tank, "count": 2}, {"build_id": heal, "count": 3}]}
    assert c.post(f"/api/guilds/{GUILD}/compos", json=body).status_code == 201

    saved = fake_db.templates[GUILD]["ZvZ"]
    assert saved["pf_1"] == {"TANK": 2, "HEAL": 3}
    assert saved["builds"] == {"TANK": tank, "HEAL": heal}
    assert saved["weapon"] == {"TANK": "Tank Masse", "HEAL": "Heal Sacre"}
    rows = c.get(f"/api/guilds/{GUILD}/compos/ZvZ").json()["pf1"]
    assert [r["build_id"] for r in rows] == [tank, heal]


def test_compo_two_tanks_with_different_builds(login):
    c = login(STAFF_ID)
    a, b = _make_build(c, "Tank A", "TANK"), _make_build(c, "Tank B", "TANK")
    r = c.post(f"/api/guilds/{GUILD}/compos", json={**COMPO, "pf1": [{"build_id": a, "count": 1}, {"build_id": b, "count": 1}]})
    assert r.status_code == 201
    rows = c.get(f"/api/guilds/{GUILD}/compos/ZvZ").json()["pf1"]
    assert [(r["role"], r["build_id"]) for r in rows] == [("TANK", a), ("TANK", b)]


def test_compo_same_build_twice_is_422(login):
    c = login(STAFF_ID)
    a = _make_build(c, "Tank A", "TANK")
    r = c.post(f"/api/guilds/{GUILD}/compos", json={**COMPO, "pf1": [{"build_id": a, "count": 1}, {"build_id": a, "count": 1}]})
    assert r.status_code == 422 and "deux fois" in r.json()["detail"]


def test_compo_with_unknown_build_is_422(login):
    r = login(STAFF_ID).post(f"/api/guilds/{GUILD}/compos", json={**COMPO, "pf1": [{"build_id": 999, "count": 1}]})
    assert r.status_code == 422


def test_delete_build_used_by_compo_is_409(login):
    c = login(STAFF_ID)
    tank = _make_build(c, "Tank Masse", "TANK")
    c.post(f"/api/guilds/{GUILD}/compos", json={**COMPO, "pf1": [{"build_id": tank, "count": 1}]})
    r = c.delete(f"/api/guilds/{GUILD}/builds/{tank}")
    assert r.status_code == 409
    assert "ZvZ" in r.json()["detail"]


def test_renaming_build_updates_compo_hint(login, fake_db):
    c = login(STAFF_ID)
    tank = _make_build(c, "Tank Masse", "TANK")
    c.post(f"/api/guilds/{GUILD}/compos", json={**COMPO, "pf1": [{"build_id": tank, "count": 1}]})
    assert c.put(f"/api/guilds/{GUILD}/builds/{tank}", json={**BUILD, "name": "Tank Hallebarde", "role": "TANK"}).status_code == 200
    assert fake_db.templates[GUILD]["ZvZ"]["weapon"]["TANK"] == "Tank Hallebarde"


def test_changing_role_of_used_build_is_409(login):
    c = login(STAFF_ID)
    tank = _make_build(c, "Tank Masse", "TANK")
    c.post(f"/api/guilds/{GUILD}/compos", json={**COMPO, "pf1": [{"build_id": tank, "count": 1}]})
    r = c.put(f"/api/guilds/{GUILD}/builds/{tank}", json={**BUILD, "name": "Tank Masse", "role": "HEAL"})
    assert r.status_code == 409


def test_changing_role_of_unused_build_is_fine(login):
    c = login(STAFF_ID)
    b = _make_build(c, "Libre", "TANK")
    assert c.put(f"/api/guilds/{GUILD}/builds/{b}", json={**BUILD, "role": "HEAL"}).status_code == 200


# ── Ma BAL : historique complet + export CSV ─────────────────────────────────

def test_my_bal_operations_paginated_and_only_mine(login):
    r = login(MEMBER_ID).get(f"/api/guilds/{GUILD}/bal/me/operations")
    body = r.json()
    assert r.status_code == 200
    assert body["total"] == 35 and body["page_size"] == 25 and len(body["items"]) == 25
    assert body["items"][0]["action"] == "retirebal"  # plus récente d'abord
    assert all(op["delta"] not in (999, 777) for op in body["items"])  # ni un autre joueur ni un autre serveur
    assert len(login(MEMBER_ID).get(f"/api/guilds/{GUILD}/bal/me/operations?page=2").json()["items"]) == 10


def test_my_bal_operations_filter_by_action(login):
    body = login(MEMBER_ID).get(f"/api/guilds/{GUILD}/bal/me/operations?action=retirebal").json()
    assert body["total"] == 5 and {op["action"] for op in body["items"]} == {"retirebal"}


def test_my_bal_operations_rejects_bad_params(login):
    c = login(MEMBER_ID)
    assert c.get(f"/api/guilds/{GUILD}/bal/me/operations?action=drop").status_code == 422
    assert c.get(f"/api/guilds/{GUILD}/bal/me/operations?page=0").status_code == 422
    assert c.get(f"/api/guilds/{GUILD}/bal/me/operations?page=99999999").status_code == 422


def test_my_bal_operations_requires_membership(login):
    assert login(STRANGER_ID).get(f"/api/guilds/{GUILD}/bal/me/operations").status_code == 403
    assert login(STRANGER_ID).get(f"/api/guilds/{GUILD}/bal/me/operations.csv").status_code == 403


def test_my_bal_csv_export(login):
    r = login(MEMBER_ID).get(f"/api/guilds/{GUILD}/bal/me/operations.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    lines = r.content.decode("utf-8-sig").strip().split("\r\n")
    assert lines[0] == "date;operation;compo;montant;solde_apres;par"
    assert len(lines) == 1 + 35
    assert "999" not in r.text and "777" not in r.text


# ── Admin : erreurs du bot ───────────────────────────────────────────────────

def test_admin_errors_forbidden_for_member_and_staff(login):
    assert login(MEMBER_ID).get(f"/api/guilds/{GUILD}/admin/errors").status_code == 403
    assert login(STAFF_ID).get(f"/api/guilds/{GUILD}/admin/errors").status_code == 403
    assert login(STAFF_ID).get(f"/api/guilds/{GUILD}/admin/errors/1").status_code == 403


def test_admin_errors_list_only_this_guild_without_traceback(login, fake_db):
    body = login(ADMIN_ID).get(f"/api/guilds/{GUILD}/admin/errors").json()
    mine = [e for e in fake_db.errors if e["guild_id"] == GUILD]
    assert body["total"] == len(mine) and len(body["items"]) == 25
    assert all("traceback" not in e for e in body["items"])
    assert {e["id"] for e in body["items"]} <= {e["id"] for e in mine}
    assert body["commands"] == ["acti", "finacti"]


def test_admin_errors_filter_by_command(login):
    body = login(ADMIN_ID).get(f"/api/guilds/{GUILD}/admin/errors?command=acti").json()
    assert body["items"] and {e["command"] for e in body["items"]} == {"acti"}


def test_admin_error_detail_and_other_guild_is_404(login, fake_db):
    mine = next(e for e in fake_db.errors if e["guild_id"] == GUILD)
    other = next(e for e in fake_db.errors if e["guild_id"] != GUILD)
    c = login(ADMIN_ID)
    r = c.get(f"/api/guilds/{GUILD}/admin/errors/{mine['id']}")
    assert r.status_code == 200 and r.json()["traceback"] == mine["traceback"]
    assert c.get(f"/api/guilds/{GUILD}/admin/errors/{other['id']}").status_code == 404
