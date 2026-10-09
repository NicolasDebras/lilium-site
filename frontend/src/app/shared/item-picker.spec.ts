import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_ITEMS } from '../../testing/items';
import { ItemsService } from '../core/items.service';
import { Slot } from '../core/models';
import { ItemPicker, lastPick } from './item-picker';

async function render(slot: Slot | 'swaps', value: string[] = [], disabled = false) {
  TestBed.configureTestingModule({
    imports: [ItemPicker],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const load = TestBed.inject(ItemsService).load();
  TestBed.inject(HttpTestingController).expectOne('/api/items').flush(TEST_ITEMS);
  await load;

  const fixture = TestBed.createComponent(ItemPicker);
  fixture.componentRef.setInput('slot', slot);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('disabled', disabled);
  const emitted: string[][] = [];
  // Comme dans le formulaire : la valeur émise redevient la valeur affichée.
  fixture.componentInstance.valueChange.subscribe((v) => {
    emitted.push(v);
    fixture.componentRef.setInput('value', v);
  });
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const openPanel = async () => {
    el.querySelector<HTMLButtonElement>('button.slot')!.click();
    await fixture.whenStable();
  };
  const clickResult = async (name: string) => {
    [...el.querySelectorAll<HTMLButtonElement>('.result')].find((b) => b.textContent?.includes(name))!.click();
    await fixture.whenStable();
  };
  return { fixture, el, emitted, openPanel, clickResult };
}

describe('ItemPicker', () => {
  beforeEach(() => lastPick.set({ tier: 8, enchant: 0 }));   // partagé entre les cases : remis à T8.0

  it('case vide : libellé de l’emplacement, pas d’image', async () => {
    const { el } = await render('head');
    expect(el.querySelector('.slot img')).toBeNull();
    expect(el.querySelector('.slot-label')?.textContent).toContain('Tête');
  });

  it('un seul objet : grande image + nom', async () => {
    const { el } = await render('mainhand', ['MAIN_SWORD']);
    expect(el.querySelector<HTMLImageElement>('.slot > img')?.src).toContain('T8_MAIN_SWORD.png');
    expect(el.querySelector('.slot-label')?.textContent).toContain('Épée large');
  });

  it('plusieurs choix : petites images + « A / B »', async () => {
    const { el } = await render('mainhand', ['2H_HOLYSTAFF', '2H_HOLYSTAFF_HELL']);
    expect(el.querySelectorAll('.multi img').length).toBe(2);
    expect(el.querySelector('.slot-label')?.textContent).toContain('Grand bâton béni / Bâton de rédemption');
  });

  it('« au choix du joueur » s’affiche comme tel', async () => {
    const { el } = await render('cape', ['*']);
    expect(el.querySelector('.free')?.textContent).toContain('Au choix');
    expect(el.querySelector('.slot-label')?.textContent).toContain('Au choix du joueur');
  });

  it('le panneau ne montre que les objets de l’emplacement', async () => {
    const { el, openPanel } = await render('head');
    await openPanel();
    const results = [...el.querySelectorAll('.result')].map((b) => b.textContent?.trim());
    expect(results).toEqual(['Casque de soldat', "Capuchon d'ecclésiastique"]);
  });

  it('bouffe et potion ont leurs propres objets', async () => {
    const { el, openPanel } = await render('food');
    await openPanel();
    expect([...el.querySelectorAll('.result')].map((b) => b.textContent?.trim())).toEqual(['Ragoût de bœuf']);
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

  it('cliquer ajoute puis retire un objet, le panneau reste ouvert', async () => {
    const { el, emitted, openPanel, clickResult } = await render('mainhand');
    await openPanel();
    await clickResult('Épée large');
    await clickResult('Grand bâton béni');
    await clickResult('Épée large');
    expect(emitted).toEqual([['T8_MAIN_SWORD'], ['T8_MAIN_SWORD', 'T8_2H_HOLYSTAFF'], ['T8_2H_HOLYSTAFF']]);   // T8.0 par défaut
    expect(el.querySelector('.panel')).not.toBeNull();
  });

  it('3 choix maximum : les autres objets sont désactivés', async () => {
    const { el, openPanel } = await render('mainhand', ['MAIN_SWORD', '2H_HOLYSTAFF', '2H_HOLYSTAFF_HELL']);
    await openPanel();
    const other = [...el.querySelectorAll<HTMLButtonElement>('.result')].find((b) => b.textContent?.includes('Bâton béni') && !b.textContent?.includes('Grand'))!;
    expect(other.disabled).toBe(true);
    expect(el.querySelector('.count')?.textContent).toContain('3/3');
  });

  it('« Au choix du joueur » remplace la sélection et ferme', async () => {
    const { el, emitted, openPanel } = await render('mainhand', ['MAIN_SWORD']);
    await openPanel();
    el.querySelector<HTMLButtonElement>('.free-btn')!.click();
    expect(emitted).toEqual([['*']]);
  });

  it('choisir un objet après « au choix » repart de zéro', async () => {
    const { emitted, openPanel, clickResult } = await render('mainhand', ['*']);
    await openPanel();
    await clickResult('Épée large');
    expect(emitted).toEqual([['T8_MAIN_SWORD']]);
  });

  it('« Vider la case » émet une liste vide', async () => {
    const { fixture, el, emitted, openPanel } = await render('head', ['HEAD_PLATE_SET1']);
    await openPanel();
    el.querySelector<HTMLButtonElement>('.clear')!.click();
    await fixture.whenStable();
    expect(emitted).toEqual([[]]);
  });

  it('désactivé : la case ne s’ouvre pas', async () => {
    const { el } = await render('offhand', [], true);
    expect(el.querySelector<HTMLButtonElement>('button.slot')!.disabled).toBe(true);
  });

  it('swaps : tous les emplacements, jusqu’à 6, sans « au choix »', async () => {
    const { el, openPanel, clickResult, emitted } = await render('swaps');
    await openPanel();
    const results = [...el.querySelectorAll('.result')].map((b) => b.textContent?.trim());
    expect(results).toContain('Casque de soldat');
    expect(results.length).toBeGreaterThan(2);
    expect(el.textContent).not.toContain('Au choix du joueur');
    expect(el.querySelector('.panel h3')?.textContent).toContain('Swaps');
    expect(el.querySelector('.panel .count')?.textContent?.trim()).toBe('0/6');
    await clickResult('Casque de soldat');
    expect(emitted.at(-1)?.length).toBe(1);
  });

  it('case à un objet (limit=1) : libellé « Swap », un autre objet remplace le premier', async () => {
    const { fixture, el, openPanel, clickResult, emitted } = await render('swaps', ['MAIN_SWORD']);
    fixture.componentRef.setInput('limit', 1);
    fixture.componentRef.setInput('placeholder', 'Swap');
    await fixture.whenStable();
    await openPanel();
    expect(el.querySelector('.panel .count')?.textContent?.trim()).toBe('1/1');
    await clickResult('Casque de soldat');
    expect(emitted).toEqual([['T8_HEAD_PLATE_SET1']]);
    expect(el.querySelector('.panel')).not.toBeNull();   // reste ouvert pour régler le tier
    fixture.componentRef.setInput('value', []);
    await fixture.whenStable();
    expect(el.querySelector('.slot-label')?.textContent?.trim()).toBe('Swap');
  });

  describe('tier et enchantement', () => {
    function select(el: HTMLElement, cls: 'tier' | 'ench', index = 0) {
      return el.querySelectorAll<HTMLSelectElement>(`.selection select.${cls}`)[index];
    }
    async function choose(fixture: { whenStable(): Promise<unknown> }, sel: HTMLSelectElement, value: string) {
      sel.value = value;
      sel.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    }
    const options = (sel: HTMLSelectElement) => [...sel.options].map((o) => o.textContent?.trim());

    it('case remplie : icône du tier, pastille « 8.1 » et libellé « Épée large 8.1 »', async () => {
      const { el } = await render('mainhand', ['T8_MAIN_SWORD@1']);
      expect(el.querySelector<HTMLImageElement>('.slot > img')?.src).toContain('T8_MAIN_SWORD@1.png');
      expect(el.querySelector('.slot app-tier-badge')?.textContent?.trim()).toBe('8.1');
      expect(el.querySelector('.slot-label')?.textContent).toContain('Épée large 8.1');
    });

    it('changer tier puis enchantement remplace le choix ; le prochain clic reprend ce réglage', async () => {
      const { fixture, el, emitted, openPanel, clickResult } = await render('mainhand', ['T8_MAIN_SWORD']);
      await openPanel();
      expect(options(select(el, 'tier'))).toEqual(['Tier libre', 'T6', 'T7', 'T8']);
      await choose(fixture, select(el, 'tier'), '7');
      await choose(fixture, select(el, 'ench'), '2');
      await clickResult('Grand bâton béni');
      expect(emitted).toEqual([['T7_MAIN_SWORD'], ['T7_MAIN_SWORD@2'], ['T7_MAIN_SWORD@2', 'T7_2H_HOLYSTAFF@2']]);
      expect(el.querySelector('.tiers-hint')?.textContent).toContain('8.1 = 7.2 = 6.3');
    });

    it('« Tier libre » : id nu (ancien format), enchantement désactivé', async () => {
      const { fixture, el, emitted, openPanel } = await render('mainhand', ['T8_MAIN_SWORD@3']);
      await openPanel();
      await choose(fixture, select(el, 'tier'), '');
      expect(emitted).toEqual([['MAIN_SWORD']]);
      expect(select(el, 'ench').disabled).toBe(true);
    });

    it('un choix sans tier (ancien build) est bien reconnu comme sélectionné', async () => {
      const { el, emitted, openPanel, clickResult } = await render('mainhand', ['MAIN_SWORD']);
      await openPanel();
      expect(el.querySelector('.result.selected')?.textContent).toContain('Épée large');
      await clickResult('Épée large');
      expect(emitted).toEqual([[]]);
    });

    it('bouffe : seulement les tiers qui existent (T6, T8) et enchantement .3 max', async () => {
      const { el, openPanel } = await render('food', ['T8_MEAL_STEW']);
      await openPanel();
      expect(options(select(el, 'tier'))).toEqual(['Tier libre', 'T6', 'T8']);
      expect(options(select(el, 'ench'))).toEqual(['.0', '.1', '.2', '.3']);
    });

    it('objet sans le tier par défaut : ramené au plus haut possible (potion T6)', async () => {
      const { emitted, openPanel, clickResult } = await render('potion');
      await openPanel();
      await clickResult('Potion de soin');
      expect(emitted).toEqual([['T6_POTION_HEAL']]);
    });

    it('retirer depuis la sélection', async () => {
      const { el, emitted, openPanel } = await render('mainhand', ['T8_MAIN_SWORD', 'T7_2H_HOLYSTAFF@1']);
      await openPanel();
      el.querySelector<HTMLButtonElement>('.selection .remove')!.click();
      expect(emitted).toEqual([['T7_2H_HOLYSTAFF@1']]);
    });
  });
});
