import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { hasLevel } from '../../core/models';
import { Icon, IconName } from '../../shared/icon';
import { Logo } from '../../shared/logo';
import { Toasts } from '../../shared/toasts';

interface NavLink {
  path: string;
  label: string;
  icon: IconName;
  admin?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { path: 'builds', label: 'Builds', icon: 'sword' },
  { path: 'compos', label: 'Compos', icon: 'users' },
  { path: 'bal', label: 'Ma BAL', icon: 'coins' },
  { path: 'admin', label: 'Admin', icon: 'shield', admin: true },
];

/** Mise en page connectée : barre du haut (verre dépoli) + contenu + notifications. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Logo, Toasts],
  template: `
    <header class="nav glass">
      <div class="nav-inner">
        <a routerLink="/" class="brand" aria-label="Accueil Lilium"><app-logo /></a>

        @if (guild(); as g) {
          <nav class="links" [class.open]="menuOpen()" (click)="menuOpen.set(false)">
            @for (l of links(); track l.path) {
              <a [routerLink]="['/g', g.id, l.path]" routerLinkActive="active">
                <app-icon [name]="l.icon" [size]="17" />
                <span>{{ l.label }}</span>
              </a>
            }
          </nav>
        }

        <div class="right">
          @if (guild(); as g) {
            <a routerLink="/" class="guild-pill" title="Changer de serveur">
              @if (g.icon) {
                <img [src]="g.icon" alt="" />
              } @else {
                <span class="guild-initial">{{ g.name.charAt(0) }}</span>
              }
              <span class="guild-name">{{ g.name }}</span>
              <app-icon name="swap" [size]="14" />
            </a>
          }

          @if (auth.user(); as u) {
            <div class="account">
              <button type="button" class="avatar-btn" (click)="toggleAccount($event)"
                      [attr.aria-expanded]="accountOpen()" aria-haspopup="menu" aria-label="Mon compte">
                <img [src]="u.avatar_url" alt="" class="avatar" />
                <span class="username">{{ u.username }}</span>
                <app-icon name="chevron" [size]="14" />
              </button>
              @if (accountOpen()) {
                <div class="menu" role="menu" (click)="$event.stopPropagation()">
                  <div class="menu-head">
                    <img [src]="u.avatar_url" alt="" class="avatar big" />
                    <div>
                      <strong>{{ u.username }}</strong>
                      @if (guild(); as g) { <span class="muted level">{{ levelLabel(g.level) }} · {{ g.name }}</span> }
                    </div>
                  </div>
                  <a role="menuitem" routerLink="/" (click)="accountOpen.set(false)">
                    <app-icon name="swap" [size]="16" /> Changer de serveur
                  </a>
                  <button type="button" role="menuitem" class="logout" (click)="logout()">
                    <app-icon name="logout" [size]="16" /> Déconnexion
                  </button>
                </div>
              }
            </div>
          }

          @if (guild()) {
            <button class="burger btn btn-sm btn-icon" type="button" (click)="menuOpen.set(!menuOpen())"
                    [attr.aria-expanded]="menuOpen()" aria-label="Menu">
              <app-icon [name]="menuOpen() ? 'close' : 'menu'" />
            </button>
          }
        </div>
      </div>
    </header>

    <main class="container">
      <router-outlet />
    </main>
    <app-toasts />
  `,
  styles: `
    .nav { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid var(--border-soft); }
    .nav-inner { max-width: 1180px; margin: 0 auto; padding: 10px var(--gutter);
                 display: flex; align-items: center; gap: 24px; }
    .brand:hover { text-decoration: none; }

    .links { display: flex; gap: 2px; flex: 1; }
    .links a { position: relative; display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px;
               border-radius: 10px; color: var(--text-muted); font-weight: 500; transition: color .15s, background .15s; }
    .links a:hover { color: var(--text); background: var(--surface-2); text-decoration: none; }
    .links a::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: -11px; height: 2px;
                      border-radius: 2px; background: var(--gradient); transform: scaleX(0); transition: transform .25s var(--ease); }
    .links a.active { color: var(--text); }
    .links a.active app-icon { color: var(--lilac); }
    .links a.active::after { transform: scaleX(1); }

    .right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
    .guild-pill { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; border-radius: 999px;
                  border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); font-size: .85rem; }
    .guild-pill:hover { color: var(--text); border-color: var(--lilac-strong); text-decoration: none; }
    .guild-pill img, .guild-initial { width: 24px; height: 24px; border-radius: 50%; }
    .guild-initial { display: grid; place-items: center; background: var(--lilac-soft); color: var(--lilac); font-weight: 700; font-size: .75rem; }
    .guild-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .account { position: relative; }
    .avatar-btn { display: inline-flex; align-items: center; gap: 8px; padding: 3px 8px 3px 3px; border-radius: 999px;
                  border: 1px solid transparent; background: transparent; color: var(--text); font: inherit; cursor: pointer; }
    .avatar-btn:hover, .avatar-btn[aria-expanded='true'] { background: var(--surface-2); border-color: var(--border); }
    .avatar { width: 30px; height: 30px; border-radius: 50%; box-shadow: 0 0 0 2px var(--lilac-soft); }
    .avatar.big { width: 40px; height: 40px; }
    .username { font-weight: 600; font-size: .9rem; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .menu { position: absolute; right: 0; top: calc(100% + 8px); min-width: 240px; padding: 6px; border-radius: 14px;
            background: var(--surface-2); border: 1px solid var(--border); box-shadow: var(--shadow-lg);
            display: grid; gap: 2px; animation: fade-up .18s var(--ease) both; }
    .menu-head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
    .menu-head div { display: grid; min-width: 0; }
    .level { font-size: .78rem; }
    .menu a, .menu button { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 9px; border: 0;
                            background: transparent; color: var(--text); font: inherit; font-size: .9rem; cursor: pointer; text-align: left; }
    .menu a:hover, .menu button:hover { background: var(--surface-3); text-decoration: none; }
    .logout { color: var(--danger) !important; }

    .burger { display: none; }
    @media (max-width: 860px) {
      .guild-name, .username { display: none; }
      .guild-pill { padding-right: 8px; }
    }
    @media (max-width: 720px) {
      .nav-inner { flex-wrap: wrap; gap: 10px; }
      .burger { display: inline-flex; }
      .links { order: 3; flex-basis: 100%; flex-direction: column; gap: 2px; max-height: 0; overflow: hidden;
               transition: max-height .3s var(--ease); }
      .links.open { max-height: 320px; padding-bottom: 6px; }
      .links a::after { display: none; }
      .links a.active { background: var(--lilac-soft); }
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly menuOpen = signal(false);
  protected readonly accountOpen = signal(false);

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
  protected readonly links = computed(() => NAV_LINKS.filter((l) => !l.admin || this.isAdmin()));

  protected levelLabel(level: string): string {
    return ({ member: 'Membre', staff: 'Staff', admin: 'Admin' } as Record<string, string>)[level] ?? '';
  }

  toggleAccount(event: Event): void {
    event.stopPropagation();
    this.accountOpen.update((v) => !v);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeMenus(): void {
    this.accountOpen.set(false);
  }

  async logout(): Promise<void> {
    this.accountOpen.set(false);
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
