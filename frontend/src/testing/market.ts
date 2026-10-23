import { MarketData, PriceRow } from '../app/pages/market/market-logic';

/** Extrait du catalogue du marché (GET /api/market) pour les tests. */
export const TEST_MARKET: MarketData = {
  items: [
    ['T6_2H_BOW', 'Arc du maître', "Master's Bow", 2],
    ['T6_MAIN_SWORD', 'Épée large du maître', "Master's Broadsword", 0],
    ['T5_EGG', "Œuf d'oie", 'Goose Eggs', 0],
    ['T6_FOXGLOVE', 'Digitale', 'Foxglove', 0],
    ['T6_POTION_HEAL', 'Potion de soin majeure', 'Major Healing Potion', 1],
    ['T4_MEAL_SOUP', 'Soupe de carottes', 'Carrot Soup', 0],
    ['T1_CARROT', 'Carottes', 'Carrots', 0],
  ],
  recipes: [
    { id: 'T6_POTION_HEAL', tier: 6, ench: 0, cat: 'potion', y: 5, r: [['T6_FOXGLOVE', 72], ['T5_EGG', 18]] },
    { id: 'T4_MEAL_SOUP', tier: 4, ench: 0, cat: 'meal', y: 10, r: [['T1_CARROT', 16]] },
  ],
};

const DATE = '2026-10-23T10:00:00';

/** Ligne de prix de l'Albion Online Data Project. */
export function priceRow(item_id: string, city: string, sell: number, buy: number, quality = 1): PriceRow {
  return { item_id, city, quality, sell_price_min: sell, sell_price_min_date: DATE, buy_price_max: buy, buy_price_max_date: DATE };
}
