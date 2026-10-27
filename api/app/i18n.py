"""Messages d'erreur de l'API en français ou en anglais, selon l'en-tête Accept-Language.

Le front envoie « Accept-Language: fr|en » (langue choisie sur le site). Sans en-tête : français.
La langue de la requête est portée par un ContextVar posé par LanguageMiddleware : `tr()` marche
partout pendant la requête (routes, validateurs, gestionnaires d'exception) sans passer `request`.
"""
from contextvars import ContextVar

LANGS = ("fr", "en")
_lang: ContextVar[str] = ContextVar("lang", default="fr")

MESSAGES: dict[str, dict[str, str]] = {
    # Connexion, droits, sécurité
    "auth_failed": {"fr": "Échec de l'authentification Discord.", "en": "Discord authentication failed."},
    "profile_failed": {"fr": "Impossible de récupérer le profil Discord.", "en": "Could not fetch the Discord profile."},
    "login_required": {"fr": "Connexion requise.", "en": "Login required."},
    "not_member": {"fr": "Tu n'es pas membre de ce serveur (ou tu n'as pas fait /register).",
                   "en": "You are not a member of this server (or you haven't run /register)."},
    "staff_only": {"fr": "Réservé au staff du site (rôle configuré via /config).",
                   "en": "Website staff only (role set with /config)."},
    "admin_only": {"fr": "Réservé aux admins du site (/webadmin).", "en": "Website admins only (/webadmin)."},
    "discord_down": {"fr": "Discord ne répond pas, réessaie dans un instant.",
                     "en": "Discord is not responding, try again in a moment."},
    "too_large": {"fr": "Requête trop volumineuse.", "en": "Request too large."},
    "bad_origin": {"fr": "Origine de la requête refusée.", "en": "Request origin refused."},
    # Builds
    "too_many_choices": {"fr": "Trop de choix pour une case.", "en": "Too many choices for one slot."},
    "build_not_found": {"fr": "Build introuvable.", "en": "Build not found."},
    "max_builds": {"fr": "{max} builds maximum par serveur : supprimes-en d'abord.",
                   "en": "{max} builds maximum per server: delete some first."},
    "build_role_used": {"fr": "Ce build est utilisé en {role} par : {compos}. Retire-le de ces compos avant de changer son rôle.",
                        "en": "This build is used as {role} by: {compos}. Remove it from these comps before changing its role."},
    "build_used": {"fr": "Ce build est utilisé par : {compos}. Retire-le de ces compos d'abord.",
                   "en": "This build is used by: {compos}. Remove it from these comps first."},
    "unknown_item": {"fr": "Objet inconnu : {choice}", "en": "Unknown item: {choice}"},
    "bad_tier": {"fr": "« {name} » ne se choisit pas en T{tier} (T4 à T8 selon l'objet).",
                 "en": "“{name}” can't be picked in T{tier} (T4 to T8 depending on the item)."},
    "max_enchant": {"fr": "« {name} » : enchantement .{max} maximum.", "en": "“{name}”: enchantment .{max} maximum."},
    "duplicate_item": {"fr": "Un même objet ne peut être proposé qu'une fois (un seul tier par objet).",
                       "en": "An item can only be offered once (one tier per item)."},
    "unknown_slot": {"fr": "Emplacement inconnu : {slot}", "en": "Unknown slot: {slot}"},
    "free_with_items": {"fr": "« Au choix du joueur » ne se combine pas avec des objets.",
                        "en": "“Player's choice” can't be combined with items."},
    "max_choices": {"fr": "{max} choix maximum par case.", "en": "{max} choices maximum per slot."},
    "wrong_slot": {"fr": "« {name} » ne se porte pas à cet emplacement.", "en": "“{name}” can't be worn in this slot."},
    "two_handed": {"fr": "Toutes les armes proposées sont à deux mains : pas de main gauche possible.",
                   "en": "Every suggested weapon is two-handed: no off-hand allowed."},
    "free_swap": {"fr": "Un swap doit être un objet précis.", "en": "A swap must be a specific item."},
    "spell_item_missing": {"fr": "Sorts donnés pour un objet absent du build : {item}.",
                           "en": "Spells given for an item that isn't in the build: {item}."},
    "bad_spell": {"fr": "{name} n'a pas ce sort à cet emplacement : {spell}.",
                  "en": "{name} doesn't have this spell in that slot: {spell}."},
    "shoes_spell_with_item": {"fr": "Sort de bottes imposé : la case Bottes doit être vide ou « au choix ».",
                              "en": "Required boots spell: the Shoes slot must be empty or “free choice”."},
    "shoes_any": {"fr": "Bottes au choix", "en": "Any boots"},
    "payout_not_found": {"fr": "Payout introuvable (seuls ceux de cette semaine et de la précédente se corrigent).",
                         "en": "Payout not found (only this week's and last week's can be corrected)."},
    "payout_no_change": {"fr": "Aucun montant ne change.", "en": "No amount changes."},
    "payout_not_member": {"fr": "Le joueur {uid} n'est pas sur le serveur.",
                          "en": "Player {uid} isn't on the server."},
    "max_swaps": {"fr": "{max} swaps maximum.", "en": "{max} swaps maximum."},
    # Compos
    "compo_not_found": {"fr": "Compo introuvable.", "en": "Comp not found."},
    "compo_needs_pf1": {"fr": "La compo doit contenir au moins un rôle en PF1.",
                        "en": "The comp must have at least one role in Party 1."},
    "no_build_image": {"fr": "Aucun rôle de cette compo n'a de build : pas d'image à générer.",
                       "en": "No role in this comp has a build: no image to generate."},
    "default_template_name": {"fr": "« {name} » est un template par défaut, choisis un autre nom.",
                              "en": "“{name}” is a default template, pick another name."},
    "compo_exists": {"fr": "Une compo « {name} » existe déjà.", "en": "A comp named “{name}” already exists."},
    "max_compos": {"fr": "{max} compos maximum par serveur : supprimes-en d'abord.",
                   "en": "{max} comps maximum per server: delete some first."},
    "bad_share": {"fr": "Le nombre de parts d'un rôle doit être entre 0 et {max}.",
                  "en": "A role's pay shares must be between 0 and {max}."},
    "max_count": {"fr": "{max} joueurs maximum par ligne ({label}).", "en": "{max} players maximum per line ({label})."},
    "compo_build_missing": {"fr": "Build introuvable (n°{id}) : il a peut-être été supprimé.",
                            "en": "Build not found (#{id}): it may have been deleted."},
    "build_twice": {"fr": "« {name} » est deux fois en {label} : augmente plutôt le nombre de joueurs de sa ligne.",
                    "en": "“{name}” is twice in {label}: increase the player count of its line instead."},
    "bad_name": {"fr": "Nom invalide : 1 à 100 caractères, sans / \\ ? # % ni caractère spécial invisible.",
                 "en": "Invalid name: 1 to 100 characters, without / \\ ? # % or invisible special characters."},
    "bad_image": {"fr": "L'image doit être un lien https:// (ou rester vide).",
                  "en": "The image must be an https:// link (or stay empty)."},
    # Bibliothèque de modèles
    "import_too_many_builds": {"fr": "Il faudrait créer {count} build(s) : {max} maximum par serveur.",
                               "en": "{count} build(s) would have to be created: {max} maximum per server."},
    "copy_needs_staff": {"fr": "Tu dois être staff du serveur d'origine pour copier ses compos.",
                         "en": "You must be staff on the source server to copy its comps."},
    "max_public": {"fr": "{max} modèles publiés maximum par serveur.", "en": "{max} published templates maximum per server."},
    "model_not_found": {"fr": "Modèle introuvable.", "en": "Template not found."},
    "model_no_build": {"fr": "Ce modèle n'a aucun build : pas d'image.", "en": "This template has no build: no image."},
    "model_remove_denied": {"fr": "Seul l'auteur, un admin du serveur d'origine ou le propriétaire du site peut retirer ce modèle.",
                            "en": "Only the author, an admin of the source server or the site owner can remove this template."},
    # Admin
    "error_not_found": {"fr": "Erreur introuvable.", "en": "Error not found."},
}


def lang_from_header(value: str | None) -> str:
    """« en-GB,en;q=0.9 » → « en » ; 1re langue connue de la liste, sinon français."""
    for part in (value or "").split(","):
        tag = part.split(";")[0].strip().lower()
        for lang in LANGS:
            if tag == lang or tag.startswith(lang + "-"):
                return lang
    return "fr"


def current_lang() -> str:
    return _lang.get()


def tr(key: str, **params) -> str:
    """Message `key` dans la langue de la requête en cours, paramètres insérés."""
    text = MESSAGES[key][_lang.get()]
    return text.format(**params) if params else text


class LanguageMiddleware:
    """Middleware ASGI : fixe la langue de la requête d'après Accept-Language."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        header = dict(scope.get("headers") or []).get(b"accept-language", b"").decode("latin-1")
        token = _lang.set(lang_from_header(header))
        try:
            await self.app(scope, receive, send)
        finally:
            _lang.reset(token)
