"""
scripts/sync_from_bot.py — Recopie dans le site les fichiers partagés avec le bot.

Le bot (repo botDiscord) est la source : le rendu des images et les rôles/templates
par défaut y sont écrits, le site en garde une copie identique dans app/shared/.

    python -m scripts.sync_from_bot            # copie depuis ../../botDiscord
    python -m scripts.sync_from_bot --check    # code 1 si une copie diffère (CI)
    python -m scripts.sync_from_bot --bot CHEMIN
"""
import argparse
import shutil
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
DEFAULT_BOT_DIR = API_DIR.parent.parent / "botDiscord"   # repos côte à côte

# chemin dans le bot → chemin dans api/ (fichier ou dossier)
SHARED: dict[str, str] = {
    "Service/build_image.py": "app/shared/build_image.py",
    "roles_templates.py": "app/shared/roles_templates.py",
    "assets": "app/assets",
}


def _files(root: Path) -> dict[str, bytes]:
    """{chemin relatif: contenu} d'un fichier ou de tous les fichiers d'un dossier."""
    if root.is_file():
        return {"": root.read_bytes()}
    if not root.is_dir():
        return {}
    return {p.relative_to(root).as_posix(): p.read_bytes()
            for p in sorted(root.rglob("*")) if p.is_file() and "__pycache__" not in p.parts}


def differences(bot_dir: Path, api_dir: Path = API_DIR) -> list[str]:
    """Copies du site qui diffèrent du bot (manquantes, en trop ou modifiées) ; [] si tout est à jour."""
    diffs = []
    for src, dst in SHARED.items():
        bot, site = _files(bot_dir / src), _files(api_dir / dst)
        if not bot:
            diffs.append(f"{src} : introuvable dans le bot")
            continue
        for rel in sorted(bot.keys() | site.keys()):
            if bot.get(rel) != site.get(rel):
                diffs.append(f"{dst}/{rel}".rstrip("/"))
    return diffs


def sync(bot_dir: Path, api_dir: Path = API_DIR) -> None:
    """Remplace chaque copie du site par la version du bot (un dossier est recopié en entier)."""
    for src, dst in SHARED.items():
        source, target = bot_dir / src, api_dir / dst
        if not source.exists():
            raise FileNotFoundError(f"{source} introuvable")
        if source.is_dir():
            shutil.rmtree(target, ignore_errors=True)
            shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__"))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--bot", type=Path, default=DEFAULT_BOT_DIR, help="dossier du repo botDiscord")
    parser.add_argument("--check", action="store_true", help="vérifier sans copier")
    args = parser.parse_args(argv)
    if args.check:
        diffs = differences(args.bot)
        for d in diffs:
            print(f"différent du bot : {d}")
        if diffs:
            print("→ lancer `python -m scripts.sync_from_bot` depuis api/")
        return 1 if diffs else 0
    sync(args.bot)
    print("copies du bot à jour")
    return 0


if __name__ == "__main__":
    sys.exit(main())
