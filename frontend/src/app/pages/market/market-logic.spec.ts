import { priceRow } from '../../../testing/market';
import { en } from '../../core/i18n/en';
import { fr } from '../../core/i18n/fr';
import {
  BLACK_MARKET, CATEGORIES, Recipe, calcTrade, classify, expandItems, familyOf, filterItems, filterRecipes, hoursSince,
  matchTokens, mergePrices, recipeCalc, sortRows,
} from './market-logic';

const NOW = Date.parse('2026-10-23T12:00:00Z');

describe('market-logic', () => {
  it('sortRows : sens naturel, inversé, valeurs absentes toujours en bas, départage', () => {
    const rows = [{ n: 'b', v: 2 }, { n: 'x', v: null }, { n: 'a', v: 5 }, { n: 'c', v: 2 }];
    const names = (r: typeof rows) => r.map((x) => x.n).join('');
    expect(names(sortRows(rows, { value: (r) => r.v, desc: true }))).toBe('abcx');
    expect(names(sortRows(rows, { value: (r) => r.v, desc: true }, true))).toBe('bcax');
    expect(names(sortRows(rows, { value: (r) => r.v, then: (a, b) => b.n.localeCompare(a.n) }))).toBe('cbax');
    expect(names(sortRows(rows, { value: (r) => r.n }, true))).toBe('xcba');
    expect(names(rows)).toBe('bxac');   // tableau d'origine intact
  });

  it('classe les objets d’après leur id', () => {
    expect(classify('T6_2H_BOW@1')).toEqual({ tier: 6, ench: 1, cat: 'weapons', type: 'bows', orig: 'normal' });
    expect(classify('T5_2H_CROSSBOWLARGE')?.type).toBe('crossbows');
    expect(classify('T8_HEAD_PLATE_SET1')?.type).toBe('headPlate');
    expect(classify('T4_FIBER_LEVEL1@1')).toMatchObject({ cat: 'resources', type: 'fiber', ench: 1 });
    expect(classify('T6_2H_TOOL_PICK')?.type).toBe('pickaxes');
    expect(classify('T6_JOURNAL_FIBER_FULL')?.type).toBe('journalsFull');
    expect(classify('T7_MAIN_SWORD_HELL')?.orig).toBe('artifact');
    expect(classify('T4_HEAD_CLOTH_ROYAL')?.orig).toBe('royal');
    expect(classify('T6_POTION_HEAL')?.type).toBe('potions');
    expect(classify('T3_FARM_CARROT_SEED')?.type).toBe('seeds');
    expect(classify('QUESTITEM_TOKEN_AVALON')).toBeNull();
  });

  it('chaque catégorie et chaque type a un libellé FR et EN', () => {
    for (const [cat, types] of Object.entries(CATEGORIES)) {
      expect(fr.market.cats[cat]).toBeTruthy();
      expect(en.market.cats[cat]).toBeTruthy();
      for (const type of types) {
        expect(fr.market.types[type], type).toBeTruthy();
        expect(en.market.types[type], type).toBeTruthy();
      }
    }
    expect(Object.keys(en.market.families).sort()).toEqual(Object.keys(fr.market.families).sort());
  });

  it('déplie les enchantements et cherche en FR, EN ou id, avec exclusion', () => {
    const items = expandItems([['T6_2H_BOW', 'Arc du maître', "Master's Bow", 2]]);
    expect(items.map((i) => i.id)).toEqual(['T6_2H_BOW', 'T6_2H_BOW@1', 'T6_2H_BOW@2']);
    expect(matchTokens(items[0].search, 'arc maitre')).toBe(true);
    expect(matchTokens(items[0].search, 'MASTER bow')).toBe(true);
    expect(matchTokens(items[0].search, 't6_2h_bow')).toBe(true);
    expect(matchTokens(items[0].search, 'arc -maitre')).toBe(false);
    const f = { q: '', cat: '' as const, type: '', tiers: [6], enchs: [1, 2], orig: '' as const };
    expect(filterItems(items, f).map((i) => i.ench)).toEqual([1, 2]);
  });

  it('garde le meilleur prix par ville, filtre la qualité et ignore les lieux inconnus', () => {
    const p = mergePrices({}, ['A', 'B'], [
      priceRow('A', 'Martlock', 120, 90), priceRow('A', 'Martlock', 100, 95, 2), priceRow('A', 'Martlock', 110, 80, 0),
      priceRow('A', BLACK_MARKET, 0, 200), priceRow('A', 'Caerleon Portal', 1, 999),
    ], 1);
    expect(p['A'].Martlock).toMatchObject({ s: 110, b: 90 });
    expect(p['A'][BLACK_MARKET]?.b).toBe(200);
    expect(Object.keys(p['A'])).toHaveLength(2);
    expect(p['B']).toEqual({});
  });

  it('âge des relevés (UTC sans « Z ») et date vide', () => {
    expect(hoursSince('2026-10-23T10:00:00', NOW)).toBe(2);
    expect(hoursSince('0001-01-01T00:00:00', NOW)).toBeNull();
  });

  it('marge : achat le moins cher, revente selon le mode, taxe, Marché noir et villes imposées', () => {
    const p = mergePrices({}, ['X'], [
      priceRow('X', 'Martlock', 1000, 900), priceRow('X', 'Lymhurst', 1500, 1300), priceRow('X', BLACK_MARKET, 0, 2000),
    ], 1)['X'];
    const direct = calcTrade(p, { mode: 'direct', tax: 4, bm: true, now: NOW });
    expect(direct.buy?.city).toBe('Martlock');
    expect(direct.sell).toMatchObject({ city: BLACK_MARKET, value: 2000 });
    expect(direct.profit).toBe(2000 * 0.96 - 1000);
    expect(direct.roi).toBeCloseTo(92);
    expect(direct.age).toBe(2);
    expect(calcTrade(p, { mode: 'direct', tax: 4, bm: false, now: NOW }).sell?.city).toBe('Lymhurst');
    expect(calcTrade(p, { mode: 'order', tax: 6.5, bm: true, now: NOW }).sell).toMatchObject({ city: 'Lymhurst', value: 1500 });
    expect(calcTrade(p, { mode: 'direct', tax: 4, bm: true, buyCity: 'Lymhurst', sellCity: 'Martlock', now: NOW }).profit).toBe(900 * 0.96 - 1500);
    expect(calcTrade(p, { mode: 'direct', tax: 4, bm: true, maxAge: 1, now: NOW }).buy).toBeNull();
    expect(calcTrade(undefined, { mode: 'direct', tax: 4, bm: true }).profit).toBeNull();
  });

  it('recette : fabrications, retour de ressources, coût, revente et marge', () => {
    const recipe: Recipe = { id: 'T6_POTION_HEAL', tier: 6, ench: 0, cat: 'potion', y: 5, r: [['T6_FOXGLOVE', 72], ['T5_EGG', 18]] };
    const prices = mergePrices({}, ['T6_POTION_HEAL', 'T6_FOXGLOVE', 'T5_EGG'], [
      priceRow('T6_FOXGLOVE', 'Martlock', 10, 0), priceRow('T5_EGG', 'Lymhurst', 20, 0), priceRow('T6_POTION_HEAL', 'Thetford', 500, 400),
    ], 1);
    const res = recipeCalc(recipe, prices, 12, 15.2, { mode: 'direct', tax: 4, bm: true });
    expect(res.crafts).toBe(3);
    expect(res.made).toBe(15);
    expect(res.lines.map((l) => l.need)).toEqual([Math.ceil(3 * 72 * 0.848), Math.ceil(3 * 18 * 0.848)]);
    expect(res.cost).toBe(184 * 10 + 46 * 20);
    expect(res.revenue).toBe(400 * 0.96 * 15);
    expect(res.profit).toBe(400 * 0.96 * 15 - (184 * 10 + 46 * 20));
    expect(recipeCalc(recipe, {}, 12, 0, { mode: 'direct', tax: 4, bm: true }).cost).toBeNull();
    // ressource jamais rendue (énergie avalonienne, drops rares) : achetée en entier
    const avalon: Recipe = { ...recipe, r: [['T6_FOXGLOVE', 72], ['QUESTITEM_TOKEN_AVALON', 4, 0]] };
    const lines = recipeCalc(avalon, {}, 12, 53.9, { mode: 'direct', tax: 4, bm: true }).lines;
    expect(lines.map((l) => [l.need, l.noReturn])).toEqual([[Math.ceil(3 * 72 * 0.461), false], [12, true]]);
  });

  it('familles et filtre des recettes (nom, ingrédients, exclusion)', () => {
    expect(familyOf({ id: 'T6_POTION_HEAL@1' })).toBe('HEAL');
    expect(familyOf({ id: 'T8_MEAL_STEW_AVALON' })).toBe('STEW');
    const recipes: Recipe[] = [
      { id: 'T6_POTION_HEAL', tier: 6, ench: 0, cat: 'potion', y: 5, r: [['T5_EGG', 18]] },
      { id: 'T4_MEAL_SOUP@1', tier: 4, ench: 1, cat: 'meal', y: 10, r: [['T1_CARROT', 16], ['T1_FISHSAUCE_LEVEL1', 10]] },
    ];
    const names: Record<string, string> = { T6_POTION_HEAL: 'Potion de soin', T5_EGG: 'Œuf', T4_MEAL_SOUP: 'Soupe', T1_CARROT: 'Carottes' };
    const name = (id: string) => names[id.replace(/@\d$/, '')] ?? id;
    const base = { q: '', scope: 'both' as const, cat: '' as const, fam: '', ing: '', tiers: [], enchs: [] };
    expect(filterRecipes(recipes, { ...base, q: 'oeuf' }, name).map((r) => r.id)).toEqual(['T6_POTION_HEAL']);
    expect(filterRecipes(recipes, { ...base, q: 'oeuf', scope: 'name' }, name)).toEqual([]);
    expect(filterRecipes(recipes, { ...base, q: '-carottes' }, name).map((r) => r.id)).toEqual(['T6_POTION_HEAL']);
    expect(filterRecipes(recipes, { ...base, ing: 'T1_FISHSAUCE' }, name).map((r) => r.id)).toEqual(['T4_MEAL_SOUP@1']);
    expect(filterRecipes(recipes, { ...base, cat: 'potion', enchs: [0] }, name)).toHaveLength(1);
    expect(filterRecipes(recipes, { ...base, fam: 'SOUP' }, name)).toHaveLength(1);
  });
});
