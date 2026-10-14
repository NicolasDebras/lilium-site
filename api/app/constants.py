"""ROLES et DEFAULT_TEMPLATES du bot, plus ce que seul le site utilise.

ROLES et DEFAULT_TEMPLATES viennent de app/shared/roles_templates.py, copie exacte de
botDiscord/roles_templates.py (`python -m scripts.sync_from_bot`, vérifiée par la CI).
"""
from app.shared.roles_templates import DEFAULT_TEMPLATES, ROLES  # noqa: F401

TYPES_ACTI = ("PVP", "PVE")


def default_templates_for(guild_id: int) -> dict[str, dict]:
    """Templates par défaut visibles sur ce serveur (clé "guild_ids" optionnelle)."""
    return {
        name: tpl for name, tpl in DEFAULT_TEMPLATES.items()
        if not tpl.get("guild_ids") or guild_id in tpl["guild_ids"]
    }
