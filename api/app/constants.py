"""Copie de ROLES et DEFAULT_TEMPLATES du bot (botDiscord/config.py).

⚠️ À garder synchronisé à la main avec le bot : si un rôle ou un template par
défaut y est ajouté/supprimé, reporter le changement ici.
"""

ROLES: dict[str, str] = {
    "TANK":        "🛡️",
    "MAIN TANK":   "🛡️",
    "TANK OFF":    "🛡️",
    "TANK DEF":    "🛡️",
    "OFF TANK":    "🛡️",
    "HEAL":        "💚",
    "MAIN HEAL":   "💚",
    "IRON ROOT":   "🌿",
    "IRON":        "🌿",
    "DPS":         "⚔️",
    "FAUX":        "🌾",
    "DAMME":       "💥",
    "SUPPORT":     "🔮",
    "CALLER":      "📢",
    "SCOUT":       "👁️",
    "FROST":       "❄️",
    "HURLEGIVRE":  "🌨️",
    "SC":          "💣",
    "COBRA/GA":    "🏹",
    "COBRA":       "🐍",
    "BM":          "🐴",
    "LEACHER PVP": "⚡",
    "HO":          "🏠",
}

DEFAULT_TEMPLATES: dict[str, dict] = {
    "Donjon Groupe 5": {
        "description": "Donjon de groupe — 5 joueurs",
        "type_acti":   "PVE",
        "image":       "",
        "pf_1": {"TANK": 1, "DPS": 3, "HEAL": 1},
    },
}

TYPES_ACTI = ("PVP", "PVE")


def default_templates_for(guild_id: int) -> dict[str, dict]:
    """Templates par défaut visibles sur ce serveur (clé "guild_ids" optionnelle)."""
    return {
        name: tpl for name, tpl in DEFAULT_TEMPLATES.items()
        if not tpl.get("guild_ids") or guild_id in tpl["guild_ids"]
    }
