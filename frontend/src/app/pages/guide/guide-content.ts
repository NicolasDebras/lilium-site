/* Contenu du guide (/guide). Données pures : le composant ne fait que l'afficher.
   ⚠️ Nouvelle commande ou commande modifiée dans le bot → mettre à jour COMMANDS
   (un test du bot vérifie que la liste correspond aux commandes du code).
   Textes en { fr, en } ; `usage` reste tel que Discord l'affiche (le bot est en français). */
import { L10n, Lang } from '../../core/i18n/i18n';

export interface TutoStep {
  id: string;
  title: L10n;
  text: L10n;
  /** Action proposée : 'invite' (lien d'invitation du bot) ou 'login' (connexion au site). */
  action?: 'invite' | 'login';
  /** « Ça ne marche pas ? » */
  help?: L10n;
}

/** Tutoriel « Lier ton serveur Discord au site », pas à pas. */
export const TUTORIAL: TutoStep[] = [
  {
    id: 'inviter', action: 'invite',
    title: { fr: 'Inviter le bot sur ton serveur', en: 'Invite the bot to your server' },
    text: {
      fr: 'Clique sur « Ajouter le bot », choisis ton serveur et valide les permissions demandées. Il faut avoir la permission « Gérer le serveur » sur Discord.',
      en: 'Click “Add the bot”, pick your server and accept the requested permissions. You need the “Manage Server” permission on Discord.',
    },
    help: {
      fr: 'Ton serveur n’apparaît pas dans la liste de Discord ? Tu n’as pas « Gérer le serveur » : demande au propriétaire.',
      en: 'Your server isn’t in Discord’s list? You don’t have “Manage Server”: ask the owner.',
    },
  },
  {
    id: 'roles-bot',
    title: { fr: 'Placer le rôle du bot assez haut', en: 'Move the bot’s role high enough' },
    text: {
      fr: 'Paramètres du serveur → Rôles : fais glisser le rôle « Lilium » au-dessus des rôles qu’il doit donner ou retirer (Membre, Absent, rôles à la carte, rôle d’arrivée…).',
      en: 'Server Settings → Roles: drag the “Lilium” role above the roles it has to give or remove (Member, Away, self-assignable roles, join role…).',
    },
    help: {
      fr: 'Message « Je n’ai pas la permission de gérer ce rôle » : le rôle du bot est en dessous de ce rôle dans la liste.',
      en: 'Message “Je n’ai pas la permission de gérer ce rôle” (I can’t manage this role): the bot’s role is below that role in the list.',
    },
  },
  {
    id: 'register',
    title: { fr: 'Chaque membre fait /register', en: 'Every member runs /register' },
    text: {
      fr: 'Sur Discord, tape /register suivi de ton pseudo Albion exact. C’est ce profil qui fait apparaître le serveur sur le site.',
      en: 'On Discord, type /register followed by your exact Albion name. This profile is what makes the server show up on the website.',
    },
    help: {
      fr: 'Pseudo « introuvable » : vérifie l’orthographe exacte (le serveur Albion Europe est utilisé). Sans /register, le serveur n’apparaît pas sur le site.',
      en: 'Name “not found”: check the exact spelling (the Albion Europe server is used). Without /register, the server doesn’t show up on the website.',
    },
  },
  {
    id: 'staff',
    title: { fr: 'Choisir le rôle staff du site', en: 'Pick the website staff role' },
    text: {
      fr: 'Sur Discord : /config → 🌐 Rôle staff du site web, puis choisis le rôle (ex. Officier). Ses membres pourront créer et modifier builds et compos sur le site.',
      en: 'On Discord: /config → 🌐 Rôle staff du site web (website staff role), then pick the role (e.g. Officer). Its members can create and edit builds and comps on the website.',
    },
    help: {
      fr: 'Pas de bouton « Modifier » sur le site ? Vérifie que tu as bien ce rôle ; un changement de rôle met jusqu’à 60 secondes à être pris en compte.',
      en: 'No “Edit” button on the website? Check that you have this role; a role change takes up to 60 seconds to apply.',
    },
  },
  {
    id: 'admin',
    title: { fr: 'Nommer les admins du site', en: 'Appoint the website admins' },
    text: {
      fr: 'Sur Discord, tape /webadmin add puis mentionne-toi (ex. /webadmin add @toi). Réservé aux administrateurs du serveur et au Maitre de guilde. Les admins voient la page Admin : stats BAL, BAL par joueur, erreurs du bot. Vérifie avec /webadmin list. Plusieurs serveurs ? Refais-le sur chacun.',
      en: 'On Discord, type /webadmin add then mention yourself (e.g. /webadmin add @you). Only for server administrators and the Guild Master. Admins see the Admin page: balance stats, balance per player, bot errors. Check with /webadmin list. Several servers? Do it again on each one.',
    },
    help: {
      fr: 'Commande refusée ? Il faut la permission Administrateur sur Discord ou le rôle « Maitre de guilde ».',
      en: 'Command refused? You need the Administrator permission on Discord or the “Maitre de guilde” (Guild Master) role.',
    },
  },
  {
    id: 'connexion', action: 'login',
    title: { fr: 'Se connecter au site', en: 'Log in to the website' },
    text: {
      fr: 'Clique sur « Se connecter avec Discord » : seuls ton pseudo et ton avatar sont lus. Choisis ensuite ton serveur dans la liste.',
      en: 'Click “Log in with Discord”: only your username and avatar are read. Then pick your server from the list.',
    },
    help: {
      fr: 'Liste vide ? Fais /register sur le serveur (étape 3), puis recharge la page.',
      en: 'Empty list? Run /register on the server (step 3), then reload the page.',
    },
  },
  {
    id: 'bonus',
    title: { fr: 'Pour aller plus loin (optionnel)', en: 'Going further (optional)' },
    text: {
      fr: 'Toujours dans /config : salons de bienvenue et d’au revoir, rôle donné à l’arrivée, vocaux temporaires, rôles à la carte, salon du récap de 22h, vérif guilde Albion (membres hors guilde + renommage « [Guilde] Pseudo »), annonces des nouveautés du bot. Pour le recrutement externe : /setup-recrutement.',
      en: 'Still in /config: welcome and goodbye channels, join role, temporary voice channels, self-assignable roles, 10 pm recap channel, Albion guild check (members out of the guild + "[Guild] Name" renaming), bot update announcements. For external recruitment: /setup-recrutement.',
    },
  },
];

