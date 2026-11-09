import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET, priceRow } from '../../../testing/market';
import { MARKET_URL, MarketService } from '../../core/market.service';
import { BLACK_MARKET } from './market-logic';
import { AUTOLOAD_MS } from './market-search';
import { MarketUpgrade } from './market-upgrade';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const isPrices = (r: { url: string }) => r.url.includes('albion-online-data.com');
const n = (v: number) => Math.round(v).toLocaleString('fr-FR');

describe('MarketUpgrade (upgradeur)', () => {
  async function render() {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MarketUpgrade], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const market = TestBed.inject(MarketService);
    const loading = market.load();
    http.expectOne(MARKET_URL).flush({ ...TEST_MARKET, items: [...TEST_MARKET.items, ['T6_RUNE', 'Rune du maître', "Master's Rune", 0]] });
    await loading;
    const fixture = TestBed.createComponent(MarketUpgrade);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const all = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)].map((x) => x.textContent?.trim() ?? '');
    const typeIn = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const click = (sel: string, index = 0) => {
      el.querySelectorAll<HTMLElement>(sel)[index].click();
      fixture.detectChanges();
    };
    /** Choisit l'arc dans les suggestions et répond au chargement automatique des prix. */
    const pickBow = async () => {
      const field = el.querySelector<HTMLInputElement>('.field.wide input')!;
      field.dispatchEvent(new Event('focus'));
      typeIn(field, 'arc');
      // équipement améliorable seulement, sans ses variantes enchantées
      expect(all('[role=option] small')).toEqual(['6.0 · T6_2H_BOW']);
      click('[role=option]');
      await wait(AUTOLOAD_MS + 50);
      const req = http.expectOne(isPrices);
      expect(req.request.url.split('/').pop()!.replace('.json', '').split(',').sort()).toEqual([
        'T6_2H_BOW', 'T6_2H_BOW@1', 'T6_2H_BOW@2', 'T6_2H_BOW@3', 'T6_RELIC', 'T6_RUNE', 'T6_SOUL',
      ]);
      req.flush([
        priceRow('T6_2H_BOW', 'Martlock', 50000, 0),
        priceRow('T6_RUNE', 'Lymhurst', 100, 0), priceRow('T6_RUNE', 'Martlock', 120, 0),
        priceRow('T6_SOUL', 'Martlock', 380, 0), priceRow('T6_RELIC', 'Martlock', 1500, 0),
        priceRow('T6_2H_BOW@1', BLACK_MARKET, 0, 150000), priceRow('T6_2H_BOW@1', 'Lymhurst', 110000, 100000),
        priceRow('T6_2H_BOW@2', 'Martlock', 0, 200000),
      ]);
      await wait();
      fixture.detectChanges();
    };
    return { fixture, http, el, all, typeIn, click, pickBow };
  }

  it('sans objet choisi : invitation à en choisir un', async () => {
    const { el, all } = await render();
    expect(all('.chip.from')).toEqual(['.0', '.1', '.2']);
    expect(el.querySelector('.target')).toBeNull();
    expect(all('.none')[0]).toContain('Choisis une arme');
  });

  it('objet choisi : runes, âmes, reliques à la meilleure ville, marge par niveau, le plus rentable mis en avant', async () => {
    const { el, all } = await pickBowReady();
    expect(all('.chip.from')).toEqual(['6.0', '6.1', '6.2']);
    expect(all('.c-mat strong')).toEqual(['Runes', 'Âmes', 'Reliques']);
    expect(all('.c-mat small')[0]).toBe('Rune du maître · vers 6.1');
    expect(all('.c-per .num')).toEqual(['384', '384', '384']);
    expect(all('.c-price small')).toEqual(['Marché : 100 · Lymhurst', 'Marché : 380 · Martlock', `Marché : ${n(1500)} · Martlock`]);
    expect(all('.c-cost .num')).toEqual([n(38400), n(384 * 380), n(384 * 1500)]);
    expect(el.querySelector<HTMLInputElement>('#up-buy')!.placeholder).toBe(n(50000));
    expect(all('.target h3')).toEqual(['Vers 6.1', 'Vers 6.2', 'Vers 6.3']);
    const [to1, to2, to3] = [...el.querySelectorAll<HTMLElement>('.target')];
    expect(to1.classList).toContain('best');
    expect(to1.querySelector('.best-badge')?.textContent).toContain('Le plus rentable');
    expect(to1.querySelector('.cost')?.textContent?.trim()).toBe(n(50000 + 38400));
    // revente en ville royale (Lymhurst), pas au Marché noir
    expect(to1.querySelector('#up-sell-1 + small')?.textContent?.trim()).toBe(`Marché : ${n(100000)} · Lymhurst`);
    expect(to1.querySelector('.per-item')?.textContent?.trim()).toBe(n(100000 * 0.96 - 88400));
    expect(to1.querySelector('.verdict')?.textContent?.trim()).toBe('Rentable');
    expect(to1.querySelector('.direct')?.textContent).toContain(`Déjà en 6.1 au marché : ${n(110000)} · Lymhurst`);
    expect(to1.querySelector('.saving')?.textContent).toBe(`Améliorer revient ${n(110000 - 88400)} moins cher par objet.`);
    expect(to2.querySelector('.verdict')?.textContent?.trim()).toBe('À perte');
    expect(to3.querySelector('.warn')?.textContent).toContain('Prix de vente inconnu');
    expect(to3.querySelector('.verdict')).toBeNull();
  });

  it('ville donnée : matériaux achetés dans cette ville, prix manquant signalé', async () => {
    const { el, all, click, fixture } = await pickBowReady();
    click('.where button', 1);
    const select = el.querySelector<HTMLSelectElement>('#up-city')!;
    select.value = 'Lymhurst';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(all('.c-price small')).toEqual(['Marché : 100 · Lymhurst', 'aucun relevé au marché', 'aucun relevé au marché']);
    expect(all('.warn').join(' ')).toContain('Prix manquant : T6_SOUL, T6_RELIC');
    click('.where button', 0);
    expect(el.querySelector('#up-city')).toBeNull();
    expect(all('.c-price small')[1]).toBe('Marché : 380 · Martlock');
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lilium.market.upgrade')!)).toMatchObject({ id: 'T6_2H_BOW', buyIn: 'best', city: 'Lymhurst' });
  });

  it('quantité, prix saisis, départ en .2, réinitialisation', async () => {
    const { el, all, click, typeIn } = await pickBowReady();
    typeIn(el.querySelector<HTMLInputElement>('#up-qty')!, '3');
    expect(all('.c-need .num')).toEqual([n(1152), n(1152), n(1152)]);
    typeIn(el.querySelector<HTMLInputElement>('.c-price input')!, '50');
    expect(all('.c-cost .num')[0]).toBe(n(50 * 1152));
    typeIn(el.querySelector<HTMLInputElement>('#up-sell-3')!, '900000');
    expect(el.querySelectorAll<HTMLElement>('.target')[2].querySelector('.warn')).toBeNull();
    click('.chip.from', 2);
    expect(all('.c-mat strong')).toEqual(['Reliques']);
    expect(all('.target h3')).toEqual(['Vers 6.3']);
    expect(el.querySelector('.best-badge')).toBeNull();
    expect(el.querySelector('label[for=up-buy]')?.textContent).toContain('6.2');
    click('.reset');
    expect(el.querySelector<HTMLInputElement>('.field.wide input')!.value).toBe('');
    expect(el.querySelector<HTMLInputElement>('#up-qty')!.value).toBe('1');
    expect(el.querySelector('.target')).toBeNull();
  });

  async function pickBowReady() {
    const ctx = await render();
    await ctx.pickBow();
    return ctx;
  }
});
