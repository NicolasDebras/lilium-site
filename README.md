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
| `SESSION_SECRET` | n'importe quelle longue chaîne aléatoire |

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
| GET | `/guilds/{gid}/builds[?role=&type_acti=]`, `/guilds/{gid}/builds/{id}` | membre |
| POST · PUT · DELETE | `/guilds/{gid}/builds[/{id}]` | staff |
| GET | `/guilds/{gid}/compos`, `/guilds/{gid}/compos/{nom}` | membre |
| POST · PUT · DELETE | `/guilds/{gid}/compos[/{nom}]` | staff |
| GET | `/guilds/{gid}/bal/me`, `/guilds/{gid}/roles` | membre |
| GET | `/guilds/{gid}/admin/overview` | admin |
| GET | `/guilds/{gid}/admin/bal?days=30` (7 à 180) | admin |

### Page Admin — tableau de bord BAL

Période au choix (30 jours, 90 jours, 6 mois), lue dans `bal_log` (historique conservé 6 mois par le bot) et `bal` :
- **BAL due** aux joueurs (en grand) + crédité, payé, solde net et nombre de fins d'activité sur la période ;
- **Silver crédité et payé** par jour (par semaine au-delà de 31 jours) — crédité = `/finacti`, `/paybal`, `/addbal` ; payé = `/retirebal` ; les `/transferbal` ne comptent ni dans l'un ni dans l'autre ;
- **Évolution de la BAL due**, reconstituée à rebours depuis le total actuel ;
- **Plus grosses BAL dues** (top 10) et **silver gagné par compo**.

Chaque graphique a une info-bulle au survol et un tableau « Voir les données ». Les calculs sont dans `api/app/bal_stats.py` (fonctions pures testées) ; les graphiques sont des composants SVG/HTML maison (`frontend/src/app/shared/charts.ts`), sans librairie. Jours comptés à l'heure de Paris.

La liste des **builds** a une barre de recherche instantanée (nom, rôle, arme, notes, auteur, objets de l'équipement ; accents et majuscules ignorés, tous les mots doivent correspondre) et un **pager** (12 builds par page, retour à la page 1 quand la recherche ou les filtres changent ; composant réutilisable `shared/pager.ts`).

### Builds et équipement

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
   | `SESSION_SECRET` | longue chaîne aléatoire (différente de celle du local) |
   | `COOKIE_SECURE` | `true` |

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
            ├── shared/      # item-picker (case d'équipement, 1 à 3 choix), gear (rangée d'icônes d'un build), charts (graphiques)
            └── pages/       # login, guilds, shell (nav), builds, compos, bal, admin
```

## Pistes pour la suite
- Page Admin : d'autres outils (activité des membres…) — route `admin/…` + garde `require_admin`
- Builds : monture dans l'équipement
