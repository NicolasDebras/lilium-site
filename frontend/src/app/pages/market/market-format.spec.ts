import { setLang } from '../../core/i18n/i18n';
import { cityLabel, familyLabel, itemLabel, otherLabel, percent, silver } from './market-format';

describe('market-format', () => {
  afterEach(() => setLang('fr'));

  it('montants, pourcentages et Marché noir selon la langue', () => {
    expect(silver(12500.4)).toBe((12500).toLocaleString('fr-FR'));
    expect(silver(null)).toBe('–');
    expect(percent(12.4)).toBe('12 %');
    expect(cityLabel('Black Market')).toBe('Marché noir');
    expect(cityLabel('Martlock')).toBe('Martlock');
    setLang('en');
    expect(percent(12.4)).toBe('12%');
    expect(cityLabel('Black Market')).toBe('Black Market');
  });

  it('nom dans la langue du site, l’autre en complément', () => {
    const item = { fr: 'Arc', en: 'Bow' };
    expect(itemLabel(item)).toBe('Arc');
    expect(otherLabel(item)).toBe('Bow');
    expect(otherLabel({ fr: 'Sac', en: '' })).toBe('');
    setLang('en');
    expect(itemLabel(item)).toBe('Bow');
    expect(itemLabel({ fr: 'Sac', en: '' })).toBe('Sac');
  });

  it('famille de recettes : traduite, sinon mot du jeu lisible', () => {
    expect(familyLabel('HEAL')).toBe('Soin');
    expect(familyLabel('NEWTHING')).toBe('Newthing');
  });
});
