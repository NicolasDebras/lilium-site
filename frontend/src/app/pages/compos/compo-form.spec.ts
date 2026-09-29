import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { CompoForm } from './compo-form';

async function render(name?: string) {
  TestBed.configureTestingModule({
    imports: [CompoForm],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), fakeAuth({ levels: { '111': 'staff' } })],
  });
  const fixture = TestBed.createComponent(CompoForm);
  fixture.componentRef.setInput('guildId', '111');
  if (name) fixture.componentRef.setInput('name', name);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/guilds/111/roles').flush([{ name: 'TANK', emoji: '🛡️' }, { name: 'DPS', emoji: '⚔️' }]);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { fixture, http, navigate, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('CompoForm', () => {
  it('démarre avec une ligne en PF1 et aucune en PF2', async () => {
    const { fixture, el } = await render();
    await fixture.whenStable();
    expect(el.querySelectorAll('.slot[data-party="pf1"]').length).toBe(1);
    expect(el.querySelectorAll('.slot[data-party="pf2"]').length).toBe(0);
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
    cmp['model'].set({
      name: 'ZvZ', description: '', type_acti: 'PVP', image: '',
      pf1: [{ role: 'TANK', count: 2, weapon: '' }, { role: '', count: 5, weapon: '' }],
      pf2: [{ role: 'DPS', count: 4, weapon: '' }],
    });
    expect(cmp.total('pf1')).toBe(2);
    expect(cmp.total('pf2')).toBe(4);
  });

  it('crée la compo avec le bon payload puis revient à la liste', async () => {
    const { cmp, http, navigate } = await render();
    const body = {
      name: 'ZvZ', description: 'd', type_acti: 'PVP' as const, image: '',
      pf1: [{ role: 'TANK', count: 2, weapon: 'Masse' }], pf2: [],
    };
    cmp['model'].set(body);
    const done = cmp.save();
    const req = http.expectOne('/api/guilds/111/compos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ name: 'ZvZ' });
    await done;
    expect(navigate).toHaveBeenCalledWith(['/g', '111', 'compos']);
  });

  it('en édition : charge la compo puis fait un PUT sur son nom', async () => {
    const { fixture, cmp, http } = await render('ZvZ');
    http.expectOne('/api/guilds/111/compos/ZvZ').flush({
      name: 'ZvZ', description: '', type_acti: 'PVP', image: '',
      pf1: [{ role: 'TANK', count: 1, weapon: '' }], pf2: [], total: 1, custom: true,
    });
    await fixture.whenStable();
    expect(cmp['model']().pf1[0].role).toBe('TANK');

    const done = cmp.save();
    const req = http.expectOne('/api/guilds/111/compos/ZvZ');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.total).toBeUndefined();
    req.flush({ name: 'ZvZ' });
    await done;
  });

  it('affiche le message d’erreur de l’API', async () => {
    const { fixture, cmp, http, el } = await render();
    cmp['model'].update((m) => ({ ...m, name: 'Donjon Groupe 5' }));
    const done = cmp.save();
    http.expectOne('/api/guilds/111/compos').flush(
      { detail: '« Donjon Groupe 5 » est un template par défaut, choisis un autre nom.' },
      { status: 409, statusText: 'Conflict' },
    );
    await done;
    await fixture.whenStable();
    expect(el.querySelector('.alert')?.textContent).toContain('template par défaut');
  });
});
