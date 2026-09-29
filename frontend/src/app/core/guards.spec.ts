import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';

import { fakeAuth } from '../../testing/fake-auth';
import { authGuard, levelGuard } from './guards';
import { Level } from './models';

function routeFor(guildId: string | null): ActivatedRouteSnapshot {
  return {
    paramMap: convertToParamMap(guildId ? { guildId } : {}),
    parent: null,
  } as unknown as ActivatedRouteSnapshot;
}

async function run(guard: ReturnType<typeof levelGuard>, route: ActivatedRouteSnapshot) {
  return TestBed.runInInjectionContext(() => guard(route, {} as RouterStateSnapshot));
}

function url(result: unknown): string {
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

function setup(options: Parameters<typeof fakeAuth>[0]) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), fakeAuth(options)] });
}

describe('authGuard', () => {
  it('laisse passer un utilisateur connecté', async () => {
    setup({});
    expect(await run(authGuard, routeFor(null))).toBe(true);
  });

  it('redirige vers /login sinon', async () => {
    setup({ me: null });
    expect(url(await run(authGuard, routeFor(null)))).toBe('/login');
  });
});

describe('levelGuard', () => {
  const levels: Record<string, Level> = { '111': 'staff', '222': 'member', '333': 'admin' };

  it('staff requis : ok pour staff et admin', async () => {
    setup({ levels });
    expect(await run(levelGuard('staff'), routeFor('111'))).toBe(true);
    expect(await run(levelGuard('staff'), routeFor('333'))).toBe(true);
  });

  it('staff requis : un membre est renvoyé vers les builds du serveur', async () => {
    setup({ levels });
    expect(url(await run(levelGuard('staff'), routeFor('222')))).toBe('/g/222/builds');
  });

  it('admin requis : le staff est refusé', async () => {
    setup({ levels });
    expect(url(await run(levelGuard('admin'), routeFor('111')))).toBe('/g/111/builds');
    expect(await run(levelGuard('admin'), routeFor('333'))).toBe(true);
  });

  it('serveur inconnu → accueil', async () => {
    setup({ levels });
    expect(url(await run(levelGuard('member'), routeFor('999')))).toBe('/');
  });

  it('lit :guildId sur une route parente', async () => {
    setup({ levels });
    const child = { paramMap: convertToParamMap({}), parent: routeFor('333') } as unknown as ActivatedRouteSnapshot;
    expect(await run(levelGuard('admin'), child)).toBe(true);
  });

  it('non connecté → /login', async () => {
    setup({ me: null });
    expect(url(await run(levelGuard('member'), routeFor('111')))).toBe('/login');
  });
});
