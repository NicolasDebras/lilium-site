import { Item } from './models';

/** Tiers qu'un build peut imposer. */
export const BUILD_TIERS = [6, 7, 8];

/** Un choix d'objet dans un build : id de base + tier minimum (null = libre) + enchantement. */
export interface Choice {
  base: string;
  tier: number | null;
  enchant: number;
}

// Format du jeu : « T8_MAIN_SWORD@1 » = 8.1 ; aucun id de base du catalogue ne commence par « T<n>_ ».
const TIERED = /^T([1-8])_([A-Z0-9_]+?)(?:@([1-4]))?$/;

/** « T8_MAIN_SWORD@1 » → {base: 'MAIN_SWORD', tier: 8, enchant: 1} ; « MAIN_SWORD » → tier libre. */
export function parseChoice(value: string): Choice {
  const m = TIERED.exec(value);
  return m ? { base: m[2], tier: +m[1], enchant: +(m[3] ?? 0) } : { base: value, tier: null, enchant: 0 };
}

/** Inverse de parseChoice : tier libre → id nu, enchantement .0 → sans « @0 ». */
export function makeChoice(base: string, tier: number | null, enchant = 0): string {
  if (tier === null) return base;
  return `T${tier}_${base}${enchant ? `@${enchant}` : ''}`;
}

/** Bouffe et potions : l'enchantement change l'effet, pas la puissance (pas d'équivalence, .3 max). */
function isConsumable(item: Pick<Item, 'slot'>): boolean {
  return item.slot === 'food' || item.slot === 'potion';
}

export function allowedTiers(item: Pick<Item, 'tiers'>): number[] {
  return BUILD_TIERS.filter((t) => item.tiers.includes(t));
}

export function maxEnchant(item: Pick<Item, 'slot'>): number {
  return isConsumable(item) ? 3 : 4;
}

/** « 8.1 » */
export function tierLabel(tier: number, enchant: number): string {
  return `${tier}.${enchant}`;
}

/** Même puissance d'objet sur les autres tiers du build : 8.1 → [[7, 2], [6, 3]] (niveau = tier + enchantement). */
export function equivalents(tier: number, enchant: number): [number, number][] {
  return BUILD_TIERS.filter((t) => t !== tier)
    .sort((a, b) => b - a)
    .map((t): [number, number] => [t, tier + enchant - t])
    .filter(([, e]) => e >= 0 && e <= 4);
}

/** « 8.1 minimum ou équivalent (7.2, 6.3) » ; « 8.1 » pour un consommable ; '' si tier libre. */
export function tierText(item: Pick<Item, 'slot' | 'tier' | 'enchant'>): string {
  if (item.tier == null) return '';
  const label = tierLabel(item.tier, item.enchant ?? 0);
  if (isConsumable(item)) return label;
  const eq = equivalents(item.tier, item.enchant ?? 0).map(([t, e]) => tierLabel(t, e));
  return `${label} minimum${eq.length ? ` ou équivalent (${eq.join(', ')})` : ''}`;
}
