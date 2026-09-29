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

### Builds et équipement

Un build choisit son équipement parmi les **vrais objets du jeu**, avec leur image, dans une disposition identique à l'inventaire in-game :
arme, main gauche, tête, armure, bottes, cape. Le sélecteur propose une recherche (FR, EN ou famille, accents ignorés) et des filtres par famille (Épées, Bâtons sacrés, Plaque, Cuir…).

- Stocké dans `builds.items` (JSON `{"mainhand": "2H_HOLYSTAFF", "head": "HEAD_CLOTH_SET2", …}`) : une entrée par **type** d'objet, tous tiers confondus.
- L'API refuse un objet inconnu, un objet au mauvais emplacement, ou une main gauche avec une arme à deux mains. Le site bloque aussi la case main gauche dans ce cas.
- Images : CDN officiel `https://render.albiononline.com/v1/item/{id}.png`. Si une image manque (objet trop récent), une icône « ? » s'affiche à la place.
- Le champ texte « Précisions sur le stuff » reste disponible pour le reste (tier minimum, bouffe, potion, monture…).

**Catalogue** : `api/app/data/items.json` (~250 objets), généré depuis les dumps officiels du jeu ([ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)).
Après un patch d'Albion qui ajoute des objets :

```powershell
cd api
.venv\Scripts\python -m scripts.update_items
```

Les compos sont écrites dans `custom_templates` (même format que `/addtemplate`) ; le bot recharge ce cache toutes les 2 minutes, elles apparaissent donc dans `/acti` sans redémarrage.

---

## Structure

```
lilium-site/
├── start-local.ps1          # lance API + frontend en local
├── api/
│   ├── app/
│   │   ├── main.py          # create_app() : FastAPI, routes sous /api
│   │   ├── settings.py      # lecture de api/.env (erreur claire si une variable manque)
│   │   ├── db.py            # requêtes Postgres (asyncpg)
│   │   ├── auth.py          # OAuth2 Discord + cookie de session signé
│   │   ├── discord_rest.py  # membres/serveurs via l'API Discord (cache 60 s)
│   │   ├── permissions.py   # niveaux member / staff / admin
│   │   ├── compos.py        # conversion lignes du site <-> format template du bot
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
            ├── shared/      # item-picker (case d'équipement + sélecteur d'objets)
            └── pages/       # login, guilds, shell (nav), builds, compos, bal, admin
```

## Pistes pour la suite
- Page Admin : ajouter des outils (historique BAL, activité des membres…) — route `admin/…` + garde `require_admin`
- Builds : bouffe / potion / monture dans l'équipement, lien entre les compos et les builds
- Déploiement (Railway) puis retrait du site embarqué dans le bot (`web/`, `ENABLE_WEB`)
