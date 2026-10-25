import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET, priceRow } from '../../../testing/market';
import { MarketService } from '../../core/market.service';
import { MarketCraft } from './market-craft';
import { AUTOLOAD_MS } from './market-search';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const isPrices = (r: { url: string }) => r.url.includes('albion-online-data.com');

describe('MarketCraft (cuisine & potions)', () => {
  async function render() {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MarketCraft], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const market = TestBed.inject(MarketService);
    const loading = market.load();
    http.expectOne('/api/market').flush(TEST_MARKET);
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
    expect(el.querySelectorAll('th .sort-h').length).toBe(5);
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
});
