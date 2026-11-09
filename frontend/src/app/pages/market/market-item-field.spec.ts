import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_MARKET } from '../../../testing/market';
import { MarketService } from '../../core/market.service';
import { MarketItemField, PickedItem } from './market-item-field';

describe('MarketItemField (champ objet de Mon craft)', () => {
  async function render() {
    TestBed.configureTestingModule({ imports: [MarketItemField], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const market = TestBed.inject(MarketService);
    const loading = market.load();
    TestBed.inject(HttpTestingController).expectOne('/api/market').flush(TEST_MARKET);
    await loading;
    const fixture = TestBed.createComponent(MarketItemField);
    fixture.componentRef.setInput('label', 'Ressource 1');
    const picks: PickedItem[] = [];
    fixture.componentInstance.pick.subscribe((p) => picks.push(p));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    const typeIn = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const press = (key: string) => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key }));
      fixture.detectChanges();
    };
    return { fixture, el, input, picks, typeIn, press };
  }

  it('texte libre émis tel quel, suggestions à partir de 2 lettres (FR, EN ou id)', async () => {
    const { el, input, picks, typeIn } = await render();
    input.dispatchEvent(new Event('focus'));
    typeIn('a');
    expect(picks.at(-1)).toEqual({ id: '', name: 'a' });
    expect(el.querySelector('[role=listbox]')).toBeNull();
    typeIn('bow');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect([...el.querySelectorAll('[role=option] small')].map((s) => s.textContent)).toEqual(
      ['6.0 · T6_2H_BOW', '6.1 · T6_2H_BOW@1', '6.2 · T6_2H_BOW@2'],
    );
    typeIn('zzz');
    expect(el.querySelector('[role=listbox]')).toBeNull();
  });

  it('clavier : flèches (en boucle), Entrée choisit, Échap ferme ; clic sur une suggestion', async () => {
    const { fixture, el, input, picks, typeIn, press } = await render();
    input.dispatchEvent(new Event('focus'));
    typeIn('bow');
    press('ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-2$/);
    press('ArrowDown');
    expect(el.querySelector('[role=option].on small')?.textContent).toContain('T6_2H_BOW');
    press('Enter');
    expect(picks.at(-1)).toEqual({ id: 'T6_2H_BOW', name: 'Arc du maître' });
    expect(el.querySelector('[role=listbox]')).toBeNull();
    typeIn('carot');
    press('Escape');
    expect(el.querySelector('[role=listbox]')).toBeNull();
    typeIn('carrots');
    el.querySelector<HTMLElement>('[role=option]')!.click();
    fixture.detectChanges();
    expect(picks.at(-1)).toEqual({ id: 'T1_CARROT', name: 'Carottes' });
  });

  it('objet choisi : icône à gauche du nom', async () => {
    const { fixture, el } = await render();
    expect(el.querySelector('img.ico')).toBeNull();
    fixture.componentRef.setInput('id', 'T6_2H_BOW');
    fixture.componentRef.setInput('name', 'Arc du maître');
    fixture.detectChanges();
    expect(el.querySelector<HTMLImageElement>('img.ico')?.src).toContain('T6_2H_BOW');
    expect(el.querySelector('input')!.value).toBe('Arc du maître');
  });
});
