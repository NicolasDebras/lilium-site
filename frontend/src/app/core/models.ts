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
export const SLOTS = ['mainhand', 'offhand', 'head', 'armor', 'shoes', 'cape'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  mainhand: 'Arme',
  offhand: 'Main gauche',
  head: 'Tête',
  armor: 'Armure',
  shoes: 'Bottes',
  cape: 'Cape',
};

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

export type BuildItems = Partial<Record<Slot, string>>;

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

export interface SlotRow {
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
