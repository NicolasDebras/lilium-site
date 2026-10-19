import { HttpRequest, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';

import { compactSilver, fullSilver, longDate } from '../../shared/charts';
import { itemName } from '../items.service';
import { languageInterceptor } from '../language.interceptor';
import { tierText } from '../tiers';
import { en } from './en';
import { fr } from './fr';
import { LANG_KEY, detectLang, dict, lang, locale, setLang } from './i18n';

/** Toutes les clés (chemins) d'un dictionnaire, fonctions comprises. */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

describe('i18n', () => {
  afterEach(() => vi.restoreAllMocks());

  it('détection : choix mémorisé, sinon langue du navigateur (fr* → fr, le reste → en)', () => {
    localStorage.setItem(LANG_KEY, 'en');
    expect(detectLang()).toBe('en');
    localStorage.removeItem(LANG_KEY);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-CA');
    expect(detectLang()).toBe('fr');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
    expect(detectLang()).toBe('en');
    localStorage.setItem(LANG_KEY, 'xx');   // valeur inconnue : ignorée
    expect(detectLang()).toBe('en');
  });

  it('setLang mémorise le choix, change <html lang>, le dictionnaire et la locale', () => {
    setLang('en');
    expect(lang()).toBe('en');
    expect(localStorage.getItem(LANG_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(dict().shell.logout).toBe('Log out');
    expect(locale()).toBe('en-US');
    setLang('fr');
    expect(dict().shell.logout).toBe('Déconnexion');
    expect(locale()).toBe('fr-FR');
  });

  it('en.ts a exactement les clés de fr.ts (listes de même longueur)', () => {
    const { categories: _fc, ...frRest } = fr;
    const { categories: _ec, ...enRest } = en;
    expect(keys(enRest)).toEqual(keys(frRest));
    expect(en.notFound.jokes.length).toBe(fr.notFound.jokes.length);
    expect(en.landing.botFeatures.length).toBe(fr.landing.botFeatures.length);
    expect(en.charts.weekdays.length).toBe(7);
  });

  it('nombres, dates, noms d’objets et tiers suivent la langue', () => {
    const item = { name: 'Épée large', name_en: 'Broadsword', slot: 'mainhand' as const, tier: 8, enchant: 1 };
    expect(fullSilver(1500000)).toBe('1 500 000');
    expect(compactSilver(4_016_770_211)).toBe('4,02 Md');
    expect(itemName(item)).toBe('Épée large');
    expect(tierText(item)).toContain('minimum ou équivalent');
    setLang('en');
    expect(fullSilver(1500000)).toBe('1,500,000');
    expect(compactSilver(4_016_770_211)).toBe('4.02 B');
    expect(longDate('2026-09-28')).toBe('Mon, Sep 28');
    expect(itemName(item)).toBe('Broadsword');
    expect(tierText(item)).toBe('8.1 minimum or equivalent (7.2, 6.3, 5.4)');
  });

  it('l’en-tête Accept-Language part vers /api seulement', () => {
    setLang('en');
    const seen: HttpRequest<unknown>[] = [];
    const next = (req: HttpRequest<unknown>) => {
      seen.push(req);
      return of(new HttpResponse());
    };
    languageInterceptor(new HttpRequest('GET', '/api/me'), next).subscribe();
    languageInterceptor(new HttpRequest('GET', 'https://render.albiononline.com/x.png'), next).subscribe();
    expect(seen[0].headers.get('Accept-Language')).toBe('en');
    expect(seen[1].headers.has('Accept-Language')).toBe(false);
  });
});
