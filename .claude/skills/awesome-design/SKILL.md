---
name: awesome-design
description: Règles de design du site Lilium (thème noir & lilas, Angular). À charger avant de créer ou modifier une page, un composant, un style ou une animation du front (`frontend/src/app/**`, `styles.scss`), ou quand on demande un rendu « plus beau », « plus pro », « awesome ». Ne couvre pas les images PNG de build (lib AlbionCreateImageBuild).
---

# Awesome design — Lilium

Objectif : chaque écran a l'air fini, cohérent et vivant, sans jamais sortir du système existant.
Source de vérité : `frontend/src/styles.scss` (variables + classes globales). Lire les ~80 premières lignes avant de styler.

## 1. Règles absolues
- **Aucune couleur en dur** hors `:root` de `styles.scss` (ni hex, ni `rgb()`, ni nom). Besoin d'une nouvelle teinte → l'ajouter comme variable dans `:root`, commentée, puis l'utiliser.
- **Réutiliser les classes globales** avant d'écrire du CSS : `.container`, `.page-head` (+ `.subtitle`), `.section-title`, `.grid`, `.row`, `.card`, `.card-hover`/`.card-link`, `.glass`, `.btn` (`-primary`, `-danger`, `-ghost`, `-sm`, `-icon`), `.badge`, `.badge-outline`, `.chip(s)`, `.segmented`, `.form`/`.field`/`.input`/`.select`/`.textarea`/`.switch`, `.alert`, `.empty`, `.skeleton`, `.table`, `.num`, `.muted`, `.faint`, `.gradient-text`, `.sr-only`, `.linklike`.
- Styles propres à un composant = `styles:` du composant, courts, basés sur les variables. Rien de générique là-dedans : si ça sert à 2 pages, ça monte dans `styles.scss`.
- Icônes = `<app-icon name="…">` (`shared/icon.ts`, SVG outline 24×24, trait 2 px). Nouvelle icône → ajouter son tracé dans `ICONS`, même style. Pas de librairie d'icônes, pas d'emoji comme icône d'interface (emojis OK pour les rôles, à côté du nom).
- Textes visibles via i18n (`core/i18n/fr.ts` **et** `en.ts`), jamais en dur dans le template.

## 2. Palette et usage
| Usage | Variable |
|---|---|
| Fond / fond secondaire | `--bg`, `--bg-2` |
| Surfaces (carte → survol → actif) | `--surface`, `--surface-2`, `--surface-3` |
| Bordures | `--border` (nette), `--border-soft` (séparateurs) |
| Texte | `--text`, `--text-muted` (secondaire), `--text-faint` (méta, en-têtes de tableau) |
| Accent | `--lilac` (liens, focus), `--lilac-strong` (bord au survol), `--lilac-soft` (fond léger), `--lilac-glow` (halo) |
| Action principale | `--gradient` + texte `--on-lilac` (`.btn-primary`) |
| États | `--danger(-soft)`, `--success(-soft)` |
| Rôles | `--role-tank/heal/dps/support/other` via `roleColor()` (`shared/roles.ts`), toujours avec le nom ou l'emoji |
| Graphiques | `--series-*`, `--cat-1..7` (ordre fixe, 7 max puis « Autres » en `--text-faint`), `--heat-1..5`, `--grid`, `--axis` — charger le skill `dataviz` |
| Enchantement | `--ench-0..4` |

Hiérarchie : **un seul** `.btn-primary` (dégradé) par zone d'action ; le reste en `.btn` ou `.btn-ghost`. L'accent lilas est rare : s'il est partout, plus rien ne ressort.

## 3. Mise en page
- Page = `.container` → `.page-head` (h1 avec icône + `.subtitle` + actions à droite) → sections `.section-title` → `.grid` de `.card`.
- Espacements sur l'échelle 4 / 6 / 8 / 12 / 16 / 20 / 24 / 36 px ; `gap` plutôt que des marges.
- Rayons : `--radius` (cartes), `--radius-sm` (boutons, champs), `999px` (pastilles). Ombres : `--shadow`, `--shadow-lg`, `--shadow-glow` (survol/sélection uniquement).
- Typo : Inter, base 15 px ; titres 700, `letter-spacing` négatif ; chiffres en `.num` (tabular-nums). Méta en `.8rem` / `.85rem`, jamais sous `.75rem`.
- Responsive : points de rupture `860px` (grilles 2 colonnes → 1) et `720px` (navigation). Tester à 360 px de large : aucun défilement horizontal, `minmax(0, 1fr)` dans les grilles, `min-width: 0` sur les enfants flex/grid.

## 4. États (un écran n'est pas fini sans eux)
- **Chargement** : squelette qui a la forme du contenu final (`.skeleton`, barres `sk-*`, `app-lys-loader` pour une image en cours), pas un simple spinner centré. `.spinner` seulement dans un bouton occupé.
- **Vide** : `.empty` avec `<app-icon>` en premier enfant (médaillon flottant), une phrase utile et, si possible, l'action pour en sortir.
- **Erreur** : `.alert` avec `errorText(resource)` ; message humain, pas un code.
- **Succès d'une action** : toast (`ToastService`), pas d'alerte bloquante.
- **Désactivé / occupé** : `disabled` + `.spinner` dans le bouton, libellé inchangé.

## 5. Mouvement (subtil, jamais gratuit)
- Animations existantes à réutiliser : `.fade-up` (apparition), `.reveal` (panneau qui se déploie), `.slide-in` (bascule d'onglet), `.flash` / `.flash.gain` (valeur qui change), `.glow-pulse` (un seul élément à mettre en avant), `count-up` (chiffres clés), transitions de page (déjà gérées par le shell).
- Courbe `var(--ease)`, durées 150–400 ms ; survol = changement de bord/fond + légère élévation, pas de saut.
- `prefers-reduced-motion` est déjà neutralisé globalement : ne pas le contourner (pas d'animation JS non coupable).

## 6. Accessibilité
- Contraste texte ≥ 4.5:1 sur sa surface (`--text-faint` réservé aux méta, jamais pour une info indispensable).
- Focus visible conservé (`:focus-visible` global) ; ne jamais `outline: none` sans remplacement.
- Boutons-icônes avec `aria-label` ; champs sans libellé visible avec `.sr-only` ; couleur jamais seule porteuse d'information (rôle = couleur + nom).
- Éléments cliquables = `<button>` ou `<a>`, cible ≥ 32 px.

## 7. Checklist avant de rendre
1. `grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' ` sur les fichiers modifiés hors `styles.scss` → rien.
2. Chargement, vide, erreur et 360 px vérifiés (lancer le front via le skill `run`, capture Playwright si possible).
3. FR + EN à jour ; specs du composant à jour (`*.spec.ts`, cf. `CLAUDE.md`).
4. Nouvelle variable ou classe globale → commentée dans `styles.scss` ; README si la page est nouvelle.
