# lilium-site

Règles communes (invariants, workflow git, lecture économe) : `../CLAUDE.md`.
Schéma = bot (`botDiscord/db.py`). `api/app/shared/` et `api/app/assets/` = copies exactes du bot : ne jamais les modifier ici, changer le bot puis `python -m scripts.sync_from_bot` (vérifié par `tests/test_shared_sync.py` et la CI).

## Carte
- `api/app/main.py` — app, front servi via `STATIC_DIR` ; `security.py` — taille des corps, origine, en-têtes/CSP
- `api/app/auth.py` + `routes/auth.py` — OAuth Discord (`state`), cookie de session signé
- `api/app/permissions.py` — `require_member/staff/admin` (`member < staff < admin`), cache 60 s
- `api/app/images.py` — ré-exporte `shared/build_image.py` + rendu async/cache ; `constants.py` — `shared/roles_templates.py` + spécifique site
- `api/app/db.py` — requêtes ; `bal_stats.py`, `compos.py`, `catalog.py` — logique pure
- `api/app/routes/` — builds, compos, guild (BAL, admin, erreurs du bot), items, me
- `frontend/src/app/core/` — `api.service.ts`, `models.ts`, guards (`levelGuard`, `hasLevel`)
- `frontend/src/app/pages/` — builds, compos, bal, admin… ; `shared/` — charts, pager, icon, item-picker

## Front : conventions (Angular 22, zoneless, OnPush par défaut)
- État = signals ; jamais de propriété simple modifiée en asynchrone (la vue ne suivrait pas).
- Chargement = `rxResource`/`httpResource` (params réactifs, pas de `ngOnInit` + `subscribe`) ; `lastValue`/`errorText` (`core/resource.ts`), recherche à la frappe = `debouncedSignal` (`core/debounce.ts`).
- Formulaires = Signal Forms (`@angular/forms/signals`, `form()` + `[formField]`, validation dans le schéma) ; pas de `ngModel` ni de mutation en place.
- Pas de méthode qui recrée un tableau dans un template : `computed` (vue précalculée par élément si besoin) ; `host: {}` plutôt que `@HostListener`.
- Specs : une ressource en cours bloque `whenStable()` → répondre aux requêtes (enfants compris) avant ; après une interaction, `detectChanges()` avant `expectOne`.

## À chaque changement
- README.md mis à jour si visible (page, route, variable d'env, lancement local).
- Design : uniquement les variables CSS de `frontend/src/styles.scss`.

## Tests (obligatoires)
- API : toute route/logique/permission testée dans `api/tests/` (doubles `tests/fakes.py`, jamais de vraie base).
- Front : tout service/garde/composant a son `*.spec.ts` (Vitest, `HttpTestingController`, `src/testing/fake-auth.ts`).
- Test rouge après un changement voulu : corriger l'assertion, jamais supprimer le test.
