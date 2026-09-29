import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';

const LEVEL_LABEL = { none: '', member: 'Membre', staff: 'Staff', admin: 'Admin' } as const;

@Component({
  selector: 'app-guilds',
  imports: [RouterLink],
  template: `
    <div class="page-head"><h1>Tes serveurs</h1></div>

    @if (auth.guilds().length) {
      <div class="grid">
        @for (g of auth.guilds(); track g.id) {
          <a class="card card-link guild" [routerLink]="['/g', g.id, 'builds']">
            @if (g.icon) {
              <img [src]="g.icon" alt="" class="icon" />
            } @else {
              <div class="icon placeholder">{{ g.name.charAt(0) }}</div>
            }
            <div class="info">
              <strong>{{ g.name }}</strong>
              <span class="badge">{{ levelLabel[g.level] }}</span>
            </div>
          </a>
        }
      </div>
    } @else {
      <div class="empty">
        <p>Aucun serveur trouvé.</p>
        <p>Le site s'appuie sur ton profil de guilde : fais <code>/register ton_pseudo_ig</code>
          sur le Discord de ta guilde, puis recharge cette page.</p>
      </div>
    }
  `,
  styles: `
    .guild { display: flex; align-items: center; gap: 14px; }
    .icon { width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0; }
    .placeholder { display: grid; place-items: center; background: var(--lilac-soft); color: var(--lilac); font-weight: 700; font-size: 1.3rem; }
    .info { display: grid; gap: 4px; justify-items: start; min-width: 0; }
    code { color: var(--lilac); }
  `,
})
export class GuildsPage {
  protected readonly auth = inject(AuthService);
  protected readonly levelLabel = LEVEL_LABEL;
}
