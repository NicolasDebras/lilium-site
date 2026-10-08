# lilium-site

Règles communes (invariants, workflow git, lecture économe) : `../CLAUDE.md`.
Schéma = bot (`botDiscord/db.py`) ; `api/app/constants.py` est une copie de `botDiscord/config.py` (resynchroniser).

## Carte
- `api/app/main.py` — app, front servi via `STATIC_DIR` ; `security.py` — taille des corps, origine, en-têtes/CSP
- `api/app/auth.py` + `routes/auth.py` — OAuth Discord (`state`), cookie de session signé
- `api/app/permissions.py` — `require_member/staff/admin` (`member < staff < admin`), cache 60 s
- `api/app/db.py` — requêtes ; `bal_stats.py`, `compos.py`, `catalog.py` — logique pure
- `api/app/routes/` — builds, compos, guild (BAL, admin, erreurs du bot), items, me
- `frontend/src/app/core/` — `api.service.ts`, `models.ts`, guards (`levelGuard`, `hasLevel`)
- `frontend/src/app/pages/` — builds, compos, bal, admin… ; `shared/` — charts, pager, icon, item-picker

## À chaque changement
- README.md mis à jour si visible (page, route, variable d'env, lancement local).
- Design : uniquement les variables CSS de `frontend/src/styles.scss`.

## Tests (obligatoires)
- API : toute route/logique/permission testée dans `api/tests/` (doubles `tests/fakes.py`, jamais de vraie base).
- Front : tout service/garde/composant a son `*.spec.ts` (Vitest, `HttpTestingController`, `src/testing/fake-auth.ts`).
- Test rouge après un changement voulu : corriger l'assertion, jamais supprimer le test.
