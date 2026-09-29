import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { Me } from './models';

const ME: Me = {
  user: { id: '1', username: 'Lily', avatar_url: 'a.png' },
  guilds: [
    { id: '111', name: 'Lilium', icon: null, level: 'admin' },
    { id: '222', name: 'Autre', icon: null, level: 'member' },
  ],
};

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('charge /api/me et expose user, guildes et niveaux', async () => {
    const promise = auth.load();
    http.expectOne('/api/me').flush(ME);
    expect(await promise).toEqual(ME);
    expect(auth.user()?.username).toBe('Lily');
    expect(auth.guilds().length).toBe(2);
    expect(auth.levelFor('111')).toBe('admin');
    expect(auth.levelFor('222')).toBe('member');
    expect(auth.levelFor('999')).toBe('none');
  });

  it('401 = pas connecté (null), sans erreur', async () => {
    const promise = auth.load();
    http.expectOne('/api/me').flush({ detail: 'Connexion requise.' }, { status: 401, statusText: 'Unauthorized' });
    expect(await promise).toBeNull();
    expect(auth.loaded()).toBe(true);
    expect(auth.user()).toBeNull();
  });

  it('ne refait pas la requête une fois chargé, et partage une requête en cours', async () => {
    const a = auth.load();
    const b = auth.load();
    http.expectOne('/api/me').flush(ME);
    await Promise.all([a, b]);
    await auth.load();
    http.expectNone('/api/me');
  });

  it('load(true) force le rechargement', async () => {
    const first = auth.load();
    http.expectOne('/api/me').flush(ME);
    await first;
    const again = auth.load(true);
    http.expectOne('/api/me').flush({ ...ME, guilds: [] });
    await again;
    expect(auth.guilds()).toEqual([]);
  });

  it('logout appelle l’API et oublie l’utilisateur', async () => {
    const first = auth.load();
    http.expectOne('/api/me').flush(ME);
    await first;

    const out = auth.logout();
    const req = http.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await out;
    expect(auth.user()).toBeNull();
  });
});
