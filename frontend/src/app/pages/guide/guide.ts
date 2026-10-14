import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { Icon, IconName } from '../../shared/icon';
import { Logo } from '../../shared/logo';
import { Toasts } from '../../shared/toasts';
import {
  ARTICLE_AUDIENCE, AUDIENCES, Article, Audience, COMMANDS, FAQ, PRIVACY, SITE, TUTORIAL, TUTORIAL_AUDIENCE,
  commandAudience,
} from './guide-content';
import { GuideTutorial } from './guide-tutorial';
import { Highlight } from './highlight';
import { anchorOf, matches } from './search';

export { anchorOf, fold, matches } from './search';

interface Section { id: string; title: string; icon: IconName }

const SECTIONS: Section[] = [
  { id: 'tuto', title: 'Lier ton serveur au site', icon: 'discord' },
  { id: 'commandes', title: 'Commandes du bot', icon: 'sword' },
  { id: 'site', title: 'Le site', icon: 'book' },
  { id: 'faq', title: 'Ça ne marche pas ?', icon: 'alert' },
  { id: 'confidentialite', title: 'Confidentialité', icon: 'shield' },
];

const AUDIENCE_LABEL: Record<Audience, string> = { joueur: 'Joueur', staff: 'Staff', admin: 'Admin' };

/** Guide public : tuto « lier ton serveur Discord au site », commandes, le site, FAQ.
 *  Sommaire qui suit la lecture, recherche surlignée, filtre par public, liens copiables. */
