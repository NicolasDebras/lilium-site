import { Component, DOCUMENT, DestroyRef, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { hideSplashAfterFirstNavigation } from './core/splash';
import { trackSpotlight } from './core/spotlight';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  constructor() {
    const doc = inject(DOCUMENT);
    hideSplashAfterFirstNavigation(inject(Router), doc);
    inject(DestroyRef).onDestroy(trackSpotlight(doc));
  }
}
