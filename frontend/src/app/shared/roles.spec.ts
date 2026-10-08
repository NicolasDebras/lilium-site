import { baseRole, roleColor, roleRank, sortByRole } from './roles';

describe('roles', () => {
  it('baseRole : clés de lignes en double (2 tanks…), PF2 et casse', () => {
    expect(baseRole('TANK')).toBe('TANK');
    expect(baseRole('TANK · Main tank')).toBe('TANK');
    expect(baseRole('PF2:heal · Heal sacré')).toBe('HEAL');
    expect(baseRole('DPS 2')).toBe('DPS');
    expect(baseRole('RAID 2')).toBe('RAID 2');   // rôle inconnu : intact
  });

  it('couleur et rang suivent le rôle de base', () => {
    expect(roleColor('TANK · Def tank')).toBe('var(--role-tank)');
    expect(roleRank('TANK · Def tank')).toBe(roleRank('TANK'));
    expect(roleColor('CALLER')).toBe('var(--role-other)');
  });

  it('sortByRole : TANK, HEAL, DPS, SUPPORT puis le reste, ordre gardé à rôle égal', () => {
    const rows = ['DPS', 'CALLER', 'TANK · Main', 'HEAL', 'TANK'];
    expect(sortByRole(rows, (r) => r)).toEqual(['TANK · Main', 'TANK', 'HEAL', 'DPS', 'CALLER']);
  });
});
