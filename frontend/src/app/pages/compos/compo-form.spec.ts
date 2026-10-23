import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { TEST_ITEMS } from '../../../testing/items';
import { Build } from '../../core/models';
import { CompoForm } from './compo-form';

const BUILDS: Build[] = [
  { id: 12, name: 'Tank Masse', role: 'TANK', type_acti: 'PVP', weapon: '', notes: '', image: '',
    items: { mainhand: ['MAIN_SWORD'] }, created_by_name: 'Lily' },
  { id: 13, name: 'Tank Bouclier', role: 'TANK', type_acti: 'PVP', weapon: '', notes: '', image: '',
    items: {}, created_by_name: 'Lily' },
  { id: 15, name: 'Heal Sacré', role: 'HEAL', type_acti: 'PVP', weapon: '', notes: '', image: '',
    items: { mainhand: ['2H_HOLYSTAFF'] }, created_by_name: 'Lily' },
];

/** `edited` : réponse de l'API pour la compo ouverte en édition (avec `name`). */
async function render(name?: string, edited?: object) {
  TestBed.configureTestingModule({
    imports: [CompoForm],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), fakeAuth({ levels: { '111': 'staff' } })],
  });
  const fixture = TestBed.createComponent(CompoForm);
  fixture.componentRef.setInput('guildId', '111');
  if (name) fixture.componentRef.setInput('name', name);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/guilds/111/roles').flush([{ name: 'TANK', emoji: '🛡️' }, { name: 'HEAL', emoji: '💚' }]);
  http.expectOne((r) => r.url === '/api/guilds/111/builds').flush(BUILDS);
  http.expectOne('/api/items').flush(TEST_ITEMS);
  if (name) http.expectOne(`/api/guilds/111/compos/${name}`).flush(edited ?? {});
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  await fixture.whenStable();
  return { fixture, http, navigate, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('CompoForm', () => {
  it('démarre avec une ligne en PF1 et aucune en PF2', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('.slot[data-party="pf1"]').length).toBe(1);
    expect(el.querySelectorAll('.slot[data-party="pf2"]').length).toBe(0);
  });

  it('le sélecteur propose les builds groupés par rôle + « sans build »', async () => {
    const { el } = await render();
    const groups = [...el.querySelectorAll('select.source optgroup')].map((g) => g.getAttribute('label'));
    expect(groups).toEqual(['TANK', 'HEAL']);
    expect(el.querySelector('select.source')?.textContent).toContain('Sans build');
  });

  it('choisir un build fixe le rôle et affiche son équipement', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setSource('pf1', 0, '15');
    await fixture.whenStable();
    expect(cmp['model']().pf1[0]).toMatchObject({ build_id: 15, role: 'HEAL', weapon: 'Heal Sacré' });
    expect(el.querySelector('.detail .badge')?.textContent).toContain('HEAL');
    expect(el.querySelector('.detail app-gear img')?.getAttribute('alt')).toBe('Grand bâton béni');
  });

  it('2 tanks avec des builds différents : permis ; un même build deux fois : désactivé', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setSource('pf1', 0, '12');
    cmp.addRow('pf1');
    await fixture.whenStable();
    expect(cmp.isBuildTaken('pf1', 12, 1)).toBe(true);
    expect(cmp.isBuildTaken('pf1', 12, 0)).toBe(false);
    expect(cmp.isBuildTaken('pf2', 12, 0)).toBe(false);
    const options = [...el.querySelectorAll('select.source')[1].querySelectorAll<HTMLOptionElement>('option')];
    expect(options.find((o) => o.value === '12')?.disabled).toBe(true);    // Tank Masse déjà là
    expect(options.find((o) => o.value === '13')?.disabled).toBe(false);   // l'autre tank : OK
  });

  it('les lignes se trient toutes seules par rôle (TANK, HEAL, DPS…)', async () => {
    const { fixture, cmp } = await render();
    cmp.setSource('pf1', 0, '15');   // HEAL
    cmp.addRow('pf1');
    cmp.setSource('pf1', 1, '12');   // TANK → remonte
    cmp.addRow('pf1');
    cmp.setSource('pf1', 2, '13');   // 2e TANK → après le 1er
    cmp.addRow('pf1');               // ligne vide → reste en bas
    await fixture.whenStable();
    expect(cmp['model']().pf1.map((r) => r.build_id)).toEqual([12, 13, 15, null]);
  });

  it('« sans build » affiche les champs rôle + armes', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setSource('pf1', 0, 'free');
    await fixture.whenStable();
    expect(el.querySelector('.free-row select')).not.toBeNull();
    expect(cmp['model']().pf1[0].build_id).toBeNull();
  });

  it('ajoute et retire des lignes PF1 / PF2', async () => {
    const { fixture, cmp, el } = await render();
    cmp.addRow('pf1');
    cmp.addRow('pf2');
    await fixture.whenStable();
    expect(el.querySelectorAll('.slot[data-party="pf1"]').length).toBe(2);
    expect(el.querySelectorAll('.slot[data-party="pf2"]').length).toBe(1);
    cmp.removeRow('pf1', 0);
    await fixture.whenStable();
    expect(el.querySelectorAll('.slot[data-party="pf1"]').length).toBe(1);
  });

  it('calcule le total en ignorant les lignes sans rôle', async () => {
    const { cmp } = await render();
    cmp.setSource('pf1', 0, '12');
    cmp['model'].update((m) => ({ ...m, pf1: [{ ...m.pf1[0], count: 2 }, { build_id: null, role: '', count: 5, weapon: '', share: 1 }] }));
    expect(cmp.total('pf1')).toBe(2);
  });

  it('changer le nombre dans le champ met à jour les totaux affichés', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setSource('pf1', 0, '12');
    fixture.detectChanges();
    const count = el.querySelector<HTMLInputElement>('.slot input.count')!;
    count.value = '3';
    count.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(cmp['model']().pf1[0].count).toBe(3);
    expect(el.querySelector('.preview .badge')?.textContent).toContain('3 joueurs');
    expect(el.querySelector('legend')?.textContent).toContain('3 joueurs');
  });

  it('crée la compo : lignes avec build_id, sans le champ interne « free »', async () => {
    const { cmp, http, navigate } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'ZvZ' }));
    cmp.setSource('pf1', 0, '12');
    cmp.addRow('pf1');
    cmp.setSource('pf1', 1, 'free');
    cmp['model'].update((m) => ({ ...m, pf1: [m.pf1[0], { ...m.pf1[1], role: 'CALLER', weapon: 'Libre' }] }));
    const done = cmp.save();
    const req = http.expectOne('/api/guilds/111/compos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.pf1).toEqual([
      { build_id: 12, role: 'TANK', count: 1, weapon: 'Tank Masse', share: 1 },
      { build_id: null, role: 'CALLER', count: 1, weapon: 'Libre', share: 1 },
    ]);
    expect(req.request.body.custom_shares).toBe(false);
    req.flush({ name: 'ZvZ' });
    await done;
    expect(navigate).toHaveBeenCalledWith(['/g', '111', 'compos']);
  });

  it('parts de paie : la case affiche la colonne « Parts » (1 par défaut) et les envoie', async () => {
    const { fixture, cmp, http, el } = await render();
    expect(el.querySelector('.slot input.share')).toBeNull();
    el.querySelector<HTMLInputElement>('.check input[type="checkbox"]')!.click();
    fixture.detectChanges();
    expect(cmp['model']().custom_shares).toBe(true);
    const share = el.querySelector<HTMLInputElement>('.slot input.share')!;
    expect(share.value).toBe('1');
    expect(el.querySelector('.slot-head')?.textContent).toContain('Parts');
    share.value = '1.1';   // pas de 0,01 (comme l'API) : 1,1 ou 1,25 acceptés par le navigateur
    share.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(share.validity.valid).toBe(true);

    cmp['model'].update((m) => ({ ...m, name: 'ZvZ' }));
    cmp.setSource('pf1', 0, '12');
    const done = cmp.save();
    const req = http.expectOne('/api/guilds/111/compos');
    expect(req.request.body.custom_shares).toBe(true);
    expect(req.request.body.pf1[0]).toMatchObject({ build_id: 12, share: 1.1 });
    req.flush({ name: 'ZvZ' });
    await done;
  });

  it('parts hors bornes : formulaire invalide', async () => {
    const { cmp } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'ZvZ', custom_shares: true, pf1: [{ ...m.pf1[0], share: 11 }] }));
    expect(cmp['form']().invalid()).toBe(true);
  });

  it('en édition : relit les builds des lignes puis fait un PUT', async () => {
    const { cmp, http, el } = await render('ZvZ', {
      name: 'ZvZ', description: '', type_acti: 'PVP', image: '',
      pf1: [{ build_id: 12, role: 'TANK', count: 1, weapon: 'Tank Masse' }, { build_id: null, role: 'CALLER', count: 1, weapon: '' }],
      pf2: [], total: 2, custom: true,
    });
    expect(cmp.sourceOf(cmp['model']().pf1[0])).toBe('12');
    expect(cmp.sourceOf(cmp['model']().pf1[1])).toBe('free');
    expect(el.querySelector('.free-row')).not.toBeNull();
    expect(el.querySelector<HTMLInputElement>('#name')!.disabled).toBe(false);  // renommage permis
    expect(cmp['model']().pf1[0].share).toBe(1);                                 // absent de l'API → 1
    expect(cmp['model']().custom_shares).toBe(false);

    cmp['model'].update((m) => ({ ...m, name: 'ZvZ Soir' }));
    const done = cmp.save();
    const req = http.expectOne('/api/guilds/111/compos/ZvZ');                  // l'ancien nom dans l'URL
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.name).toBe('ZvZ Soir');
    expect(req.request.body.total).toBeUndefined();
    req.flush({ name: 'ZvZ Soir' });
    await done;
  });

  it('affiche le message d’erreur de l’API', async () => {
    const { fixture, cmp, http, el } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'ZvZ' }));
    const done = cmp.save();
    http.expectOne('/api/guilds/111/compos').flush(
      { detail: 'Un seul build par rôle et par party : TANK en double en PF1.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await done;
    await fixture.whenStable();
    expect(el.querySelector('.alert')?.textContent).toContain('TANK en double');
  });

  it("génère l'aperçu de l'image sans enregistrer la compo", async () => {
    const { fixture, cmp, http, el } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'ZvZ' }));
    cmp.setSource('pf1', 0, '12');
    await fixture.whenStable();
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:apercu');
    const button = [...el.querySelectorAll<HTMLButtonElement>('.image-preview button')][0];
    button.click();
    const req = http.expectOne('/api/guilds/111/compos/preview-image');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.pf1[0]).toEqual({ build_id: 12, role: 'TANK', count: 1, weapon: 'Tank Masse', share: 1 });
    expect(req.request.body.pf1[0].free).toBeUndefined();
    req.flush(new Blob(['png'], { type: 'image/png' }));
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(createUrl).toHaveBeenCalled();
    expect(el.querySelector('.image-preview app-image-share img')?.getAttribute('src')).toBe('blob:apercu');
    http.expectNone('/api/guilds/111/compos');   // rien d'enregistré
  });

  it("affiche le message de l'API quand l'aperçu échoue", async () => {
    const { fixture, cmp, http, el } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'ZvZ' }));
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.image-preview button')!.click();
    const body = new Blob([JSON.stringify({ detail: "Aucun rôle de cette compo n'a de build." })], { type: 'application/json' });
    http.expectOne('/api/guilds/111/compos/preview-image').flush(body, { status: 404, statusText: 'Not Found' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();
    expect(el.querySelector('.image-preview .alert')?.textContent).toContain("n'a de build");
  });

});
