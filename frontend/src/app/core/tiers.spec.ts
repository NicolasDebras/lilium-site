import { allowedTiers, equivalents, makeChoice, maxEnchant, parseChoice, tierLabel, tierText } from './tiers';

describe('tiers', () => {
  it('parseChoice / makeChoice : format du jeu, aller-retour', () => {
    expect(parseChoice('T8_MAIN_SWORD@1')).toEqual({ base: 'MAIN_SWORD', tier: 8, enchant: 1 });
    expect(parseChoice('T7_2H_HOLYSTAFF_HELL')).toEqual({ base: '2H_HOLYSTAFF_HELL', tier: 7, enchant: 0 });
    expect(parseChoice('MAIN_SWORD')).toEqual({ base: 'MAIN_SWORD', tier: null, enchant: 0 });   // ancien format
    expect(parseChoice('*')).toEqual({ base: '*', tier: null, enchant: 0 });
    expect(makeChoice('MAIN_SWORD', 8, 1)).toBe('T8_MAIN_SWORD@1');
    expect(makeChoice('MAIN_SWORD', 7, 0)).toBe('T7_MAIN_SWORD');
    expect(makeChoice('MAIN_SWORD', null, 3)).toBe('MAIN_SWORD');
  });

  it('tiers T6–T8 qui existent pour l’objet ; enchantement .4 (équipement) ou .3 (consommable)', () => {
    expect(allowedTiers({ tiers: [4, 5, 6, 7, 8] })).toEqual([6, 7, 8]);
    expect(allowedTiers({ tiers: [2, 4, 6] })).toEqual([6]);
    expect(allowedTiers({ tiers: [3, 5] })).toEqual([]);
    expect(maxEnchant({ slot: 'head' })).toBe(4);
    expect(maxEnchant({ slot: 'food' })).toBe(3);
    expect(maxEnchant({ slot: 'potion' })).toBe(3);
  });

  it('équivalences de puissance : niveau = tier + enchantement', () => {
    expect(tierLabel(8, 1)).toBe('8.1');
    expect(equivalents(8, 1)).toEqual([[7, 2], [6, 3]]);
    expect(equivalents(8, 3)).toEqual([[7, 4]]);
    expect(equivalents(7, 0)).toEqual([[6, 1]]);
    expect(equivalents(6, 0)).toEqual([]);
    expect(equivalents(6, 4)).toEqual([[8, 2], [7, 3]]);
  });

  it('tierText : minimum + équivalents pour l’équipement, tier exact pour la bouffe, vide si libre', () => {
    expect(tierText({ slot: 'mainhand', tier: 8, enchant: 1 })).toBe('8.1 minimum ou équivalent (7.2, 6.3)');
    expect(tierText({ slot: 'head', tier: 6, enchant: 0 })).toBe('6.0 minimum');
    expect(tierText({ slot: 'food', tier: 8, enchant: 2 })).toBe('8.2');
    expect(tierText({ slot: 'mainhand' })).toBe('');
  });
});
