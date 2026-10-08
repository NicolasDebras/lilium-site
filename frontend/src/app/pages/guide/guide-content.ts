/* Contenu du guide (/guide). Données pures : le composant ne fait que l'afficher.
   ⚠️ Nouvelle commande ou commande modifiée dans le bot → mettre à jour COMMANDS
   (un test du bot vérifie que la liste correspond aux commandes du code). */

export interface TutoStep {
  id: string;
  title: string;
  text: string;
  /** Action proposée : 'invite' (lien d'invitation du bot) ou 'login' (connexion au site). */
  action?: 'invite' | 'login';
  /** « Ça ne marche pas ? » */
  help?: string;
}

/** Tutoriel « Lier ton serveur Discord au site », pas à pas. */
export const TUTORIAL: TutoStep[] = [
  {
    id: 'inviter', title: 'Inviter le bot sur ton serveur', action: 'invite',
    text: 'Clique sur « Ajouter le bot », choisis ton serveur et valide les permissions demandées. Il faut avoir la permission « Gérer le serveur » sur Discord.',
    help: 'Ton serveur n’apparaît pas dans la liste de Discord ? Tu n’as pas « Gérer le serveur » : demande au propriétaire.',
  },
  {
    id: 'roles-bot', title: 'Placer le rôle du bot assez haut',
    text: 'Paramètres du serveur → Rôles : fais glisser le rôle « Lilium » au-dessus des rôles qu’il doit donner ou retirer (Membre, Absent, rôles à la carte, rôle d’arrivée…).',
    help: 'Message « Je n’ai pas la permission de gérer ce rôle » : le rôle du bot est en dessous de ce rôle dans la liste.',
  },
  {
    id: 'register', title: 'Chaque membre fait /register',
    text: 'Sur Discord, tape /register suivi de ton pseudo Albion exact. C’est ce profil qui fait apparaître le serveur sur le site.',
    help: 'Pseudo « introuvable » : vérifie l’orthographe exacte (le serveur Albion Europe est utilisé). Sans /register, le serveur n’apparaît pas sur le site.',
  },
  {
    id: 'staff', title: 'Choisir le rôle staff du site',
    text: 'Sur Discord : /config → 🌐 Rôle staff du site web, puis choisis le rôle (ex. Officier). Ses membres pourront créer et modifier builds et compos sur le site.',
    help: 'Pas de bouton « Modifier » sur le site ? Vérifie que tu as bien ce rôle ; un changement de rôle met jusqu’à 60 secondes à être pris en compte.',
  },
  {
    id: 'admin', title: 'Nommer les admins du site',
    text: 'Sur Discord, tape /webadmin add puis mentionne-toi (ex. /webadmin add @toi). Réservé aux administrateurs du serveur et au Maitre de guilde. Les admins voient la page Admin : stats BAL, BAL par joueur, erreurs du bot. Vérifie avec /webadmin list. Plusieurs serveurs ? Refais-le sur chacun.',
    help: 'Commande refusée ? Il faut la permission Administrateur sur Discord ou le rôle « Maitre de guilde ».',
  },
  {
    id: 'connexion', title: 'Se connecter au site', action: 'login',
    text: 'Clique sur « Se connecter avec Discord » : seuls ton pseudo et ton avatar sont lus. Choisis ensuite ton serveur dans la liste.',
    help: 'Liste vide ? Fais /register sur le serveur (étape 3), puis recharge la page.',
  },
  {
    id: 'bonus', title: 'Pour aller plus loin (optionnel)',
    text: 'Toujours dans /config : salons de bienvenue et d’au revoir, rôle donné à l’arrivée, vocaux temporaires, rôles à la carte, salon du récap recrutement, annonces des nouveautés du bot. Pour le recrutement externe : /setup-recrutement.',
  },
];

export interface Command { name: string; usage: string; who: string; text: string; group: string }

