import { Item } from '../app/core/models';

/** Petit catalogue d'objets pour les tests (même forme que /api/items). */
export const TEST_ITEMS: Item[] = [
  { id: 'MAIN_SWORD', slot: 'mainhand', name: 'Épée large', name_en: 'Broadsword', icon: 'T8_MAIN_SWORD',
    tiers: [4, 5, 6, 7, 8], two_handed: false, category: 'Épées' },
  { id: '2H_HOLYSTAFF', slot: 'mainhand', name: 'Grand bâton béni', name_en: 'Great Holy Staff', icon: 'T8_2H_HOLYSTAFF',
    tiers: [4, 5, 6, 7, 8], two_handed: true, category: 'Bâtons sacrés' },
  { id: 'OFF_SHIELD', slot: 'offhand', name: 'Bouclier', name_en: 'Shield', icon: 'T8_OFF_SHIELD',
    tiers: [4, 5, 6, 7, 8], two_handed: false, category: 'Boucliers' },
  { id: 'HEAD_PLATE_SET1', slot: 'head', name: 'Casque de soldat', name_en: 'Soldier Helmet', icon: 'T8_HEAD_PLATE_SET1',
    tiers: [4, 5, 6, 7, 8], two_handed: false, category: 'Plaque' },
  { id: 'HEAD_CLOTH_SET2', slot: 'head', name: "Capuchon d'ecclésiastique", name_en: 'Cleric Cowl', icon: 'T8_HEAD_CLOTH_SET2',
    tiers: [4, 5, 6, 7, 8], two_handed: false, category: 'Tissu' },
];
