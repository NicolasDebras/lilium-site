"""Accès PostgreSQL (asyncpg) — même base que le bot.

Le bot reste propriétaire du schéma (il crée/migre les tables via son init_db) :
ici on ne fait que lire/écrire dans des tables existantes. Requêtes reprises de
botDiscord/db.py.
"""
import json

import asyncpg


def _jloads(value):
    return json.loads(value) if isinstance(value, str) else value


class Database:
    def __init__(self, dsn: str):
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(self._dsn, min_size=1, max_size=5)

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()

    async def ping(self) -> bool:
        async with self._pool.acquire() as conn:
            return await conn.fetchval("SELECT 1") == 1

    # ── Profils (/register) ──────────────────────────────────────────────────
    async def get_user_guild_ids(self, user_id: int) -> list[int]:
        """Serveurs où l'utilisateur a un profil (créé par /register ou la candidature)."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT guild_id FROM player_profiles WHERE user_id = $1 ORDER BY guild_id", str(user_id)
            )
        return [r["guild_id"] for r in rows]

    async def has_profile(self, guild_id: int, user_id: int) -> bool:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT 1 FROM player_profiles WHERE user_id = $1 AND guild_id = $2", str(user_id), guild_id
            )
        return row is not None

    async def get_profile(self, guild_id: int, user_id: int) -> dict | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT ig_name FROM player_profiles WHERE user_id = $1 AND guild_id = $2", str(user_id), guild_id
            )
        return dict(row) if row else None

    # ── Rôle staff / admins du site ──────────────────────────────────────────
    async def get_web_staff_role(self, guild_id: int) -> int | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("SELECT staff_role_id FROM web_staff_config WHERE guild_id = $1", guild_id)
        return row["staff_role_id"] if row else None

    async def is_web_admin(self, guild_id: int, user_id: int) -> bool:
        """False si la table web_admins n'existe pas encore (bot pas encore redéployé)."""
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT 1 FROM web_admins WHERE guild_id = $1 AND user_id = $2", guild_id, user_id
                )
        except asyncpg.UndefinedTableError:
            return False
        return row is not None

    # ── BAL ──────────────────────────────────────────────────────────────────
    async def get_bal(self, guild_id: int, user_id: int) -> int:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT amount FROM bal WHERE user_id = $1 AND guild_id = $2", str(user_id), guild_id
            )
        return row["amount"] if row else 0

    # ── Builds ───────────────────────────────────────────────────────────────
    async def get_builds(self, guild_id: int, role: str | None = None, type_acti: str | None = None) -> list[dict]:
        query, params = "SELECT * FROM builds WHERE guild_id = $1", [guild_id]
        if role:
            params.append(role)
            query += f" AND role = ${len(params)}"
        if type_acti:
            params.append(type_acti)
            query += f" AND type_acti = ${len(params)}"
        query += " ORDER BY role, name"
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
        return [dict(r) for r in rows]

    async def get_build(self, guild_id: int, build_id: int) -> dict | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM builds WHERE id = $1 AND guild_id = $2", build_id, guild_id)
        return dict(row) if row else None

    async def add_build(self, guild_id: int, data: dict, created_by: str, created_by_name: str) -> int:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO builds (guild_id, name, role, type_acti, weapon, notes, image, created_by, created_by_name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            """, guild_id, data["name"], data["role"], data["type_acti"], data["weapon"], data["notes"],
                data["image"], created_by, created_by_name)
        return row["id"]

    async def update_build(self, guild_id: int, build_id: int, data: dict) -> bool:
        async with self._pool.acquire() as conn:
            result = await conn.execute("""
                UPDATE builds SET name = $3, role = $4, type_acti = $5, weapon = $6, notes = $7, image = $8
                WHERE id = $1 AND guild_id = $2
            """, build_id, guild_id, data["name"], data["role"], data["type_acti"], data["weapon"],
                data["notes"], data["image"])
        return result != "UPDATE 0"

    async def delete_build(self, guild_id: int, build_id: int) -> bool:
        async with self._pool.acquire() as conn:
            result = await conn.execute("DELETE FROM builds WHERE id = $1 AND guild_id = $2", build_id, guild_id)
        return result != "DELETE 0"

    # ── Compos (templates custom, même table que /addtemplate) ───────────────
    async def get_custom_templates(self, guild_id: int) -> dict[str, dict]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT name, data FROM custom_templates WHERE guild_id = $1 ORDER BY name", guild_id
            )
        return {r["name"]: _jloads(r["data"]) for r in rows}

    async def save_custom_template(self, guild_id: int, name: str, data: dict) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO custom_templates (name, guild_id, data) VALUES ($1, $2, $3::jsonb)
                ON CONFLICT (name, guild_id) DO UPDATE SET data = EXCLUDED.data
            """, name, guild_id, json.dumps(data, ensure_ascii=False))

    async def delete_custom_template(self, guild_id: int, name: str) -> bool:
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM custom_templates WHERE name = $1 AND guild_id = $2", name, guild_id
            )
        return result != "DELETE 0"

    # ── Admin ────────────────────────────────────────────────────────────────
    async def get_admin_overview(self, guild_id: int) -> dict:
        async with self._pool.acquire() as conn:
            builds   = await conn.fetchval("SELECT COUNT(*) FROM builds WHERE guild_id = $1", guild_id)
            compos   = await conn.fetchval("SELECT COUNT(*) FROM custom_templates WHERE guild_id = $1", guild_id)
            profiles = await conn.fetchval("SELECT COUNT(*) FROM player_profiles WHERE guild_id = $1", guild_id)
            bal      = await conn.fetchval(
                "SELECT COALESCE(SUM(amount), 0) FROM bal WHERE guild_id = $1 AND amount > 0", guild_id
            )
        return {"builds": builds, "compos": compos, "profiles": profiles, "total_bal": int(bal)}
