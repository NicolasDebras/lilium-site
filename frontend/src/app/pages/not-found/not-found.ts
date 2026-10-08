import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/logo';

export const JOKES = [
  "Cette page a été gankée en zone noire. Elle n'avait pas de monture.",
  "Même le scout ne l'a pas trouvée… et pourtant c'était un vrai scout, pas un grille-pain.",
  "Page perdue en Avalon. Le caller jure que c'était « juste à gauche ».",
  'Elle est partie farmer en T4 et ne répond plus en vocal.',
  "Le loot de cette page a été split entre 20 joueurs. Il ne reste rien. Même pas l'URL.",
  "Erreur 404 : la page est au repair à Fort Sterling. Durée estimée : jusqu'au prochain patch.",
  "Cette page a quitté la guilde sans prévenir. Sa BAL, elle, est restée.",
  "Le tank a pull toute la salle, la page est morte avec le reste du groupe.",
];

/** 404 : URL inconnue (remplace l'ancienne redirection silencieuse vers l'accueil). */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, Icon, Logo],
  template: `
    <div class="page">
      <a routerLink="/" class="logo-link" aria-label="Accueil Lilium"><app-logo /></a>
      <section class="lost fade-up">
        <svg class="map" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="4 6" />
          <path d="M60 18 74 60 60 102 46 60Z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2" />
          <path d="M60 18 74 60H46Z" fill="currentColor" />
          <circle cx="60" cy="60" r="5" fill="var(--bg)" stroke="currentColor" stroke-width="2" />
        </svg>
        <p class="code gradient-text">404</p>
        <h1>Page introuvable</h1>
        <p class="joke">« {{ joke() }} »</p>
        <div class="row actions">
          <a routerLink="/" class="btn btn-primary"><app-icon name="compass" /> Retour à l'accueil</a>
          <button type="button" class="btn" (click)="another()"><app-icon name="sparkles" /> Une autre blague</button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .page { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; padding: 18px var(--gutter); }
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
  protected readonly joke = signal(pickJoke());

  another(): void {
    this.joke.set(pickJoke(this.joke()));
  }
}

/** Blague au hasard, différente de la précédente quand c'est possible. */
export function pickJoke(previous?: string, random: () => number = Math.random): string {
  const pool = JOKES.filter((j) => j !== previous);
  return pool[Math.floor(random() * pool.length)];
}
