import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET, historyRow, priceRow } from '../../../testing/market';
import { MarketService } from '../../core/market.service';
import { HistoryRow } from './market-logic';
import { AUTOLOAD_MS, MarketSearch } from './market-search';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const isPrices = (r: { url: string }) => r.url.includes('/stats/prices/');
/** Date d'il y a `n` jours (« 2026-10-21 »), dans la fenêtre des 7 derniers jours. */
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const isHistory = (r: { url: string }) => r.url.includes('/stats/history/');


describe('MarketSearch (recherche marché)', () => {
  async function render() {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MarketSearch], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const market = TestBed.inject(MarketService);
    const loading = market.load();
    http.expectOne('/api/market').flush(TEST_MARKET);
    await loading;
    const fixture = TestBed.createComponent(MarketSearch);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, http, market, el };
  }

  /** Attend le chargement automatique des prix de la page, puis de l'historique des ventes, et y répond. */
  async function answerPrices(ctx: Awaited<ReturnType<typeof render>>, rows = PRICES, history: HistoryRow[] = []) {
    await wait(AUTOLOAD_MS + 50);
    const req = ctx.http.expectOne(isPrices);
    req.flush(rows);
    await wait();
    const hist = ctx.http.expectOne(isHistory);
    hist.flush(history);
    await wait();
    ctx.fixture.detectChanges();
    return Object.assign(req, { hist });
  }

  const PRICES = [
    priceRow('T6_2H_BOW', 'Martlock', 10000, 9000), priceRow('T6_2H_BOW', 'Black Market', 0, 15000),
    priceRow('T6_MAIN_SWORD', 'Lymhurst', 20000, 12000),
  ];

  it('T6.0 par défaut, prix de la page chargés tout seuls, meilleure affaire en tête', async () => {
    const ctx = await render();
    const names = () => [...ctx.el.querySelectorAll('tbody .name')].map((n) => n.firstChild?.textContent?.trim());
    expect(ctx.el.querySelector('.count')?.textContent).toContain('4 objets');
    expect(ctx.el.querySelectorAll('tbody tr').length).toBe(4);
    const req = await answerPrices(ctx);
    expect(req.request.url).toContain('T6_2H_BOW');
    expect(req.request.url).not.toContain('T6_2H_BOW@1');
    expect(names()[0]).toBe('Arc du maître');
    const best = ctx.el.querySelector('tr.best')!;
    expect(best.textContent).toContain('Meilleure affaire');
    expect(best.querySelector('.pos')?.textContent).toContain((15000 * 0.96 - 10000).toLocaleString('fr-FR'));
    expect(best.textContent).toContain('Marché noir');
    expect(ctx.el.querySelector('tbody tr:nth-child(2) .neg')).not.toBeNull();   // épée : marge négative
  });

  it('tri au clic sur les en-têtes : colonne puis sens inversé, mémorisé', async () => {
    const ctx = await render();
    await answerPrices(ctx);
    const names = () => [...ctx.el.querySelectorAll('tbody .name')].map((n) => n.firstChild?.textContent?.trim());
    const header = (label: string) => [...ctx.el.querySelectorAll<HTMLButtonElement>('th .sort-h')].find((b) => b.textContent?.trim() === label)!;
    expect(header('Marge nette').closest('th')?.getAttribute('aria-sort')).toBe('descending');

    header('Acheter à').click();
    ctx.fixture.detectChanges();
    const [bow, sword] = names();
    expect(bow).toBe('Arc du maître');   // 10 000 puis l'épée à 20 000, les objets sans prix en bas
    expect(header('Acheter à').closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(ctx.el.querySelector('tr.best')).toBeNull();

    header('Acheter à').click();
    ctx.fixture.detectChanges();
    expect(names().slice(0, 2)).toEqual([sword, bow]);
    expect(header('Acheter à').closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(JSON.parse(localStorage.getItem('lilium.market.search') ?? '{}')).toMatchObject({ sort: 'buy', rev: true });
    expect(ctx.el.querySelector<HTMLSelectElement>('#s-sort')!.value).toBe('buy');
  });

  it('recherche à la frappe (FR, EN, id) et filtre « seulement avec prix »', async () => {
    const ctx = await render();
    await answerPrices(ctx);
    const input = ctx.el.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'bow';
    input.dispatchEvent(new Event('input'));
    await wait(300);
    ctx.fixture.detectChanges();
    expect(ctx.el.querySelectorAll('tbody tr').length).toBe(1);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await wait(300);
    ctx.fixture.detectChanges();
    ctx.el.querySelector<HTMLInputElement>('.switch input')!.click();
    ctx.fixture.detectChanges();
    expect(ctx.el.querySelector('.count')?.textContent).toContain('2 objets (sur 4');
    ctx.el.querySelector<HTMLButtonElement>('button.reset')!.click();
    ctx.fixture.detectChanges();
    expect(ctx.el.querySelector<HTMLInputElement>('.switch input')!.checked).toBe(false);
    expect(ctx.el.querySelector('.count')?.textContent).not.toContain('(sur');
  });

  it('puces tier et enchantement, catégorie puis type', async () => {
    const ctx = await render();
    const chip = (label: string) => [...ctx.el.querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.textContent?.trim() === label)!;
    chip('.1').click();
    ctx.fixture.detectChanges();
    expect(ctx.el.querySelector('.count')?.textContent).toContain('6 objets');   // .0 et .1
    expect(chip('.1').getAttribute('aria-pressed')).toBe('true');
    const [cat, type] = [...ctx.el.querySelectorAll<HTMLSelectElement>('select')];
    expect(type.disabled).toBe(true);
    cat.value = 'weapons';
    cat.dispatchEvent(new Event('change'));
    ctx.fixture.detectChanges();
    expect(type.disabled).toBe(false);
    expect([...type.options].map((o) => o.textContent)).toContain('Arcs');
    expect(ctx.el.querySelector('.count')?.textContent).toContain('3 objets');
    expect(JSON.parse(localStorage.getItem('lilium.market.search') ?? '{}')).toMatchObject({ cat: 'weapons', enchs: [0, 1] });
  });

  it('détail ville par ville : meilleur achat en vert, meilleure revente en lilas', async () => {
    const ctx = await render();
    await answerPrices(ctx);
    ctx.el.querySelector<HTMLButtonElement>('tbody .item')!.click();
    ctx.fixture.detectChanges();
    const cities = ctx.el.querySelectorAll('.cities tbody tr');
    expect(cities.length).toBe(8);   // 7 villes + Marché noir
    expect(ctx.el.querySelector('.cities .hl-buy')?.textContent).toContain((10000).toLocaleString('fr-FR'));
    expect(ctx.el.querySelector('.cities .hl-sell')?.textContent).toContain((15000).toLocaleString('fr-FR'));
    ctx.el.querySelector<HTMLButtonElement>('tbody .item')!.click();
    ctx.fixture.detectChanges();
    expect(ctx.el.querySelector('.cities')).toBeNull();
  });

  it('« Charger tous les résultats » demande tous les objets filtrés', async () => {
    const ctx = await render();
    await answerPrices(ctx, []);
    const loadAll = [...ctx.el.querySelectorAll<HTMLButtonElement>('.actions button')][1];
    loadAll.click();
    ctx.fixture.detectChanges();
    expect(loadAll.querySelector('.spinner')).not.toBeNull();   // loader tant que ça charge
    const req = ctx.http.expectOne(isPrices);
    expect(req.request.url.split('/').pop()!.replace('.json', '').split(',').length).toBe(4);
    req.flush([]);
    await wait();
    ctx.http.expectNone(isHistory);   // historique déjà chargé pour ces objets
    ctx.fixture.detectChanges();
    expect(loadAll.querySelector('.spinner')).toBeNull();
  });

  it('aucun résultat : message et pas de tableau', async () => {
    const ctx = await render();
    const input = ctx.el.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await wait(300);
    ctx.fixture.detectChanges();
    expect(ctx.el.querySelector('table')).toBeNull();
    expect(ctx.el.querySelector('.empty')?.textContent).toContain('Aucun résultat');
  });

  it('ventes par jour, filtre de volume, alerte prix inhabituel et courbe du prix moyen', async () => {
    const ctx = await render();
    const req = await answerPrices(ctx, PRICES, [
      // revente au Marché noir : 140 ventes en 7 jours ; achat à Martlock bien sous la moyenne (10 000 contre 30 000)
      historyRow('T6_2H_BOW', 'Black Market', [[daysAgo(1), 70, 15500], [daysAgo(2), 70, 15000]]),
      historyRow('T6_2H_BOW', 'Martlock', [[daysAgo(1), 3, 30000], [daysAgo(3), 4, 30000]]),
    ]);
    expect(req.hist.request.url).toContain('T6_2H_BOW');
    const bow = () => [...ctx.el.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Arc du maître'))!;
    expect(bow().querySelector('.vol')?.textContent?.trim()).toBe('20');
    expect(bow().querySelector('.vol')?.getAttribute('title')).toContain('à Marché noir');
    expect(bow().querySelector('.odd')?.getAttribute('title')).toContain('67 % sous le prix moyen');
    const sword = [...ctx.el.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Épée'))!;
    expect(sword.querySelector('.vol')?.textContent?.trim()).toBe('0');
    expect(sword.querySelector('.odd')).toBeNull();

    bow().querySelector<HTMLButtonElement>('.item')!.click();
    ctx.fixture.detectChanges();
    const detail = ctx.el.querySelector('.detail')!;
    const martlock = [...detail.querySelectorAll('.cities tbody tr')].find((r) => r.textContent?.includes('Martlock'))!;
    expect(martlock.textContent).toContain('30 000');
    expect(detail.querySelector('.chart-title')?.textContent).toContain('Prix moyen par jour à Marché noir');
    expect(detail.querySelector('app-line-chart')).not.toBeNull();

    const vol = ctx.el.querySelector<HTMLInputElement>('#s-vol')!;
    vol.value = '5';
    vol.dispatchEvent(new Event('change'));
    ctx.fixture.detectChanges();
    expect(ctx.el.querySelectorAll('tbody .item').length).toBe(1);
    expect(ctx.el.querySelector('tbody .name')?.textContent).toContain('Arc du maître');
  });
});
