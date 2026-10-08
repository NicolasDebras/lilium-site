"""Règles de validation partagées par les routes (logique pure)."""


def https_url_or_empty(value: str) -> str:
    """Image d'un build ou d'une compo : vide, ou une URL https:// sans espace.
    Le bot la passe à Discord (embed.set_image, qui échoue sur autre chose qu'une URL),
    et le site l'affiche : pas de javascript:, data:, ni http:// en clair."""
    value = value.strip()
    if value and (not value.lower().startswith("https://") or any(c.isspace() for c in value)):
        raise ValueError("L'image doit être un lien https:// (ou rester vide).")
    return value
