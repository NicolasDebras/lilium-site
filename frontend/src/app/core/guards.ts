import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { Level, hasLevel } from './models';

/** Connecté ? Sinon → /login. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.load();
  return me ? true : router.createUrlTree(['/accueil']);
};

function guildIdOf(route: ActivatedRouteSnapshot): string | null {
  for (let r: ActivatedRouteSnapshot | null = route; r; r = r.parent) {
    const id = r.paramMap.get('guildId');
    if (id) return id;
  }
  return null;
}

/**
 * Niveau minimum requis sur le serveur de l'URL (/g/:guildId/...).
 * Pas membre → liste des serveurs ; membre sans le niveau → page builds du serveur.
 */
export function levelGuard(minimum: Level): CanActivateFn {
  return async (route) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const me = await auth.load();
    if (!me) return router.createUrlTree(['/accueil']);

    const guildId = guildIdOf(route);
    const level = auth.levelFor(guildId);
    if (hasLevel(level, minimum)) return true;
    if (hasLevel(level, 'member')) return router.createUrlTree(['/g', guildId, 'builds']);
    return router.createUrlTree(['/']);
  };
}
