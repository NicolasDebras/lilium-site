import { TEST_ITEMS } from '../../testing/items';
import { describeGear, describeSwaps, gearTitle } from './gear';

const byId = new Map(TEST_ITEMS.map((i) => [i.id, i]));
const get = (id: string) => byId.get(id);

describe('describeGear', () => {
  it('garde l’ordre des emplacements et ignore les cases vides', () => {
    const gear = describeGear({ food: ['MEAL_STEW'], head: ['HEAD_PLATE_SET1'], mainhand: ['MAIN_SWORD'], cape: [] }, get);
    expect(gear.map((g) => g.slot)).toEqual(['mainhand', 'head', 'food']);
  });

  it('case « au choix » et choix multiples', () => {
    const [weapon, cape] = describeGear({ mainhand: ['2H_HOLYSTAFF', 'MAIN_HOLYSTAFF'], cape: ['*'] }, get);
    expect(weapon.items.map((i) => i.id)).toEqual(['2H_HOLYSTAFF', 'MAIN_HOLYSTAFF']);
    expect(cape.free).toBe(true);
    expect(gearTitle(weapon)).toBe('Arme : Grand bâton béni ou Bâton béni');
    expect(gearTitle(cape)).toBe('Cape : au choix du joueur');
  });

  it('ignore les objets inconnus du catalogue', () => {
    expect(describeGear({ head: ['INCONNU'] }, get)).toEqual([]);
    expect(describeGear(undefined, get)).toEqual([]);
  });
});

describe('describeSwaps', () => {
  it('objets de rechange de tous emplacements, ids inconnus ignorés, hors équipement', () => {
    const items = { mainhand: ['MAIN_SWORD'], swaps: ['HEAD_PLATE_SET1', 'INCONNU', 'MEAL_STEW'] };
    expect(describeSwaps(items, get).map((i) => i.id)).toEqual(['HEAD_PLATE_SET1', 'MEAL_STEW']);
    expect(describeGear(items, get).map((g) => g.slot)).toEqual(['mainhand']);
    expect(describeSwaps({}, get)).toEqual([]);
  });
});
