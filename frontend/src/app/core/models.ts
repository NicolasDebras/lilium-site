export type Level = 'none' | 'member' | 'staff' | 'admin';

const LEVEL_RANK: Record<Level, number> = { none: 0, member: 1, staff: 2, admin: 3 };

/** true si `level` donne au moins les droits de `minimum` (admin ⊇ staff ⊇ member). */
export function hasLevel(level: Level | undefined, minimum: Level): boolean {
  return LEVEL_RANK[level ?? 'none'] >= LEVEL_RANK[minimum];
}

export interface User {
  id: string;
  username: string;
  avatar_url: string;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  level: Level;
}

export interface Me {
  user: User;
  guilds: Guild[];
}

export type TypeActi = 'PVP' | 'PVE';

// ── Équipement Albion (catalogue /api/items) ──────────────────────────────────
export const SLOTS = ['mainhand', 'offhand', 'head', 'armor', 'shoes', 'cape', 'food', 'potion'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  mainhand: 'Arme',
  offhand: 'Main gauche',
  head: 'Tête',
  armor: 'Armure',
  shoes: 'Bottes',
  cape: 'Cape',
  food: 'Bouffe',
  potion: 'Potion',
};

/** Valeur d'une case « au choix du joueur » (rien d'imposé). */
export const FREE_CHOICE = '*';
/** Nombre max d'objets proposés au choix dans une case. */
export const MAX_CHOICES = 3;

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  name_en: string;
  /** Identifiant d'objet du jeu (tier max) pour l'image du CDN Albion. */
  icon: string;
  tiers: number[];
  two_handed: boolean;
  category: string;
}

/** Par case : 1 à 3 ids d'objets au choix, ou [FREE_CHOICE]. Case absente = rien de précisé. */
export type BuildItems = Partial<Record<Slot, string[]>>;

export interface Build {
  id: number;
  name: string;
  role: string;
  type_acti: TypeActi;
  weapon: string;
  notes: string;
  image: string;
  items: BuildItems;
  created_by_name: string;
}

export type BuildInput = Omit<Build, 'id' | 'created_by_name'>;

/** GET /builds/{id} — le build + les compos du serveur qui l'utilisent. */
export interface BuildDetail extends Build {
  used_by: string[];
}

export interface SlotRow {
  /** Ligne liée à un build : le rôle et l'arme viennent du build. null = ligne libre. */
  build_id: number | null;
  role: string;
  count: number | null;
  weapon: string;
}

export interface Compo {
  name: string;
  description: string;
  type_acti: TypeActi;
  image: string;
  pf1: SlotRow[];
  pf2: SlotRow[];
  total: number;
  custom: boolean;
}

export type CompoInput = Omit<Compo, 'total' | 'custom'>;

export interface CompoList {
  custom: Compo[];
  defaults: Compo[];
}

export interface RoleInfo {
  name: string;
  emoji: string;
}

export interface Bal {
  amount: number;
  ig_name: string;
}

export interface AdminOverview {
  builds: number;
  compos: number;
  profiles: number;
  total_bal: number;
}

/** Périodes BAL : « week » = semaine en cours (depuis lundi, heure de Paris), les autres glissantes. */
export type BalPeriod = 'week' | '7d' | '30d' | '90d' | '180d';

export interface BalTotals {
  credited: number;
  withdrawn: number;
  activities: number;
}

export interface FlowPoint {
  start: string;
  credited: number;
  withdrawn: number;
}

/** GET /admin/bal?period= — tableau de bord BAL de la page Admin. */
export interface BalStats {
  period: BalPeriod;
  days: number;
  start: string;
  bucket: 'day' | 'week';
  totals: BalTotals & { due: number; players: number; avg_per_activity: number; avg_players_per_activity: number };
  /** Même durée juste avant (semaine : mêmes jours de la semaine d'avant), pour les variations. */
  previous: BalTotals;
  flow: FlowPoint[];
  due: { date: string; total: number }[];
  top_players: { name: string; amount: number }[];
  top_earners: { name: string; amount: number }[];
  top_callers: { name: string; silver: number; activities: number }[];
  by_template: { template: string; silver: number; activities: number }[];
  /** 7 lignes (lundi → dimanche) × 24 heures : nombre de fins d'activité, heure de Paris. */
  heatmap: number[][];
}

/** GET /bal/me/history?period= — page « Ma BAL ». */
export interface MyBalHistory {
  period: BalPeriod;
  days: number;
  start: string;
  bucket: 'day' | 'week';
  amount: number;
  rank: number | null;
  players: number;
  totals: BalTotals;
  flow: FlowPoint[];
  curve: { date: string; total: number }[];
  recent: { ts: string; action: string; template: string; delta: number; by: string }[];
}

/** Types d'opération du bal_log (commandes du bot). */
export type BalAction = 'finacti' | 'paybal' | 'addbal' | 'retirebal' | 'transferbal';

export interface BalOperation {
  ts: string;
  action: string;
  template: string;
  delta: number;
  /** Solde après l'opération (absent sur les très vieilles lignes). */
  total: number | null;
  by: string;
}

/** GET /bal/me/operations?action=&page= — historique complet, paginé. */
export interface BalOperationsPage {
  items: BalOperation[];
  total: number;
  page: number;
  page_size: number;
}

/** Modèle de compo public (bibliothèque partagée entre tous les serveurs). */
export interface PublicCompo {
  id: number;
  name: string;
  description: string;
  type_acti: TypeActi;
  image: string;
  author_name: string;
  created_at: string;
  imports: number;
  total: number;
  pf1: { role: string; count: number }[];
  pf2: { role: string; count: number }[];
  builds: number;
}

export interface PublicComposPage {
  items: PublicCompo[];
  total: number;
  page: number;
  page_size: number;
}

/** GET /admin/bal/players?q= — un joueur de la BAL du serveur. */
export interface BalPlayer {
  uid: string;
  name: string;
  amount: number;
}

/** Une erreur du bot (table error_log), sans traceback. */
export interface BotError {
  id: number;
  ts: string;
  command: string;
  user_id: string | null;
  error_type: string;
  error_message: string;
}

/** GET /admin/errors?command=&page= */
export interface BotErrorsPage {
  items: BotError[];
  total: number;
  page: number;
  page_size: number;
  /** Commandes ayant au moins une erreur sur ce serveur (filtre). */
  commands: string[];
}

/** GET /admin/errors/{id} */
export interface BotErrorDetail extends BotError {
  traceback: string;
}
