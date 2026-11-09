import { historyRow, priceRow } from '../../../testing/market';
import { en } from '../../core/i18n/en';
import { fr } from '../../core/i18n/fr';
import {
  BLACK_MARKET, CATEGORIES, CustomCraft, Recipe, activity, busiestCity, calcTrade, classify, customCraftCalc, deviation, expandItems,
  familyOf, filterItems, filterRecipes, hoursSince, matchTokens, mergeHistory, mergePrices, rawCost, recipeCalc, sortRows, suspect,
  taxRate, UpgradePlan, enchantedId, upgradeCalc, upgradeMaterial,
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

  it('rawCost : ressources raffinées remplacées récursivement par les matériaux bruts', () => {
    const refine = (id: string, r: Recipe['r']): Recipe => ({ id, tier: 4, ench: 0, cat: 'refine', y: 1, r });
    const refines = new Map([
      ['T4_LEATHER', refine('T4_LEATHER', [['T4_HIDE', 2], ['T3_LEATHER', 1]])],
      ['T3_LEATHER', refine('T3_LEATHER', [['T3_HIDE', 2], ['T3_RUNE', 1, 0]])],
    ]);
    const sword: Recipe = { id: 'T4_MAIN_SWORD', tier: 4, ench: 0, cat: 'gear', y: 1, r: [['T4_LEATHER', 10], ['T4_ARTEFACT', 1, 0]] };
    const prices = mergePrices({}, ['T4_HIDE', 'T3_HIDE', 'T3_RUNE', 'T4_ARTEFACT'], [
      priceRow('T4_HIDE', 'Martlock', 10, 0), priceRow('T3_HIDE', 'Lymhurst', 5, 0),
      priceRow('T3_RUNE', 'Lymhurst', 100, 0), priceRow('T4_ARTEFACT', 'Thetford', 1000, 0),
    ], 1);
    const lines = recipeCalc(sword, prices, 2, 50, { mode: 'direct', tax: 4, bm: true }).lines;   // 10 cuirs, 2 artefacts
    const raw = rawCost(lines, refines, prices, 50)!;
    // 10 cuirs T4 → 10 peaux T4 + 5 cuirs T3 → 5 peaux T3 + 5 runes (jamais rendues : pas de retour)
    expect(raw.lines.map((l) => [l.id, l.need])).toEqual([['T4_HIDE', 10], ['T3_HIDE', 5], ['T3_RUNE', 5], ['T4_ARTEFACT', 2]]);
    expect(raw.cost).toBe(10 * 10 + 5 * 5 + 5 * 100 + 2 * 1000);
    expect(rawCost(lines, refines, {}, 50)!.cost).toBeNull();
    expect(rawCost(lines, new Map(), prices, 50)).toBeNull();   // rien à raffiner
  });

  it('matériaux : villes exclues de l\'achat (recette et matériaux bruts), jamais pour la revente', () => {
    const recipe: Recipe = { id: 'T4_LEATHER', tier: 4, ench: 0, cat: 'refine', y: 1, r: [['T4_HIDE', 2]] };
    const prices = mergePrices({}, ['T4_HIDE', 'T4_LEATHER'], [
      priceRow('T4_HIDE', 'Caerleon', 5, 0), priceRow('T4_HIDE', 'Brecilien', 6, 0), priceRow('T4_HIDE', 'Martlock', 10, 0),
      priceRow('T4_LEATHER', 'Caerleon', 0, 100),
    ], 1);
    const o = { mode: 'direct' as const, tax: 4, bm: true };
    expect(recipeCalc(recipe, prices, 1, 0, o).lines[0].buy?.city).toBe('Caerleon');
    const res = recipeCalc(recipe, prices, 1, 0, { ...o, noBuy: ['Caerleon', 'Brecilien'] });
    expect(res.lines[0].buy).toMatchObject({ city: 'Martlock', value: 10 });
    expect(res.sell?.city).toBe('Caerleon');   // la revente n'est pas concernée
    expect(recipeCalc(recipe, prices, 1, 0, { ...o, noBuy: ['Caerleon', 'Brecilien', 'Martlock'] }).cost).toBeNull();
    const sword: Recipe = { id: 'T4_MAIN_SWORD', tier: 4, ench: 0, cat: 'gear', y: 1, r: [['T4_LEATHER', 1]] };
    const lines = recipeCalc(sword, prices, 1, 0, o).lines;
    expect(rawCost(lines, new Map([['T4_LEATHER', recipe]]), prices, 0)!.lines[0].buy?.city).toBe('Caerleon');
    expect(rawCost(lines, new Map([['T4_LEATHER', recipe]]), prices, 0, ['Caerleon'])!.lines[0].buy?.city).toBe('Brecilien');
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

  it('mon craft : prix saisis ou du marché, frais d’atelier, revente, marge et seuil de rentabilité', () => {
    const prices = mergePrices({}, ['T6_2H_BOW', 'T6_PLANKS'], [
      priceRow('T6_PLANKS', 'Lymhurst', 300, 0), priceRow('T6_PLANKS', 'Martlock', 280, 0), priceRow('T6_2H_BOW', 'Caerleon', 0, 30000),
    ], 1);
    const o = { mode: 'direct' as const, tax: 4, bm: true };
    const craft: CustomCraft = {
      id: 'T6_2H_BOW', name: 'Arc', units: 1, qty: 10, rrr: 15.2, fee: 500, sell: null,
      lines: [
        { id: 'T6_PLANKS', name: 'Planches', count: 32, price: null, noReturn: false },
        { id: '', name: 'Cuir maison', count: 4, price: 0, noReturn: true },
        { id: '', name: '', count: null, price: null, noReturn: false },   // ligne vide : ignorée
      ],
    };
    const res = customCraftCalc(craft, prices, o);
    expect([res.crafts, res.made]).toEqual([10, 10]);
    expect(res.lines.map((l) => l.need)).toEqual([Math.ceil(10 * 32 * 0.848), 40, 0]);
    expect(res.lines[0]).toMatchObject({ unit: 280, own: false, market: { city: 'Martlock' } });
    expect(res.lines[1]).toMatchObject({ unit: 0, own: true, cost: 0 });
    const cost = Math.ceil(10 * 32 * 0.848) * 280 + 500 * 10;
    expect([res.resources, res.fees, res.cost]).toEqual([cost - 5000, 5000, cost]);
    expect(res.market?.city).toBe('Caerleon');
    expect(res.revenue).toBeCloseTo(30000 * 0.96 * 10);
    expect(res.profit).toBeCloseTo(30000 * 0.96 * 10 - cost);
    expect(res.perUnit).toBeCloseTo((30000 * 0.96 * 10 - cost) / 10);
    expect(res.breakEven).toBeCloseTo(cost / 10 / 0.96);
    // ville exclue de l'achat des matériaux : prix du marché pris ailleurs
    expect(customCraftCalc(craft, prices, { ...o, noBuy: ['Martlock'] }).lines[0]).toMatchObject({ unit: 300, market: { city: 'Lymhurst' } });
    // prix de vente saisi, plusieurs unités par fabrication (quantité arrondie à la fabrication supérieure)
    const own = customCraftCalc({ ...craft, units: 5, qty: 12, sell: 1000 }, prices, o);
    expect([own.crafts, own.made, own.unit, own.own]).toEqual([3, 15, 1000, true]);
    // prix manquant : pas de coût ni de marge, la revente reste connue
    const missing = customCraftCalc({ ...craft, lines: [{ id: '', name: 'Rien', count: 2, price: null, noReturn: false }] }, prices, o);
    expect([missing.cost, missing.profit, missing.breakEven]).toEqual([null, null, null]);
    expect(missing.revenue).not.toBeNull();
    // saisies vides ou négatives : 1 fabrication, ni retour ni frais
    const empty = customCraftCalc({ ...craft, units: null, qty: -3, rrr: null, fee: -10, lines: [] }, {}, o);
    expect([empty.crafts, empty.made, empty.fees, empty.cost, empty.unit]).toEqual([1, 1, 0, 0, null]);
  });

  it('qualité choisie : objets d’équipement seulement, une rune ou une ressource garde son prix en qualité normale', () => {
    const p = mergePrices({}, ['T6_RUNE', 'T6_PLANKS', 'T6_2H_BOW'], [
      priceRow('T6_RUNE', 'Martlock', 100, 0), priceRow('T6_RUNE', 'Martlock', 0, 0, 3),
      priceRow('T6_PLANKS', 'Lymhurst', 300, 0), priceRow('T6_2H_BOW', 'Martlock', 50000, 0), priceRow('T6_2H_BOW', 'Martlock', 70000, 0, 3),
    ], 3);
    expect([p['T6_RUNE'].Martlock?.s, p['T6_PLANKS'].Lymhurst?.s, p['T6_2H_BOW'].Martlock?.s]).toEqual([100, 300, 70000]);
  });

  it('upgradeur : runes, âmes, reliques à la meilleure ville ou dans une ville donnée, marge par niveau visé', () => {
    expect([upgradeMaterial(6, 1), upgradeMaterial(6, 2), upgradeMaterial(8, 3), enchantedId('T6_2H_BOW', 2)])
      .toEqual(['T6_RUNE', 'T6_SOUL', 'T8_RELIC', 'T6_2H_BOW@2']);
    const ids = ['T6_2H_BOW', 'T6_2H_BOW@1', 'T6_2H_BOW@2', 'T6_2H_BOW@3', 'T6_RUNE', 'T6_SOUL', 'T6_RELIC'];
    const prices = mergePrices({}, ids, [
      priceRow('T6_2H_BOW', 'Martlock', 50000, 0), priceRow('T6_2H_BOW', 'Caerleon', 45000, 0),
      priceRow('T6_RUNE', 'Lymhurst', 100, 0), priceRow('T6_RUNE', 'Martlock', 120, 0), priceRow('T6_RUNE', 'Caerleon', 90, 0),
      priceRow('T6_SOUL', 'Lymhurst', 400, 0), priceRow('T6_SOUL', 'Martlock', 380, 0), priceRow('T6_RELIC', 'Martlock', 1500, 0),
      priceRow('T6_2H_BOW@1', BLACK_MARKET, 0, 150000), priceRow('T6_2H_BOW@1', 'Caerleon', 0, 130000),
      priceRow('T6_2H_BOW@1', 'Lymhurst', 110000, 100000), priceRow('T6_2H_BOW@2', 'Martlock', 300000, 200000),
    ], 1);
    // Marché noir coché dans les réglages : l'upgradeur revend quand même en ville royale
    const o = { mode: 'direct' as const, tax: 4, bm: true, noBuy: ['Caerleon' as const] };
    const counts = [384, 384, 384];
    const plan: UpgradePlan = {
      id: 'T6_2H_BOW', name: 'Arc du maître', from: 0, qty: 2, buyIn: 'best', city: 'Martlock', buy: null, mats: [null, null, null], sell: [null, null, null],
    };
    const res = upgradeCalc(plan, counts, prices, o);
    // objet et matériaux hors des villes exclues ; 384 par objet × 2
    expect(res.item).toMatchObject({ id: 'T6_2H_BOW', unit: 50000, cost: 100000, market: { city: 'Martlock' } });
    expect(res.lines.map((l) => [l.id, l.need, l.unit, l.market?.city])).toEqual([
      ['T6_RUNE', 768, 100, 'Lymhurst'], ['T6_SOUL', 768, 380, 'Martlock'], ['T6_RELIC', 768, 1500, 'Martlock'],
    ]);
    const [to1, to2, to3] = res.targets;
    // revente en ville royale seulement : ni Marché noir ni Caerleon
    expect([to1.mats, to1.cost, to1.unit, to1.market?.city]).toEqual([76800, 176800, 100000, 'Lymhurst']);
    expect(to1.revenue).toBeCloseTo(100000 * 0.96 * 2);
    expect(to1.profit).toBeCloseTo(100000 * 0.96 * 2 - 176800);
    expect(to1.perItem).toBeCloseTo((100000 * 0.96 * 2 - 176800) / 2);
    expect(to1.roi).toBeCloseTo(((100000 * 0.96 * 2 - 176800) / 176800) * 100);
    // déjà enchanté à 110 000 au marché, amélioration à 88 400 l'objet
    expect([to1.direct?.value, to1.saving]).toEqual([110000, 110000 - 88400]);
    expect([to2.mats, to2.cost, to2.unit]).toEqual([76800 + 768 * 380, 100000 + 76800 + 768 * 380, 200000]);
    expect(to2.profit!).toBeLessThan(0);
    expect([to3.unit, to3.profit, to3.direct]).toEqual([null, null, null]);
    expect(res.best).toBe(1);

    // ville donnée : tous les matériaux y sont achetés (villes exclues comprises), prix manquant = pas de total
    const city = upgradeCalc({ ...plan, buyIn: 'city', city: 'Lymhurst' }, counts, prices, o);
    expect(city.lines.map((l) => l.unit)).toEqual([100, 400, null]);
    expect([city.targets[1].mats, city.targets[2].mats]).toEqual([768 * 500, null]);
    expect(upgradeCalc({ ...plan, buyIn: 'city', city: 'Caerleon' }, counts, prices, o).lines[0].unit).toBe(90);

    // prix saisis : objet de départ, rune, revente en .3
    const own = upgradeCalc({ ...plan, buy: 0, mats: [80, null, null], sell: [null, null, 1000000] }, counts, prices, o);
    expect([own.item.cost, own.lines[0].unit, own.lines[0].own, own.targets[2].unit, own.targets[2].own]).toEqual([0, 80, true, 1000000, true]);
    expect(own.best).toBe(3);

    // départ en .2 : reliques seulement ; départ hors bornes ramené au plus haut possible
    const from2 = upgradeCalc({ ...plan, from: 2 }, counts, prices, o);
    expect([from2.item.id, from2.lines.map((l) => l.id), from2.targets.map((t) => t.level)]).toEqual(['T6_2H_BOW@2', ['T6_RELIC'], [3]]);
    expect(upgradeCalc({ ...plan, from: 7 }, [384], prices, o)).toMatchObject({ from: 0, targets: [{ level: 1 }] });
    // aucun objet choisi : rien à calculer
    expect(upgradeCalc({ ...plan, id: '' }, counts, prices, o)).toMatchObject({ lines: [], targets: [], best: null });
  });

  it('familles et filtre des recettes (nom, ingrédients, exclusion)', () => {
    expect(familyOf({ id: 'T6_POTION_HEAL@1', cat: 'potion' })).toBe('HEAL');
    expect(familyOf({ id: 'T8_MEAL_STEW_AVALON', cat: 'meal' })).toBe('STEW');
    // raffinage et équipement : type du marché
    expect(familyOf({ id: 'T4_LEATHER_LEVEL1@1', cat: 'refine' })).toBe('leather');
    expect(familyOf({ id: 'T6_2H_BOW_KEEPER@2', cat: 'gear' })).toBe('bows');
    expect(familyOf({ id: 'T5_ARMOR_PLATE_SET1', cat: 'gear' })).toBe('armorPlate');
    expect(familyOf({ id: 'UNKNOWN', cat: 'gear' })).toBe('other');
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

  it('taxe : 4 % avec Premium, 8 % sans, + 2,5 % de frais de mise en vente', () => {
    expect(taxRate('direct', true)).toBe(4);
    expect(taxRate('order', true)).toBe(6.5);
    expect(taxRate('direct', false)).toBe(8);
    expect(taxRate('order', false)).toBe(10.5);
  });

  it('historique : fusion par ville et par jour, qualité et villes inconnues ignorées', () => {
    const h = mergeHistory({ OLD: {} }, ['T4_BAG', 'T5_BAG'], [
      historyRow('T4_BAG', 'Martlock', [['2026-10-21', 10, 1000], ['2026-10-20', 4, 900], ['2026-10-19', 0, 5]]),
      historyRow('T4_BAG', 'Martlock', [['2026-10-22', 6, 1100]]),
      historyRow('T4_BAG', 'Thetford', [['2026-10-22', 2, 2000]], 2),     // autre qualité
      historyRow('T4_BAG', 'Thetford Portal', [['2026-10-22', 2, 2000]]), // pas une ville du marché
      historyRow('T9_UNASKED', 'Martlock', [['2026-10-22', 2, 2000]]),
    ], 1);
    expect(h['T4_BAG'].Martlock).toEqual([{ d: '2026-10-20', n: 4, p: 900 }, { d: '2026-10-21', n: 10, p: 1000 }, { d: '2026-10-22', n: 6, p: 1100 }]);
    expect(h['T4_BAG'].Thetford).toBeUndefined();
    expect(h['T5_BAG']).toEqual({});    // demandé, aucune vente : entrée vide
    expect(h['OLD']).toEqual({});
    expect(h['T9_UNASKED']).toBeUndefined();
  });

  it('activité : ventes par jour et prix moyen pondéré sur 7 jours, ville ou toutes', () => {
    const h = mergeHistory({}, ['T4_BAG'], [
      historyRow('T4_BAG', 'Martlock', [['2026-10-10', 100, 1], ['2026-10-20', 10, 1000], ['2026-10-22', 4, 1350]]),
      historyRow('T4_BAG', BLACK_MARKET, [['2026-10-21', 7, 2000]]),
    ], 1)['T4_BAG'];
    // NOW = 23/10 12 h : du 17 au 23 ; le relevé du 10 est trop vieux
    expect(activity(h, 'Martlock', NOW)).toEqual({ perDay: 2, avg: (10 * 1000 + 4 * 1350) / 14 });
    expect(activity(h, '', NOW)?.perDay).toBe(3);
    expect(activity(h, 'Lymhurst', NOW)).toEqual({ perDay: 0, avg: null });
    expect(activity(h, ['Lymhurst', 'Martlock'], NOW)?.perDay).toBe(2);   // plusieurs villes : sans le Marché noir
    expect(activity(undefined, 'Martlock', NOW)).toBeNull();
    expect(busiestCity(h)).toBe('Martlock');
    expect(busiestCity({})).toBeNull();
  });

  it('prix inhabituels : achat bien sous la moyenne, revente bien au-dessus', () => {
    expect(deviation(150, 100)).toBeCloseTo(0.5);
    expect(deviation(150, null)).toBeNull();
    expect(deviation(null, 100)).toBeNull();
    const q = (value: number) => ({ city: 'Martlock' as const, value, date: null });
    expect(suspect({ buy: q(40), sell: q(100) }, 100, 100)).toBe('buy');
    expect(suspect({ buy: q(90), sell: q(200) }, 100, 100)).toBe('sell');
    expect(suspect({ buy: q(60), sell: q(140) }, 100, 100)).toBeNull();
    expect(suspect({ buy: q(1), sell: null }, null, null)).toBeNull();
  });
});
