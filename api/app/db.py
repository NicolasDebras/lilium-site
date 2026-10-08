"""Accès PostgreSQL (asyncpg) — même base que le bot.

Le bot reste propriétaire du schéma (il crée/migre les tables via son init_db) :
ici on ne fait que lire/écrire dans des tables existantes. Requêtes reprises de
botDiscord/db.py.
"""
import json

import asyncpg


def _jloads(value):
    return json.loads(value) if isinstance(value, str) else value


def _build_row(row) -> dict:
    build = dict(row)
    build["items"] = _jloads(build.get("items")) or {}
    return build


class Database:
    def __init__(self, dsn: str):
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        # min_size=3 : connexions ouvertes dès le démarrage. En local la base
        # Railway est loin (~300 ms par aller-retour) et ouvrir une connexion
        # à la volée (TLS) coûte bien plus cher qu'une requête.
        self._pool = await asyncpg.create_pool(self._dsn, min_size=3, max_size=10)

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

    async def get_profile(self, guild_id: int, user_id: int) -> dict | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT ig_name FROM player_profiles WHERE user_id = $1 AND guild_id = $2", str(user_id), guild_id
            )
        return dict(row) if row else None

    # ── Rôle staff / admins du site ──────────────────────────────────────────
    async def get_access_info(self, guild_id: int, user_id: int) -> dict:
        """Tout ce qu'il faut pour calculer le niveau d'accès, en UN aller-retour
        (profil /register, rôle staff du serveur, admin /webadmin)."""
        base = """
            SELECT EXISTS (SELECT 1 FROM player_profiles WHERE user_id = $1 AND guild_id = $2) AS has_profile,
                   (SELECT staff_role_id FROM web_staff_config WHERE guild_id = $2)          AS staff_role_id,
                   {admin}                                                                    AS is_admin
        """
        with_admin = "EXISTS (SELECT 1 FROM web_admins WHERE guild_id = $2 AND user_id = $3)"
        async with self._pool.acquire() as conn:
            try:
                row = await conn.fetchrow(base.format(admin=with_admin), str(user_id), guild_id, user_id)
            except asyncpg.UndefinedTableError:  # bot pas encore redéployé avec web_admins
                row = await conn.fetchrow(base.format(admin="FALSE"), str(user_id), guild_id)
        return dict(row)

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
        return [_build_row(r) for r in rows]

    async def get_build(self, guild_id: int, build_id: int) -> dict | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM builds WHERE id = $1 AND guild_id = $2", build_id, guild_id)
        return _build_row(row) if row else None

    async def add_build(self, guild_id: int, data: dict, created_by: str, created_by_name: str) -> int:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO builds (guild_id, name, role, type_acti, weapon, notes, image, items, created_by, created_by_name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
                RETURNING id
            """, guild_id, data["name"], data["role"], data["type_acti"], data["weapon"], data["notes"],
                data["image"], json.dumps(data["items"]), created_by, created_by_name)
        return row["id"]

    async def update_build(self, guild_id: int, build_id: int, data: dict) -> bool:
        async with self._pool.acquire() as conn:
            result = await conn.execute("""
                UPDATE builds SET name = $3, role = $4, type_acti = $5, weapon = $6, notes = $7, image = $8,
                                  items = $9::jsonb
                WHERE id = $1 AND guild_id = $2
            """, build_id, guild_id, data["name"], data["role"], data["type_acti"], data["weapon"],
                data["notes"], data["image"], json.dumps(data["items"]))
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
            row = await conn.fetchrow("""
                SELECT (SELECT COUNT(*) FROM builds           WHERE guild_id = $1)                AS builds,
                       (SELECT COUNT(*) FROM custom_templates WHERE guild_id = $1)                AS compos,
                       (SELECT COUNT(*) FROM player_profiles  WHERE guild_id = $1)                AS profiles,
                       (SELECT COALESCE(SUM(amount), 0) FROM bal WHERE guild_id = $1 AND amount > 0) AS total_bal
            """, guild_id)
        return {k: int(v) for k, v in dict(row).items()}

    _BAL_EVENTS_SQL = """
        SELECT l.id, l.ts, l.action, COALESCE(l.template, '') AS template, l.by_user,
               elem->>'uid' AS uid, elem->>'name' AS name, (elem->>'delta')::bigint AS delta
        FROM bal_log l, jsonb_array_elements(l.entries) AS elem
        WHERE l.guild_id = $1 AND l.ts >= $2 {extra}
        ORDER BY l.ts
    """

    async def get_bal_events(self, guild_id: int, since) -> list[dict]:
        """Mouvements de BAL depuis `since` : une ligne par joueur et par opération du bal_log."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(self._BAL_EVENTS_SQL.format(extra=""), guild_id, since)
        return [dict(r) for r in rows]

    async def get_my_bal_events(self, guild_id: int, user_id: int, since) -> list[dict]:
        """Mouvements de BAL d'UN joueur depuis `since` (page « Ma BAL »)."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                self._BAL_EVENTS_SQL.format(extra="AND elem->>'uid' = $3"), guild_id, since, str(user_id)
            )
        return [dict(r) for r in rows]

    async def get_bal_rank(self, guild_id: int, user_id: int) -> dict:
        """Solde du joueur, son rang parmi les BAL > 0 du serveur (None s'il n'a rien) et ce nombre de joueurs."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT COALESCE((SELECT amount FROM bal WHERE guild_id = $1 AND user_id = $2), 0) AS amount,
                       (SELECT COUNT(*) FROM bal WHERE guild_id = $1 AND amount > 0)             AS players
            """, guild_id, str(user_id))
            amount, players = int(row["amount"]), int(row["players"])
            rank = None
            if amount > 0:
                rank = 1 + await conn.fetchval(
                    "SELECT COUNT(*) FROM bal WHERE guild_id = $1 AND amount > $2", guild_id, amount
                )
        return {"amount": amount, "rank": rank, "players": players}

    async def get_bal_balances(self, guild_id: int) -> list[dict]:
        """Soldes > 0 avec le meilleur nom connu : pseudo IG (/register), sinon dernier nom du bal_log."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch("""
                WITH names AS (
                    SELECT DISTINCT ON (elem->>'uid') elem->>'uid' AS uid, elem->>'name' AS name
                    FROM bal_log l, jsonb_array_elements(l.entries) AS elem
                    WHERE l.guild_id = $1
                    ORDER BY elem->>'uid', l.id DESC
                )
                SELECT b.user_id AS uid, b.amount, COALESCE(NULLIF(p.ig_name, ''), n.name, b.user_id) AS name
                FROM bal b
                LEFT JOIN player_profiles p ON p.user_id = b.user_id AND p.guild_id = b.guild_id
                LEFT JOIN names n ON n.uid = b.user_id
                WHERE b.guild_id = $1 AND b.amount > 0
                ORDER BY b.amount DESC
            """, guild_id)
        return [dict(r) for r in rows]

    # ── Historique BAL complet d'un joueur (« Ma BAL », Admin → BAL par joueur) ─
    _MY_OPS_FROM = """
        FROM bal_log l, jsonb_array_elements(l.entries) AS elem
        WHERE l.guild_id = $1 AND elem->>'uid' = $2 AND ($3::text IS NULL OR l.action = $3)
    """

    async def get_bal_players(self, guild_id: int) -> list[dict]:
        """Tous les joueurs ayant une BAL ou une ligne au bal_log (soldes à 0 compris), avec le
        meilleur nom connu : pseudo IG (/register), sinon dernier nom du bal_log, sinon l'id."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch("""
                WITH names AS (
                    SELECT DISTINCT ON (elem->>'uid') elem->>'uid' AS uid, elem->>'name' AS name
                    FROM bal_log l, jsonb_array_elements(l.entries) AS elem
                    WHERE l.guild_id = $1
                    ORDER BY elem->>'uid', l.id DESC
                ),
                ids AS (SELECT uid FROM names UNION SELECT user_id FROM bal WHERE guild_id = $1)
                SELECT ids.uid, COALESCE(b.amount, 0) AS amount,
                       COALESCE(NULLIF(p.ig_name, ''), n.name, ids.uid) AS name
                FROM ids
                LEFT JOIN bal b ON b.user_id = ids.uid AND b.guild_id = $1
                LEFT JOIN player_profiles p ON p.user_id = ids.uid AND p.guild_id = $1
                LEFT JOIN names n ON n.uid = ids.uid
                ORDER BY amount DESC, name
            """, guild_id)
        return [dict(r) for r in rows]

    async def get_bal_operations(self, guild_id: int, user_id: int, action: str | None,
                                 limit: int | None = None, offset: int = 0) -> tuple[list[dict], int]:
        """Opérations BAL d'UN joueur (plus récentes d'abord) + leur nombre total. `limit=None` = toutes."""
        async with self._pool.acquire() as conn:
            total = await conn.fetchval(f"SELECT COUNT(*) {self._MY_OPS_FROM}", guild_id, str(user_id), action)
            rows = await conn.fetch(f"""
                SELECT l.ts, l.action, COALESCE(l.template, '') AS template, l.by_user,
                       (elem->>'delta')::bigint AS delta, (elem->>'total')::bigint AS total
                {self._MY_OPS_FROM}
                ORDER BY l.ts DESC, l.id DESC
                LIMIT $4 OFFSET $5
            """, guild_id, str(user_id), action, limit, offset)
        return [dict(r) for r in rows], int(total)

    # ── Erreurs du bot (table error_log, écrite par le bot) ────────────────────
    async def get_error_logs(self, guild_id: int, command: str | None, limit: int,
                             offset: int) -> tuple[list[dict], int, list[str]]:
        """Erreurs du serveur (sans traceback), plus récentes d'abord + nombre total + commandes concernées."""
        where = "WHERE guild_id = $1 AND ($2::text IS NULL OR command = $2)"
        async with self._pool.acquire() as conn:
            total = await conn.fetchval(f"SELECT COUNT(*) FROM error_log {where}", guild_id, command)
            rows = await conn.fetch(f"""
                SELECT id, ts, command, user_id, error_type, error_message
                FROM error_log {where}
                ORDER BY ts DESC, id DESC
                LIMIT $3 OFFSET $4
            """, guild_id, command, limit, offset)
            commands = await conn.fetch(
                "SELECT DISTINCT command FROM error_log WHERE guild_id = $1 ORDER BY command", guild_id
            )
        return [dict(r) for r in rows], int(total), [r["command"] for r in commands]

    async def get_error_log(self, guild_id: int, error_id: int) -> dict | None:
        """Une erreur avec son traceback — seulement si elle appartient à ce serveur."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, ts, command, user_id, error_type, error_message, traceback "
                "FROM error_log WHERE id = $1 AND guild_id = $2", error_id, guild_id
            )
        return dict(row) if row else None