/** Groupes de commandes, dans l'ordre d'affichage (libellés : dictionnaire `guide.groups`). */
export type CommandGroup = 'activites' | 'bal' | 'recrutement' | 'locations' | 'serveur';

export interface Command { name: string; usage: string; who: L10n; text: L10n; group: CommandGroup }

export const COMMANDS: Command[] = [
  // Activités
  { group: 'activites', name: 'acti', usage: '/acti [heure]', who: { fr: 'Membre', en: 'Member' }, text: {
    fr: 'Créer une activité de guilde (à partir d’une compo ou d’un template). Heure de départ en option (ex : 21h30 ou 18/10 21h, heure de Paris) : affichée dans le fuseau de chacun avec un compte à rebours. En BAL (partage du butin en fin d’acti) si tu es Caller, Officier ou GM ; sinon l’acti est libre. Bouton Fill : tu passes en attente et un Caller/Officier/GM te place sur un rôle libre via « ⏳ En attente » (tu reçois un MP). Si un inscrit se retire à moins de 30 min du départ, le créateur de l’acti est prévenu en MP.',
    en: 'Create a guild activity (from a comp or a template). Optional start time (e.g. 21h30 or 18/10 21h, Paris time): shown in everyone’s time zone with a countdown. With balance (loot split at the end) if you are Caller, Officer or GM; otherwise the activity is free. Fill button: you go on the waiting list and a Caller/Officer/GM puts you on an open role via “⏳ En attente” (you get a DM). If someone signed up drops out less than 30 min before the start, the activity’s creator gets a DM.' } },
  { group: 'activites', name: 'templates', usage: '/templates', who: { fr: 'Membre', en: 'Member' }, text: {
    fr: 'Afficher les templates et compos disponibles.', en: 'Show the available templates and comps.' } },
  { group: 'activites', name: 'massup', usage: '/massup [message]', who: { fr: 'Créateur, Caller, Officier', en: 'Creator, Caller, Officer' }, text: {
    fr: 'Ping tous les inscrits d’une activité (une fois toutes les 2 min) et envoie à chacun l’image de son build en MP.',
    en: 'Pings everyone signed up for an activity (once every 2 min) and DMs each of them their build image.' } },
  { group: 'activites', name: 'kickacti', usage: '/kickacti @joueur', who: { fr: 'Organisateur, Officier, Caller', en: 'Organizer, Officer, Caller' }, text: {
    fr: 'Retirer un joueur d’une activité.', en: 'Remove a player from an activity.' } },
  { group: 'activites', name: 'addacti', usage: '/addacti @joueur rôle', who: { fr: 'Officier, Caller', en: 'Officer, Caller' }, text: {
    fr: 'Ajouter ou déplacer un joueur dans une activité.', en: 'Add or move a player in an activity.' } },
  { group: 'activites', name: 'addtemplate', usage: '/addtemplate', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Ajouter un template au format JSON (les compos du site sont plus simples).', en: 'Add a template in JSON format (the website’s comps are simpler).' } },
  { group: 'activites', name: 'deltemplate', usage: '/deltemplate nom', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Supprimer un template custom.', en: 'Delete a custom template.' } },
  { group: 'activites', name: 'setimage', usage: '/setimage nom [url]', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Modifier l’image d’un template.', en: 'Change a template’s image.' } },
  { group: 'activites', name: 'setdescription', usage: '/setdescription nom [description]', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Modifier la description d’un template.', en: 'Change a template’s description.' } },
  // BAL
  { group: 'bal', name: 'monbal', usage: '/monbal', who: { fr: 'Membre', en: 'Member' }, text: {
    fr: 'Voir son solde BAL.', en: 'See your balance.' } },
  { group: 'bal', name: 'transferbal', usage: '/transferbal @joueur montant', who: { fr: 'Membre', en: 'Member' }, text: {
    fr: 'Transférer de la BAL à un autre joueur.', en: 'Transfer balance to another player.' } },
  { group: 'bal', name: 'classement', usage: '/classement', who: { fr: 'Membre', en: 'Member' }, text: {
    fr: 'Classement BAL du serveur (top 20).', en: 'Server balance leaderboard (top 20).' } },
  { group: 'bal', name: 'addbal', usage: '/addbal @joueur montant', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Ajouter de la BAL à un joueur (il reçoit un MP avec le montant).', en: 'Add balance to a player (they get a DM with the amount).' } },
  { group: 'bal', name: 'retirebal', usage: '/retirebal @joueur montant motif [raison]', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Retirer de la BAL : paiement effectué, ou amende (raison obligatoire, le joueur reçoit un MP avec la raison et la somme retirée).',
    en: 'Withdraw balance: payment made, or fine (reason required, the player gets a DM with the reason and the amount taken).' } },
  { group: 'bal', name: 'paybal', usage: '/paybal montant', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Distribuer de la BAL à tous les participants d’une activité.', en: 'Hand out balance to every participant of an activity.' } },
  { group: 'bal', name: 'baljoueur', usage: '/baljoueur @joueur', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Voir le solde d’un joueur.', en: 'See a player’s balance.' } },
  { group: 'bal', name: 'ballog', usage: '/ballog [page] [joueur] [action]', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Historique BAL sur 6 mois.', en: 'Balance history over 6 months.' } },
  { group: 'bal', name: 'statbal', usage: '/statbal [jours]', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Silver distribué sur une période.', en: 'Silver handed out over a period.' } },
  { group: 'bal', name: 'totalbal', usage: '/totalbal', who: { fr: 'Officier, GM', en: 'Officer, GM' }, text: {
    fr: 'Total des BAL dues par la guilde.', en: 'Total balance owed by the guild.' } },
  { group: 'bal', name: 'balpartis', usage: '/balpartis [vider]', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Joueurs partis du Discord qui ont encore de la BAL.', en: 'Players who left the Discord and still have a balance.' } },
  { group: 'bal', name: 'setrate', usage: '/setrate taux', who: { fr: 'Maitre de guilde', en: 'Guild Master' }, text: {
    fr: 'Modifier le taux de rachat de la guilde (%).', en: 'Change the guild’s buyback rate (%).' } },
  // Recrutement & joueurs
  { group: 'recrutement', name: 'register', usage: '/register pseudo', who: { fr: 'Tous', en: 'Everyone' }, text: {
    fr: 'Enregistrer son pseudo Albion : indispensable pour accéder au site.', en: 'Register your Albion name: required to access the website.' } },
  { group: 'recrutement', name: 'recrutement', usage: '/recrutement @joueur', who: { fr: 'Recruteur, Officier', en: 'Recruiter, Officer' }, text: {
    fr: 'Enregistrer une candidature.', en: 'Record an application.' } },
  { group: 'recrutement', name: 'setup-recrutement', usage: '/setup-recrutement', who: { fr: 'Admin', en: 'Admin' }, text: {
    fr: 'Configurer et poster le message de candidature.', en: 'Set up and post the application message.' } },
  { group: 'recrutement', name: 'info', usage: '/info @joueur', who: { fr: 'Membre', en: 'Member' }, text: {
    fr: 'Profil d’un joueur : pseudo, fame Albion, activités.', en: 'A player’s profile: name, Albion fame, activities.' } },
  { group: 'recrutement', name: 'ancien', usage: '/ancien @joueur', who: { fr: 'Recruteur, Officier', en: 'Recruiter, Officer' }, text: {
    fr: 'Basculer le statut Nouveau joueur ↔ Membre.', en: 'Toggle the New player ↔ Member status.' } },
  { group: 'recrutement', name: 'reporter', usage: '/reporter @joueur', who: { fr: 'Recruteur, Officier', en: 'Recruiter, Officer' }, text: {
    fr: 'Repousser le suivi d’une recrue d’une semaine.', en: 'Postpone a recruit’s follow-up by one week.' } },
  { group: 'recrutement', name: 'kick', usage: '/kick @joueur', who: { fr: 'Recruteur, Officier', en: 'Recruiter, Officer' }, text: {
    fr: 'Passer un joueur en AFK (retire ses rôles, ajoute le rôle Absent).', en: 'Set a player as AFK (removes their roles, adds the Away role).' } },
  { group: 'recrutement', name: 'recap', usage: '/recap', who: { fr: 'Recruteur, Officier', en: 'Recruiter, Officer' }, text: {
    fr: 'Relancer le récap recrutement.', en: 'Re-run the recruitment recap.' } },
  // Locations
  { group: 'locations', name: 'location', usage: '/location @joueur arme durée [caution]', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Créer une location d’arme.', en: 'Create a weapon rental.' } },
  { group: 'locations', name: 'recaplocation', usage: '/recaplocation', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Locations actives et montants dus.', en: 'Active rentals and amounts owed.' } },
  { group: 'locations', name: 'closelocation', usage: '/closelocation id', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Clôturer une location.', en: 'Close a rental.' } },
  // Serveur & site
  { group: 'serveur', name: 'config', usage: '/config', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Panneau de configuration du serveur (rôle staff du site, salons, rôles…).', en: 'Server settings panel (website staff role, channels, roles…).' } },
  { group: 'serveur', name: 'webadmin add', usage: '/webadmin add @membre', who: { fr: 'Admin serveur, Maitre de guilde', en: 'Server admin, Guild Master' }, text: {
    fr: 'Nommer un admin du site pour CE serveur : il voit la page Admin (stats BAL, BAL par joueur, erreurs du bot) en plus des droits staff. Pris en compte sous 60 s.',
    en: 'Appoint a website admin for THIS server: they see the Admin page (balance stats, balance per player, bot errors) on top of staff rights. Applied within 60 s.' } },
  { group: 'serveur', name: 'webadmin remove', usage: '/webadmin remove @membre', who: { fr: 'Admin serveur, Maitre de guilde', en: 'Server admin, Guild Master' }, text: {
    fr: 'Retirer un admin du site sur ce serveur.', en: 'Remove a website admin on this server.' } },
  { group: 'serveur', name: 'webadmin list', usage: '/webadmin list', who: { fr: 'Admin serveur, Maitre de guilde', en: 'Server admin, Guild Master' }, text: {
    fr: 'Lister les admins du site de ce serveur.', en: 'List this server’s website admins.' } },
  { group: 'serveur', name: 'errors', usage: '/errors [page] [commande] [id_erreur]', who: { fr: 'Officier', en: 'Officer' }, text: {
    fr: 'Erreurs des commandes (30 jours) — aussi dans Admin sur le site.', en: 'Command errors (30 days) — also in Admin on the website.' } },
  { group: 'serveur', name: 'helpliliumbot', usage: '/helpliliumbot', who: { fr: 'Tous', en: 'Everyone' }, text: {
    fr: 'Liste de toutes les commandes.', en: 'List of every command.' } },
];

export interface Article { id: string; title: L10n; paragraphs: Record<Lang, string[]> }

export const SITE: Article[] = [
  { id: 'niveaux', title: { fr: 'Niveaux d’accès', en: 'Access levels' }, paragraphs: {
    fr: [
      'Membre : a fait /register sur le serveur et y est toujours — voit builds, compos, modèles et sa BAL.',
      'Staff : membre + rôle choisi dans /config → 🌐 Rôle staff du site web — crée, modifie, copie et publie builds et compos.',
      'Admin : nommé avec /webadmin add — tout le staff + la page Admin.',
    ],
    en: [
      'Member: ran /register on the server and is still there — sees builds, comps, templates and their balance.',
      'Staff: member + the role picked in /config → 🌐 Rôle staff du site web — creates, edits, copies and publishes builds and comps.',
      'Admin: appointed with /webadmin add — everything staff can do + the Admin page.',
    ],
  } },
  { id: 'multi-serveur', title: { fr: 'Plusieurs serveurs Discord', en: 'Several Discord servers' }, paragraphs: {
    fr: [
      'Le bot est public : il peut être sur autant de serveurs que tu veux, et toi tu peux être membre, staff ou admin de plusieurs serveurs à la fois.',
      'Fais /register sur chaque serveur : ils apparaissent tous sur le site après connexion, et tu changes de serveur avec « Changer de serveur » (menu de ton compte).',
      'Chaque serveur a ses propres builds, compos, BAL, rôle staff (/config) et admins (/webadmin add, à refaire sur chaque serveur). Rien n’est mélangé entre serveurs.',
      'Pour réutiliser une compo d’un serveur à l’autre : « Copier vers… » sur la compo (il faut être staff des deux serveurs), ou passe par les Modèles.',
    ],
    en: [
      'The bot is public: it can be on as many servers as you like, and you can be member, staff or admin of several servers at once.',
      'Run /register on each server: they all show up on the website after login, and you switch with “Switch server” (your account menu).',
      'Each server has its own builds, comps, balances, staff role (/config) and admins (/webadmin add, to repeat on each server). Nothing is mixed between servers.',
      'To reuse a comp from one server on another: “Copy to…” on the comp (you must be staff on both servers), or go through Templates.',
    ],
  } },
  { id: 'builds', title: { fr: 'Builds', en: 'Builds' }, paragraphs: {
    fr: [
      'Chaque case d’équipement vaut un objet imposé, 2 ou 3 objets au choix, ou « au choix du joueur ».',
      'Chaque objet choisi a son tier minimum (T4 à T8, ou libre) et son enchantement (.0 à .4, .3 pour la bouffe et les potions), réglables dans la liste « Sélection » du sélecteur. C’est un minimum : un équivalent convient (8.1 = 7.2 = 6.3). Une pastille « 8.1 » s’affiche sur l’icône, et le MP de /massup le rappelle.',
      'Swaps : la rangée de 6 cases sous l’équipement accueille les objets de rechange (arme, cape, armure…), un par case ; ils apparaissent aussi sur l’image du build.',
      'La page d’un build a un lien à coller dans Discord et son image (la même qu’en MP avec /massup) ; le staff peut le dupliquer.',
    ],
    en: [
      'Each gear slot holds one mandatory item, 2 or 3 items to choose from, or “player’s choice”.',
      'Each chosen item has its minimum tier (T4 to T8, or any) and its enchantment (.0 to .4, .3 for food and potions), set in the picker’s “Selection” list. It’s a minimum: an equivalent is fine (8.1 = 7.2 = 6.3). An “8.1” badge shows on the icon, and the /massup DM reminds it.',
      'Swaps: the row of 6 slots under the gear holds spare items (weapon, cape, armor…), one per slot; they also appear on the build image.',
      'A build’s page has a link to paste in Discord and its image (the same one sent by DM with /massup); staff can duplicate it.',
    ],
  } },
  { id: 'compos', title: { fr: 'Compos', en: 'Comps' }, paragraphs: {
    fr: [
      'Une compo = des lignes « build × nombre de joueurs » en Party 1 et/ou Party 2. Elle apparaît dans /acti sous 2 minutes.',
      'Plusieurs lignes du même rôle (ex. 1 Def tank + 1 Main tank) : « Ajouter une ligne » autant que tu veux, elles se trient toutes seules. Dans /acti, chaque ligne est un rôle séparé (« TANK · Main tank ») avec son build.',
      'Parts de paie personnalisées : coche la case pour ajouter une colonne « Parts » à chaque ligne (1 par défaut ; 2 = double part, 0,5 = demi-part, 0 = non payé). /finacti partage le butin selon ces parts ; l’embed de l’acti les affiche (« 💰 2 parts »).',
      'Bouton Image : l’image postée sous /acti, à télécharger ou copier. Copier vers… : la recrée dans un autre de tes serveurs.',
    ],
    en: [
      'A comp = lines of “build × number of players” in Party 1 and/or Party 2. It shows up in /acti within 2 minutes.',
      'Several lines of the same role (e.g. 1 Def tank + 1 Main tank): “Add a line” as many times as you want, they sort themselves. In /acti, each line is a separate role (“TANK · Main tank”) with its build.',
      'Custom pay shares: tick the box to add a “Shares” column to each line (1 by default; 2 = double share, 0.5 = half share, 0 = unpaid). /finacti splits the loot by these shares; the activity embed shows them (“💰 2 parts”).',
      'Image button: the image posted under /acti, to download or copy. Copy to…: recreates it on another of your servers.',
    ],
  } },
  { id: 'modeles', title: { fr: 'Modèles (bibliothèque)', en: 'Templates (library)' }, paragraphs: {
    fr: [
      'Le staff peut publier une compo comme modèle public : elle devient importable par toutes les guildes, builds compris.',
      'Un modèle est un instantané : modifier ta compo ensuite ne change pas le modèle.',
    ],
    en: [
      'Staff can publish a comp as a public template: every guild can then import it, builds included.',
      'A template is a snapshot: editing your comp afterwards doesn’t change the template.',
    ],
  } },
  { id: 'bal', title: { fr: 'Ma BAL', en: 'My balance' }, paragraphs: {
    fr: ['Solde, rang, courbe, gains par période et historique complet filtrable, exportable en CSV.'],
    en: ['Balance, rank, chart, earnings per period and full history, filterable and exportable as CSV.'],
  } },
  { id: 'page-admin', title: { fr: 'Page Admin', en: 'Admin page' }, paragraphs: {
    fr: ['Tableau de bord BAL (dont le camembert des BAL dues), BAL par joueur et export CSV de la guilde, erreurs du bot.'],
    en: ['Balance dashboard (including the owed-balance pie chart), balance per player and guild CSV export, bot errors.'],
  } },
];

export const FAQ: Article[] = [
  { id: 'faq-serveur', title: { fr: 'Je ne vois pas mon serveur', en: 'I can’t see my server' }, paragraphs: {
    fr: ['Fais /register sur ce serveur, puis recharge la page. Le bot doit aussi y être.'],
    en: ['Run /register on that server, then reload the page. The bot must be there too.'],
  } },
  { id: 'faq-modifier', title: { fr: 'Pas de bouton Modifier', en: 'No Edit button' }, paragraphs: {
    fr: ['Il faut le rôle staff du site (/config). Les changements de rôle mettent jusqu’à 60 s à s’appliquer.'],
    en: ['You need the website staff role (/config). Role changes take up to 60 s to apply.'],
  } },
  { id: 'faq-mp', title: { fr: 'Un joueur ne reçoit pas son build avec /massup', en: 'A player doesn’t get their build with /massup' }, paragraphs: {
    fr: ['Ses MP sont fermés : Paramètres de confidentialité du serveur → autoriser les messages privés.'],
    en: ['Their DMs are closed: server Privacy Settings → allow direct messages.'],
  } },
  { id: 'faq-role', title: { fr: '« Je n’ai pas la permission de gérer ce rôle »', en: '“Je n’ai pas la permission de gérer ce rôle” (can’t manage this role)' }, paragraphs: {
    fr: ['Monte le rôle du bot au-dessus de ce rôle dans Paramètres du serveur → Rôles.'],
    en: ['Move the bot’s role above that role in Server Settings → Roles.'],
  } },
  { id: 'faq-refuse', title: { fr: 'Un rôle est refusé dans les rôles à la carte', en: 'A role is refused in self-assignable roles' }, paragraphs: {
    fr: ['Par sécurité, les rôles de staff et ceux qui ont des permissions sensibles (administrateur, gérer les rôles, expulser…) ne peuvent pas être distribués automatiquement.'],
    en: ['For safety, staff roles and roles with sensitive permissions (administrator, manage roles, kick…) can’t be handed out automatically.'],
  } },
];

export const PRIVACY: Article = { id: 'confidentialite', title: { fr: 'Confidentialité', en: 'Privacy' }, paragraphs: {
  fr: [
    'Connexion Discord : seuls ton identifiant, ton pseudo et ton avatar sont lus (permission « identify »).',
    'Chaque serveur ne voit que ses propres données : BAL, builds, compos et profils sont cloisonnés.',
    'L’historique BAL est conservé 6 mois, les erreurs du bot 30 jours.',
  ],
  en: [
    'Discord login: only your id, username and avatar are read (“identify” permission).',
    'Each server only sees its own data: balances, builds, comps and profiles are kept separate.',
    'Balance history is kept 6 months, bot errors 30 days.',
  ],
} };

// ── Public visé (filtre « Joueur / Staff / Admin » du guide) ─────────────────

export type Audience = 'joueur' | 'staff' | 'admin';

/** Filtre du guide (null = tout) ; libellés : dictionnaire `guide.audiences`. */
export const AUDIENCES: (Audience | null)[] = [null, 'joueur', 'staff', 'admin'];

/** Le tuto « lier ton serveur au site » s'adresse à celui qui installe le bot. */
export const TUTORIAL_AUDIENCE: Audience = 'admin';

/** Public des articles du site et de la FAQ (par id). */
export const ARTICLE_AUDIENCE: Record<string, Audience> = {
  niveaux: 'joueur', 'multi-serveur': 'joueur', builds: 'staff', compos: 'staff', modeles: 'staff',
  bal: 'joueur', 'page-admin': 'admin',
  'faq-serveur': 'joueur', 'faq-modifier': 'staff', 'faq-mp': 'joueur', 'faq-role': 'admin', 'faq-refuse': 'admin',
};

/** Public d'une commande d'après « qui peut l'utiliser » (texte français). */
export function commandAudience(who: string): Audience {
  if (/\b(Tous|Membre)\b/.test(who)) return 'joueur';
  if (/Officier|Caller|Recruteur|Créateur|Organisateur/.test(who)) return 'staff';
  return 'admin';
}
