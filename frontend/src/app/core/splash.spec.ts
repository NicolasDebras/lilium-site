import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { hideSplash, hideSplashAfterFirstNavigation } from './splash';

describe('écran de démarrage', () => {
  let splash: HTMLElement;

  beforeEach(() => {
    splash = document.createElement('div');
    splash.id = 'splash';
    document.body.appendChild(splash);
  });
  afterEach(() => splash.remove());

  it('reste affiché pendant la navigation, s’efface à la première fin de navigation', () => {
    const events = new Subject<unknown>();
    hideSplashAfterFirstNavigation({ events } as unknown as Router, document);
    events.next(new NavigationStart(1, '/'));
    expect(splash.classList.contains('done')).toBe(false);
    events.next(new NavigationEnd(1, '/', '/'));
    expect(splash.classList.contains('done')).toBe(true);
  });

  it('retiré du DOM après le fondu', () => {
    hideSplash(document);
    splash.dispatchEvent(new Event('transitionend'));
    expect(document.getElementById('splash')).toBeNull();
  });

  it('sans #splash (tests, rechargement à chaud) : rien à faire', () => {
    splash.remove();
    expect(() => hideSplash(document)).not.toThrow();
  });
});
