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
