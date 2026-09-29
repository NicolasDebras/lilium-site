# Instructions pour Claude Code — lilium-site

Monorepo du site de la guilde : `api/` (FastAPI + asyncpg) et `frontend/` (Angular 22, standalone + signals, zoneless).
Même base Postgres que le bot `botDiscord` : **le bot est propriétaire du schéma** (tables créées/migrées par son `init_db`).
Une nouvelle table ou colonne se crée donc dans `botDiscord/db.py`, jamais ici.

## README
Mettre à jour `README.md` à chaque modification visible (nouvelle page, nouvelle route, nouvelle variable d'env, changement du lancement local), dans le même commit que le code.

## Tests (obligatoires)
- Toute nouvelle route, logique ou règle de permission côté API vient avec ses tests dans `api/tests/` (faux db/Discord dans `tests/fakes.py`, jamais de vraie base).
- Tout nouveau service, garde ou composant côté frontend vient avec son `*.spec.ts` (Vitest via `ng test`, `HttpTestingController`, `testing/fake-auth.ts`).
- Ne pas supprimer un test qui échoue après un changement volontaire : corriger l'assertion consciemment.

Commandes :
```powershell
cd api;      .venv\Scripts\python -m pytest
cd frontend; npm test -- --watch=false; npx ng build
```

## Workflow git
- **Avant tout `git push`** : `pytest` (api) et `npm test` + `ng build` (frontend) doivent passer. Un test rouge bloque le push.
- **Chaque fonctionnalité/fix terminé doit être poussé** — un commit propre et un push dès que c'est complet et testé, pas d'accumulation en local.

## Conventions
- Design noir & lilas : **uniquement** les variables CSS de `frontend/src/styles.scss` (pas de couleur en dur dans les composants).
- Niveaux d'accès : `member < staff < admin` (admin ⊇ staff). Côté API : dépendances `require_member/staff/admin` (`app/permissions.py`). Côté front : `levelGuard(...)` + `hasLevel(...)`.
- Les admins sont nommés sur Discord via `/webadmin` (table `web_admins`, bot).
- `app/constants.py` (ROLES, DEFAULT_TEMPLATES) est une copie de `botDiscord/config.py` : la resynchroniser si le bot change.
