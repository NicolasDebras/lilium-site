"""Règles de validation partagées par les routes (logique pure)."""


def duplicate_name(name: str, taken: set[str], max_length: int = 100) -> str:
    """« Tank » → « Tank (copie) », puis « Tank (copie 2) »… sans collision (casse ignorée)
    et dans la longueur maximale d'un nom."""
    lowered = {t.casefold() for t in taken}
    n = 1
    while True:
        suffix = " (copie)" if n == 1 else f" (copie {n})"
        candidate = name[: max_length - len(suffix)].rstrip() + suffix
        if candidate.casefold() not in lowered:
            return candidate
        n += 1


def https_url_or_empty(value: str) -> str:
    """Image d'un build ou d'une compo : vide, ou une URL https:// sans espace.
    Le bot la passe à Discord (embed.set_image, qui échoue sur autre chose qu'une URL),
    et le site l'affiche : pas de javascript:, data:, ni http:// en clair."""
    value = value.strip()
    if value and (not value.lower().startswith("https://") or any(c.isspace() for c in value)):
        raise ValueError("L'image doit être un lien https:// (ou rester vide).")
    return value
