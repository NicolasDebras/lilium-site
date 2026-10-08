import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/logo';
import { Article, COMMANDS, FAQ, PRIVACY, SITE, TUTORIAL } from './guide-content';

const DONE_KEY = 'lilium.guide.done';

/** Minuscules sans accents : la recherche ignore accents et majuscules. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Tous les mots de la recherche doivent apparaître dans le texte. */
export function matches(query: string, ...texts: string[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hay = fold(texts.join(' '));
  return words.every((w) => hay.includes(w));
}

/** Guide public : tutoriel « lier ton serveur Discord au site », commandes du bot, le site, FAQ. */
@Component({
  selector: 'app-guide',
  imports: [Icon, Logo, RouterLink],
  template: `
    <div class="guide">
      <aside class="toc">
        <a routerLink="/accueil" class="brand"><app-logo /></a>
        <label class="sr-only" for="guide-search">Chercher dans le guide</label>
        <input id="guide-search" class="input" type="search" placeholder="Chercher (ex. transferbal)…"
               [value]="query()" (input)="query.set($any($event.target).value)" />
        <nav aria-label="Sommaire">
          <a href="#tuto">Lier ton serveur au site</a>
          <a href="#commandes">Commandes du bot</a>
          <a href="#site">Le site</a>
          <a href="#faq">Ça ne marche pas ?</a>
          <a href="#confidentialite">Confidentialité</a>
        </nav>
      </aside>

      <main>
        <h1>Guide Lilium</h1>

        @if (showTuto()) {
          <section id="tuto" class="block">
            <h2>Tuto : lier ton serveur Discord au site</h2>
            <p class="muted">{{ doneCount() }} / {{ tutorial.length }} étapes faites — coche-les au fur et à mesure (mémorisé dans ce navigateur).</p>
            <ol class="steps">
              @for (s of tutorial; track s.id; let i = $index) {
                <li class="card step" [id]="s.id" [class.done]="done().has(s.id)">
                  <label class="check">
                    <input type="checkbox" [checked]="done().has(s.id)" (change)="toggle(s.id)" />
                    <span class="num">{{ i + 1 }}</span>
                    <strong>{{ s.title }}</strong>
                  </label>
                  <p>{{ s.text }}</p>
                  @if (s.action === 'invite' && inviteUrl(); as url) {
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
                    <details><summary>Ça ne marche pas ?</summary><p class="muted">{{ s.help }}</p></details>
                  }
                </li>
              }
            </ol>
          </section>
        }

        <section id="commandes" class="block">
          <h2>Commandes du bot</h2>
          @for (g of commandGroups(); track g.group) {
            <h3>{{ g.group }}</h3>
            <div class="table-wrap">
              <table class="table cmds">
                <thead><tr><th>Commande</th><th>Qui</th><th>Rôle</th></tr></thead>
                <tbody>
                  @for (c of g.commands; track c.name) {
                    <tr [id]="c.name"><td><code>{{ c.usage }}</code></td><td class="who">{{ c.who }}</td><td>{{ c.text }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          } @empty {
            <p class="muted">Aucune commande ne correspond.</p>
          }
        </section>

        <section id="site" class="block">
          <h2>Le site</h2>
          @for (a of site(); track a.id) {
            <article class="card" [id]="a.id"><h3>{{ a.title }}</h3>@for (p of a.paragraphs; track $index) { <p>{{ p }}</p> }</article>
          } @empty { <p class="muted">Rien ne correspond.</p> }
        </section>

        <section id="faq" class="block">
          <h2>Ça ne marche pas ?</h2>
          @for (a of faq(); track a.id) {
            <details class="card" [id]="a.id"><summary>{{ a.title }}</summary>@for (p of a.paragraphs; track $index) { <p>{{ p }}</p> }</details>
          } @empty { <p class="muted">Rien ne correspond.</p> }
        </section>

        <section [id]="privacy.id" class="block">
          <h2>{{ privacy.title }}</h2>
          @for (p of privacy.paragraphs; track $index) { <p>{{ p }}</p> }
        </section>
      </main>
    </div>
  `,
  styles: `
    .guide { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; padding: 32px var(--gutter) 64px; }
    .toc { position: sticky; top: 24px; align-self: start; display: grid; gap: 14px; }
    .toc nav { display: grid; gap: 4px; }
    .toc nav a { color: var(--text-muted); padding: 4px 8px; border-radius: 8px; font-size: .9rem; }
    .toc nav a:hover { background: var(--lilac-soft); color: var(--lilac); text-decoration: none; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    h1 { margin: 0 0 8px; }
    .block { display: grid; gap: 12px; margin-bottom: 36px; scroll-margin-top: 16px; }
    .block h2 { margin: 0; }
    .block h3 { margin: 8px 0 0; font-size: 1rem; }
    .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    .step { display: grid; gap: 8px; justify-items: start; scroll-margin-top: 16px; }
    .step p { margin: 0; }
    .step.done { opacity: .7; }
    .check { display: flex; align-items: center; gap: 10px; cursor: pointer; }
    .num { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--gradient); color: var(--on-lilac); font-weight: 700; font-size: .85rem; }
    .step.done strong { text-decoration: line-through; }
    details summary { cursor: pointer; color: var(--text-muted); }
    details p { margin: 6px 0 0; }
    .table-wrap { overflow-x: auto; }
    .cmds td { vertical-align: top; }
    .cmds tr { scroll-margin-top: 16px; }
    .cmds tr:target { background: var(--lilac-soft); }
    .who { color: var(--text-muted); white-space: nowrap; }
    code { color: var(--lilac); white-space: nowrap; }
    article.card p, details.card p { margin: 6px 0 0; }
    article.card h3 { margin: 0; }
    @media (max-width: 820px) {
      .guide { grid-template-columns: minmax(0, 1fr); }
      .toc { position: static; }
    }
  `,
})
export class GuidePage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  protected readonly tutorial = TUTORIAL;
  protected readonly privacy = PRIVACY;
  protected readonly query = signal('');
  protected readonly inviteUrl = signal<string | null>(null);
  protected readonly done = signal<Set<string>>(readDone());
  protected readonly doneCount = computed(() => TUTORIAL.filter((s) => this.done().has(s.id)).length);

  protected readonly showTuto = computed(() =>
    !this.query().trim() || TUTORIAL.some((s) => matches(this.query(), s.title, s.text, s.help ?? '')));
  protected readonly commandGroups = computed(() => {
    const found = COMMANDS.filter((c) => matches(this.query(), c.usage, c.who, c.text, c.group));
    const groups = [...new Set(found.map((c) => c.group))];
    return groups.map((group) => ({ group, commands: found.filter((c) => c.group === group) }));
  });
  protected readonly site = computed(() => filterArticles(SITE, this.query()));
  protected readonly faq = computed(() => filterArticles(FAQ, this.query()));

  ngOnInit(): void {
    void this.auth.load().catch(() => null);
    this.http.get<{ invite_url: string }>('/api/public/info').subscribe({ next: (i) => this.inviteUrl.set(i.invite_url), error: () => {} });
  }

  toggle(id: string): void {
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

function filterArticles(list: Article[], query: string): Article[] {
  return list.filter((a) => matches(query, a.title, ...a.paragraphs));
}

function readDone(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
