# lilium-site

Site web de la guilde Lilium : **builds**, **compos** (utilisables dans `/acti`), **BAL** et **page Admin**.
Connexion avec Discord. Thème noir & lilas.

Un seul repo pour les deux morceaux :

| Dossier | Techno | Rôle |
|---|---|---|
| [`api/`](api/) | FastAPI + asyncpg (Python 3.11+) | API JSON sous `/api`, auth Discord, permissions |
| [`frontend/`](frontend/) | Angular 22 (composants standalone, signals) | Interface web |

Le site partage la **même base PostgreSQL** que le bot [`botDiscord`](https://github.com/NicolasDebras/botDiscord).
Le bot reste propriétaire du schéma (il crée les tables au démarrage) ; l'API ne fait que lire/écrire dedans.

---

## Accès et rôles

Tout se joue **par serveur Discord** :

| Niveau | Condition | Droits |
|---|---|---|
| **Membre** | a fait `/register` sur le serveur (profil dans `player_profiles`) **et** y est toujours | voir builds & compos, voir sa BAL |
| **Staff** | membre + rôle configuré via `/config` → 🌐 Rôle staff du site web | créer / modifier / supprimer builds et compos |
| **Admin** | membre + nommé via **`/webadmin add @membre`** | tout le staff + **page Admin** (stats, futurs outils) |

`/webadmin add|remove|list` est une commande du bot, réservée aux administrateurs du serveur et au **Maitre de guilde**.

Les rôles Discord sont vérifiés via l'API REST Discord avec le token du bot. Le niveau d'accès calculé est gardé **60 s en cache** (par serveur et par utilisateur) : un `/webadmin add` ou un changement de rôle peut mettre jusqu'à une minute à apparaître sur le site.

---

## Lancer en local

### 1. Prérequis
- Python 3.11+ et Node 20+ (`python --version`, `node --version`)
- Le bot déployé au moins une fois avec la version qui crée la table `web_admins` (sinon personne n'est admin, le reste marche)

### 2. Remplir `api/.env`

```powershell
Copy-Item api\.env.example api\.env
```

| Variable | Où la trouver |
|---|---|
| `DATABASE_URL` | Railway → service **Postgres** → onglet *Variables* → **`DATABASE_PUBLIC_URL`** (l'URL interne `DATABASE_URL` de Railway ne marche pas depuis ton PC) |
| `DISCORD_TOKEN` | le même token que le bot |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | [Discord Developer Portal](https://discord.com/developers/applications) → ton application → **OAuth2** |
| `DISCORD_REDIRECT_URI` | laisser `http://localhost:4200/api/auth/callback` **et l'ajouter dans OAuth2 → Redirects** du portail |
| `SESSION_SECRET` | longue chaîne aléatoire, **16 caractères minimum** (sinon l'API refuse de démarrer) : `python -c "import secrets; print(secrets.token_urlsafe(48))"` |

> ⚠️ En local tu es branché sur la **vraie base** : un build ou une compo créé/supprimé sur ton site local l'est aussi pour le bot.

> En local, chaque requête vers la base Railway prend ~300 ms (base distante, via le proxy public) : c'est le délai minimum d'une page qui charge des données. Une fois l'API hébergée sur Railway à côté de la base, ce délai disparaît.

### 3. Démarrer

```powershell
.\start-local.ps1
```

Le script installe ce qu'il faut la première fois (venv Python, `npm install`), puis ouvre deux fenêtres :
l'API sur <http://localhost:8000> et le site sur **<http://localhost:4200>**.

À la main, si tu préfères :

```powershell
# Terminal 1 — API
cd api
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m uvicorn app.main:create_app --factory --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm start
```

Le serveur Angular redirige `/api/*` vers l'API (`frontend/proxy.conf.json`) : le navigateur ne parle qu'à `localhost:4200`, donc le cookie de session fonctionne sans config CORS.

Vérifier que l'API voit la base : <http://localhost:8000/api/health> → `{"status":"ok","database":true}`.

### 4. Devenir admin
Sur Discord : `/webadmin add @toi` → recharge le site, l'onglet **Admin** apparaît.

---

## Tests

```powershell
# API (aucune vraie base ni Discord : tout est simulé dans tests/fakes.py)
cd api
.venv\Scripts\python -m pytest

# Frontend (Vitest, sans navigateur)
cd frontend
npm test -- --watch=false
```

---

## Routes de l'API

Toutes sous `/api`. `{gid}` = id du serveur Discord.

| Méthode | Route | Niveau |
|---|---|---|
| GET | `/health` | — |
| GET | `/auth/login`, `/auth/callback` · POST `/auth/logout` | — |
| GET | `/me` (utilisateur + serveurs avec niveau) | connecté |
| GET | `/items` (catalogue des objets d'équipement Albion) | connecté |
| GET | `/guilds/{gid}/builds[?role=&type_acti=]`, `/guilds/{gid}/builds/{id}` (+ `used_by` : compos qui l'utilisent), `/guilds/{gid}/builds/{id}/image.png` | membre |
| POST | `/guilds/{gid}/builds/{id}/duplicate` (« Nom (copie) ») | staff |
| POST · PUT · DELETE | `/guilds/{gid}/builds[/{id}]` | staff |
| GET | `/guilds/{gid}/compos`, `/guilds/{gid}/compos/{nom}`, `/guilds/{gid}/compos/{nom}/image.png` (404 si aucun rôle n'a de build) | membre |
| POST | `/guilds/{gid}/compos/preview-image` (aperçu PNG d'une compo non enregistrée) | staff |
| POST · PUT · DELETE | `/guilds/{gid}/compos[/{nom}]` | staff |
| GET | `/guilds/{gid}/bal/me`, `/guilds/{gid}/bal/me/history?period=`, `/guilds/{gid}/roles` | membre |
| GET | `/guilds/{gid}/bal/me/operations?action=&page=` (25 par page), `/guilds/{gid}/bal/me/operations.csv?action=` | membre (ses propres lignes uniquement) |
| GET | `/guilds/{gid}/admin/overview` | admin |
| GET | `/guilds/{gid}/admin/bal?period=week\|7d\|30d\|90d\|180d` | admin |
| GET | `/guilds/{gid}/admin/bal/players?q=` (50 max, soldes à 0 compris), `/guilds/{gid}/admin/bal/players/{uid}/operations[.csv]?action=&page=`, `/guilds/{gid}/admin/bal/operations.csv?period=` (toute la guilde) | admin |
| GET | `/guilds/{gid}/admin/errors?command=&page=` (sans traceback), `/guilds/{gid}/admin/errors/{id}` (avec traceback, 404 si autre serveur) | admin |

**Page « Ma BAL » → Historique complet** : toutes les opérations du joueur (6 mois gardés par le bot), filtre par type (`/finacti`, `/paybal`, `/addbal`, `/retirebal`, `/transferbal`), pagination et **export CSV** (séparateur `;`, ouvrable dans Excel ; les cellules commençant par `= + - @` sont neutralisées contre l'injection de formules).

**Page Admin → BAL par joueur** : recherche par pseudo ou id Discord (accents et majuscules ignorés), liste des joueurs avec leur solde, clic → historique complet du joueur (même vue que « Ma BAL », filtre et export CSV), et **export CSV de toute la BAL de la guilde** sur la période choisie (colonnes date, opération, compo, joueur, uid, montant, par).

**Page Admin → Erreurs du bot** : équivalent web de `/errors` (table `error_log` du bot, 30 jours), filtre par commande, traceback chargé au clic et affiché en texte brut.

### Sécurité

- **Connexion Discord** : paramètre `state` OAuth (cookie HttpOnly de 10 min) vérifié au retour — un lien piégé `?code=` ne connecte pas la victime sur le compte d'un autre.
- **`SESSION_SECRET`** : au moins 16 caractères et jamais une valeur d'exemple, sinon l'API refuse de démarrer (avec le dépôt public, un secret faible permettrait de forger un cookie admin).
- **Cookie `Secure`** par défaut quand l'API sert le front (`STATIC_DIR`), sauf `COOKIE_SECURE=false` explicite.
- **Anti-CSRF** : en plus de `SameSite=Lax`, toute requête qui modifie (POST/PUT/DELETE) est refusée si le navigateur annonce une autre origine que `FRONTEND_URL` ou le domaine du site.
- **En-têtes** : `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, et en prod une **CSP** (scripts limités au site + empreinte du script en ligne de `index.html`, calculée au démarrage) et **HSTS**. `/docs` et `/openapi.json` ne sont pas exposés en prod.
- **Limites** : corps de requête 128 Ko max (refusé avant l'authentification) ; 500 builds et 100 compos par serveur ; 20 lignes par party et 50 joueurs par ligne dans une compo ; 10 choix max par case d'équipement à la saisie (3 après nettoyage) ; noms de compo sans `/ \ ? # %` (et unicité sans tenir compte de la casse) ; images en `https://` uniquement.
- **Quota Discord** : l'API n'interroge Discord (token du bot) que si l'utilisateur a un profil `/register` sur ce serveur — un id de serveur au hasard ne consomme rien. Caches bornés, délais d'attente de 10 s sur les appels Discord.

### Statistiques BAL — page Admin et page « Ma BAL »

**Périodes** (même sélecteur partout) : **Cette semaine** (depuis lundi 00:00, heure de Paris — comme le récap du bot), **7 jours**, **30 jours**, **90 jours**, **6 mois** (glissants). Données lues dans `bal_log` (historique conservé 6 mois par le bot) et `bal`. Crédité = `/finacti`, `/paybal`, `/addbal` ; payé = `/retirebal` ; les `/transferbal` ne comptent ni dans l'un ni dans l'autre. Jour par jour jusqu'à 31 jours, sinon par semaine.

**Admin** (`GET /admin/bal?period=`) :
- **BAL due** en grand + tuiles crédité, payé, solde net, fins d'activité, **gain moyen par acti**, **joueurs moyens par acti** ; **variation vs la période précédente** de même durée (semaine : mêmes jours de la semaine d'avant) ;
- **Silver crédité et payé** (colonnes) et **évolution de la BAL due** (reconstituée à rebours depuis le total actuel), chacun avec un tableau « Voir les données » ;
- **Quand la guilde joue** : carte jour × heure des fins d'activité (heure de Paris) + créneau le plus actif ;
- **Top callers** (qui lance les `/finacti`/`/paybal` : silver distribué, nb d'actis), **top gagnants** de la période, **plus grosses BAL dues** en **donut** (les 7 plus grosses + « Autres », part de la BAL due au survol, palette catégorielle `--cat-1…7` validée daltonisme), **silver par compo**.

**Ma BAL** (`GET /bal/me/history?period=`, membre — uniquement ses propres données) : solde + **rang dans la guilde**, gagné / retiré / actis payées sur la période, **courbe de son solde**, gains et retraits par jour/semaine, **15 dernières opérations** (date, type, compo, montant, par qui).

Calculs dans `api/app/bal_stats.py` (fonctions pures testées) ; graphiques SVG/HTML maison (`frontend/src/app/shared/charts.ts` : colonnes, courbe, barres, carte de chaleur, badge de variation), sans librairie. Palettes (lilas/orange, couleurs de rôle, rampe de la carte) validées pour le contraste et le daltonisme.

### Design

Thème noir & lilas refondu (`frontend/src/styles.scss`, toutes les couleurs en variables) : halos lilas, surfaces en verre dépoli, boutons en dégradé, pastilles de filtre, sélecteur segmenté, chargements animés (shimmer), **notifications** (« Build enregistré », « Supprimé »…), icônes SVG maison (`shared/icon.ts`) et logo lys (`shared/logo.ts`, aussi en favicon). Couleur par rôle (TANK bleu, HEAL vert, DPS orange, SUPPORT violet), toujours accompagnée du nom ou de l'emoji.
- **Barre du haut** : liens avec icônes et soulignement animé, pastille du serveur, menu du compte (changer de serveur, déconnexion), menu burger sur mobile.
- **Builds** : cartes avec liseré de la couleur du rôle et **mini-inventaire 3×3** disposé comme en jeu ; filtres par rôle / PVP-PVE en pastilles.
- **Compos** : **barre de composition** par rôle, lignes build + icônes par party ; aperçu en direct dans le formulaire.
- **Formulaire de build** : inventaire grand format à gauche, champs à droite, barre d'enregistrement collante.
- **Page 404** avec une blague Albion tirée au hasard (« Une autre blague »).

La liste des **builds** a une barre de recherche instantanée (nom, rôle, arme, notes, auteur, objets de l'équipement ; accents et majuscules ignorés, tous les mots doivent correspondre) et un **pager** (12 builds par page, retour à la page 1 quand la recherche ou les filtres changent ; composant réutilisable `shared/pager.ts`).

### Builds et équipement

**Page d'un build** (`/g/{gid}/builds/{id}`, lien à coller dans Discord — il faut être connecté et membre du serveur) : équipement en grand, précisions, compos qui l'utilisent, **image PNG** identique au MP de `/massup` (télécharger / copier), et pour le staff **Dupliquer** (crée « Nom (copie) » puis ouvre son formulaire).

**Images générées par l'API** (`app/images.py`) : **copie** du rendu du bot (`botDiscord/Service/build_image.py`) — à resynchroniser si le bot change — avec sa police et ses icônes (`app/assets/`, CDN Albion en secours). Rendu dans un thread, 2 à la fois au plus, 200 dernières images gardées en mémoire (clé = contenu exact).

Un build choisit son équipement parmi les **vrais objets du jeu**, avec leur image, dans une disposition identique à l'inventaire in-game :
tête, cape / arme, armure, main gauche / potion, bottes, bouffe. Le sélecteur propose une recherche (FR, EN ou famille, accents ignorés) et des filtres par famille (Épées, Bâtons sacrés, Plaque, Nourriture, Potions…).

Chaque case peut valoir :
- **1 objet** imposé ;
- **2 ou 3 objets au choix** (« Grand bâton béni *ou* Bâton de rédemption ») ;
- **« Au choix du joueur »** (rien d'imposé) ;
- rien (case vide).

Détails :
- Stocké dans `builds.items` : `{"mainhand": ["2H_HOLYSTAFF", "2H_HOLYSTAFF_HELL"], "cape": ["*"], "food": ["MEAL_STEW"], …}` — une entrée par **type** d'objet, tous tiers confondus. L'ancien format `{"mainhand": "ID"}` est encore lu.
- L'API refuse : objet inconnu ou au mauvais emplacement, plus de 3 choix, « au choix » mélangé à des objets, main gauche alors que **toutes** les armes proposées sont à deux mains (si au moins une est à une main, la main gauche reste possible). Le site applique les mêmes règles.
- Images : CDN officiel `https://render.albiononline.com/v1/item/{id}.png`. Si une image manque (objet trop récent), une icône « ? » s'affiche à la place.
- Le champ texte « Précisions sur le stuff » reste disponible (tier minimum, monture…).

### Compos = ensemble de builds

**Image de la compo depuis le site** : bouton **Image** sur chaque compo de guilde qui a au moins un build (visible par tous les membres), et **Aperçu de l'image** dans le formulaire (avant même d'enregistrer, staff). C'est la même image que celle postée sous `/acti` (seuls les rôles liés à un build y figurent) ; boutons Télécharger et Copier pour la coller dans Discord.

Chaque ligne d'une compo = **un build × un nombre de joueurs**, en PF1 et/ou PF2. Le rôle vient du build, et il n'y a **qu'un build par rôle et par party** :
sur Discord, avec `/acti`, le joueur choisit son rôle et le build lui est imposé (pas de liste d'armes). Une ligne peut aussi rester « sans build » (rôle + armes en texte, comme avant).

- Stocké dans `custom_templates` au format du bot, avec en plus `builds` / `builds_pf2` (`{rôle: id du build}`) ; le hint d'arme affiché dans l'acti = nom du build.
- Un build utilisé par une compo ne peut pas être supprimé ni changer de rôle (409, avec la liste des compos). Le renommer met à jour les compos.
- Lancement des activités : uniquement via `/acti nametemplate:<compo>` sur Discord.
- `/massup` envoie en MP à chaque joueur l'image du build de son rôle (voir le README du bot).

**Catalogue** : `api/app/data/items.json` (~290 objets, bouffe et potions comprises), généré depuis les dumps officiels du jeu ([ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)).
Après un patch d'Albion qui ajoute des objets :

```powershell
cd api
.venv\Scripts\python -m scripts.update_items
```

Les compos sont écrites dans `custom_templates` (même format que `/addtemplate`) ; le bot recharge ce cache toutes les 2 minutes, elles apparaissent donc dans `/acti` sans redémarrage.

---

## Déploiement (Railway)

Un **seul service** construit avec le `Dockerfile` de la racine (`railway.json` force ce builder) :
le front Angular est compilé (Node), puis servi par l'API FastAPI (`STATIC_DIR=/app/static`) — site et API sur le même domaine, pas de CORS.
Toute URL hors `/api` renvoie `index.html` (routes Angular). Healthcheck : `/api/health` (vérifie aussi la base).

1. Railway → service **lilium-site** → **Settings → Networking → Generate Domain** (ex. `lilium-site-production.up.railway.app`).
2. **Variables** du service :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence au Postgres du projet, réseau interne) |
   | `DISCORD_TOKEN` | token du bot (le même que le bot) |
   | `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | application Discord → OAuth2 |
   | `DISCORD_REDIRECT_URI` | `https://<domaine>/api/auth/callback` |
   | `FRONTEND_URL` | `https://<domaine>` |
   | `SESSION_SECRET` | longue chaîne aléatoire, 16 caractères minimum (différente de celle du local) |
   | `COOKIE_SECURE` | `true` (valeur par défaut en prod de toute façon) |

3. Portail Discord → ton application → **OAuth2 → Redirects** : ajouter `https://<domaine>/api/auth/callback` (garder celle de localhost pour le dev).
4. Chaque push sur `main` redéploie.

Le bot n'est pas concerné : il continue de tourner seul, le seul lien reste la base Postgres.

## Structure

```
lilium-site/
├── start-local.ps1          # lance API + frontend en local
├── Dockerfile               # image de prod (front compilé + API) — Railway
├── railway.json             # builder Dockerfile + healthcheck /api/health
├── api/
│   ├── app/
│   │   ├── main.py          # create_app() : FastAPI, routes sous /api
│   │   ├── settings.py      # lecture de api/.env (erreur claire si une variable manque)
│   │   ├── db.py            # requêtes Postgres (asyncpg)
│   │   ├── auth.py          # OAuth2 Discord + cookie de session signé
│   │   ├── discord_rest.py  # membres/serveurs via l'API Discord (cache 60 s)
│   │   ├── permissions.py   # niveaux member / staff / admin
│   │   ├── compos.py        # conversion lignes du site <-> format template du bot
│   │   ├── bal_stats.py     # statistiques BAL de la page Admin (fonctions pures)
│   │   ├── catalog.py       # catalogue d'objets Albion (génération + validation de l'équipement)
│   │   ├── data/items.json  # catalogue généré (versionné)
│   │   ├── constants.py     # ROLES + DEFAULT_TEMPLATES (copie de botDiscord/config.py, à garder synchro)
│   │   └── routes/          # auth, me, items, builds, compos, guild (bal, rôles, admin)
│   ├── scripts/update_items.py  # régénère data/items.json depuis ao-bin-dumps
│   └── tests/
└── frontend/
    ├── proxy.conf.json      # /api → localhost:8000
    └── src/
        ├── styles.scss      # thème noir & lilas (toutes les couleurs sont ici)
        └── app/
            ├── core/        # AuthService, ApiService, ItemsService, guards, intercepteur 401, modèles
            ├── shared/      # item-picker, gear (rangée / mini-inventaire), charts, icon, logo, role-bar, period-picker, toasts, pager
            └── pages/       # login, guilds, shell (nav), builds, compos, bal, admin, not-found (404)
```

## Pistes pour la suite
- Page Admin : d'autres outils (activité des membres…) — route `admin/…` + garde `require_admin`
- Builds : monture dans l'équipement
