import { Router, NavigationCancel, NavigationEnd, NavigationError } from '@angular/router';
import { filter, take } from 'rxjs';

/** Retire l'écran de démarrage d'index.html (#splash) à la fin de la première navigation
 *  (gardes comprises : sinon une page vide suivrait le temps de charger /api/me). */
export function hideSplashAfterFirstNavigation(router: Router, doc: Document): void {
  router.events
    .pipe(
      filter((e) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
      take(1),
    )
    .subscribe(() => hideSplash(doc));
}

export function hideSplash(doc: Document): void {
  const splash = doc.getElementById('splash');
  if (!splash) return;
  splash.classList.add('done');
  // retiré après le fondu (0,45 s) ; sans transition (onglet en arrière-plan), au plus tard 1 s après
  const remove = () => splash.remove();
  splash.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 1000);
}
