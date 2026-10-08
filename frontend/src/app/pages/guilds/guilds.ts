import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { Icon } from '../../shared/icon';

const LEVEL_LABEL = { none: '', member: 'Membre', staff: 'Staff', admin: 'Admin' } as const;

@Component({
  selector: 'app-guilds',
  imports: [RouterLink, Icon],
  template: `
    <div class="page-head">
      <div>
        <h1>Tes serveurs</h1>
        <p class="subtitle">Choisis la guilde dont tu veux voir les builds, les compos et la BAL.</p>
      </div>
    </div>

    @if (auth.guilds().length) {
      <div class="grid">
        @for (g of auth.guilds(); track g.id; let i = $index) {
          <a class="card card-link guild fade-up" [style.animation-delay.ms]="i * 60" [routerLink]="['/g', g.id, 'builds']">
            <div class="banner"></div>
            <div class="body">
              @if (g.icon) {
                <img [src]="g.icon" alt="" class="icon" />
              } @else {
                <div class="icon placeholder">{{ g.name.charAt(0) }}</div>
              }
              <div class="info">
                <strong>{{ g.name }}</strong>
                <span class="badge">{{ levelLabel[g.level] }}</span>
              </div>
              <app-icon name="chevron-right" class="go" />
            </div>
          </a>
        }
      </div>
    } @else {
      <div class="empty">
        <app-icon name="compass" [size]="36" />
        <p><strong>Aucun serveur trouvé.</strong></p>
        <p>Le site s'appuie sur ton profil de guilde : fais <code>/register ton_pseudo_ig</code>
          sur le Discord de ta guilde, puis recharge cette page.</p>
      </div>
    }
  `,
  styles: `
    .guild { padding: 0; overflow: hidden; }
    .banner { height: 64px; background: radial-gradient(circle at 20% 0%, rgba(217, 188, 255, .5), transparent 60%), var(--gradient); opacity: .85; }
    .body { position: relative; display: flex; align-items: center; gap: 14px; padding: 0 18px 18px; margin-top: -26px; }
    .icon { width: 58px; height: 58px; border-radius: 16px; flex-shrink: 0; border: 3px solid var(--surface); background: var(--surface); }
    .placeholder { display: grid; place-items: center; background: var(--surface-2); color: var(--lilac); font-weight: 800; font-size: 1.5rem; }
    .info { display: grid; gap: 4px; justify-items: start; min-width: 0; padding-top: 26px; flex: 1; }
    .info strong { font-size: 1.05rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .go { padding-top: 26px; color: var(--text-faint); transition: transform .2s var(--ease), color .2s; }
    .guild:hover .go { transform: translateX(3px); color: var(--lilac); }
    code { color: var(--lilac); }
  `,
})
export class GuildsPage {
  protected readonly auth = inject(AuthService);
  protected readonly levelLabel = LEVEL_LABEL;
}
