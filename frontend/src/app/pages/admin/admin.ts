import { DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AdminOverview } from '../../core/models';

/** Page réservée aux admins du site (nommés via /webadmin sur Discord).
 *  Point de départ : quelques chiffres clés, à enrichir au fil des besoins. */
@Component({
  selector: 'app-admin',
  imports: [DecimalPipe],
  template: `
    <div class="page-head">
      <h1>Admin <span class="badge">ADMIN</span></h1>
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    } @else if (overview(); as o) {
      <div class="grid stats">
        @for (s of stats(o); track s.label) {
          <div class="card stat">
            <strong class="value">{{ s.value | number: '1.0-0' : 'fr-FR' }}</strong>
            <span class="muted">{{ s.label }}</span>
          </div>
        }
        <div class="card stat soon">
          <strong>À venir</strong>
          <span class="muted">Prochains outils d'administration.</span>
        </div>
      </div>
    } @else {
      <p class="muted">Chargement…</p>
    }
  `,
  styles: `
    h1 { display: flex; align-items: center; gap: 10px; }
    .stats { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
    .stat { display: grid; gap: 4px; }
    .value { font-size: 2rem; color: var(--lilac); font-weight: 700; }
    .soon { border-style: dashed; box-shadow: none; background: transparent; }
  `,
})
export class AdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly overview = signal<AdminOverview | null>(null);
  protected readonly error = signal('');

  stats(o: AdminOverview): { label: string; value: number }[] {
    return [
      { label: 'Profils enregistrés (/register)', value: o.profiles },
      { label: 'Builds', value: o.builds },
      { label: 'Compos de guilde', value: o.compos },
      { label: 'BAL totale due (silver)', value: o.total_bal },
    ];
  }

  async ngOnInit(): Promise<void> {
    try {
      this.overview.set(await firstValueFrom(this.api.adminOverview(this.guildId())));
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }
}
