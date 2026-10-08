import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { COMMANDS, TUTORIAL, commandAudience } from './guide-content';
import { GuidePage, anchorOf, fold, matches } from './guide';
import { highlight } from './highlight';

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
    const el = f.nativeElement as HTMLElement;
    const search = (q: string) => {
      const input = el.querySelector('#guide-search') as HTMLInputElement;
      input.value = q;
      input.dispatchEvent(new Event('input'));
      f.detectChanges();
    };
    const chip = (label: string) => {
      [...el.querySelectorAll<HTMLButtonElement>('.audiences .chip')].find((b) => b.textContent?.trim() === label)!.click();
      f.detectChanges();
    };
    return { f, el, search, chip };
  }

  it('recherche sans accents ni majuscules, tous les mots', () => {
    expect(fold('Équipe')).toBe('equipe');
    expect(matches('ROLE staff', 'Rôle staff du site')).toBe(true);
    expect(matches('role admin', 'Rôle staff du site')).toBe(false);
  });

  it('surlignage : accents ignorés, plusieurs mots, positions exactes', () => {
    expect(highlight('Rôle staff', 'role')).toEqual([{ text: 'Rôle', hit: true }, { text: ' staff', hit: false }]);
    expect(highlight('a b a', 'a').filter((s) => s.hit).length).toBe(2);
    expect(highlight('texte', '')).toEqual([{ text: 'texte', hit: false }]);
  });

  it('public des commandes', () => {
    expect(commandAudience('Membre')).toBe('joueur');
    expect(commandAudience('Recruteur, Officier')).toBe('staff');
    expect(commandAudience('Admin serveur, Maitre de guilde')).toBe('admin');
  });

  it('affiche le tuto pas à pas avec le bouton d’invitation et la connexion', () => {
    const { el } = render();
    expect(el.querySelectorAll('#tuto .step').length).toBe(TUTORIAL.length);
    expect(el.querySelector('#inviter a')?.getAttribute('href')).toContain('discord.com/oauth2/authorize');
    expect(el.querySelector('#connexion button')?.textContent).toContain('Se connecter');
  });

  it('cocher une étape la mémorise et fait avancer la barre', () => {
    const { f, el } = render();
    (el.querySelector('#register input[type=checkbox]') as HTMLInputElement).click();
    f.detectChanges();
    expect(el.querySelector('#tuto p.small')?.textContent).toContain(`1 / ${TUTORIAL.length}`);
    expect(JSON.parse(localStorage.getItem('lilium.guide.done')!)).toEqual(['register']);
  });

  it('chaque commande a une ancre partageable ; la recherche filtre et surligne', () => {
    const { el, search } = render();
    expect(el.querySelectorAll('#commandes .cmd').length).toBe(COMMANDS.length);
    expect(el.querySelector('#transferbal')).not.toBeNull();
    expect(el.querySelector(`#${anchorOf('webadmin add')}`)?.textContent).toContain('/webadmin add @membre');
    search('transferbal');
    expect(el.querySelectorAll('#commandes .cmd').length).toBe(1);
    expect(el.querySelector('#commandes mark')?.textContent?.toLowerCase()).toBe('transferbal');
    expect(el.querySelector('#tuto')).toBeNull();
    expect(el.querySelector('.toc nav .count')?.textContent).toBe('1');
  });

  it('filtre par public : Joueur cache le tuto (admin) et les commandes d’officier', () => {
    const { el, chip } = render();
    chip('Joueur');
    expect(el.querySelector('#tuto')).toBeNull();
    expect(el.querySelector('#monbal')).not.toBeNull();
    expect(el.querySelector('#addbal')).toBeNull();
    chip('Admin');
    expect(el.querySelector('#tuto')).not.toBeNull();
    expect(el.querySelector(`#${anchorOf('webadmin add')}`)).not.toBeNull();
  });

  it('rien ne correspond : message et bouton « Tout afficher »', () => {
    const { f, el, search } = render();
    search('zzzzz');
    expect(el.querySelector('.empty')?.textContent).toContain('Rien ne correspond');
    (el.querySelector('.empty button') as HTMLButtonElement).click();
    f.detectChanges();
    expect(el.querySelectorAll('#commandes .cmd').length).toBe(COMMANDS.length);
  });

  it('noms de commandes uniques', () => {
    expect(new Set(COMMANDS.map((c) => c.name)).size).toBe(COMMANDS.length);
  });
});
