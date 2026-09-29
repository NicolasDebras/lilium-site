import { hasLevel } from './models';

describe('hasLevel', () => {
  it('admin inclut staff et member', () => {
    expect(hasLevel('admin', 'staff')).toBe(true);
    expect(hasLevel('admin', 'member')).toBe(true);
    expect(hasLevel('admin', 'admin')).toBe(true);
  });

  it('staff ne donne pas admin', () => {
    expect(hasLevel('staff', 'admin')).toBe(false);
    expect(hasLevel('staff', 'staff')).toBe(true);
  });

  it('member ne donne pas staff', () => {
    expect(hasLevel('member', 'staff')).toBe(false);
  });

  it('niveau inconnu = none', () => {
    expect(hasLevel(undefined, 'member')).toBe(false);
    expect(hasLevel('none', 'member')).toBe(false);
  });
});