export const COMMANDS: Command[] = [
  // Activités
  { group: 'Activités', name: 'acti', usage: '/acti', who: 'Membre', text: 'Créer une activité de guilde (à partir d’une compo ou d’un template).' },
  { group: 'Activités', name: 'templates', usage: '/templates', who: 'Membre', text: 'Afficher les templates et compos disponibles.' },
  { group: 'Activités', name: 'massup', usage: '/massup [message]', who: 'Créateur, Caller, Officier', text: 'Ping tous les inscrits d’une activité (une fois toutes les 2 min) et envoie à chacun l’image de son build en MP.' },
  { group: 'Activités', name: 'kickacti', usage: '/kickacti @joueur', who: 'Organisateur, Officier, Caller', text: 'Retirer un joueur d’une activité.' },
  { group: 'Activités', name: 'addacti', usage: '/addacti @joueur rôle', who: 'Officier, Caller', text: 'Ajouter ou déplacer un joueur dans une activité.' },
  { group: 'Activités', name: 'addtemplate', usage: '/addtemplate', who: 'Officier', text: 'Ajouter un template au format JSON (les compos du site sont plus simples).' },
  { group: 'Activités', name: 'deltemplate', usage: '/deltemplate nom', who: 'Officier', text: 'Supprimer un template custom.' },
  { group: 'Activités', name: 'setimage', usage: '/setimage nom [url]', who: 'Officier', text: 'Modifier l’image d’un template.' },
  { group: 'Activités', name: 'setdescription', usage: '/setdescription nom [description]', who: 'Officier', text: 'Modifier la description d’un template.' },
  // BAL
  { group: 'BAL', name: 'monbal', usage: '/monbal', who: 'Membre', text: 'Voir son solde BAL.' },
  { group: 'BAL', name: 'transferbal', usage: '/transferbal @joueur montant', who: 'Membre', text: 'Transférer de la BAL à un autre joueur.' },
  { group: 'BAL', name: 'classement', usage: '/classement', who: 'Membre', text: 'Classement BAL du serveur (top 20).' },
  { group: 'BAL', name: 'addbal', usage: '/addbal @joueur montant', who: 'Officier', text: 'Ajouter de la BAL à un joueur.' },
  { group: 'BAL', name: 'retirebal', usage: '/retirebal @joueur montant', who: 'Officier', text: 'Retirer de la BAL (paiement effectué).' },
  { group: 'BAL', name: 'paybal', usage: '/paybal montant', who: 'Officier', text: 'Distribuer de la BAL à tous les participants d’une activité.' },
  { group: 'BAL', name: 'baljoueur', usage: '/baljoueur @joueur', who: 'Officier', text: 'Voir le solde d’un joueur.' },
  { group: 'BAL', name: 'ballog', usage: '/ballog [page] [joueur] [action]', who: 'Officier', text: 'Historique BAL sur 6 mois.' },
  { group: 'BAL', name: 'statbal', usage: '/statbal [jours]', who: 'Officier', text: 'Silver distribué sur une période.' },
  { group: 'BAL', name: 'totalbal', usage: '/totalbal', who: 'Officier, GM', text: 'Total des BAL dues par la guilde.' },
  { group: 'BAL', name: 'balpartis', usage: '/balpartis [vider]', who: 'Officier', text: 'Joueurs partis du Discord qui ont encore de la BAL.' },
  { group: 'BAL', name: 'setrate', usage: '/setrate taux', who: 'Maitre de guilde', text: 'Modifier le taux de rachat de la guilde (%).' },
  // Recrutement & joueurs
  { group: 'Recrutement & joueurs', name: 'register', usage: '/register pseudo', who: 'Tous', text: 'Enregistrer son pseudo Albion : indispensable pour accéder au site.' },
  { group: 'Recrutement & joueurs', name: 'recrutement', usage: '/recrutement @joueur', who: 'Recruteur, Officier', text: 'Enregistrer une candidature.' },
  { group: 'Recrutement & joueurs', name: 'setup-recrutement', usage: '/setup-recrutement', who: 'Admin', text: 'Configurer et poster le message de candidature.' },
  { group: 'Recrutement & joueurs', name: 'info', usage: '/info @joueur', who: 'Membre', text: 'Profil d’un joueur : pseudo, fame Albion, activités.' },
  { group: 'Recrutement & joueurs', name: 'ancien', usage: '/ancien @joueur', who: 'Recruteur, Officier', text: 'Basculer le statut Nouveau joueur ↔ Membre.' },
  { group: 'Recrutement & joueurs', name: 'reporter', usage: '/reporter @joueur', who: 'Recruteur, Officier', text: 'Repousser le suivi d’une recrue d’une semaine.' },
  { group: 'Recrutement & joueurs', name: 'kick', usage: '/kick @joueur', who: 'Recruteur, Officier', text: 'Passer un joueur en AFK (retire ses rôles, ajoute le rôle Absent).' },
  { group: 'Recrutement & joueurs', name: 'recap', usage: '/recap', who: 'Recruteur, Officier', text: 'Relancer le récap recrutement.' },
  // Locations
  { group: 'Locations', name: 'location', usage: '/location @joueur arme durée [caution]', who: 'Officier', text: 'Créer une location d’arme.' },
  { group: 'Locations', name: 'recaplocation', usage: '/recaplocation', who: 'Officier', text: 'Locations actives et montants dus.' },
  { group: 'Locations', name: 'closelocation', usage: '/closelocation id', who: 'Officier', text: 'Clôturer une location.' },
  // Serveur & site
  { group: 'Serveur & site', name: 'config', usage: '/config', who: 'Officier', text: 'Panneau de configuration du serveur (rôle staff du site, salons, rôles…).' },
  { group: 'Serveur & site', name: 'webadmin add', usage: '/webadmin add @membre', who: 'Admin serveur, Maitre de guilde', text: 'Nommer un admin du site pour CE serveur : il voit la page Admin (stats BAL, BAL par joueur, erreurs du bot) en plus des droits staff. Pris en compte sous 60 s.' },
  { group: 'Serveur & site', name: 'webadmin remove', usage: '/webadmin remove @membre', who: 'Admin serveur, Maitre de guilde', text: 'Retirer un admin du site sur ce serveur.' },
  { group: 'Serveur & site', name: 'webadmin list', usage: '/webadmin list', who: 'Admin serveur, Maitre de guilde', text: 'Lister les admins du site de ce serveur.' },
  { group: 'Serveur & site', name: 'errors', usage: '/errors [page] [commande] [id_erreur]', who: 'Officier', text: 'Erreurs des commandes (30 jours) — aussi dans Admin sur le site.' },
  { group: 'Serveur & site', name: 'helpliliumbot', usage: '/helpliliumbot', who: 'Tous', text: 'Liste de toutes les commandes.' },
];

