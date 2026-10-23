import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET, priceRow } from '../../testing/market';
import { setLang } from './i18n/i18n';
import { MarketService } from './market.service';

const tick = () => new Promise((resolve) => setTimeout(resolve));
const priceUrl = (server: string) => (r: { url: string }) => r.url.startsWith(`https://${server}.albion-online-data.com/api/v2/stats/prices/`);

describe('MarketService', () => {
  let service: MarketService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MarketService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    setLang('fr');
  });

  it('charge le catalogue une fois et déplie les enchantements', async () => {
    const first = service.load();
    service.load();
    http.expectOne('/api/market').flush(TEST_MARKET);
    await first;
    expect(service.items().filter((i) => i.id.startsWith('T6_2H_BOW')).map((i) => i.id)).toEqual(['T6_2H_BOW', 'T6_2H_BOW@1', 'T6_2H_BOW@2']);
    expect(service.recipes()).toHaveLength(2);
    expect(service.nameOf('T6_POTION_HEAL@1')).toBe('Potion de soin majeure');
    setLang('en');
    expect(service.nameOf('T6_POTION_HEAL@1')).toBe('Major Healing Potion');
    expect(service.nameOf('INCONNU')).toBe('INCONNU');
    await service.load();   // déjà chargé : pas de 2e requête
  });

  it('garde l’erreur de chargement pour la réafficher', async () => {
    const done = service.load();
    http.expectOne('/api/market').flush('ko', { status: 500, statusText: 'Server Error' });
    await done;
    expect(service.loadError()).toBeTruthy();
    expect(service.loaded()).toBe(false);
  });

  it('charge les prix par lots de 40 sur le serveur choisi', async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `T4_ITEM${i}`);
    const done = service.fetchPrices(ids);
    expect(service.busy()).toBe(true);
    const first = http.expectOne(priceUrl('europe'));
    expect(first.request.url.endsWith('.json')).toBe(true);
    expect(first.request.url).toContain('T4_ITEM0,T4_ITEM1,');
    first.flush([priceRow('T4_ITEM0', 'Martlock', 100, 80)]);
    await tick();
    expect(service.prices()['T4_ITEM0'].Martlock?.s).toBe(100);
    expect(service.status()).toEqual({ kind: 'busy', done: 40, total: 45 });
    http.expectOne(priceUrl('europe')).flush([]);
    await done;
    expect(service.status()).toMatchObject({ kind: 'done', count: 45 });
    expect(service.untried(['T4_ITEM3', 'T4_NEW', 'T4_NEW'])).toEqual(['T4_NEW']);
  });

  it('erreur réseau (bloqueur, hors ligne) ou HTTP', async () => {
    let done = service.fetchPrices(['T4_BAG']);
    http.expectOne(priceUrl('europe')).error(new ProgressEvent('error'));
    await done;
    expect(service.status()).toEqual({ kind: 'error', network: true, code: 0 });
    done = service.fetchPrices(['T4_BAG']);
    http.expectOne(priceUrl('europe')).flush('', { status: 429, statusText: 'Too Many Requests' });
    await done;
    expect(service.status()).toEqual({ kind: 'error', network: false, code: 429 });
    expect(service.busy()).toBe(false);
  });

  it('réglages : taxe par défaut du mode, prix remis à zéro au changement de serveur ou de qualité, mémorisés', async () => {
    service.prices.set({ T4_BAG: {} });
    service.update({ mode: 'order' });
    expect(service.settings().tax).toBe(6.5);
    expect(service.prices()).toEqual({ T4_BAG: {} });
    service.update({ quality: 3 });
    expect(service.prices()).toEqual({});
    service.prices.set({ T4_BAG: {} });
    service.update({ server: 'west' });
    expect(service.prices()).toEqual({});
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lilium.market.settings')!)).toMatchObject({ server: 'west', mode: 'order', quality: 3 });
    const done = service.fetchPrices(['T4_BAG']);
    http.expectOne(priceUrl('west')).flush([]);
    await done;
  });

  it('ignore les prix arrivés après un changement de serveur', async () => {
    const done = service.fetchPrices(['T4_BAG']);
    const req = http.expectOne(priceUrl('europe'));
    service.update({ server: 'east' });
    req.flush([priceRow('T4_BAG', 'Martlock', 100, 80)]);
    await done;
    expect(service.prices()).toEqual({});
    expect(service.busy()).toBe(false);
  });
});
