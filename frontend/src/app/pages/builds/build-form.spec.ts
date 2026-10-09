import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { TEST_ITEMS } from '../../../testing/items';
import { BuildForm, allTwoHanded } from './build-form';

async function render(buildId?: string) {
  TestBed.configureTestingModule({
    imports: [BuildForm],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(BuildForm);
  fixture.componentRef.setInput('guildId', '111');
  if (buildId) fixture.componentRef.setInput('buildId', buildId);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/guilds/111/roles').flush([{ name: 'HEAL', emoji: '💚' }]);
  http.expectOne('/api/items').flush(TEST_ITEMS);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  await fixture.whenStable();
  return { fixture, http, navigate, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

const byId = new Map(TEST_ITEMS.map((i) => [i.id, i]));
const get = (id: string) => byId.get(id);

describe('allTwoHanded', () => {
  it('vrai seulement si toutes les armes proposées sont à deux mains', () => {
    expect(allTwoHanded(['2H_HOLYSTAFF'], get)).toBe(true);
    expect(allTwoHanded(['2H_HOLYSTAFF', '2H_HOLYSTAFF_HELL'], get)).toBe(true);
    expect(allTwoHanded(['2H_HOLYSTAFF', 'MAIN_HOLYSTAFF'], get)).toBe(false);
    expect(allTwoHanded(['*'], get)).toBe(false);
    expect(allTwoHanded([], get)).toBe(false);
  });
});

describe('BuildForm — équipement', () => {
  function offhandButton(el: HTMLElement) {
    return [...el.querySelectorAll<HTMLButtonElement>('button.slot')].find((b) =>
      b.getAttribute('aria-label')?.startsWith('Main gauche'),
    );
  }

  it('affiche les 8 cases (dont bouffe et potion) + 6 cases Swap sous l’équipement', async () => {
    const { el } = await render();
    const labels = [...el.querySelectorAll('.doll button.slot')].map((b) => b.getAttribute('aria-label')?.split(' :')[0]);
    expect(labels.length).toBe(8);
    expect(labels).toContain('Bouffe');
    expect(labels).toContain('Potion');
    const swaps = el.querySelectorAll('.swaps-row button.slot');
    expect(swaps.length).toBe(6);
    expect(swaps[0].getAttribute('aria-label')).toContain('Swaps');
    expect(el.querySelector('.swaps-row .slot-label')?.textContent?.trim()).toBe('Swap');
  });

  it('swaps : une case par objet, tassés à gauche, sans doublon', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setSwap(3, ['MAIN_SWORD']);           // case vide lointaine → ajouté à la suite
    cmp.setSwap(1, ['HEAD_PLATE_SET1']);
    expect(cmp['model']().items.swaps).toEqual(['MAIN_SWORD', 'HEAD_PLATE_SET1']);
    cmp.setSwap(0, ['MEAL_STEW']);            // remplace la 1re case
    expect(cmp['model']().items.swaps).toEqual(['MEAL_STEW', 'HEAD_PLATE_SET1']);
    cmp.setSwap(0, ['HEAD_PLATE_SET1']);      // déjà en case 2 → déplacé
    expect(cmp['model']().items.swaps).toEqual(['HEAD_PLATE_SET1']);
    cmp.setSwap(1, ['MAIN_SWORD']);
    await fixture.whenStable();
    expect(el.querySelectorAll('.swaps-row .slot.filled').length).toBe(2);
    cmp.setSwap(0, []);                       // vider resserre la liste
    expect(cmp['model']().items.swaps).toEqual(['MAIN_SWORD']);
    cmp.setSwap(0, []);
    expect(cmp['model']().items).toEqual({});
  });

  it('armes toutes à deux mains : la main gauche est vidée et bloquée', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setItem('offhand', ['OFF_SHIELD']);
    cmp.setItem('mainhand', ['2H_HOLYSTAFF', '2H_HOLYSTAFF_HELL']);
    await fixture.whenStable();
    expect(cmp['model']().items).toEqual({ mainhand: ['2H_HOLYSTAFF', '2H_HOLYSTAFF_HELL'] });
    expect(offhandButton(el)?.disabled).toBe(true);
  });

  it('une arme à une main dans les choix : la main gauche reste possible', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setItem('offhand', ['OFF_SHIELD']);
    cmp.setItem('mainhand', ['2H_HOLYSTAFF', 'MAIN_HOLYSTAFF']);
    await fixture.whenStable();
    expect(cmp['model']().items.offhand).toEqual(['OFF_SHIELD']);
    expect(offhandButton(el)?.disabled).toBe(false);
  });

  it('vider une case l’enlève du build', async () => {
    const { cmp } = await render();
    cmp.setItem('head', ['HEAD_PLATE_SET1']);
    cmp.setItem('head', []);
    expect(cmp['model']().items).toEqual({});
  });

  it('envoie les choix multiples, « au choix » et la bouffe dans le POST', async () => {
    const { cmp, http, navigate } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'Heal', role: 'HEAL' }));
    cmp.setItem('mainhand', ['2H_HOLYSTAFF', 'MAIN_HOLYSTAFF']);
    cmp.setItem('cape', ['*']);
    cmp.setItem('food', ['MEAL_STEW']);
    const done = cmp.save();
    const req = http.expectOne('/api/guilds/111/builds');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.items).toEqual({ mainhand: ['2H_HOLYSTAFF', 'MAIN_HOLYSTAFF'], cape: ['*'], food: ['MEAL_STEW'] });
    req.flush({ id: 1 });
    await done;
    expect(navigate).toHaveBeenCalledWith(['/g', '111', 'builds']);
  });

  it('en édition : relit l’équipement (et l’ancien format « chaîne »)', async () => {
    const { fixture, cmp, http } = await render('7');
    http.expectOne('/api/guilds/111/builds/7').flush({
      id: 7, name: 'Tank', role: 'HEAL', type_acti: 'PVP', weapon: '', notes: '', image: '',
      items: { mainhand: 'MAIN_SWORD', head: ['HEAD_PLATE_SET1', 'HEAD_CLOTH_SET2'] }, created_by_name: 'Lily',
    });
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(cmp['model']().items).toEqual({ mainhand: ['MAIN_SWORD'], head: ['HEAD_PLATE_SET1', 'HEAD_CLOTH_SET2'] });
  });
});
