import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET, historyRow, priceRow } from '../../testing/market';
import { setLang } from './i18n/i18n';
import { MARKET_URL, MarketService, historyStart } from './market.service';

const tick = () => new Promise((resolve) => setTimeout(resolve));
const priceUrl = (server: string) => (r: { url: string }) => r.url.startsWith(`https://${server}.albion-online-data.com/api/v2/stats/prices/`);
const historyUrl = (server: string) => (r: { url: string }) => r.url.startsWith(`https://${server}.albion-online-data.com/api/v2/stats/history/`);

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
    http.expectOne(MARKET_URL).flush(TEST_MARKET);
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
    http.expectOne(MARKET_URL).flush('ko', { status: 500, statusText: 'Server Error' });
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

  it('réglages : taxe selon le mode et le Premium, prix remis à zéro au changement de serveur ou de qualité, mémorisés', async () => {
    service.prices.set({ T4_BAG: {} });
    expect(service.tax()).toBe(4);
    service.update({ mode: 'order' });
    expect(service.tax()).toBe(6.5);
    service.update({ premium: false });
    expect(service.tax()).toBe(10.5);
    service.update({ premium: true });
    expect(service.prices()).toEqual({ T4_BAG: {} });
    service.update({ quality: 3 });
    expect(service.prices()).toEqual({});
    service.prices.set({ T4_BAG: {} });
    service.update({ server: 'west' });
    expect(service.prices()).toEqual({});
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lilium.market.settings')!)).toEqual({ server: 'west', mode: 'order', premium: true, quality: 3, bm: true, noBuy: [] });
    const done = service.fetchPrices(['T4_BAG']);
    http.expectOne(priceUrl('west')).flush([]);
    await done;
  });

  it('ancien réglage mémorisé (taxe saisie à la main) : abandonné au 1er changement', () => {
    localStorage.setItem('lilium.market.settings', JSON.stringify({ server: 'east', mode: 'order', tax: 3, quality: 2, bm: false }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fresh = TestBed.inject(MarketService);
    expect(fresh.tax()).toBe(6.5);     // Premium par défaut
    fresh.update({ bm: true });
    expect(fresh.settings()).toEqual({ server: 'east', mode: 'order', premium: true, quality: 2, bm: true, noBuy: [] });
    http = TestBed.inject(HttpTestingController);
  });

  it('villes exclues de l\'achat des matériaux : cochées/décochées, ville inconnue ignorée, prix gardés', () => {
    service.prices.set({ T4_BAG: {} });
    service.toggleNoBuy('Brecilien', true);
    service.toggleNoBuy('Caerleon', true);
    expect(service.settings().noBuy).toEqual(['Caerleon', 'Brecilien']);
    service.toggleNoBuy('Caerleon', false);
    expect(service.settings().noBuy).toEqual(['Brecilien']);
    service.update({ noBuy: ['Martlock', 'Brecilien'] });
    expect(service.settings().noBuy).toEqual(['Brecilien']);
    service.update({ noBuy: 'Caerleon' as never });   // valeur mémorisée abîmée
    expect(service.settings().noBuy).toEqual([]);
    expect(service.prices()).toEqual({ T4_BAG: {} });
  });

  it('historique des ventes après les prix : lots de 20, 14 jours, qualité, une seule fois par objet', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `T4_ITEM${i}`);
    const done = service.fetchPrices(['T4_ITEM0'], ids);
    http.expectOne(priceUrl('europe')).flush([]);
    await tick();
    const first = http.expectOne(historyUrl('europe'));
    expect(first.request.url).toContain('/T4_ITEM0,T4_ITEM1,');
    expect(first.request.url.endsWith('T4_ITEM19.json')).toBe(true);
    expect(first.request.params.get('time-scale')).toBe('24');
    expect(first.request.params.get('qualities')).toBe('1');
    expect(first.request.params.get('date')).toBe(historyStart(Date.now()));
    first.flush([historyRow('T4_ITEM0', 'Martlock', [['2026-10-22', 5, 100]])]);
    await tick();
    expect(service.history()['T4_ITEM0'].Martlock).toEqual([{ d: '2026-10-22', n: 5, p: 100 }]);
    expect(service.status()).toEqual({ kind: 'busy', done: 21, total: 26 });
    http.expectOne(historyUrl('europe')).flush([]);
    await done;
    expect(service.status()).toMatchObject({ kind: 'done', count: 1, history: true });
    // déjà demandé : ni prix (rien à charger) ni historique
    await service.fetchPrices([], ids);
    http.expectNone(historyUrl('europe'));
    // changement de qualité : historique remis à zéro
    service.update({ quality: 2 });
    expect(service.history()).toEqual({});
  });

  it('historique en échec : les prix restent, statut « done » sans historique', async () => {
    const done = service.fetchPrices(['T4_BAG'], ['T4_BAG']);
    http.expectOne(priceUrl('europe')).flush([priceRow('T4_BAG', 'Martlock', 100, 80)]);
    await tick();
    http.expectOne(historyUrl('europe')).flush('', { status: 429, statusText: 'Too Many Requests' });
    await done;
    expect(service.prices()['T4_BAG'].Martlock?.s).toBe(100);
    expect(service.status()).toMatchObject({ kind: 'done', history: false });
    expect(service.history()).toEqual({});
    // réessayé au prochain chargement
    const again = service.fetchPrices([], ['T4_BAG']);
    http.expectOne(historyUrl('europe')).flush([]);
    await again;
    expect(service.history()).toEqual({ T4_BAG: {} });
  });

  it('date de début de l’historique au format mois-jour-année', () => {
    expect(historyStart(Date.parse('2026-10-23T12:00:00Z'))).toBe('10-9-2026');
    expect(historyStart(Date.parse('2026-01-05T12:00:00Z'), 7)).toBe('12-29-2025');
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
