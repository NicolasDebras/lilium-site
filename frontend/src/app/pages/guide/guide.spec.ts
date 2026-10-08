import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { COMMANDS, TUTORIAL } from './guide-content';
import { GuidePage, fold, matches } from './guide';

describe('GuidePage', () => {
  beforeEach(() => localStorage.clear());

  function render() {
    TestBed.configureTestingModule({
      imports: [GuidePage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), fakeAuth({ me: null })],
    });
    const f = TestBed.createComponent(GuidePage);
    f.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/public/info').flush({ invite_url: 'https://discord.com/oauth2/authorize?x' });
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('recherche sans accents ni majuscules, tous les mots', () => {
    expect(fold('Équipe')).toBe('equipe');
    expect(matches('ROLE staff', 'Rôle staff du site')).toBe(true);
    expect(matches('role admin', 'Rôle staff du site')).toBe(false);
  });

  it('affiche le tuto pas à pas avec le bouton d’invitation et la connexion', () => {
    const { el } = render();
    expect(el.querySelectorAll('#tuto .step').length).toBe(TUTORIAL.length);
    expect(el.querySelector('#inviter a')?.getAttribute('href')).toContain('discord.com/oauth2/authorize');
    expect(el.querySelector('#connexion button')?.textContent).toContain('Se connecter');
  });

  it('cocher une étape la mémorise dans le navigateur', () => {
    const { f, el } = render();
    (el.querySelector('#register input[type=checkbox]') as HTMLInputElement).click();
    f.detectChanges();
    expect(el.querySelector('#tuto p.muted')?.textContent).toContain(`1 / ${TUTORIAL.length}`);
    expect(JSON.parse(localStorage.getItem('lilium.guide.done')!)).toEqual(['register']);
  });

  it('chaque commande a une ancre partageable, la recherche filtre', () => {
    const { f, el } = render();
    expect(el.querySelectorAll('#commandes tbody tr').length).toBe(COMMANDS.length);
    expect(el.querySelector('tr#transferbal')).not.toBeNull();
    const input = el.querySelector('#guide-search') as HTMLInputElement;
    input.value = 'transferbal';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(el.querySelectorAll('#commandes tbody tr').length).toBe(1);
    expect(el.querySelector('#tuto')).toBeNull();
  });

  it('noms de commandes uniques', () => {
    expect(new Set(COMMANDS.map((c) => c.name)).size).toBe(COMMANDS.length);
  });
});