@Component({
  selector: 'app-guide',
  imports: [GuideTutorial, Highlight, Icon, Logo, RouterLink, Toasts],
  host: { '(window:scroll)': 'onScroll()' },
  template: `
    <div class="guide">
      <aside class="toc">
        <a routerLink="/accueil" class="brand" aria-label="Accueil"><app-logo /></a>
        <div class="search-box">
          <app-icon name="search" [size]="16" />
          <label class="sr-only" for="guide-search">Chercher dans le guide</label>
          <input id="guide-search" class="input" type="search" placeholder="Chercher (ex. transferbal)…"
                 [value]="query()" (input)="query.set($any($event.target).value)" />
        </div>
        <div class="audiences" role="group" aria-label="Pour qui ?">
          @for (a of audiences; track a.label) {
            <button type="button" class="chip" [class.on]="audience() === a.value" [attr.aria-pressed]="audience() === a.value"
                    (click)="audience.set(a.value)">{{ a.label }}</button>
          }
        </div>
        <nav aria-label="Sommaire">
          @for (s of visibleSections(); track s.id) {
            <a [href]="'/guide#' + s.id" [class.active]="active() === s.id" (click)="go($event, s.id)">
              <app-icon [name]="s.icon" [size]="16" /> {{ s.title }}
              @if (counts()[s.id] !== undefined) { <span class="count">{{ counts()[s.id] }}</span> }
            </a>
          }
        </nav>
        @if (filtering() && !visibleSections().length) {
          <p class="muted small">Rien ne correspond. <button type="button" class="linklike" (click)="reset()">Tout afficher</button></p>
        }
      </aside>

      <main>
        <header class="intro card">
          <h1>Guide <span class="gradient-text">Lilium</span></h1>
          <p class="muted">Tout pour installer le bot, le relier au site et t'en servir. Filtre par public ou cherche un mot : les résultats se surlignent.</p>
        </header>

        @if (show('tuto')) {
          <section id="tuto" class="block" data-section>
            <div class="section-head">
              <span class="section-icon"><app-icon name="discord" [size]="20" /></span>
              <h2>Tuto : lier ton serveur Discord au site</h2>
              <span class="tag admin">Admin</span>
              <button type="button" class="copy" (click)="copyLink('tuto')" aria-label="Copier le lien de la section"><app-icon name="link" [size]="15" /></button>
            </div>
            <app-guide-tutorial [query]="query()" />
          </section>
        }

        @if (show('commandes')) {
          <section id="commandes" class="block" data-section>
            <div class="section-head">
              <span class="section-icon"><app-icon name="sword" [size]="20" /></span>
              <h2>Commandes du bot</h2>
              <button type="button" class="copy" (click)="copyLink('commandes')" aria-label="Copier le lien de la section"><app-icon name="link" [size]="15" /></button>
            </div>
            @for (g of commandGroups(); track g.group) {
              <h3 class="group">{{ g.group }}</h3>
              <ul class="cmds">
                @for (c of g.commands; track c.name) {
                  <li class="card cmd" [id]="anchor(c.name)">
                    <div class="cmd-head">
                      <code><app-hl [text]="c.usage" [q]="query()" /></code>
                      <span class="tag" [class]="'tag ' + c.audience">{{ audienceLabel[c.audience] }}</span>
                      <button type="button" class="copy" (click)="copyLink(anchor(c.name))" [attr.aria-label]="'Copier le lien de ' + c.usage"><app-icon name="link" [size]="14" /></button>
                    </div>
                    <p><app-hl [text]="c.text" [q]="query()" /></p>
                    <p class="who muted small">Qui : <app-hl [text]="c.who" [q]="query()" /></p>
                  </li>
                }
              </ul>
            }
          </section>
        }

        @if (show('site')) {
          <section id="site" class="block" data-section>
            <div class="section-head">
              <span class="section-icon"><app-icon name="book" [size]="20" /></span>
              <h2>Le site</h2>
              <button type="button" class="copy" (click)="copyLink('site')" aria-label="Copier le lien de la section"><app-icon name="link" [size]="15" /></button>
            </div>
            <div class="articles">
              @for (a of site(); track a.id) {
                <article class="card" [id]="a.id">
                  <div class="cmd-head">
                    <h3><app-hl [text]="a.title" [q]="query()" /></h3>
                    <span [class]="'tag ' + audienceOf(a.id)">{{ audienceLabel[audienceOf(a.id)] }}</span>
                    <button type="button" class="copy" (click)="copyLink(a.id)" [attr.aria-label]="'Copier le lien de ' + a.title"><app-icon name="link" [size]="14" /></button>
                  </div>
                  @for (p of a.paragraphs; track $index) { <p><app-hl [text]="p" [q]="query()" /></p> }
                </article>
              }
            </div>
          </section>
        }

        @if (show('faq')) {
          <section id="faq" class="block" data-section>
            <div class="section-head">
              <span class="section-icon"><app-icon name="alert" [size]="20" /></span>
              <h2>Ça ne marche pas ?</h2>
              <button type="button" class="copy" (click)="copyLink('faq')" aria-label="Copier le lien de la section"><app-icon name="link" [size]="15" /></button>
            </div>
            @for (a of faq(); track a.id) {
              <details class="card faq-item" [id]="a.id" [open]="filtering()">
                <summary><app-hl [text]="a.title" [q]="query()" /></summary>
                @for (p of a.paragraphs; track $index) { <p><app-hl [text]="p" [q]="query()" /></p> }
              </details>
            }
          </section>
        }

        @if (show('confidentialite')) {
          <section id="confidentialite" class="block" data-section>
            <div class="section-head">
              <span class="section-icon"><app-icon name="shield" [size]="20" /></span>
              <h2>{{ privacy.title }}</h2>
            </div>
            <div class="card">
              @for (p of privacy.paragraphs; track $index) { <p><app-hl [text]="p" [q]="query()" /></p> }
            </div>
          </section>
        }

        @if (filtering() && !visibleSections().length) {
          <div class="empty">
            <app-icon name="search" [size]="28" />
            <p>Rien ne correspond à ta recherche.</p>
            <button type="button" class="btn btn-sm" (click)="reset()">Tout afficher</button>
          </div>
        }
      </main>
    </div>

    @if (showTop()) {
      <button type="button" class="to-top" (click)="toTop()" aria-label="Revenir en haut"><app-icon name="arrow-up" [size]="18" /></button>
    }
    <app-toasts />
  `,
  styles: `
    .guide { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; padding: 32px var(--gutter) 80px; }
    .toc { position: sticky; top: 24px; align-self: start; display: grid; gap: 14px; }
    .brand { justify-self: start; }
    .search-box { position: relative; }
    .search-box app-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-faint); pointer-events: none; }
    .search-box .input { padding-left: 34px; width: 100%; }
    .audiences { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1px solid var(--border); background: transparent; color: var(--text-muted); border-radius: 999px;
            padding: 4px 11px; font: inherit; font-size: .8rem; cursor: pointer; }
    .chip.on { background: var(--lilac-soft); color: var(--lilac); border-color: var(--lilac-strong); }
    .toc nav { display: grid; gap: 2px; }
    .toc nav a { display: flex; align-items: center; gap: 8px; color: var(--text-muted); padding: 7px 10px; border-radius: 10px;
                 font-size: .9rem; border-left: 2px solid transparent; transition: background .15s, color .15s; }
    .toc nav a:hover, .toc nav a.active { background: var(--lilac-soft); color: var(--lilac); text-decoration: none; }
    .toc nav a.active { border-left-color: var(--lilac-strong); font-weight: 600; }
    .count { margin-left: auto; font-size: .72rem; color: var(--text-faint); font-variant-numeric: tabular-nums; }
    .small { font-size: .82rem; }

    .intro { margin-bottom: 28px; background: radial-gradient(ellipse at 0% 0%, rgba(167, 123, 243, .22), transparent 65%), var(--surface); }
    .intro h1 { margin: 0 0 6px; font-size: clamp(1.7rem, 4vw, 2.3rem); }
    .intro p { margin: 0; }
    main [id] { scroll-margin-top: 16px; }
    .block { display: grid; gap: 12px; margin-bottom: 40px; }
    .section-head { display: flex; align-items: center; gap: 10px; }
    .section-head h2 { margin: 0; font-size: 1.35rem; }
    .section-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--lilac-soft); color: var(--lilac); flex: none; }
    .copy { margin-left: auto; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid transparent;
            background: transparent; color: var(--text-faint); cursor: pointer; opacity: .6; transition: opacity .15s, color .15s; }
    .copy:hover, .copy:focus-visible { opacity: 1; color: var(--lilac); border-color: var(--border); }
    .tag { font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; padding: 2px 8px; border-radius: 999px;
           background: var(--surface-3); color: var(--text-muted); white-space: nowrap; }
    .tag.joueur { background: var(--success-soft); color: var(--success); }
    .tag.staff { background: var(--lilac-soft); color: var(--lilac); }
    .tag.admin { background: var(--danger-soft); color: var(--danger); }


    .group { margin: 10px 0 0; font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); }
    .cmds { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); }
    .cmd { display: grid; gap: 6px; align-content: start; padding: 12px 14px; }
    .cmd:target, article:target, .faq-item:target { box-shadow: var(--shadow-glow); }
    .cmd-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .cmd-head h3 { margin: 0; font-size: 1rem; }
    .cmd p { margin: 0; font-size: .9rem; }
    code { color: var(--lilac); font-size: .88rem; overflow-wrap: anywhere; }
    .articles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); }
    article.card p, .faq-item p { margin: 6px 0 0; }
    .faq-item summary { cursor: pointer; font-weight: 600; color: var(--text); }

    .to-top { position: fixed; right: 20px; bottom: 20px; z-index: 20; display: grid; place-items: center; width: 44px; height: 44px;
              border-radius: 50%; border: 1px solid var(--lilac-strong); background: var(--surface-2); color: var(--lilac);
              box-shadow: var(--shadow-lg); cursor: pointer; }
    .to-top:hover { background: var(--lilac-soft); }

    @media (max-width: 860px) {
      .guide { grid-template-columns: minmax(0, 1fr); gap: 16px; padding-top: 16px; }
      .toc { position: sticky; top: 0; z-index: 10; padding: 10px 0; background: var(--bg); gap: 10px; }
      .brand { display: none; }
      .toc nav { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
      .toc nav a { white-space: nowrap; border-left: 0; border: 1px solid var(--border); padding: 5px 10px; font-size: .82rem; }
      .toc nav a.active { border-color: var(--lilac-strong); }
    }
  `,
})
export class GuidePage {
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly privacy = PRIVACY;
  protected readonly audiences = AUDIENCES;
  protected readonly audienceLabel = AUDIENCE_LABEL;
  protected readonly anchor = anchorOf;
  protected readonly query = signal('');
  protected readonly audience = signal<Audience | null>(null);
  protected readonly active = signal('tuto');
  protected readonly showTop = signal(false);
  protected readonly filtering = computed(() => !!this.query().trim() || this.audience() !== null);

