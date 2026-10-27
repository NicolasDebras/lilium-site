import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { TEST_ITEMS, TEST_SPELLS } from '../../../testing/items';
import { BuildForm, allTwoHanded, pruneSpells } from './build-form';

/** `edited` : réponse de l'API pour le build ouvert en édition (avec `buildId`). */
async function render(buildId?: string, edited?: object) {
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
  http.expectOne('/api/spells').flush(TEST_SPELLS);
  if (buildId) http.expectOne(`/api/guilds/111/builds/${buildId}`).flush(edited ?? {});
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

describe('pruneSpells', () => {
  it('garde les sorts des objets encore présents (tier ignoré) et ceux des bottes au choix', () => {
    const spells = { MAIN_SWORD: { q: 'CLEAVE' }, HEAD_PLATE_SET1: { a: 'BLOCK' }, '@shoes': { a: 'DODGE' } };
    expect(pruneSpells({ mainhand: ['T8_MAIN_SWORD@1'], shoes: ['*'] }, spells))
      .toEqual({ MAIN_SWORD: { q: 'CLEAVE' }, '@shoes': { a: 'DODGE' } });
    expect(pruneSpells({ shoes: ['SHOES_PLATE_SET1'] }, spells)).toEqual({});
  });
});

describe('BuildForm — sorts & passifs', () => {
  it('une ligne par objet avec sorts + les bottes au choix ; choix, retrait et nettoyage', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setItem('mainhand', ['T8_MAIN_SWORD@1']);
    fixture.detectChanges();
    const rows = cmp['spellRows']();
    expect(rows.map((r) => r.key)).toEqual(['MAIN_SWORD', '@shoes']);
    expect(rows[0].slots.map((s) => s.label)).toEqual(['Q', 'W', 'E', 'Passif']);
    expect(rows[1].slots.map((s) => s.label)).toEqual(['F']);   // actif des bottes = touche F
    expect(el.querySelectorAll('.spell-row').length).toBe(2);

    cmp.setSpell('MAIN_SWORD', 'q', 'CLEAVE');
    cmp.setSpell('@shoes', 'a', 'SPRINT_CD_REDUCTION');
    expect(cmp['model']().spells).toEqual({ MAIN_SWORD: { q: 'CLEAVE' }, '@shoes': { a: 'SPRINT_CD_REDUCTION' } });
    cmp.setSpell('MAIN_SWORD', 'q', '');                 // « au choix » : l'objet sort de `spells`
    expect(cmp['model']().spells).toEqual({ '@shoes': { a: 'SPRINT_CD_REDUCTION' } });

    cmp.setItem('shoes', ['SHOES_PLATE_SET1']);           // bottes précises : plus de sort « au choix »
    expect(cmp['model']().spells).toEqual({});
    expect(cmp['spellRows']().map((r) => r.key)).toEqual(['MAIN_SWORD']);
  });

  it('enregistre les sorts avec le build', async () => {
    const { fixture, cmp, el, http } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'Tank', role: 'HEAL' }));
    cmp.setItem('head', ['HEAD_PLATE_SET1']);
    cmp.setSpell('HEAD_PLATE_SET1', 'a', 'BLOCK');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    const req = http.expectOne('/api/guilds/111/builds');
    expect(req.request.body.spells).toEqual({ HEAD_PLATE_SET1: { a: 'BLOCK' } });
    expect(req.request.body.notes).toBeUndefined();
    req.flush({ id: 1 });
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

  it('swaps : le même objet à un autre tier compte comme un doublon', async () => {
    const { cmp } = await render();
    cmp.setSwap(0, ['T8_MAIN_SWORD@1']);
    cmp.setSwap(1, ['HEAD_PLATE_SET1']);
    cmp.setSwap(1, ['T7_MAIN_SWORD']);       // Épée large déjà en case 1 → déplacée en case 2 avec ce tier
    expect(cmp['model']().items.swaps).toEqual(['T7_MAIN_SWORD']);
  });

  it('deux mains reconnu sur une arme avec tier', async () => {
    const { cmp } = await render();
    cmp.setItem('offhand', ['T8_OFF_SHIELD']);
    cmp.setItem('mainhand', ['T8_2H_HOLYSTAFF@2']);
    expect(cmp['model']().items).toEqual({ mainhand: ['T8_2H_HOLYSTAFF@2'] });
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

  it('formulaire (signal forms) : nom et rôle obligatoires, limites de longueur, saisie dans le modèle', async () => {
    const { fixture, cmp, el } = await render();
    const name = el.querySelector<HTMLInputElement>('#name')!;
    const submit = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(name.required).toBe(true);
    expect(name.maxLength).toBe(100);
    expect(el.querySelector('#notes')).toBeNull();   // champs Notes et Image retirés
    expect(el.querySelector('#image')).toBeNull();
    expect(submit.disabled).toBe(true);

    name.value = '   ';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(submit.disabled).toBe(true);   // que des espaces : refusé

    name.value = 'Heal ZvZ';
    name.dispatchEvent(new Event('input'));
    const role = el.querySelector<HTMLSelectElement>('#role')!;
    role.value = 'HEAL';
    role.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(cmp['model']()).toMatchObject({ name: 'Heal ZvZ', role: 'HEAL' });
    expect(submit.disabled).toBe(false);
  });

  it('en édition : relit l’équipement (et l’ancien format « chaîne »)', async () => {
    const { cmp } = await render('7', {
      id: 7, name: 'Tank', role: 'HEAL', type_acti: 'PVP', weapon: '', spells: {},
      items: { mainhand: 'MAIN_SWORD', head: ['HEAD_PLATE_SET1', 'HEAD_CLOTH_SET2'] }, created_by_name: 'Lily',
    });
    expect(cmp['model']().items).toEqual({ mainhand: ['MAIN_SWORD'], head: ['HEAD_PLATE_SET1', 'HEAD_CLOTH_SET2'] });
  });
});
