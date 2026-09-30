import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ItemsService } from '../../core/items.service';
import { Build, Compo, SlotRow, hasLevel } from '../../core/models';
import { Gear } from '../../shared/gear';

@Component({
  selector: 'app-compos-list',
  imports: [NgTemplateOutlet, RouterLink, Gear],
  template: `
    <div class="page-head">
      <h1>Compos</h1>
      @if (canEdit()) {
        <a class="btn btn-primary" [routerLink]="['/g', guildId(), 'compos', 'new']">+ Nouvelle compo</a>
      }
    </div>
    <p class="muted intro">Les compos de la guilde sont utilisables directement dans <code>/acti</code> sur Discord.</p>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (loading()) {
      <p class="muted">Chargement…</p>
    } @else {
      @if (custom().length) {
        <div class="grid">
          @for (c of custom(); track c.name) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: c }" />
          }
        </div>
      } @else {
        <div class="empty">Aucune compo de guilde pour l'instant.</div>
      }

      @if (defaults().length) {
        <h2 class="section">Templates par défaut</h2>
        <div class="grid">
          @for (c of defaults(); track c.name) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: c }" />
          }
        </div>
      }
    }

    <ng-template #card let-c>
      <article class="card compo">
        <div class="row">
          <h2>{{ c.name }}</h2>
          <span class="badge badge-outline">{{ c.type_acti }}</span>
          <span class="badge">{{ c.total }} joueurs</span>
        </div>
        @if (c.description) {
          <p class="muted desc">{{ c.description }}</p>
        }
        @for (pf of [{ label: 'PF1', rows: c.pf1 }, { label: 'PF2', rows: c.pf2 }]; track pf.label) {
          @if (pf.rows.length) {
            <table class="table">
              <thead><tr><th>{{ pf.label }}</th><th>Nb</th><th>Build / armes</th></tr></thead>
              <tbody>
                @for (r of pf.rows; track r.role) {
                  <tr>
                    <td>{{ r.role }}</td>
                    <td>{{ r.count }}</td>
                    <td>
                      @if (buildOf(r); as b) {
                        <div class="build-cell">
                          <span>{{ b.name }}</span>
                          <app-gear [items]="b.items" size="small" />
                        </div>
                      } @else {
                        <span class="muted">{{ r.weapon }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        }
        @if (canEdit() && c.custom) {
          <div class="row">
            <a class="btn btn-sm" [routerLink]="['/g', guildId(), 'compos', c.name, 'edit']">Modifier</a>
            <button type="button" class="btn btn-sm btn-danger" (click)="remove(c)">Supprimer</button>
          </div>
        }
      </article>
    </ng-template>
  `,
  styles: `
    .intro { margin-top: -8px; }
    code { color: var(--lilac); }
    .section { margin: 32px 0 14px; color: var(--text-muted); }
    .compo { display: grid; gap: 10px; align-content: start; }
    .compo h2 { margin: 0; flex: 1; }
    .desc { margin: 0; white-space: pre-line; }
    .build-cell { display: grid; gap: 4px; }
  `,
})
export class ComposList implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);
  private readonly builds = signal<Build[]>([]);
  private readonly buildsById = computed(() => new Map(this.builds().map((b) => [b.id, b])));

  readonly guildId = input.required<string>();

  protected readonly custom = signal<Compo[]>([]);
  protected readonly defaults = signal<Compo[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));

  buildOf(row: SlotRow): Build | undefined {
    return row.build_id != null ? this.buildsById().get(row.build_id) : undefined;
  }

  async ngOnInit(): Promise<void> {
    this.items.load().catch(() => {});
    this.api.builds(this.guildId()).subscribe({ next: (b) => this.builds.set(b), error: () => {} });
    try {
      const list = await firstValueFrom(this.api.compos(this.guildId()));
      this.custom.set(list.custom);
      this.defaults.set(list.defaults);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async remove(compo: Compo): Promise<void> {
    if (!confirm(`Supprimer la compo « ${compo.name} » ? Elle ne sera plus disponible dans /acti.`)) return;
    try {
      await firstValueFrom(this.api.deleteCompo(this.guildId(), compo.name));
      this.custom.update((list) => list.filter((c) => c.name !== compo.name));
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }
}