  private keep(audience: Audience): boolean {
    return this.audience() === null || this.audience() === audience;
  }

  protected readonly showTuto = computed(() => this.keep(TUTORIAL_AUDIENCE)
    && (!this.query().trim() || TUTORIAL.some((s) => matches(this.query(), s.title, s.text, s.help ?? ''))));
  protected readonly commandGroups = computed(() => {
    const found = COMMANDS.map((c) => ({ ...c, audience: commandAudience(c.who) }))
      .filter((c) => this.keep(c.audience) && matches(this.query(), c.usage, c.who, c.text, c.group));
    const groups = [...new Set(found.map((c) => c.group))];
    return groups.map((group) => ({ group, commands: found.filter((c) => c.group === group) }));
  });
  protected readonly site = computed(() => this.filterArticles(SITE));
  protected readonly faq = computed(() => this.filterArticles(FAQ));
  protected readonly showPrivacy = computed(() =>
    this.audience() === null && matches(this.query(), PRIVACY.title, ...PRIVACY.paragraphs));

  /** Nombre de résultats par section (affiché dans le sommaire pendant un filtre). */
  protected readonly counts = computed((): Record<string, number> => {
    if (!this.filtering()) return {};
    return {
      tuto: this.showTuto() ? TUTORIAL.length : 0,
      commandes: this.commandGroups().reduce((n, g) => n + g.commands.length, 0),
      site: this.site().length,
      faq: this.faq().length,
    };
  });

