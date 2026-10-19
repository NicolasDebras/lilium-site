import { Component, inject } from '@angular/core';

import { I18nService, LANGS } from '../core/i18n/i18n';

/** Sélecteur FR | EN (barre du haut et pages publiques). Le choix est mémorisé. */
@Component({
  selector: 'app-lang-switch',
  template: `
    <div class="segmented" role="group" [attr.aria-label]="i18n.t().lang.label">
      @for (l of langs; track l) {
        <button type="button" [class.on]="i18n.lang() === l" [attr.aria-pressed]="i18n.lang() === l"
                [attr.lang]="l" [title]="i18n.t().lang[l]" (click)="i18n.set(l)">{{ l.toUpperCase() }}</button>
      }
    </div>
  `,
  styles: `
    .segmented button { padding: 4px 9px; font-size: .75rem; font-weight: 700; letter-spacing: .03em; }
  `,
})
export class LangSwitch {
  protected readonly i18n = inject(I18nService);
  protected readonly langs = LANGS;
}
