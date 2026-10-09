import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ItemsService, normalize } from '../../core/items.service';
import { Build, RoleInfo, hasLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear, GearSwaps, choiceName, describeGear, describeSwaps } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';
import { roleColor, sortByRole } from '../../shared/roles';

@Component({
  selector: 'app-builds-list',
  imports: [FormsModule, RouterLink, Gear, GearSwaps, Icon, Pager],
  template: `
    <div class="page-head">
      <div>
        <h1>Builds</h1>
        <p class="subtitle">L'équipement imposé pour chaque rôle — utilisé par les compos et envoyé en MP par <code>/massup</code>.</p>
      </div>
      @if (canEdit()) {
        <a class="btn btn-primary" [routerLink]="['/g', guildId(), 'builds', 'new']">
          <app-icon name="plus" /> Nouveau build
        </a>
      }
    </div>

    <div class="toolbar card glass">
      <label class="input-icon search-box">
        <app-icon name="search" />
        <input
          class="input search"
          type="search"
          placeholder="Rechercher un build, une arme, un objet…"
          aria-label="Rechercher un build"
          [ngModel]="query()"
          (ngModelChange)="query.set($event); page.set(1)"
        />
      </label>
      <div class="chips" role="group" aria-label="Filtrer par rôle">
        <button type="button" class="chip" [class.on]="!role()" [attr.aria-pressed]="!role()" (click)="setRole('')">Tous</button>
        @for (r of roles(); track r.name) {
          <button type="button" class="chip role-chip" [class.on]="role() === r.name" [attr.aria-pressed]="role() === r.name"
                  [style.--role-color]="color(r.name)" (click)="setRole(r.name)">{{ r.emoji }} {{ r.name }}</button>
        }
      </div>
      <div class="segmented" role="group" aria-label="Filtrer par type">
        @for (t of types; track t.value) {
          <button type="button" [class.on]="typeActi() === t.value" [attr.aria-pressed]="typeActi() === t.value"
                  (click)="setType(t.value)">{{ t.label }}</button>
        }
      </div>
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (loading()) {
      <div class="grid">
        @for (s of [1, 2, 3]; track s) { <div class="skeleton tall"></div> }
      </div>
    } @else if (visible().length) {
      <p class="count muted">{{ visible().length }} build{{ visible().length > 1 ? 's' : '' }}</p>
      <div class="grid">
        @for (b of pageBuilds(); track b.id; let i = $index) {
          <article class="card card-hover build fade-up" [style.--role-color]="color(b.role)" [style.animation-delay.ms]="i * 40">
            @if (b.image) {
              <img [src]="b.image" alt="" class="thumb" />
            }
            <div class="row tags">
              <span class="role-tag">{{ emoji(b.role) }} {{ b.role }}</span>
              <span class="badge badge-outline">{{ b.type_acti }}</span>
            </div>
            <h2><a class="title-link" [routerLink]="['/g', guildId(), 'builds', b.id]">{{ b.name }}</a></h2>
            @if (hasGear(b)) {
              <div class="body">
                <app-gear [items]="b.items" layout="doll" size="small" [showSwaps]="false" />
                @if (gearNames(b); as names) {
                  <p class="gear-names muted">{{ names }}</p>
                }
              </div>
            }
            <app-gear-swaps class="swaps" [items]="b.items" size="small" />
            @if (b.weapon) {
              <p class="weapon"><app-icon name="info" [size]="14" /> {{ b.weapon }}</p>
            }
            @if (b.notes) {
              <p class="muted notes">{{ b.notes }}</p>
            }
            <div class="foot">
              <span class="faint by">par {{ b.created_by_name }}</span>
              @if (canEdit()) {
                <div class="row actions">
                  <a class="btn btn-sm btn-ghost" [routerLink]="['/g', guildId(), 'builds', b.id, 'edit']">
                    <app-icon name="edit" [size]="14" /> Modifier
                  </a>
                  <button type="button" class="btn btn-sm btn-danger" (click)="remove(b)">
                    <app-icon name="trash" [size]="14" /> Supprimer
                  </button>
                </div>
              }
            </div>
          </article>
        }
      </div>
      <app-pager [page]="currentPage()" [pageSize]="pageSize" [total]="visible().length" label="builds"
                 (pageChange)="goToPage($event)" />
    } @else if (builds().length) {
      <div class="empty"><app-icon name="search" [size]="32" /><p>Aucun build ne correspond à « {{ query() }} ».</p></div>
    } @else {
      <div class="empty"><app-icon name="sword" [size]="32" /><p>Aucun build pour l'instant.</p></div>
    }
  `,
  styles: `
    code { color: var(--lilac); }
    .title-link { color: inherit; }
    .title-link:hover { color: var(--lilac); text-decoration: none; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px; margin-bottom: 18px; }
    .search-box { flex: 1 1 260px; }
    .search { width: 100%; }
    .count { margin: 0 0 10px; font-size: .85rem; }
    .role-chip.on { background: var(--role-color); color: #fff; }
    .tall { min-height: 280px; }

    .build { display: grid; gap: 10px; align-content: start; overflow: hidden; padding-top: 22px; }
    .build::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px;
                     background: linear-gradient(90deg, var(--role-color), transparent); }
    .build h2 { margin: 0; font-size: 1.15rem; }
    .tags { gap: 6px; }
    .thumb { width: calc(100% + 40px); margin: -22px -20px 4px; max-height: 150px; object-fit: cover; }
    .body { display: flex; gap: 14px; align-items: flex-start; }
    .gear-names { margin: 0; font-size: .8rem; line-height: 1.55; }
    .swaps { padding-top: 8px; border-top: 1px solid var(--lilac-soft); }
    .weapon { margin: 0; display: flex; gap: 6px; align-items: baseline; font-size: .88rem; }
    .weapon app-icon { color: var(--lilac); }
    .notes { margin: 0; white-space: pre-line; font-size: .88rem; }
    .foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
            margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--border-soft); }
    .by { font-size: .78rem; }
    .actions { gap: 6px; }
    @media (max-width: 420px) { .body { flex-direction: column; } }
  `,
})
export class BuildsList implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);
  private readonly toast = inject(ToastService);

  readonly guildId = input.required<string>();

  protected readonly types = [
    { value: '', label: 'Tous' },
    { value: 'PVP', label: 'PVP' },
    { value: 'PVE', label: 'PVE' },
  ];
  protected readonly builds = signal<Build[]>([]);
  protected readonly roles = signal<RoleInfo[]>([]);
  protected readonly role = signal('');
  protected readonly typeActi = signal('');
  protected readonly query = signal('');
  /** Recherche instantanée (sans accents) : nom, rôle, arme, notes, auteur et objets de l'équipement. */
  protected readonly visible = computed(() => {
    const words = normalize(this.query()).split(/\s+/).filter(Boolean);
    if (!words.length) return this.builds();
    return this.builds().filter((b) => {
      const text = normalize(
        [b.name, b.role, b.type_acti, b.weapon, b.notes, b.created_by_name, this.gearNames(b), this.swapNames(b)].join(' '),
      );
      return words.every((w) => text.includes(w));
    });
  });

  /** Pagination côté navigateur ; revient à la page 1 quand la recherche ou les filtres changent. */
  protected readonly pageSize = 12;
  protected readonly page = signal(1);
  /** Page bornée au nombre de pages (ex. après une suppression sur la dernière page). */
  protected readonly currentPage = computed(() =>
    Math.min(this.page(), Math.max(1, Math.ceil(this.visible().length / this.pageSize))));
  protected readonly pageBuilds = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.visible().slice(start, start + this.pageSize);
  });

  goToPage(page: number): void {
    this.page.set(page);
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));

  async ngOnInit(): Promise<void> {
    this.items.load().catch(() => {});
    this.api.roles(this.guildId()).subscribe({
      next: (r) => this.roles.set(sortByRole(r, (x) => x.name)),
      error: () => {},
    });
    await this.load();
  }

  setRole(role: string): void {
    this.role.set(this.role() === role ? '' : role);
    void this.load();
  }

  setType(type: string): void {
    this.typeActi.set(type);
    void this.load();
  }

  async load(): Promise<void> {
    this.page.set(1);
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

  hasGear(build: Build): boolean {
    return describeGear(build.items, (id) => this.items.get(id)).length > 0;
  }

  /** « Épée large 8.1 ou Hallebarde · Bouclier · Cape au choix » (les swaps ont leur propre rangée d'icônes). */
  gearNames(build: Build): string {
    return describeGear(build.items, (id) => this.items.get(id))
      .map((g) => (g.free ? `${g.label} au choix` : g.items.map(choiceName).join(' ou ')))
      .join(' · ');
  }

  /** Noms des swaps, pour la recherche. */
  swapNames(build: Build): string {
    return describeSwaps(build.items, (id) => this.items.get(id)).map((i) => i.name).join(' ');
  }

  emoji(role: string): string {
    return this.roles().find((r) => r.name === role)?.emoji ?? '';
  }

  color(role: string): string {
    return roleColor(role);
  }

  async remove(build: Build): Promise<void> {
    if (!confirm(`Supprimer le build « ${build.name} » ?`)) return;
    try {
      await firstValueFrom(this.api.deleteBuild(this.guildId(), build.id));
      this.builds.update((list) => list.filter((b) => b.id !== build.id));
      this.toast.success(`Build « ${build.name} » supprimé.`);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }
}
