import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../../../testing/fake-auth';
import { LandingPage } from './landing';

describe('LandingPage (accueil public)', () => {
  async function render(loggedIn: boolean, error?: string) {
    TestBed.configureTestingModule({
      imports: [LandingPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
                  loggedIn ? fakeAuth({ levels: { '111': 'member' } }) : fakeAuth({ me: null })],
    });
    const f = TestBed.createComponent(LandingPage);
    if (error) f.componentRef.setInput('error', error);
    f.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/public/info').flush({ invite_url: 'https://discord.com/oauth2/authorize?client_id=1' });
    http.expectOne((r) => r.url === '/api/public/compos').flush({
      items: [{ id: 1, name: 'ZvZ', description: '', type_acti: 'PVP', image: '', author_name: 'x', created_at: '',
                imports: 2, total: 5, builds: 1, pf1: [], pf2: [] }], total: 1, page: 1, page_size: 12,
    });
    await new Promise((resolve) => setTimeout(resolve));
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('déconnecté : bouton d’invitation du bot, connexion, guide et modèles', async () => {
    const el = await render(false);
    expect(el.querySelector('a.btn-primary')?.getAttribute('href')).toContain('discord.com/oauth2/authorize');
    expect(el.textContent).toContain('Se connecter');
    expect(el.querySelector('a[href="/guide"]')).not.toBeNull();
    expect(el.textContent).toContain('ZvZ');
  });

  it('connecté : « Mes serveurs » à la place de la connexion', async () => {
    const el = await render(true);
    expect(el.textContent).toContain('Mes serveurs');
    expect(el.textContent).not.toContain('Se connecter');
  });

  it('affiche l’échec de connexion Discord (?error=1)', async () => {
    const el = await render(false, '1');
    expect(el.querySelector('.alert')?.textContent).toContain('échoué');
  });
});
