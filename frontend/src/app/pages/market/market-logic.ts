/* Onglet Marché : logique pure (classement des objets, prix, historique, marges, recettes), portée de
   l'outil d'Aria le papi. Les libellés sont des clés traduites dans `t().market`. */

import { normalize } from '../../core/items.service';

export const CITIES = ['Caerleon', 'Bridgewatch', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford', 'Brecilien'] as const;
export const BLACK_MARKET = 'Black Market';
export type City = (typeof CITIES)[number] | typeof BLACK_MARKET;
/** Villes qu'on peut exclure de l'achat des matériaux du craft (réglage « noBuy ») : Caerleon (zone rouge
 *  autour) et Brecilien (dans les Brumes), peu pratiques pour acheter en gros. */
export const NO_BUY_CITIES = ['Caerleon', 'Brecilien'] as const satisfies readonly City[];

export type Server = 'europe' | 'west' | 'east';
/** direct = vendre aux ordres d'achat ; order = mettre en vente. */
export type SellMode = 'direct' | 'order';
/** Taxe de vente du jeu (%) : 4 avec Premium, 8 sans. */
export const SALES_TAX = { premium: 4, standard: 8 } as const;
/** Frais de mise en vente (%), payés en plus quand on crée un ordre de vente. */
export const SETUP_FEE = 2.5;

/** Taxe totale d'une vente (%) : taxe de vente, plus frais de mise en vente en mode « order ». */
export function taxRate(mode: SellMode, premium: boolean): number {
  return (premium ? SALES_TAX.premium : SALES_TAX.standard) + (mode === 'order' ? SETUP_FEE : 0);
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

/** Armes : famille d'après l'id (l'ordre compte : « CROSSBOW » avant « BOW »…). */
const WEAPONS: [string, RegExp][] = [
  ['bows', /^(2H|MAIN)_(BOW|WARBOW|LONGBOW)(_|$)/], ['crossbows', /CROSSBOW/],
  ['fireStaffs', /FIRESTAFF|INFERNOSTAFF|FIRE_RINGPAIR/], ['holyStaffs', /HOLYSTAFF|DIVINESTAFF|HOLY_/],
  ['arcaneStaffs', /ARCANE|ENIGMATIC/], ['frostStaffs', /FROST|GLACIAL|ICEGAUNTLETS|ICECRYSTAL|ICICLE|PERMAFROST|CHILLHOWL/],
  ['cursedStaffs', /CURSED|DEMONIC|SKULLORB|SHADOWCALLER/], ['natureStaffs', /NATURE|WILDSTAFF|DRUID|ROOTSTAFF/],
  ['shapeshifters', /SHAPESHIFTER/], ['gloves', /KNUCKLES|GAUNTLET|BRAWLER/],
  ['quarterstaffs', /QUARTERSTAFF|IRONCLADEDSTAFF|DOUBLEBLADEDSTAFF|COMBATSTAFF|ROCKSTAFF|BLACKMONK|GRAILSEEKER|PHASESTAFF|TRIDENT|SOULSCYTHE/],
  ['hammers', /HAMMER/], ['maces', /MACE|FLAIL|MORNINGSTAR|OATHKEEPERS/], ['spears', /SPEAR|GLAIVE|HARPOON|LANCE|SPIRITHUNTER/],
  ['axes', /AXE|HALBERD|SCYTHE|CARRIONCALLER|BEARPAW/], ['swords', /SWORD|CLAYMORE|SCIMITAR|CLEAVER|CLARENT|GALATINE|KINGMAKER/],
  ['daggers', /DAGGER|CLAW|RAPIER|SICKLE|BLOODLETTER/],
];
const RESOURCES: Record<string, string> = {
  FIBER: 'fiber', HIDE: 'hide', ORE: 'ore', WOOD: 'wood', ROCK: 'rock',
  CLOTH: 'cloth', LEATHER: 'leather', METALBAR: 'metalbar', PLANKS: 'planks', STONEBLOCK: 'stoneblock',
};
const SLOT: Record<string, string> = { HEAD: 'head', ARMOR: 'armor', SHOES: 'shoes' };
const MATERIAL: Record<string, string> = { PLATE: 'Plate', LEATHER: 'Leather', CLOTH: 'Cloth' };

/** Catégorie → types (clés de `t().market.cats` et `t().market.types`), dans l'ordre des filtres. */
export const CATEGORIES = {
  weapons: [...WEAPONS.map((w) => w[0]), 'otherWeapons'],
  armors: ['armor', 'head', 'shoes'].flatMap((s) => ['Plate', 'Leather', 'Cloth'].map((m) => s + m)),
  offhands: ['shields', 'tomes', 'torches'],
  bags: ['bags', 'capes'],
  mounts: ['mounts'],
  consumables: ['food', 'potions'],
  resources: Object.values(RESOURCES),
  tools: ['pickaxes', 'woodAxes', 'sickles', 'skinningKnives', 'stoneHammers', 'fishingRods', 'otherTools'],
  journals: ['journalsFull', 'journalsEmpty', 'journalsOther'],
  farm: ['seeds', 'animals', 'farmOther'],
  artifacts: ['artifacts', 'runes'],
  other: ['other'],
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];
export type Origin = 'normal' | 'artifact' | 'royal';
export const ORIGINS: Origin[] = ['normal', 'artifact', 'royal'];

/** Catégories reconnues au seul préfixe (après armes, armures… : « ARTEFACT » apparaît aussi dans d'autres ids). */
const SIMPLE: [RegExp, Category, string][] = [
  [/^BAG/, 'bags', 'bags'], [/^CAPE/, 'bags', 'capes'], [/^MOUNT/, 'mounts', 'mounts'],
  [/^MEAL/, 'consumables', 'food'], [/^POTION/, 'consumables', 'potions'],
  [/ARTEFACT/, 'artifacts', 'artifacts'], [/^(RUNE|SOUL|RELIC|SHARD)/, 'artifacts', 'runes'],
];

export interface Classified {
  tier: number;
  ench: number;
  cat: Category;
  type: string;
  orig: Origin;
}

/** Tier, enchantement, catégorie, type et origine d'après l'id du jeu (« T6_2H_BOW@1 »). */
export function classify(id: string): Classified | null {
  const m = /^T(\d)_(.+?)(?:@(\d))?$/.exec(id);
  if (!m) return null;
  const core = m[2];
  let cat: Category = 'other';
  let type = 'other';
  let a: RegExpExecArray | null;
  if (/^JOURNAL/.test(core)) {
    cat = 'journals';
    type = /_FULL/.test(core) ? 'journalsFull' : /_EMPTY/.test(core) ? 'journalsEmpty' : 'journalsOther';
  } else if (/(^|_)TOOL_/.test(core)) {
    cat = 'tools';
    type = /PICK/.test(core) ? 'pickaxes' : /FISHING/.test(core) ? 'fishingRods' : /AXE/.test(core) ? 'woodAxes'
      : /SICKLE/.test(core) ? 'sickles' : /KNIFE/.test(core) ? 'skinningKnives' : /HAMMER/.test(core) ? 'stoneHammers' : 'otherTools';
  } else if ((a = /^(FIBER|HIDE|ORE|WOOD|ROCK|CLOTH|LEATHER|METALBAR|PLANKS|STONEBLOCK)(_LEVEL\d)?$/.exec(core))) {
    cat = 'resources';
    type = RESOURCES[a[1]];
  } else if ((a = /^(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)/.exec(core))) {
    cat = 'armors';
    type = SLOT[a[1]] + MATERIAL[a[2]];
  } else if (/^OFF_/.test(core)) {
    cat = 'offhands';
    type = /SHIELD/.test(core) ? 'shields' : /BOOK|ORB|SKULL|TOTEM|EYE|MUISAK/.test(core) ? 'tomes' : 'torches';
  } else if (/^(2H|MAIN)_/.test(core)) {
    cat = 'weapons';
    type = WEAPONS.find((w) => w[1].test(core))?.[0] ?? 'otherWeapons';
  } else if (/^FARM_/.test(core)) {
    cat = 'farm';
    type = /SEED/.test(core) ? 'seeds' : /_(BABY|GROWN)/.test(core) ? 'animals' : 'farmOther';
  } else {
    const simple = SIMPLE.find(([re]) => re.test(core));
    if (simple) [, cat, type] = simple;
  }
  const orig: Origin = /_ROYAL/.test(core) ? 'royal'
    : /_(HELL|UNDEAD|KEEPER|MORGANA|AVALON|FEY|CRYSTAL|ARTEFACT)(_|$)/.test(core) ? 'artifact' : 'normal';
  return { tier: +m[1], ench: +(m[3] ?? 0), cat, type, orig };
}

/** [id, nom FR, nom EN, enchantement max] — voir api/app/market.py. */
export type MarketEntry = [string, string, string, number];

export interface Recipe {
  id: string;
  tier: number;
  ench: number;
  /** potion, meal (cuisine), refine (raffinage), gear (équipement : armes, armures, sacs, capes, outils, montures). */
  cat: RecipeCat;
  /** Unités produites par fabrication. */
  y: number;
  /** Ressources d'une fabrication : [id, nombre], ou [id, nombre, 0] si le jeu ne la rend jamais
   *  (drops rares de créatures, énergie avalonienne : le retour de ressources ne s'y applique pas). */
  r: RecipeResource[];
}

export type RecipeResource = [string, number] | [string, number, 0];
export type RecipeCat = 'potion' | 'meal' | 'refine' | 'gear';
export const RECIPE_CATS: RecipeCat[] = ['potion', 'meal', 'refine', 'gear'];

export interface MarketData {
  items: MarketEntry[];
  recipes: Recipe[];
}

export interface MarketItem extends Classified {
  id: string;
  fr: string;
  en: string;
  /** Texte de recherche : noms FR + EN + id, sans accents. */
  search: string;
}

/** Un objet par id vendable : « T4_MAIN_SWORD » donne aussi « @1 » à « @4 ». */
export function expandItems(entries: readonly MarketEntry[]): MarketItem[] {
  const out: MarketItem[] = [];
  for (const [id, fr, en, maxEnch] of entries) {
    for (let e = 0; e <= maxEnch; e++) {
      const full = e ? `${id}@${e}` : id;
      const c = classify(full);
      if (c) out.push({ id: full, fr, en, ...c, search: normalize(`${fr} ${en} ${full}`) });
    }
  }
  return out;
}

/** Id sans enchantement ni niveau de ressource : « T4_FIBER_LEVEL1@1 » → « T4_FIBER ». */
export function baseId(id: string): string {
  return id.replace(/@\d$/, '').replace(/_LEVEL\d$/, '');
}

/** Recherche : tous les mots présents, aucun des « -mot ». */
export function matchTokens(haystack: string, query: string): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const include = words.filter((w) => w[0] !== '-').map(normalize);
  const exclude = words.filter((w) => w[0] === '-' && w.length > 1).map((w) => normalize(w.slice(1)));
  return include.every((w) => haystack.includes(w)) && !exclude.some((w) => haystack.includes(w));
}

export interface ItemFilters {
  q: string;
  cat: Category | '';
  type: string;
  tiers: number[];
  enchs: number[];
  orig: Origin | '';
}

export function filterItems(items: readonly MarketItem[], f: ItemFilters): MarketItem[] {
  return items.filter(
    (x) =>
      (!f.cat || x.cat === f.cat) &&
      (!f.type || x.type === f.type) &&
      (!f.tiers.length || f.tiers.includes(x.tier)) &&
      (!f.enchs.length || f.enchs.includes(x.ench)) &&
      (!f.orig || x.orig === f.orig) &&
      matchTokens(x.search, f.q),
  );
}

// ── Prix ─────────────────────────────────────────────────────────────────────

/** Meilleurs prix d'une ville : s = mise en vente la plus basse, b = ordre d'achat le plus haut. */
export interface CityPrice {
  s: number;
  b: number;
  sd: string | null;
  bd: string | null;
}
export type ItemPrices = Partial<Record<City, CityPrice>>;
export type PriceMap = Record<string, ItemPrices>;

/** Ligne de l'API de l'Albion Online Data Project (/api/v2/stats/prices). */
export interface PriceRow {
  item_id: string;
  city: string;
  quality: number;
  sell_price_min: number;
  sell_price_min_date: string;
  buy_price_max: number;
  buy_price_max_date: string;
}

/** Ajoute les lignes reçues : chaque id demandé a une entrée (vide = aucun relevé). */
export function mergePrices(prices: PriceMap, ids: readonly string[], rows: readonly PriceRow[], quality: number): PriceMap {
  const next: PriceMap = { ...prices };
  for (const id of ids) next[id] = {};
  for (const x of rows) {
    const city = x.city as City;
    if (!(CITIES as readonly string[]).includes(city) && city !== BLACK_MARKET) continue;
    if (x.quality !== quality && x.quality !== 0) continue;
    const p = (next[x.item_id] ??= {});
    const e = (p[city] ??= { s: 0, b: 0, sd: null, bd: null });
    if (x.sell_price_min > 0 && (!e.s || x.sell_price_min < e.s)) {
      e.s = x.sell_price_min;
      e.sd = x.sell_price_min_date;
    }
    if (x.buy_price_max > e.b) {
      e.b = x.buy_price_max;
      e.bd = x.buy_price_max_date;
    }
  }
  return next;
}

/** Âge d'un relevé en heures (null = date absente). Les dates de l'API sont en UTC sans « Z ». */
export function hoursSince(date: string | null | undefined, now: number): number | null {
  if (!date || date.startsWith('0001')) return null;
  return (now - Date.parse(date.endsWith('Z') ? date : `${date}Z`)) / 36e5;
}

// ── Historique des ventes ────────────────────────────────────────────────────

/** Ligne de l'API de l'Albion Online Data Project (/api/v2/stats/history, time-scale=24). */
export interface HistoryRow {
  location: string;
  item_id: string;
  quality: number;
  data: { item_count: number; avg_price: number; timestamp: string }[];
}

/** Un jour de ventes dans une ville : date (« 2026-10-23 »), nombre vendu, prix moyen. */
export interface DayPoint {
  d: string;
  n: number;
  p: number;
}
export type ItemHistory = Partial<Record<City, DayPoint[]>>;
export type HistoryMap = Record<string, ItemHistory>;

/** Jours d'historique demandés (graphique) et fenêtre des moyennes (ventes/jour, prix moyen). */
export const HISTORY_DAYS = 14;
export const ACTIVITY_DAYS = 7;
/** Écart au prix moyen à partir duquel un prix est signalé (0,5 = moitié moins ou moitié plus). */
export const UNUSUAL = 0.5;

/** Ajoute l'historique reçu : chaque id demandé a une entrée (vide = aucune vente relevée). */
export function mergeHistory(history: HistoryMap, ids: readonly string[], rows: readonly HistoryRow[], quality: number): HistoryMap {
  const next: HistoryMap = { ...history };
  for (const id of ids) next[id] = {};
  for (const x of rows) {
    const city = x.location as City;
    if (!(CITIES as readonly string[]).includes(city) && city !== BLACK_MARKET) continue;
    if (x.quality !== quality || !next[x.item_id]) continue;
    const days = new Map<string, DayPoint>();
    for (const pt of [...(next[x.item_id][city] ?? []), ...x.data]) {
      const d = 'd' in pt ? pt : { d: pt.timestamp.slice(0, 10), n: pt.item_count, p: pt.avg_price };
      if (d.n > 0) days.set(d.d, d);
    }
    next[x.item_id] = { ...next[x.item_id], [city]: [...days.values()].sort((a, b) => a.d.localeCompare(b.d)) };
  }
  return next;
}

/** Ventes des `days` derniers jours : par jour en moyenne, et prix moyen pondéré par les quantités. */
export interface Activity {
  perDay: number;
  avg: number | null;
}

/** Activité d'une ville (ou de toutes avec `city` vide) ; null tant que l'historique n'est pas chargé. */
export function activity(h: ItemHistory | undefined, city: City | '', now: number, days = ACTIVITY_DAYS): Activity | null {
  if (!h) return null;
  const from = new Date(now - days * 864e5).toISOString().slice(0, 10);
  let count = 0;
  let value = 0;
  for (const c of city ? [city] : (Object.keys(h) as City[])) {
    for (const pt of h[c] ?? []) {
      if (pt.d <= from) continue;
      count += pt.n;
      value += pt.n * pt.p;
    }
  }
  return { perDay: count / days, avg: count ? value / count : null };
}

/** Écart d'un prix à la moyenne (+0,8 = 80 % plus cher) ; null sans moyenne. */
export function deviation(value: number | null | undefined, avg: number | null | undefined): number | null {
  return value && avg ? value / avg - 1 : null;
}

/** Prix suspect pour la marge : achat bien sous la moyenne (relevé isolé, déjà parti ?) ou revente bien au-dessus. */
export function suspect(trade: Pick<Trade, 'buy' | 'sell'>, buyAvg: number | null | undefined, sellAvg: number | null | undefined): 'buy' | 'sell' | null {
  if ((deviation(trade.buy?.value, buyAvg) ?? 0) < -UNUSUAL) return 'buy';
  if ((deviation(trade.sell?.value, sellAvg) ?? 0) > UNUSUAL) return 'sell';
  return null;
}

/** Ville la plus active (le plus de ventes sur la période), pour le graphique quand aucune n'est imposée. */
export function busiestCity(h: ItemHistory | undefined): City | null {
  let best: City | null = null;
  let max = 0;
  for (const [city, pts] of Object.entries(h ?? {}) as [City, DayPoint[]][]) {
    const n = pts.reduce((sum, pt) => sum + pt.n, 0);
    if (n > max) [best, max] = [city, n];
  }
  return best;
}

export interface Quote {
  city: City;
  value: number;
  date: string | null;
}

export interface TradeOptions {
  mode: SellMode;
  tax: number;
  bm: boolean;
  buyCity?: City | '';
  sellCity?: City | '';
  /** Villes où ne pas acheter (matériaux du craft). */
  noBuy?: readonly City[];
  /** Fraîcheur maximale des prix (heures), null = toutes. */
  maxAge?: number | null;
  now?: number;
}

function fresh(date: string | null, o: TradeOptions): boolean {
  if (o.maxAge == null) return true;
  const h = hoursSince(date, o.now ?? Date.now());
  return h != null && h <= o.maxAge;
}

/** Achat immédiat le moins cher (mise en vente la plus basse) — jamais au Marché noir. */
export function bestBuy(p: ItemPrices | undefined, o: Partial<TradeOptions> = {}): Quote | null {
  let best: Quote | null = null;
  for (const city of o.buyCity ? [o.buyCity] : CITIES) {
    if (o.noBuy?.includes(city)) continue;
    const e = p?.[city];
    if (e?.s && fresh(e.sd, o as TradeOptions) && (!best || e.s < best.value)) best = { city, value: e.s, date: e.sd };
  }
  return best;
}

/** Meilleure revente selon le mode : ordre d'achat le plus haut ou mise en vente la plus basse. */
export function bestSell(p: ItemPrices | undefined, o: TradeOptions): Quote | null {
  let best: Quote | null = null;
  const cities: City[] = o.sellCity ? [o.sellCity] : o.bm ? [...CITIES, BLACK_MARKET] : [...CITIES];
  for (const city of cities) {
    const e = p?.[city];
    if (!e) continue;
    const value = o.mode === 'direct' ? e.b : e.s;
    const date = o.mode === 'direct' ? e.bd : e.sd;
    if (value && fresh(date, o) && (!best || value > best.value)) best = { city, value, date };
  }
  return best;
}

export interface Trade {
  buy: Quote | null;
  sell: Quote | null;
  /** Revente après taxe. */
  net: number | null;
  profit: number | null;
  /** Marge en % du prix d'achat. */
  roi: number | null;
  /** Âge du plus vieux des deux prix (heures). */
  age: number | null;
}

export function calcTrade(p: ItemPrices | undefined, o: TradeOptions): Trade {
  const buy = bestBuy(p, o);
  const sell = bestSell(p, o);
  const net = sell ? sell.value * (1 - o.tax / 100) : null;
  const profit = net != null && buy ? net - buy.value : null;
  const now = o.now ?? Date.now();
  const ages = [buy && hoursSince(buy.date, now), sell && hoursSince(sell.date, now)].filter((h): h is number => h != null);
  return { buy, sell, net, profit, roi: profit != null && buy ? (profit / buy.value) * 100 : null, age: ages.length ? Math.max(...ages) : null };
}

// ── Recettes ─────────────────────────────────────────────────────────────────

/** Retour de ressources (%) : sans bonus, ville royale, ville spécialisée (fabrication puis raffinage), focus,
 *  focus en ville spécialisée (fabrication puis raffinage). */
export const RRR_OPTIONS = ['0', '15.2', '24.8', '36.7', '43.5', '47.9', '53.9'] as const;

export interface RecipeLine {
  id: string;
  /** Par fabrication. */
  count: number;
  /** À acheter pour toute la quantité, retour de ressources déduit (sauf ressource jamais rendue). */
  need: number;
  /** Ressource que le jeu ne rend jamais. */
  noReturn: boolean;
  buy: Quote | null;
  cost: number | null;
}

export interface RecipeResult {
  crafts: number;
  made: number;
  lines: RecipeLine[];
  /** Total des ressources (null s'il manque un prix). */
  cost: number | null;
  sell: Quote | null;
  /** Revente après taxe de toute la production. */
  revenue: number | null;
  profit: number | null;
  roi: number | null;
}

export function recipeCalc(recipe: Recipe, prices: PriceMap, qty: number, rrr: number, o: TradeOptions): RecipeResult {
  const crafts = Math.max(1, Math.ceil(qty / recipe.y));
  const made = crafts * recipe.y;
  const keep = 1 - rrr / 100;
  const lines = recipe.r.map(([id, count, maxReturn]): RecipeLine => {
    const noReturn = maxReturn === 0;
    const need = Math.ceil(crafts * count * (noReturn ? 1 : keep) - 1e-9);
    const buy = bestBuy(prices[id], { noBuy: o.noBuy });
    return { id, count, need, noReturn, buy, cost: buy ? buy.value * need : null };
  });
  const cost = lines.some((l) => l.cost == null) ? null : lines.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  const sell = bestSell(prices[recipe.id], { ...o, buyCity: '', sellCity: '', maxAge: null });
  const revenue = sell ? sell.value * (1 - o.tax / 100) * made : null;
  const profit = cost != null && revenue != null ? revenue - cost : null;
  return { crafts, made, lines, cost, sell, revenue, profit, roi: profit != null && cost ? (profit / cost) * 100 : null };
}

export interface RawLine {
  id: string;
  /** À acheter pour toute la quantité (arrondi au-dessus). */
  need: number;
  buy: Quote | null;
  cost: number | null;
}

export interface RawResult {
  lines: RawLine[];
  /** null si un prix manque. */
  cost: number | null;
}

/** Coût en matériaux bruts : chaque ressource raffinée des `lines` est remplacée, récursivement, par sa recette
 *  de raffinage (même retour de ressources) ; le reste (artefacts, ressources brutes…) est acheté tel quel,
 *  hors des villes `noBuy`.
 *  null si aucune ressource n'est raffinable (rien à comparer). */
export function rawCost(lines: readonly RecipeLine[], refines: ReadonlyMap<string, Recipe>, prices: PriceMap, rrr: number,
                        noBuy: readonly City[] = []): RawResult | null {
  const keep = 1 - rrr / 100;
  const needs = new Map<string, number>();
  const add = (id: string, qty: number, depth: number): void => {
    const rec = depth < 12 ? refines.get(id) : undefined;
    if (!rec) {
      needs.set(id, (needs.get(id) ?? 0) + qty);
      return;
    }
    for (const [rid, count, maxReturn] of rec.r) add(rid, (qty / rec.y) * count * (maxReturn === 0 ? 1 : keep), depth + 1);
  };
  if (!lines.some((l) => refines.has(l.id))) return null;
  for (const l of lines) add(l.id, l.need, 0);
  const raw = [...needs].map(([id, qty]): RawLine => {
    const need = Math.ceil(qty - 1e-9);
    const buy = bestBuy(prices[id], { noBuy });
    return { id, need, buy, cost: buy ? buy.value * need : null };
  });
  const cost = raw.some((l) => l.cost == null) ? null : raw.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  return { lines: raw, cost };
}

/** Famille d'une recette : « T6_POTION_HEAL@1 » → « HEAL », « T8_MEAL_STEW_AVALON » → « STEW » ;
 *  raffinage et équipement : type du marché (« T4_LEATHER_LEVEL1@1 » → « leather », « T4_MAIN_SWORD » → « swords »). */
export function familyOf(recipe: Pick<Recipe, 'id' | 'cat'>): string {
  if (recipe.cat === 'refine' || recipe.cat === 'gear') return classify(recipe.id)?.type ?? 'other';
  return /^(?:POTION|MEAL)_([A-Z0-9]+)/.exec(recipe.id.replace(/^T\d_/, ''))?.[1] ?? 'OTHER';
}

/** Ids dont il faut les prix pour une recette : l'objet fabriqué et ses ressources. */
export function recipeIds(recipe: Recipe): string[] {
  return [recipe.id, ...recipe.r.map((x) => x[0])];
}

export type RecipeScope = 'both' | 'name' | 'ing';

export interface RecipeFilters {
  q: string;
  scope: RecipeScope;
  cat: RecipeCat | '';
  fam: string;
  ing: string;
  tiers: number[];
  enchs: number[];
}

export function filterRecipes(recipes: readonly Recipe[], f: RecipeFilters, searchName: (id: string) => string): Recipe[] {
  return recipes.filter((r) => {
    if (f.cat && r.cat !== f.cat) return false;
    if (f.fam && familyOf(r) !== f.fam) return false;
    if (f.tiers.length && !f.tiers.includes(r.tier)) return false;
    if (f.enchs.length && !f.enchs.includes(r.ench)) return false;
    if (f.ing && !r.r.some((x) => baseId(x[0]) === f.ing)) return false;
    if (!f.q.trim()) return true;
    const name = f.scope === 'ing' ? '' : `${searchName(r.id)} ${r.id}`;
    const ings = f.scope === 'name' ? '' : r.r.map((x) => `${searchName(x[0])} ${x[0]}`).join(' ');
    return matchTokens(normalize(`${name} ${ings}`), f.q);
  });
}

/** Colonne triable : valeur comparée, sens naturel (`desc` = du plus grand au plus petit), départage. */
export interface SortSpec<T> {
  value: (row: T) => number | string | null | undefined;
  desc?: boolean;
  then?: (a: T, b: T) => number;
}

/** Trie selon `spec`, sens naturel inversé par `rev` ; les valeurs absentes restent toujours en bas. */
export function sortRows<T>(rows: readonly T[], spec: SortSpec<T>, rev = false): T[] {
  const sign = (spec.desc ? -1 : 1) * (rev ? -1 : 1);
  return rows
    .map((row) => ({ row, v: spec.value(row) }))
    .sort((a, b) => {
      if (a.v == null || b.v == null) return (a.v == null ? 1 : 0) - (b.v == null ? 1 : 0);
      const d = typeof a.v === 'string' ? a.v.localeCompare(String(b.v)) : a.v - (b.v as number);
      return sign * d || (spec.then?.(a.row, b.row) ?? 0);
    })
    .map((x) => x.row);
}
