import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET } from '../../../testing/market';
import { MarketService } from '../../core/market.service';
import { MarketPage } from './market';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('MarketPage (onglet Marché)', () => {
  function render() {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MarketPage], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(MarketPage);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }

  it('squelette pendant le chargement, puis la recherche ; crédit à Aria le papi', async () => {
    const { fixture, http, el } = render();
    expect(el.querySelector('h1')?.textContent).toBe('Marché');
    expect(el.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('.credit')?.textContent).toContain('Aria le papi');
    http.expectOne('/api/market').flush(TEST_MARKET);
    await wait();
    fixture.detectChanges();
    expect(el.querySelector('app-market-search')).not.toBeNull();
    expect(el.querySelector('.status')?.textContent).toContain('objets disponibles');
  });

  it('bascule vers Cuisine & potions et s’en souvient', async () => {
    const { fixture, http, el } = render();
    http.expectOne('/api/market').flush(TEST_MARKET);
    await wait();
    fixture.detectChanges();
    const craft = el.querySelectorAll<HTMLButtonElement>('.segmented button')[1];
    craft.click();
    fixture.detectChanges();
    expect(craft.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('app-market-craft')).not.toBeNull();
    expect(el.querySelector('app-market-search')).toBeNull();
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lilium.market.view')!)).toEqual({ view: 'craft' });
  });

  it('réglages repliés par défaut ; mode de vente → taxe par défaut et résumé', async () => {
    const { fixture, http, el } = render();
    http.expectOne('/api/market').flush(TEST_MARKET);
    await wait();
    fixture.detectChanges();
    expect(el.querySelector('#market-settings')).toBeNull();
    expect(el.querySelector('.summary')?.textContent).toContain('Europe · vente directe · taxe 4 % · Normale');
    el.querySelector<HTMLButtonElement>('.settings .btn')!.click();
    fixture.detectChanges();
    const mode = el.querySelector<HTMLSelectElement>('#m-mode')!;
    mode.value = 'order';
    mode.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#m-tax')!.value).toBe('6.5');
    expect(el.querySelector('.summary')?.textContent).toContain('mise en vente · taxe 6,5 %');
  });

  it('état des prix (chargement, erreur réseau) et barre de progression', async () => {
    const { fixture, http, el } = render();
    http.expectOne('/api/market').flush(TEST_MARKET);
    await wait();
    const market = TestBed.inject(MarketService);
    market.status.set({ kind: 'busy', done: 20, total: 40 });
    fixture.detectChanges();
    expect(el.querySelector('.status')?.textContent).toContain('20/40');
    expect(el.querySelector('.progress.active')?.getAttribute('aria-valuenow')).toBe('50');
    market.status.set({ kind: 'error', network: true, code: 0 });
    fixture.detectChanges();
    expect(el.querySelector('.status.error-text')?.textContent).toContain('bloqueur');
    expect(el.querySelector('.progress.active')).toBeNull();
  });

  it('catalogue indisponible : message et bouton pour réessayer', async () => {
    const { fixture, http, el } = render();
    http.expectOne('/api/market').flush('ko', { status: 500, statusText: 'Server Error' });
    await wait();
    fixture.detectChanges();
    expect(el.querySelector('.alert')?.textContent).toContain('Impossible de charger le catalogue');
    el.querySelector<HTMLButtonElement>('.alert button')!.click();
    http.expectOne('/api/market').flush(TEST_MARKET);
    await wait();
    fixture.detectChanges();
    expect(el.querySelector('.alert')).toBeNull();
  });
});
