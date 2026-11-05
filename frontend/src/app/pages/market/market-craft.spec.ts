import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET, historyRow, priceRow } from '../../../testing/market';
import { MarketData } from './market-logic';
import { MarketService } from '../../core/market.service';
import { MarketCraft } from './market-craft';
import { AUTOLOAD_MS } from './market-search';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const isPrices = (r: { url: string }) => r.url.includes('/stats/prices/');
/** Date d'il y a `n` jours (« 2026-10-21 »), dans la fenêtre des 7 derniers jours. */
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const isHistory = (r: { url: string }) => r.url.includes('/stats/history/');


describe('MarketCraft (fabrication)', () => {
  async function render(data: MarketData = TEST_MARKET) {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MarketCraft], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const market = TestBed.inject(MarketService);
    const loading = market.load();
    http.expectOne('/api/market').flush(data);
    await loading;
    const fixture = TestBed.createComponent(MarketCraft);
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('formule par fabrication, prix des recettes et de leurs ressources chargés, marge', async () => {
    const { fixture, http, el } = await render();
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.querySelector('.formula')?.textContent).toContain('72×');
    expect(el.querySelector('.formula')?.textContent).toContain('Digitale');
    expect(el.querySelector('.formula')?.textContent).toContain('5 potions');
    await wait(AUTOLOAD_MS + 50);
    const req = http.expectOne(isPrices);
    const ids = req.request.url.split('/').pop()!.replace('.json', '').split(',');
    expect(ids.sort()).toEqual(['T1_CARROT', 'T4_MEAL_SOUP', 'T5_EGG', 'T6_FOXGLOVE', 'T6_POTION_HEAL']);
    req.flush([
      priceRow('T6_FOXGLOVE', 'Martlock', 100, 0), priceRow('T5_EGG', 'Lymhurst', 50, 0),
      priceRow('T6_POTION_HEAL', 'Thetford', 3000, 2500),
    ]);
    await wait();
    fixture.detectChanges();
    const first = el.querySelector('tbody tr')!;
    expect(first.textContent).toContain('Potion de soin majeure');
    expect(first.textContent).toContain('Meilleure affaire');
    // 100 potions = 20 fabrications, retour de ressources 15,2 %
    const cost = Math.ceil(20 * 72 * 0.848) * 100 + Math.ceil(20 * 18 * 0.848) * 50;
    expect(first.textContent).toContain(cost.toLocaleString('fr-FR'));
    expect(el.querySelectorAll('tbody tr')[1].textContent).toContain('prix manquants');   // soupe : carottes sans prix
  });

  it('tri au clic sur les en-têtes (la formule ne se trie pas)', async () => {
    const { fixture, http, el } = await render();
    await wait(AUTOLOAD_MS + 50);
    http.expectOne(isPrices).flush([]);
    await wait();
    fixture.detectChanges();
    const names = () => [...el.querySelectorAll('tbody .name')].map((n) => n.firstChild?.textContent?.trim());
    const recipe = el.querySelector<HTMLButtonElement>('th .sort-h')!;
    expect(el.querySelectorAll('th .sort-h').length).toBe(6);
    recipe.click();
    fixture.detectChanges();
    const asc = names();
    expect(asc).toEqual([...asc].sort((a, b) => a!.localeCompare(b!)));
    expect(recipe.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    recipe.click();
    fixture.detectChanges();
    expect(names()).toEqual([...asc].reverse());
  });

  it('liste de courses détaillée avec totaux', async () => {
    const { fixture, http, el } = await render();
    await wait(AUTOLOAD_MS + 50);
    http.expectOne(isPrices).flush([priceRow('T1_CARROT', 'Bridgewatch', 10, 0), priceRow('T4_MEAL_SOUP', 'Caerleon', 0, 30)]);
    await wait();
    fixture.detectChanges();
    const soup = [...el.querySelectorAll<HTMLButtonElement>('tbody .item')].find((b) => b.textContent?.includes('Soupe'))!;
    soup.click();
    fixture.detectChanges();
    expect(el.querySelector('.crafts')?.textContent).toContain('10 fabrications pour 100 unités');
    const line = el.querySelector('.lines tbody tr')!;
    expect(line.textContent).toContain('Carottes');
    expect(line.textContent).toContain(String(Math.ceil(10 * 16 * 0.848)));
    expect(line.textContent).toContain('Bridgewatch');
    const margin = Math.round(30 * 0.96 * 100 - Math.ceil(10 * 16 * 0.848) * 10);
    expect(el.querySelector('tfoot .total')?.textContent).toContain(margin.toLocaleString('fr-FR'));
  });

  it('filtres : type, famille, recherche avec exclusion', async () => {
    const { fixture, el } = await render();
    const [scope, type] = [...el.querySelectorAll<HTMLSelectElement>('select')];
    type.value = 'meal';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    const family = el.querySelectorAll<HTMLSelectElement>('select')[2];
    expect([...family.options].map((o) => o.textContent)).toEqual(['Toutes les familles', 'Soupes']);
    type.value = '';
    type.dispatchEvent(new Event('change'));
    scope.value = 'ing';
    scope.dispatchEvent(new Event('change'));
    const input = el.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'oeuf';
    input.dispatchEvent(new Event('input'));
    await wait(300);
    fixture.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    input.value = '-oeuf';
    input.dispatchEvent(new Event('input'));
    await wait(300);
    fixture.detectChanges();
    expect(el.querySelector('tbody .name')?.textContent).toContain('Soupe');
  });

  it('types de recettes : cuisine, potions, raffinage, équipement', async () => {
    const { el } = await render();
    const type = el.querySelectorAll<HTMLSelectElement>('select')[1];
    expect([...type.options].map((o) => o.textContent)).toEqual(['Tous les types', 'Potions', 'Nourriture', 'Raffinage', 'Équipement']);
  });

  it('historique des objets fabriqués seulement : ventes par jour et délai pour écouler', async () => {
    const { fixture, http, el } = await render();
    await wait(AUTOLOAD_MS + 50);
    http.expectOne(isPrices).flush([priceRow('T6_POTION_HEAL', 'Thetford', 3000, 2500)]);
    await wait();
    const req = http.expectOne(isHistory);
    expect(req.request.url.split('/').pop()!.replace('.json', '').split(',').sort()).toEqual(['T4_MEAL_SOUP', 'T6_POTION_HEAL']);
    req.flush([historyRow('T6_POTION_HEAL', 'Thetford', [[daysAgo(1), 35, 2600], [daysAgo(2), 35, 2600]])]);
    await wait();
    fixture.detectChanges();
    const potion = [...el.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Potion de soin'))!;
    expect(potion.lastElementChild?.textContent?.trim()).toBe('10');
    potion.querySelector<HTMLButtonElement>('.item')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.detail')?.textContent).toContain('Il s’en vend environ 10 par jour à Thetford : compte 10 jours pour en écouler 100.');
  });

  it('« Contient l’ingrédient » : seulement pour la nourriture', async () => {
    const { fixture, el } = await render();
    expect(el.querySelector('#c-ing')).toBeNull();
    const type = el.querySelector<HTMLSelectElement>('#c-cat')!;
    type.value = 'meal';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect([...el.querySelector<HTMLSelectElement>('#c-ing')!.options].map((o) => o.textContent)).toEqual(['Tous les ingrédients', 'Carottes']);
    type.value = 'potion';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('#c-ing')).toBeNull();
  });

  it('« Charger tous les résultats » : loader avec l’avancement tant que ça charge', async () => {
    const { fixture, http, el } = await render();
    const bulk = el.querySelector<HTMLButtonElement>('.actions .bulk')!;
    bulk.click();
    fixture.detectChanges();
    expect(bulk.querySelector('.spinner')).not.toBeNull();
    expect(bulk.getAttribute('aria-busy')).toBe('true');
    expect(bulk.textContent).toContain('Chargement… 0/7');   // 5 prix + 2 historiques
    http.expectOne(isPrices).flush([]);
    await wait();
    http.expectOne(isHistory).flush([]);
    await wait();
    fixture.detectChanges();
    expect(bulk.querySelector('.spinner')).toBeNull();
    expect(bulk.textContent).toContain('Charger tous les résultats');
  });

  it('détail : coût en matériaux bruts en indication (ressources raffinées décomposées)', async () => {
    const data: MarketData = {
      items: [
        ['T4_MAIN_SWORD', 'Épée large de l’adepte', 'Adept’s Broadsword', 0],
        ['T4_LEATHER', 'Cuir travaillé', 'Worked Leather', 0], ['T3_LEATHER', 'Cuir tanné', 'Cured Leather', 0],
        ['T4_HIDE', 'Peau tannée', 'Medium Hide', 0], ['T3_HIDE', 'Peau fine', 'Thin Hide', 0],
      ],
      recipes: [
        { id: 'T4_MAIN_SWORD', tier: 4, ench: 0, cat: 'gear', y: 1, r: [['T4_LEATHER', 10]] },
        { id: 'T4_LEATHER', tier: 4, ench: 0, cat: 'refine', y: 1, r: [['T4_HIDE', 2], ['T3_LEATHER', 1]] },
      ],
    };
    const { fixture, http, el } = await render(data);
    const type = el.querySelector<HTMLSelectElement>('#c-cat')!;
    type.value = 'gear';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await wait(AUTOLOAD_MS + 50);
    http.expectOne(isPrices).flush([priceRow('T4_LEATHER', 'Martlock', 100, 0)]);
    await wait();
    http.expectOne(isHistory).flush([]);
    await wait();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('tbody .item')!.click();
    fixture.detectChanges();
    await wait(AUTOLOAD_MS + 50);
    // matériaux bruts du détail ouvert chargés : 100 épées × 10 cuirs × 0,848 = 848 cuirs → 1 439 peaux T4 + 720 cuirs T3
    const req = http.expectOne(isPrices);
    expect(req.request.url.split('/').pop()!.replace('.json', '').split(',').sort()).toEqual(['T3_LEATHER', 'T4_HIDE']);
    req.flush([priceRow('T4_HIDE', 'Lymhurst', 30, 0), priceRow('T3_LEATHER', 'Lymhurst', 20, 0)]);
    await wait();
    fixture.detectChanges();
    const raw = el.querySelector('.lines.raw')!;
    expect(el.querySelector('.raw-title')?.textContent).toContain('matériaux bruts');
    expect(raw.textContent).toContain('Peau tannée');
    expect(raw.textContent).toContain((1439).toLocaleString('fr-FR'));
    const rawTotal = 1439 * 30 + 720 * 20;
    expect(raw.querySelector('tfoot')?.textContent).toContain(rawTotal.toLocaleString('fr-FR'));
    expect(raw.querySelector('tfoot')?.textContent).toContain(`${(848 * 100 - rawTotal).toLocaleString('fr-FR')} de moins`);
  });
});