export interface Article { id: string; title: string; paragraphs: string[] }

export const SITE: Article[] = [
  { id: 'niveaux', title: 'Niveaux d’accès', paragraphs: [
    'Membre : a fait /register sur le serveur et y est toujours — voit builds, compos, modèles et sa BAL.',
    'Staff : membre + rôle choisi dans /config → 🌐 Rôle staff du site web — crée, modifie, copie et publie builds et compos.',
    'Admin : nommé avec /webadmin add — tout le staff + la page Admin.',
  ] },
  { id: 'multi-serveur', title: 'Plusieurs serveurs Discord', paragraphs: [
    'Le bot est public : il peut être sur autant de serveurs que tu veux, et toi tu peux être membre, staff ou admin de plusieurs serveurs à la fois.',
    'Fais /register sur chaque serveur : ils apparaissent tous sur le site après connexion, et tu changes de serveur avec « Changer de serveur » (menu de ton compte).',
    'Chaque serveur a ses propres builds, compos, BAL, rôle staff (/config) et admins (/webadmin add, à refaire sur chaque serveur). Rien n’est mélangé entre serveurs.',
    'Pour réutiliser une compo d’un serveur à l’autre : « Copier vers… » sur la compo (il faut être staff des deux serveurs), ou passe par les Modèles.',
  ] },
  { id: 'builds', title: 'Builds', paragraphs: [
    'Chaque case d’équipement vaut un objet imposé, 2 ou 3 objets au choix, ou « au choix du joueur ».',
    'Swaps : la case à droite de l’équipement accepte jusqu’à 6 objets de rechange (arme, cape, armure…) ; ils apparaissent aussi sur l’image du build.',
    'La page d’un build a un lien à coller dans Discord et son image (la même qu’en MP avec /massup) ; le staff peut le dupliquer.',
  ] },
  { id: 'compos', title: 'Compos', paragraphs: [
    'Une compo = des lignes « build × nombre de joueurs » en Party 1 et/ou Party 2. Elle apparaît dans /acti sous 2 minutes.',
    'Plusieurs lignes du même rôle (ex. 1 Def tank + 1 Main tank) : « Ajouter une ligne » autant que tu veux, elles se trient toutes seules. Dans /acti, chaque ligne est un rôle séparé (« TANK · Main tank ») avec son build.',
    'Bouton Image : l’image postée sous /acti, à télécharger ou copier. Copier vers… : la recrée dans un autre de tes serveurs.',
  ] },
  { id: 'modeles', title: 'Modèles (bibliothèque)', paragraphs: [
    'Le staff peut publier une compo comme modèle public : elle devient importable par toutes les guildes, builds compris.',
    'Un modèle est un instantané : modifier ta compo ensuite ne change pas le modèle.',
  ] },
  { id: 'bal', title: 'Ma BAL', paragraphs: [
    'Solde, rang, courbe, gains par période et historique complet filtrable, exportable en CSV.',
  ] },
  { id: 'page-admin', title: 'Page Admin', paragraphs: [
    'Tableau de bord BAL (dont le camembert des BAL dues), BAL par joueur et export CSV de la guilde, erreurs du bot.',
  ] },
];

