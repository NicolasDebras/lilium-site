import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { TEST_ITEMS } from '../../../testing/items';
import { BuildForm } from './build-form';

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

describe('BuildForm — équipement', () => {
  it('affiche les 6 cases d’équipement', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('app-item-picker').length).toBe(6);
  });

  it('choisir une arme à deux mains retire la main gauche et bloque la case', async () => {
    const { fixture, cmp, el } = await render();
    cmp.setItem('offhand', 'OFF_SHIELD');
    cmp.setItem('mainhand', '2H_HOLYSTAFF');
    await fixture.whenStable();
    expect(cmp['model']().items).toEqual({ mainhand: '2H_HOLYSTAFF' });
    expect(cmp.twoHanded()).toBe(true);
    const offhand = [...el.querySelectorAll<HTMLButtonElement>('button.slot')].find((b) =>
      b.getAttribute('aria-label')?.startsWith('Main gauche'),
    );
    expect(offhand?.disabled).toBe(true);
  });

  it('une arme à une main garde la main gauche', async () => {
    const { cmp } = await render();
    cmp.setItem('offhand', 'OFF_SHIELD');
    cmp.setItem('mainhand', 'MAIN_SWORD');
    expect(cmp['model']().items).toEqual({ offhand: 'OFF_SHIELD', mainhand: 'MAIN_SWORD' });
    expect(cmp.twoHanded()).toBe(false);
  });

  it('retirer un objet l’enlève du build', async () => {
    const { cmp } = await render();
    cmp.setItem('head', 'HEAD_PLATE_SET1');
    cmp.setItem('head', null);
    expect(cmp['model']().items).toEqual({});
  });

  it('envoie l’équipement dans le POST', async () => {
    const { cmp, http, navigate } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'Heal', role: 'HEAL' }));
    cmp.setItem('mainhand', '2H_HOLYSTAFF');
    cmp.setItem('head', 'HEAD_CLOTH_SET2');
    const done = cmp.save();
    const req = http.expectOne('/api/guilds/111/builds');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.items).toEqual({ mainhand: '2H_HOLYSTAFF', head: 'HEAD_CLOTH_SET2' });
    req.flush({ id: 1 });
    await done;
    expect(navigate).toHaveBeenCalledWith(['/g', '111', 'builds']);
  });

  it('en édition : recharge l’équipement du build', async () => {
    const { fixture, cmp, http } = await render('7');
    http.expectOne('/api/guilds/111/builds/7').flush({
      id: 7, name: 'Tank', role: 'HEAL', type_acti: 'PVP', weapon: '', notes: '', image: '',
      items: { mainhand: 'MAIN_SWORD' }, created_by_name: 'Lily',
    });
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(cmp['model']().items).toEqual({ mainhand: 'MAIN_SWORD' });
  });
});