  protected readonly visibleSections = computed(() => SECTIONS.filter((s) => this.show(s.id)));

  constructor() {
    void this.auth.load().catch(() => null);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // Lien partagé (/guide#transferbal) : la page est rendue, on peut y aller.
      const id = decodeURIComponent(location.hash.slice(1));
      if (id) this.scrollTo(id, false);
      if (typeof IntersectionObserver === 'undefined') return;
      // Sommaire qui suit la lecture : la section la plus haute visible devient active.
      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) this.active.set(visible[0].target.id);
      }, { rootMargin: '0px 0px -65% 0px' });
      const observe = () => this.host.nativeElement.querySelectorAll('[data-section]').forEach((el: Element) => observer.observe(el));
      observe();
      const mutations = new MutationObserver(() => { observer.disconnect(); observe(); });
      mutations.observe(this.host.nativeElement, { childList: true, subtree: true });
      destroyRef.onDestroy(() => { observer.disconnect(); mutations.disconnect(); });
    });
  }

  protected onScroll(): void {
    this.showTop.set(window.scrollY > 600);
  }

  show(id: string): boolean {
    switch (id) {
      case 'tuto': return this.showTuto();
      case 'commandes': return this.commandGroups().length > 0;
      case 'site': return this.site().length > 0;
      case 'faq': return this.faq().length > 0;
      case 'confidentialite': return this.showPrivacy();
      default: return false;
    }
  }

  audienceOf(id: string): Audience {
    return ARTICLE_AUDIENCE[id] ?? 'joueur';
  }

  reset(): void {
    this.query.set('');
    this.audience.set(null);
  }

  /** Sommaire : défilement dans la page (un simple href="#x" repartirait à l'accueil à cause de <base href="/">). */
  go(event: Event, id: string): void {
    event.preventDefault();
    this.scrollTo(id, true);
  }

  private scrollTo(id: string, smooth: boolean): void {
    const el = this.host.nativeElement.querySelector(`[id="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    history.replaceState(null, '', `/guide#${id}`);
    this.active.set(el.closest('[data-section]')?.id ?? id);
  }

  toTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    history.replaceState(null, '', '/guide');
  }

  async copyLink(id: string): Promise<void> {
    const url = `${location.origin}/guide#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('Lien copié : colle-le dans Discord.');
    } catch {
      this.toast.error(`Copie impossible : ${url}`);
    }
    history.replaceState(null, '', `/guide#${id}`);
  }

  private filterArticles(list: Article[]): Article[] {
    return list.filter((a) => this.keep(this.audienceOf(a.id)) && matches(this.query(), a.title, ...a.paragraphs));
  }
}