export const FAQ: Article[] = [
  { id: 'faq-serveur', title: 'Je ne vois pas mon serveur', paragraphs: ['Fais /register sur ce serveur, puis recharge la page. Le bot doit aussi y être.'] },
  { id: 'faq-modifier', title: 'Pas de bouton Modifier', paragraphs: ['Il faut le rôle staff du site (/config). Les changements de rôle mettent jusqu’à 60 s à s’appliquer.'] },
  { id: 'faq-mp', title: 'Un joueur ne reçoit pas son build avec /massup', paragraphs: ['Ses MP sont fermés : Paramètres de confidentialité du serveur → autoriser les messages privés.'] },
  { id: 'faq-role', title: '« Je n’ai pas la permission de gérer ce rôle »', paragraphs: ['Monte le rôle du bot au-dessus de ce rôle dans Paramètres du serveur → Rôles.'] },
  { id: 'faq-refuse', title: 'Un rôle est refusé dans les rôles à la carte', paragraphs: ['Par sécurité, les rôles de staff et ceux qui ont des permissions sensibles (administrateur, gérer les rôles, expulser…) ne peuvent pas être distribués automatiquement.'] },
];

export const PRIVACY: Article = { id: 'confidentialite', title: 'Confidentialité', paragraphs: [
  'Connexion Discord : seuls ton identifiant, ton pseudo et ton avatar sont lus (permission « identify »).',
  'Chaque serveur ne voit que ses propres données : BAL, builds, compos et profils sont cloisonnés.',
  'L’historique BAL est conservé 6 mois, les erreurs du bot 30 jours.',
] };

// ── Public visé (filtre « Joueur / Staff / Admin » du guide) ─────────────────

export type Audience = 'joueur' | 'staff' | 'admin';

export const AUDIENCES: { value: Audience | null; label: string }[] = [
  { value: null, label: 'Tout' },
  { value: 'joueur', label: 'Joueur' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
];

/** Le tuto « lier ton serveur au site » s'adresse à celui qui installe le bot. */
export const TUTORIAL_AUDIENCE: Audience = 'admin';

/** Public des articles du site et de la FAQ (par id). */
export const ARTICLE_AUDIENCE: Record<string, Audience> = {
  niveaux: 'joueur', 'multi-serveur': 'joueur', builds: 'staff', compos: 'staff', modeles: 'staff',
  bal: 'joueur', 'page-admin': 'admin',
  'faq-serveur': 'joueur', 'faq-modifier': 'staff', 'faq-mp': 'joueur', 'faq-role': 'admin', 'faq-refuse': 'admin',
};

/** Public d'une commande d'après « qui peut l'utiliser ». */
export function commandAudience(who: string): Audience {
  if (/\b(Tous|Membre)\b/.test(who)) return 'joueur';
  if (/Officier|Caller|Recruteur|Créateur|Organisateur/.test(who)) return 'staff';
  return 'admin';
}
