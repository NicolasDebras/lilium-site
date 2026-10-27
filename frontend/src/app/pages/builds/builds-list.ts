import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n';
import { ItemsService, itemName, normalize } from '../../core/items.service';
import { Build, hasLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear, GearSwaps, choiceName, describeGear, describeSwaps } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';
import { roleColor, sortByRole } from '../../shared/roles';

/** Un build et ce qui s'en déduit, calculé une fois par chargement (pas à chaque frappe ni à chaque rendu). */
interface BuildEntry {
  build: Build;
  /** « Épée large 8.1 ou Hallebarde · Cape au choix » ; vide si le build n'a pas d'équipement. */
  gearNames: string;
  /** Texte normalisé (sans accents) sur lequel porte la recherche. */
  haystack: string;
}

@Component({
  selector: 'app-builds-list',
  imports: [RouterLink, Gear, GearSwaps, Icon, Pager],
  template: `
    <div class="page-head">
      <div>
        <h1>{{ t().builds.title }}</h1>
        <p class="subtitle">{{ t().builds.subtitle[0] }}<code>/massup</code>{{ t().builds.subtitle[1] }}</p>
      </div>
      @if (canEdit()) {
        <a class="btn btn-primary" [routerLink]="['/g', guildId(), 'builds', 'new']">
          <app-icon name="plus" /> {{ t().builds.new }}
        </a>
      }
    </div>

    <div class="toolbar card glass">
      <label class="input-icon search-box">
        <app-icon name="search" />
        <input
          class="input search"
          type="search"
          [placeholder]="t().builds.searchPlaceholder"
          [attr.aria-label]="t().builds.searchAria"
          [value]="query()"
          (input)="query.set($any($event.target).value); page.set(1)"
        />
      </label>
      <div class="chips" role="group" [attr.aria-label]="t().builds.filterRole">
        <button type="button" class="chip" [class.on]="!role()" [attr.aria-pressed]="!role()" (click)="setRole('')">{{ t().builds.allTypes }}</button>
        @for (r of roles(); track r.name) {
          <button type="button" class="chip role-chip" [class.on]="role() === r.name" [attr.aria-pressed]="role() === r.name"
                  [style.--role-color]="color(r.name)" (click)="setRole(r.name)">{{ r.emoji }} {{ r.name }}</button>
        }
      </div>
      <div class="segmented" role="group" [attr.aria-label]="t().builds.filterType">
        @for (type of types; track type) {
          <button type="button" [class.on]="typeActi() === type" [attr.aria-pressed]="typeActi() === type"
                  (click)="setType(type)">{{ type || t().builds.allTypes }}</button>
        }
      </div>
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (buildsRes.isLoading() && !buildsRes.hasValue()) {
      <div class="grid">
        @for (s of [1, 2, 3]; track s) { <div class="skeleton tall"></div> }
      </div>
    } @else if (visible().length) {
      <p class="count muted">{{ t().builds.count(visible().length) }}</p>
      <div class="grid">
        @for (e of pageBuilds(); track e.build.id; let i = $index) {
          @let b = e.build;
          <article class="card card-hover build fade-up" [style.--role-color]="color(b.role)" [style.animation-delay.ms]="i * 40">
            <div class="row tags">
              <span class="role-tag">{{ emojis().get(b.role) }} {{ b.role }}</span>
              <span class="badge badge-outline">{{ b.type_acti }}</span>
            </div>
            <h2><a class="title-link" [routerLink]="['/g', guildId(), 'builds', b.id]">{{ b.name }}</a></h2>
            @if (e.gearNames) {
              <div class="body">
                <app-gear [items]="b.items" [spells]="b.spells" layout="doll" size="small" [showSwaps]="false" />
                <p class="gear-names muted">{{ e.gearNames }}</p>
              </div>
            }
            <app-gear-swaps class="swaps" [items]="b.items" size="small" />
            @if (b.weapon) {
              <p class="weapon"><app-icon name="info" [size]="14" /> {{ b.weapon }}</p>
            }
            <div class="foot">
              <span class="faint by">{{ t().builds.by(b.created_by_name) }}</span>
              @if (canEdit()) {
                <div class="row actions">
                  <a class="btn btn-sm btn-ghost" [routerLink]="['/g', guildId(), 'builds', b.id, 'edit']">
                    <app-icon name="edit" [size]="14" /> {{ t().common.edit }}
                  </a>
                  <button type="button" class="btn btn-sm btn-danger" (click)="remove(b)">
                    <app-icon name="trash" [size]="14" /> {{ t().common.delete }}
                  </button>
                </div>
              }
            </div>
          </article>
        }
      </div>
      <app-pager [page]="currentPage()" [pageSize]="pageSize" [total]="visible().length" [label]="t().builds.pagerLabel"
                 (pageChange)="goToPage($event)" />
    } @else if (entries().length) {
      <div class="empty"><app-icon name="search" [size]="32" /><p>{{ t().builds.noMatch(query()) }}</p></div>
    } @else {
      <div class="empty"><app-icon name="sword" [size]="32" /><p>{{ t().builds.none }}</p></div>
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
    .body { display: flex; gap: 14px; align-items: flex-start; }
    .gear-names { margin: 0; font-size: .8rem; line-height: 1.55; }
    .swaps { padding-top: 8px; border-top: 1px solid var(--lilac-soft); }
    .weapon { margin: 0; display: flex; gap: 6px; align-items: baseline; font-size: .88rem; }
    .weapon app-icon { color: var(--lilac); }
    .foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
            margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--border-soft); }
    .by { font-size: .78rem; }
    .actions { gap: 6px; }
    @media (max-width: 420px) { .body { flex-direction: column; } }
  `,
})
export class BuildsList {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);
  private readonly toast = inject(ToastService);

  readonly guildId = input.required<string>();

  protected readonly t = inject(I18nService).t;
  protected readonly types = ['', 'PVP', 'PVE'];
  protected readonly role = signal('');
  protected readonly typeActi = signal('');
  protected readonly query = signal('');

  private readonly rolesRes = rxResource({
    params: () => this.guildId(),
    stream: ({ params }) => this.api.roles(params),
  });
  protected readonly roles = computed(() => (this.rolesRes.hasValue() ? sortByRole(this.rolesRes.value(), (r) => r.name) : []));
  protected readonly emojis = computed(() => new Map(this.roles().map((r) => [r.name, r.emoji])));

  /** Rechargé automatiquement quand le serveur ou un filtre change (la requête précédente est annulée). */
  protected readonly buildsRes = rxResource({
    params: () => ({ guildId: this.guildId(), role: this.role(), type_acti: this.typeActi() }),
    stream: ({ params: { guildId, ...filters } }) => this.api.builds(guildId, filters),
  });
  private readonly actionError = signal('');
  protected readonly error = computed(() => {
    const err = this.buildsRes.error();
    return err ? errorMessage(err) : this.actionError();
  });

  protected readonly entries = computed((): BuildEntry[] => {
    const builds = this.buildsRes.hasValue() ? this.buildsRes.value() : [];
    this.items.byId();   // catalogue chargé après les builds : on recalcule les noms
    const get = (id: string) => this.items.get(id);
    return builds.map((build) => {
      const gearNames = describeGear(build.items, get)
        .map((g) => (g.free ? this.t().builds.slotFree(g.label) : g.items.map(choiceName).join(this.t().gear.or)))
        .join(' · ');
      const swapNames = describeSwaps(build.items, get).map((i) => `${i.name} ${i.name_en}`).join(' ');
      const haystack = normalize(
        [build.name, build.role, build.type_acti, build.weapon, build.created_by_name, gearNames, swapNames].join(' '),
      );
      return { build, gearNames, haystack };
    });
  });

  /** Recherche instantanée (sans accents) : nom, rôle, précisions, auteur et objets de l'équipement. */
  protected readonly visible = computed(() => {
    const words = normalize(this.query()).split(/\s+/).filter(Boolean);
    return words.length ? this.entries().filter((e) => words.every((w) => e.haystack.includes(w))) : this.entries();
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
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));

  constructor() {
    this.items.load().catch(() => {});
  }

  goToPage(page: number): void {
    this.page.set(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setRole(role: string): void {
    this.role.set(this.role() === role ? '' : role);
    this.page.set(1);
  }

  setType(type: string): void {
    this.typeActi.set(type);
    this.page.set(1);
  }

  color(role: string): string {
    return roleColor(role);
  }

  async remove(build: Build): Promise<void> {
    if (!confirm(this.t().builds.confirmDelete(build.name))) return;
    try {
      await firstValueFrom(this.api.deleteBuild(this.guildId(), build.id));
      this.buildsRes.update((list) => list?.filter((b) => b.id !== build.id));
      this.toast.success(this.t().builds.deleted(build.name));
    } catch (err) {
      this.actionError.set(errorMessage(err));
    }
  }
}
