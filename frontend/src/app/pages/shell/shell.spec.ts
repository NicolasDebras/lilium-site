import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { Level } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Shell } from './shell';

@Component({ template: '' })
class Empty {}

async function render(level: Level, url = '/g/111/builds') {
  TestBed.configureTestingModule({
    imports: [Shell],
    providers: [
      provideRouter([
        { path: 'g/:guildId/:page', component: Empty },
        { path: 'login', component: Empty },
        { path: '', component: Empty },
      ]),
      fakeAuth({ levels: { '111': level } }),
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  await TestBed.inject(Router).navigateByUrl(url);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Shell', () => {
  it('affiche le logo avec la pastille BETA', async () => {
    const { el } = await render('member');
    expect(el.querySelector('app-logo .beta')?.textContent).toBe('BETA');
  });

  it('liens de navigation avec icônes ; Admin seulement pour un admin', async () => {
    const member = await render('member');
    const labels = [...member.el.querySelectorAll('.links a')].map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Builds', 'Compos', 'Ma BAL']);
    expect(member.el.querySelectorAll('.links a app-icon').length).toBe(3);
  });

  it('un admin voit le lien Admin', async () => {
    const { el } = await render('admin');
    expect([...el.querySelectorAll('.links a')].map((a) => a.textContent?.trim())).toContain('Admin');
  });

  it('souligne l’onglet de la page courante', async () => {
    const { el } = await render('member', '/g/111/compos');
    expect(el.querySelector('.links a.active')?.textContent?.trim()).toBe('Compos');
  });

  it('pastille du serveur et menu du compte (ouverture, fermeture au clic dehors, déconnexion)', async () => {
    const { fixture, el } = await render('staff');
    expect(el.querySelector('.guild-pill .guild-name')?.textContent).toBe('Serveur 111');

    el.querySelector<HTMLButtonElement>('.avatar-btn')!.click();
    fixture.detectChanges();
    const menu = el.querySelector('.menu');
    expect(menu?.textContent).toContain('Lily');
    expect(menu?.textContent).toContain('Staff · Serveur 111');

    document.body.click();
    fixture.detectChanges();
    expect(el.querySelector('.menu')).toBeNull();

    el.querySelector<HTMLButtonElement>('.avatar-btn')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.menu .logout')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('menu burger (mobile) : ouvre et referme la liste des liens', async () => {
    const { fixture, el } = await render('member');
    el.querySelector<HTMLButtonElement>('.burger')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.links.open')).not.toBeNull();
    el.querySelector<HTMLElement>('.links')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.links.open')).toBeNull();
  });

  it('affiche les notifications', async () => {
    const { fixture, el } = await render('member');
    TestBed.inject(ToastService).success('Build enregistré.');
    fixture.detectChanges();
    expect(el.querySelector('app-toasts .toast.success')?.textContent).toContain('Build enregistré.');
  });
});
