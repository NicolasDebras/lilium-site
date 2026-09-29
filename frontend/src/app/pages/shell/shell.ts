import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { hasLevel } from '../../core/models';

/** Mise en page connectée : barre de navigation + contenu. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="nav">
      <div class="nav-inner">
        <a routerLink="/" class="brand">❀ Lilium</a>

        @if (guild(); as g) {
          <button class="burger btn btn-sm" type="button" (click)="menuOpen.set(!menuOpen())"
                  [attr.aria-expanded]="menuOpen()" aria-label="Menu">☰</button>
          <nav class="links" [class.open]="menuOpen()" (click)="menuOpen.set(false)">
            <a [routerLink]="['/g', g.id, 'builds']" routerLinkActive="active">Builds</a>
            <a [routerLink]="['/g', g.id, 'compos']" routerLinkActive="active">Compos</a>
            <a [routerLink]="['/g', g.id, 'bal']" routerLinkActive="active">Ma BAL</a>
            @if (isAdmin()) {
              <a [routerLink]="['/g', g.id, 'admin']" routerLinkActive="active" class="admin-link">
                Admin <span class="badge">ADMIN</span>
              </a>
            }
          </nav>
        }

        <div class="user">
          @if (guild(); as g) {
            <a routerLink="/" class="guild-name muted" title="Changer de serveur">{{ g.name }}</a>
          }
          @if (auth.user(); as u) {
            <img [src]="u.avatar_url" alt="" class="avatar" />
            <span class="username">{{ u.username }}</span>
          }
          <button type="button" class="btn btn-sm" (click)="logout()">Déconnexion</button>
        </div>
      </div>
    </header>

    <main class="container">
      <router-outlet />
    </main>
  `,
  styles: `
    .nav { position: sticky; top: 0; z-index: 10; background: var(--surface); border-bottom: 1px solid var(--border); }
    .nav-inner { max-width: 1100px; margin: 0 auto; padding: 10px var(--gutter);
                 display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
    .brand { color: var(--lilac); font-weight: 700; font-size: 1.15rem; letter-spacing: .02em; }
    .brand:hover { text-decoration: none; }
    .links { display: flex; gap: 4px; flex: 1; }
    .links a { color: var(--text-muted); padding: 6px 12px; border-radius: 8px; display: inline-flex; gap: 6px; align-items: center; }
    .links a:hover { color: var(--text); background: var(--surface-2); text-decoration: none; }
    .links a.active { color: var(--lilac); background: var(--lilac-soft); }
    .user { display: flex; align-items: center; gap: 10px; margin-left: auto; }
    .guild-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; }
    .burger { display: none; }
    @media (max-width: 720px) {
      .burger { display: inline-flex; margin-left: auto; }
      .links { display: none; flex-basis: 100%; flex-direction: column; order: 3; }
      .links.open { display: flex; }
      .user { flex-basis: 100%; order: 4; }
      .username, .guild-name { display: none; }
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly menuOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly guildId = computed(() => /^\/g\/([^/?#]+)/.exec(this.url())?.[1] ?? null);
  protected readonly guild = computed(() => this.auth.guild(this.guildId()));
  protected readonly isAdmin = computed(() => hasLevel(this.guild()?.level, 'admin'));

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
