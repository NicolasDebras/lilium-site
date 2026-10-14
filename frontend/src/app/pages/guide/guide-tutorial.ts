import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { PublicInfoService } from '../../core/public-info.service';
import { Icon } from '../../shared/icon';
import { TUTORIAL } from './guide-content';
import { Highlight } from './highlight';
import { matches } from './search';

const DONE_KEY = 'lilium.guide.done';

/** Tuto « lier ton serveur au site » : étapes à cocher (mémorisées dans le navigateur) et barre de progression. */
@Component({
  selector: 'app-guide-tutorial',
  imports: [Highlight, Icon, RouterLink],
  template: `
    <div class="progress" role="progressbar" [attr.aria-valuenow]="doneCount()" aria-valuemin="0" [attr.aria-valuemax]="steps.length">
      <span [style.width.%]="doneCount() / steps.length * 100"></span>
    </div>
    <p class="muted small">{{ doneCount() }} / {{ steps.length }} étapes faites — coche-les au fur et à mesure (mémorisé dans ce navigateur).</p>
    <ol class="steps">
      @for (s of steps; track s.id; let i = $index) {
        <li class="card step" [id]="s.id" [class.done]="done().has(s.id)">
          <label class="check">
            <input type="checkbox" [checked]="done().has(s.id)" (change)="toggle(s.id)" />
            <span class="num">@if (done().has(s.id)) {<app-icon name="check" [size]="14" />} @else {{{ i + 1 }}}</span>
            <strong><app-hl [text]="s.title" [q]="query()" /></strong>
          </label>
          <p><app-hl [text]="s.text" [q]="query()" /></p>
          @if (s.action === 'invite' && info.inviteUrl(); as url) {
            <a class="btn btn-sm btn-primary" [href]="url" target="_blank" rel="noopener"><app-icon name="discord" [size]="16" /> Ajouter le bot</a>
          }
          @if (s.action === 'login') {
            @if (auth.me()) {
              <a class="btn btn-sm btn-primary" routerLink="/">Mes serveurs</a>
            } @else {
              <button type="button" class="btn btn-sm btn-primary" (click)="auth.login()"><app-icon name="discord" [size]="16" /> Se connecter avec Discord</button>
            }
          }
          @if (s.help) {
            <details [open]="hasHit(s.help)"><summary>Ça ne marche pas ?</summary><p class="muted"><app-hl [text]="s.help" [q]="query()" /></p></details>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    :host { display: grid; gap: 12px; }
    .small { font-size: .82rem; margin: 0; }
    .progress { height: 6px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
    .progress span { display: block; height: 100%; background: var(--gradient); transition: width .3s var(--ease); }
    .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    .step { display: grid; gap: 8px; justify-items: start; scroll-margin-top: 16px; transition: opacity .2s; }
    .step:target { box-shadow: var(--shadow-glow); }
    .step p { margin: 0; }
    .step.done { opacity: .65; }
    .step.done strong { text-decoration: line-through; }
    .check { display: flex; align-items: center; gap: 10px; cursor: pointer; }
    .check input { width: 18px; height: 18px; accent-color: var(--lilac-strong); }
    .num { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--gradient); color: var(--on-lilac); font-weight: 700; font-size: .85rem; }
    details summary { cursor: pointer; color: var(--text-muted); }
    details p { margin: 6px 0 0; }
  `,
})
export class GuideTutorial {
  protected readonly auth = inject(AuthService);
  protected readonly info = inject(PublicInfoService);

  /** Recherche du guide : surligne les mots et ouvre les aides « Ça ne marche pas ? » qui correspondent. */
  readonly query = input('');

  protected readonly steps = TUTORIAL;
  protected readonly done = signal<Set<string>>(readDone());
  protected readonly doneCount = computed(() => TUTORIAL.filter((s) => this.done().has(s.id)).length);

  protected hasHit(text: string): boolean {
    return !!this.query().trim() && matches(this.query(), text);
  }

  protected toggle(id: string): void {
    const next = new Set(this.done());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.done.set(next);
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify([...next]));
    } catch {
      /* stockage indisponible (navigation privée) : la case reste cochée pour la session */
    }
  }
}

function readDone(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
