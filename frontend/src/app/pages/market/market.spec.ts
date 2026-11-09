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

  it('bascule vers Fabrication et s’en souvient', async () => {
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

  it('onglet Mon craft', async () => {
    const { fixture, http, el } = render();
    http.expectOne('/api/market').flush(TEST_MARKET);
    await wait();
    fixture.detectChanges();
    const mine = el.querySelectorAll<HTMLButtonElement>('.segmented button')[2];
    expect(mine.textContent).toContain('Mon craft');
    mine.click();
    fixture.detectChanges();
    expect(mine.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('app-market-mycraft')).not.toBeNull();
    expect(el.querySelector('app-market-craft')).toBeNull();
  });

  it('réglages repliés par défaut ; mode de vente et Premium → taxe et résumé', async () => {
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
    expect(el.querySelector('.summary')?.textContent).toContain('mise en vente · taxe 6,5 %');
    expect(el.querySelector('.tax-detail')?.textContent).toContain('Taxe de vente 4 % + frais de mise en vente 2,5 % = 6,5 %');
    const premium = el.querySelector<HTMLInputElement>('#m-premium')!;
    expect(premium.checked).toBe(true);
    premium.checked = false;
    premium.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('.summary')?.textContent).toContain('taxe 10,5 %');
    expect(el.querySelector('.tax-detail')?.textContent).toContain('Taxe de vente 8 %');
    const caerleon = el.querySelector<HTMLInputElement>('#m-nobuy-Caerleon')!;
    expect(caerleon.parentElement?.textContent).toContain('pas d’achat de matériaux à Caerleon');
    expect(el.querySelector<HTMLInputElement>('#m-nobuy-Brecilien')!.checked).toBe(false);
    caerleon.checked = true;
    caerleon.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(TestBed.inject(MarketService).settings().noBuy).toEqual(['Caerleon']);
    expect(caerleon.checked).toBe(true);
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
