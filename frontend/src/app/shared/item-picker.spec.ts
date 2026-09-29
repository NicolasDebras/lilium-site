import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_ITEMS } from '../../testing/items';
import { ItemsService } from '../core/items.service';
import { Slot } from '../core/models';
import { ItemPicker } from './item-picker';

async function render(slot: Slot, value?: string, disabled = false) {
  TestBed.configureTestingModule({
    imports: [ItemPicker],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const load = TestBed.inject(ItemsService).load();
  TestBed.inject(HttpTestingController).expectOne('/api/items').flush(TEST_ITEMS);
  await load;

  const fixture = TestBed.createComponent(ItemPicker);
  fixture.componentRef.setInput('slot', slot);
  if (value) fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('disabled', disabled);
  const emitted: (string | null)[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const openPanel = async () => {
    el.querySelector<HTMLButtonElement>('button.slot')!.click();
    await fixture.whenStable();
  };
  return { fixture, el, emitted, openPanel };
}

describe('ItemPicker', () => {
  it('case vide : libellé de l’emplacement, pas d’image', async () => {
    const { el } = await render('head');
    expect(el.querySelector('.slot img')).toBeNull();
    expect(el.querySelector('.slot-label')?.textContent).toContain('Tête');
  });

  it('affiche l’image et le nom de l’objet choisi', async () => {
    const { el } = await render('mainhand', 'MAIN_SWORD');
    expect(el.querySelector<HTMLImageElement>('.slot img')?.src).toContain('T8_MAIN_SWORD.png');
    expect(el.querySelector('.slot-label')?.textContent).toContain('Épée large');
  });

  it('ouvre le panneau avec seulement les objets de l’emplacement', async () => {
    const { el, openPanel } = await render('head');
    await openPanel();
    const results = [...el.querySelectorAll('.result')].map((b) => b.textContent?.trim());
    expect(results).toEqual(['Casque de soldat', "Capuchon d'ecclésiastique"]);
  });

  it('la recherche filtre les résultats', async () => {
    const { fixture, el, openPanel } = await render('head');
    await openPanel();
    const input = el.querySelector<HTMLInputElement>('input.search')!;
    input.value = 'cleric';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelectorAll('.result').length).toBe(1);
  });

  it('cliquer sur un objet l’émet et ferme le panneau', async () => {
    const { fixture, el, emitted, openPanel } = await render('head');
    await openPanel();
    el.querySelector<HTMLButtonElement>('.result')!.click();
    await fixture.whenStable();
    expect(emitted).toEqual(['HEAD_PLATE_SET1']);
    expect(el.querySelector('.panel')).toBeNull();
  });

  it('« Retirer l’objet » émet null', async () => {
    const { fixture, el, emitted, openPanel } = await render('head', 'HEAD_PLATE_SET1');
    await openPanel();
    el.querySelector<HTMLButtonElement>('.clear')!.click();
    await fixture.whenStable();
    expect(emitted).toEqual([null]);
  });

  it('désactivé : la case ne s’ouvre pas', async () => {
    const { el } = await render('offhand', undefined, true);
    expect(el.querySelector<HTMLButtonElement>('button.slot')!.disabled).toBe(true);
  });
});
