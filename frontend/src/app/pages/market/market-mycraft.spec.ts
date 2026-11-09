import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET, priceRow } from '../../../testing/market';
import { MarketService } from '../../core/market.service';
import { AUTOLOAD_MS } from './market-search';
import { MarketMyCraft } from './market-mycraft';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const isPrices = (r: { url: string }) => r.url.includes('albion-online-data.com');

describe('MarketMyCraft (mon craft)', () => {
  async function render() {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [MarketMyCraft], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const market = TestBed.inject(MarketService);
    const loading = market.load();
    http.expectOne('/api/market').flush(TEST_MARKET);
    await loading;
    const fixture = TestBed.createComponent(MarketMyCraft);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = (sel: string) => el.querySelector(sel)?.textContent?.trim() ?? '';
    const typeIn = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, http, el, text, typeIn };
  }

  it('saisie libre : coût, frais, revente, marge et prix de vente minimum', async () => {
    const { fixture, el, text, typeIn } = await render();
    typeIn(el.querySelector<HTMLInputElement>('#mc-qty')!, '4');
    typeIn(el.querySelector<HTMLInputElement>('#mc-rrr')!, '0');
    typeIn(el.querySelector<HTMLInputElement>('#mc-fee')!, '100');
    typeIn(el.querySelector<HTMLInputElement>('#mc-sell')!, '2000');
    const [count, price] = [...el.querySelectorAll<HTMLInputElement>('.line:not(.head) input[type=number]')];
    typeIn(el.querySelector<HTMLInputElement>('.c-res input')!, 'Planches maison');
    typeIn(count, '3');
    typeIn(price, '250');
    await fixture.whenStable();
    fixture.detectChanges();
    // 4 fabrications × 3 planches à 250 + 4 × 100 de frais ; revente 4 × 2000 − 4 %
    const cost = 4 * 3 * 250 + 400;
    const revenue = 4 * 2000 * 0.96;
    expect(text('.c-need')).toContain('12');
    expect(text('.cost')).toBe(cost.toLocaleString('fr-FR'));
    expect(text('.revenue')).toBe(revenue.toLocaleString('fr-FR'));
    expect(text('.profit')).toBe((revenue - cost).toLocaleString('fr-FR'));
    expect(el.querySelector('.profit')?.classList).toContain('pos');
    expect(text('.verdict')).toBe('Rentable');
    expect(text('.break-even')).toBe(Math.round(cost / 4 / 0.96).toLocaleString('fr-FR'));
    expect(el.querySelector('.warn')).toBeNull();
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lilium.market.mycraft')!).lines[0]).toMatchObject({ name: 'Planches maison', count: 3, price: 250 });
  });

  it('prix manquant signalé, retirer une ligne, nouveau craft', async () => {
    const { fixture, el, text, typeIn } = await render();
    typeIn(el.querySelector<HTMLInputElement>('.line:not(.head) input[type=number]')!, '2');
    expect(text('.warn')).toContain('Prix manquant : Ressource 1');
    expect(text('.cost')).toBe('–');
    el.querySelector<HTMLButtonElement>('.add')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.line:not(.head)').length).toBe(2);
    el.querySelector<HTMLButtonElement>('.c-del')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.line:not(.head)').length).toBe(1);
    expect(text('.warn')).not.toContain('Prix manquant');
    typeIn(el.querySelector<HTMLInputElement>('#mc-qty')!, '50');
    el.querySelector<HTMLButtonElement>('.reset')!.click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#mc-qty')!.value).toBe('10');
  });

  it('objet choisi dans les suggestions : prix du marché chargés, recette du jeu', async () => {
    const { fixture, http, el, text, typeIn } = await render();
    const product = el.querySelector<HTMLInputElement>('.field.wide input')!;
    product.dispatchEvent(new Event('focus'));
    typeIn(product, 'soin');
    const options = el.querySelectorAll<HTMLElement>('[role=option]');
    expect([...options].map((o) => o.textContent)).toEqual([
      expect.stringContaining('Potion de soin majeure'), expect.stringContaining('T6_POTION_HEAL@1'),
    ]);
    product.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    product.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(el.querySelector('[role=listbox]')).toBeNull();
    expect(product.value).toBe('Potion de soin majeure');
    el.querySelector<HTMLButtonElement>('.recipe')!.click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#mc-units')!.value).toBe('5');
    expect([...el.querySelectorAll<HTMLInputElement>('.c-res input[type=text]')].map((i) => i.value)).toEqual(['Digitale', "Œuf d'oie"]);
    await wait(AUTOLOAD_MS + 50);
    const req = http.expectOne(isPrices);
    expect(req.request.url.split('/').pop()!.replace('.json', '').split(',').sort()).toEqual(['T5_EGG', 'T6_FOXGLOVE', 'T6_POTION_HEAL']);
    req.flush([priceRow('T6_FOXGLOVE', 'Martlock', 100, 0), priceRow('T6_POTION_HEAL', 'Thetford', 3000, 2500)]);
    await wait();
    fixture.detectChanges();
    expect(text('.c-price small')).toBe('Marché : 100 · Martlock');
    expect(el.querySelectorAll<HTMLElement>('.c-price small')[1].textContent?.trim()).toBe('aucun relevé au marché');
    expect(text('#mc-sell + small')).toBe(`Marché : ${(2500).toLocaleString('fr-FR')} · Thetford`);
    expect(el.querySelector<HTMLInputElement>('#mc-sell')!.placeholder).toBe((2500).toLocaleString('fr-FR'));
    expect(text('.warn')).toContain('Œuf');
  });
});
