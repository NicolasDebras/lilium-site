import { Component, inject, input, linkedSignal } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

/** Image générée par l'API (quelques secondes : icônes à télécharger puis dessin) : loader
 *  « Génération de l'image… » tant qu'elle n'est pas arrivée, puis l'image en fondu. */
@Component({
  selector: 'app-loading-image',
  template: `
    @if (state() === 'loading') {
      <div class="loader" role="status" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <span class="muted">{{ t().imageShare.loading }}</span>
      </div>
    } @else if (state() === 'error') {
      <p class="alert">{{ t().imageShare.loadFailed }}</p>
    }
    <img [src]="src()" [alt]="alt()" [class.ready]="state() === 'ready'"
         (load)="state.set('ready')" (error)="state.set('error')" />
  `,
  styles: `
    :host { display: grid; position: relative; border-radius: var(--radius-sm); background: var(--surface-2);
            min-height: 160px; overflow: hidden; }
    img { width: 100%; display: block; opacity: 0; transition: opacity .25s; }
    img.ready { opacity: 1; }
    .loader, .alert { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center;
                      gap: 10px; margin: 0; font-size: .85rem; text-align: center; }
    .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--lilac-soft);
               border-top-color: var(--lilac); animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
  `,
})
export class LoadingImage {
  protected readonly t = inject(I18nService).t;
  readonly src = input.required<string>();
  readonly alt = input('');
  /** Repart en « loading » à chaque nouvelle adresse (autre build, aperçu régénéré…). */
  protected readonly state = linkedSignal<string, 'loading' | 'ready' | 'error'>({
    source: () => this.src(),
    computation: () => 'loading',
  });
}
