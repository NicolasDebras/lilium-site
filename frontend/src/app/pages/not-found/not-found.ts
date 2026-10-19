import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService, dict } from '../../core/i18n/i18n';
import { Icon } from '../../shared/icon';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';

/** 404 : URL inconnue (remplace l'ancienne redirection silencieuse vers l'accueil). */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, Icon, LangSwitch, Logo],
  template: `
    <div class="page">
      <div class="top">
        <a routerLink="/" class="logo-link" [attr.aria-label]="t().shell.home"><app-logo /></a>
        <app-lang-switch />
      </div>
      <section class="lost fade-up">
        <svg class="map" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 6" />
          <path d="M60 18 74 60 60 102 46 60Z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2" />
          <path d="M60 18 74 60H46Z" fill="currentColor" />
          <circle cx="60" cy="60" r="5" fill="var(--bg)" stroke="currentColor" stroke-width="2" />
        </svg>
        <p class="code gradient-text">404</p>
        <h1>{{ t().notFound.title }}</h1>
        <p class="joke">{{ t().notFound.quote(t().notFound.jokes[joke()]) }}</p>
        <div class="row actions">
          <a routerLink="/" class="btn btn-primary"><app-icon name="compass" /> {{ t().notFound.home }}</a>
          <button type="button" class="btn" (click)="another()"><app-icon name="sparkles" /> {{ t().notFound.another }}</button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .page { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; padding: 18px var(--gutter); }
    .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .logo-link:hover { text-decoration: none; }
    .lost { align-self: center; justify-self: center; max-width: 560px; display: grid; justify-items: center;
            text-align: center; gap: 10px; padding: 24px 0 60px; }
    .map { width: 110px; height: 110px; color: var(--lilac); animation: spin 18s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .code { margin: 0; font-size: clamp(5rem, 18vw, 8.5rem); font-weight: 800; line-height: .95; letter-spacing: -.05em; }
    h1 { margin: 0; }
    .joke { margin: 6px 0 14px; font-size: 1.1rem; color: var(--text-muted); font-style: italic; }
    .actions { justify-content: center; }
  `,
})
export class NotFoundPage {
  protected readonly t = inject(I18nService).t;
  /** Index de la blague : elle reste la même quand on change de langue. */
  protected readonly joke = signal(pickJoke());

  another(): void {
    this.joke.set(pickJoke(this.joke()));
  }
}

/** Index d'une blague au hasard, différente de la précédente quand c'est possible. */
export function pickJoke(previous?: number, random: () => number = Math.random): number {
  const pool = dict().notFound.jokes.map((_, i) => i).filter((i) => i !== previous);
  return pool[Math.floor(random() * pool.length)];
}
