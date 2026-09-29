import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ItemsService, itemIconUrl, useFallbackIcon } from '../../core/items.service';
import { Build, Item, RoleInfo, SLOTS, SLOT_LABELS, hasLevel } from '../../core/models';

@Component({
  selector: 'app-builds-list',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <h1>Builds</h1>
      @if (canEdit()) {
        <a class="btn btn-primary" [routerLink]="['/g', guildId(), 'builds', 'new']">+ Nouveau build</a>
      }
    </div>

    <div class="row filters">
      <select class="select" aria-label="Filtrer par rôle" [ngModel]="role()" (ngModelChange)="role.set($event); load()">
        <option value="">Tous les rôles</option>
        @for (r of roles(); track r.name) {
          <option [value]="r.name">{{ r.emoji }} {{ r.name }}</option>
        }
      </select>
      <select class="select" aria-label="Filtrer par type" [ngModel]="typeActi()" (ngModelChange)="typeActi.set($event); load()">
        <option value="">PVP et PVE</option>
        <option value="PVP">PVP</option>
        <option value="PVE">PVE</option>
      </select>
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (loading()) {
      <p class="muted">Chargement…</p>
    } @else if (builds().length) {
      <div class="grid">
        @for (b of builds(); track b.id) {
          <article class="card build">
            @if (b.image) {
              <img [src]="b.image" alt="" class="thumb" />
            }
            <div class="row">
              <span class="badge">{{ emoji(b.role) }} {{ b.role }}</span>
              <span class="badge badge-outline">{{ b.type_acti }}</span>
            </div>
            <h2>{{ b.name }}</h2>
            @if (equipment(b); as eq) {
              @if (eq.length) {
                <div class="gear">
                  @for (e of eq; track e.slot) {
                    <img [src]="icon(e.item)" [alt]="e.item.name" [title]="e.label + ' : ' + e.item.name"
                         width="48" height="48" loading="lazy" (error)="fallback($event)" />
                  }
                </div>
                <p class="gear-names muted">{{ names(eq) }}</p>
              }
            }
            @if (b.weapon) {
              <p class="weapon">{{ b.weapon }}</p>
            }
            @if (b.notes) {
              <p class="muted notes">{{ b.notes }}</p>
            }
            <p class="muted by">par {{ b.created_by_name }}</p>
            @if (canEdit()) {
              <div class="row actions">
                <a class="btn btn-sm" [routerLink]="['/g', guildId(), 'builds', b.id, 'edit']">Modifier</a>
                <button type="button" class="btn btn-sm btn-danger" (click)="remove(b)">Supprimer</button>
              </div>
            }
          </article>
        }
      </div>
    } @else {
      <div class="empty">Aucun build pour l'instant.</div>
    }
  `,
  styles: `
    .filters { margin-bottom: 18px; }
    .filters .select { width: auto; min-width: 170px; }
    .build { display: grid; gap: 8px; align-content: start; }
    .build h2 { margin: 0; }
    .thumb { width: 100%; max-height: 160px; object-fit: cover; border-radius: 8px; }
    .weapon, .notes, .by, .gear-names { margin: 0; }
    .gear { display: flex; flex-wrap: wrap; gap: 4px; }
    .gear img { width: 48px; height: 48px; border-radius: 8px; background: var(--surface-2); }
    .gear-names { font-size: .8rem; }
    .notes { white-space: pre-line; }
    .by { font-size: .8rem; }
    .actions { margin-top: 4px; }
  `,
})
export class BuildsList implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);

  readonly guildId = input.required<string>();

  protected readonly builds = signal<Build[]>([]);
  protected readonly roles = signal<RoleInfo[]>([]);
  protected readonly role = signal('');
  protected readonly typeActi = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));

  async ngOnInit(): Promise<void> {
    this.items.load().catch(() => {});
    this.api.roles(this.guildId()).subscribe({ next: (r) => this.roles.set(r), error: () => {} });
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.builds.set(
        await firstValueFrom(this.api.builds(this.guildId(), { role: this.role(), type_acti: this.typeActi() })),
      );
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Objets du build dans l'ordre des emplacements (inconnus du catalogue ignorés). */
  equipment(build: Build): { slot: string; label: string; item: Item }[] {
    return SLOTS.flatMap((slot) => {
      const item = this.items.get(build.items?.[slot]);
      return item ? [{ slot, label: SLOT_LABELS[slot], item }] : [];
    });
  }

  names(eq: { item: Item }[]): string {
    return eq.map((e) => e.item.name).join(' · ');
  }

  icon(item: Item): string {
    return itemIconUrl(item.icon);
  }

  fallback(event: Event): void {
    useFallbackIcon(event);
  }

  emoji(role: string): string {
    return this.roles().find((r) => r.name === role)?.emoji ?? '';
  }

  async remove(build: Build): Promise<void> {
    if (!confirm(`Supprimer le build « ${build.name} » ?`)) return;
    try {
      await firstValueFrom(this.api.deleteBuild(this.guildId(), build.id));
      this.builds.update((list) => list.filter((b) => b.id !== build.id));
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }
}
