"""Doubles en mémoire de la base et de Discord — aucune vraie connexion."""
from datetime import datetime, timedelta, timezone

from app.discord_rest import DiscordUnavailable
from app.settings import Settings

GUILD = 111
OTHER_GUILD = 222
STAFF_ROLE = 999

MEMBER_ID = 1   # profil + sur le serveur, sans rôle
STAFF_ID = 2    # profil + rôle staff
ADMIN_ID = 3    # profil + /webadmin (sans rôle staff)
GHOST_ID = 4    # profil mais a quitté le serveur
STRANGER_ID = 5 # aucun profil


def make_settings(**overrides) -> Settings:
    values = dict(
        database_url="postgresql://fake", discord_token="bot-token",
        discord_client_id="client-id", discord_client_secret="client-secret",
        discord_redirect_uri="http://localhost:4200/api/auth/callback",
        session_secret="test-secret", frontend_url="http://localhost:4200",
    )
    values.update(overrides)
    return Settings(**values)


class FakeDB:
    def __init__(self):
        self.profiles = {(GUILD, uid) for uid in (MEMBER_ID, STAFF_ID, ADMIN_ID, GHOST_ID)}
        self.staff_roles = {GUILD: STAFF_ROLE}
        self.admins = {(GUILD, ADMIN_ID)}
        self.admin_table_exists = True
        self.bal = {(GUILD, MEMBER_ID): 1_500_000}
        self.builds: dict[int, dict] = {}
        self.templates: dict[int, dict[str, dict]] = {}
        self._next_id = 1
        self.access_queries = 0
        t0 = datetime(2026, 10, 1, 18, 0, tzinfo=timezone.utc)
        # Lignes du bal_log « à plat » (une par joueur et par opération), plus récentes en dernier
        self.bal_ops = [
            {"guild_id": GUILD, "uid": str(MEMBER_ID), "ts": t0 + timedelta(hours=i), "action": a,
             "template": "ZvZ" if a == "finacti" else "", "by_user": "Officier", "delta": d, "total": 1_000_000 + i}
            for i, (a, d) in enumerate([("finacti", 300_000)] * 30 + [("retirebal", -200_000)] * 5)
        ] + [
            {"guild_id": GUILD, "uid": str(STAFF_ID), "ts": t0, "action": "finacti", "template": "=SECRET()",
             "by_user": "x", "delta": 999, "total": 999},
            {"guild_id": OTHER_GUILD, "uid": str(MEMBER_ID), "ts": t0, "action": "finacti", "template": "",
             "by_user": "x", "delta": 777, "total": 777},
        ]
        self.errors = [
            {"id": i, "guild_id": GUILD if i % 3 else OTHER_GUILD, "ts": t0 + timedelta(minutes=i),
             "command": "acti" if i % 2 else "finacti", "user_id": "1", "error_type": "KeyError",
             "error_message": f"boom {i}", "traceback": f"Traceback {i}"}
            for i in range(1, 61)
        ]

    async def ping(self):
        return True

    async def get_user_guild_ids(self, user_id):
        return sorted(g for g, u in self.profiles if u == user_id)

    async def get_access_info(self, guild_id, user_id):
        self.access_queries += 1
        return {
            "has_profile":   (guild_id, user_id) in self.profiles,
            "staff_role_id": self.staff_roles.get(guild_id),
            "is_admin":      self.admin_table_exists and (guild_id, user_id) in self.admins,
        }

    async def get_profile(self, guild_id, user_id):
        return {"ig_name": f"Joueur{user_id}"} if (guild_id, user_id) in self.profiles else None

    async def get_bal(self, guild_id, user_id):
        return self.bal.get((guild_id, user_id), 0)

    async def get_builds(self, guild_id, role=None, type_acti=None):
        return [
            b for b in self.builds.values()
            if b["guild_id"] == guild_id and (not role or b["role"] == role)
            and (not type_acti or b["type_acti"] == type_acti)
        ]

    async def get_build(self, guild_id, build_id):
        b = self.builds.get(build_id)
        return b if b and b["guild_id"] == guild_id else None

    async def add_build(self, guild_id, data, created_by, created_by_name):
        build_id = self._next_id
        self._next_id += 1
        self.builds[build_id] = {"id": build_id, "guild_id": guild_id, **data,
                                 "created_by": created_by, "created_by_name": created_by_name}
        return build_id

    async def update_build(self, guild_id, build_id, data):
        if not await self.get_build(guild_id, build_id):
            return False
        self.builds[build_id].update(data)
        return True

    async def delete_build(self, guild_id, build_id):
        if not await self.get_build(guild_id, build_id):
            return False
        del self.builds[build_id]
        return True

    async def get_custom_templates(self, guild_id):
        return dict(self.templates.get(guild_id, {}))

    async def save_custom_template(self, guild_id, name, data):
        self.templates.setdefault(guild_id, {})[name] = data

    async def delete_custom_template(self, guild_id, name):
        return self.templates.get(guild_id, {}).pop(name, None) is not None

    async def get_admin_overview(self, guild_id):
        return {"builds": len(await self.get_builds(guild_id)), "compos": len(self.templates.get(guild_id, {})),
                "profiles": sum(1 for g, _ in self.profiles if g == guild_id), "total_bal": 1_500_000}

    async def get_bal_events(self, guild_id, since):
        self.bal_events_since = since
        return []

    async def get_my_bal_events(self, guild_id, user_id, since):
        self.my_events_query = (guild_id, user_id)
        return []

    async def get_bal_rank(self, guild_id, user_id):
        amount = self.bal.get((guild_id, user_id), 0)
        players = sum(1 for (g, _), a in self.bal.items() if g == guild_id and a > 0)
        rank = 1 + sum(1 for (g, _), a in self.bal.items() if g == guild_id and a > amount) if amount > 0 else None
        return {"amount": amount, "rank": rank, "players": players}

    async def get_bal_balances(self, guild_id):
        return [{"uid": str(u), "name": f"Joueur{u}", "amount": a}
                for (g, u), a in self.bal.items() if g == guild_id and a > 0]

    async def get_my_bal_operations(self, guild_id, user_id, action, limit=None, offset=0):
        rows = [r for r in self.bal_ops if r["guild_id"] == guild_id and r["uid"] == str(user_id)
                and (action is None or r["action"] == action)]
        rows.sort(key=lambda r: r["ts"], reverse=True)
        page = rows[offset:] if limit is None else rows[offset:offset + limit]
        return page, len(rows)

    async def get_error_logs(self, guild_id, command, limit, offset):
        rows = [{k: v for k, v in e.items() if k not in ("traceback", "guild_id")} for e in self.errors
                if e["guild_id"] == guild_id and (command is None or e["command"] == command)]
        rows.sort(key=lambda e: e["ts"], reverse=True)
        commands = sorted({e["command"] for e in self.errors if e["guild_id"] == guild_id})
        return rows[offset:offset + limit], len(rows), commands

    async def get_error_log(self, guild_id, error_id):
        e = next((e for e in self.errors if e["id"] == error_id and e["guild_id"] == guild_id), None)
        return {k: v for k, v in e.items() if k != "guild_id"} if e else None


class FakeDiscord:
    def __init__(self):
        self.members = {
            (GUILD, MEMBER_ID): {"roles": []},
            (GUILD, STAFF_ID):  {"roles": [str(STAFF_ROLE)]},
            (GUILD, ADMIN_ID):  {"roles": []},
        }
        self.down = False

    async def get_member(self, guild_id, user_id):
        if self.down:
            raise DiscordUnavailable("down")
        return self.members.get((guild_id, user_id))

    async def get_guild(self, guild_id):
        return {"id": str(guild_id), "name": "Lilium", "icon": None}


class FakeOAuth:
    async def exchange_code(self, settings, code):
        return f"token-for-{code}"

    async def fetch_discord_user(self, access_token):
        return {"id": str(MEMBER_ID), "username": "membre", "global_name": "Membre", "avatar": None}
