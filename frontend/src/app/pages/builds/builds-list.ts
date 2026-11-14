import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n';
import { ItemsService, normalize } from '../../core/items.service';
import { Build, hasLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear, choiceName, describeGear, describeSwaps } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { roleColor, sortByRole } from '../../shared/roles';

/** Un build et ce qui s'en déduit, calculé une fois par chargement (pas à chaque frappe ni à chaque rendu). */
interface BuildEntry {
  build: Build;
  /** Texte normalisé (sans accents) sur lequel porte la recherche : nom, rôle, auteur, objets et swaps. */
  haystack: string;
  /** « ZvZ, Statik » : survol du compteur et du bouton Supprimer désactivé. */
  usedBy: string;
}

/** Builds d'un même rôle : une section repliable de la liste. */
interface RoleGroup {
  role: string;
  color: string;
  entries: BuildEntry[];
}

@Component({
  selector: 'app-builds-list',
  imports: [RouterLink, Gear, Icon],
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
          (input)="query.set($any($event.target).value)"
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
                  (click)="typeActi.set(type)">{{ type || t().builds.allTypes }}</button>
        }
      </div>
      <button type="button" class="chip unused-chip" [class.on]="unusedOnly()" [attr.aria-pressed]="unusedOnly()"
              [title]="t().builds.unusedFilterTitle" (click)="unusedOnly.set(!unusedOnly())">{{ t().builds.unusedFilter }}</button>
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (buildsRes.isLoading() && !buildsRes.hasValue()) {
      @for (s of [1, 2, 3]; track s) { <div class="skeleton row-skeleton"></div> }
    } @else if (groups().length) {
      <p class="count muted">{{ t().builds.count(visible().length) }}</p>
      @for (g of groups(); track g.role) {
        @let open = !collapsed().has(g.role);
        <section class="group" [style.--role-color]="g.color">
          <h2 class="group-head">
            <button type="button" class="group-toggle" [attr.aria-expanded]="open" (click)="toggleGroup(g.role)">
              <app-icon name="chevron" [size]="14" class="chev" [class.open]="open" />
              <span class="role-tag">{{ emojis().get(g.role) }} {{ g.role }}</span>
              <span class="faint group-count">{{ g.entries.length }}</span>
            </button>
          </h2>
          @if (open) {
            <ul class="rows">
              @for (e of g.entries; track e.build.id) {
                @let b = e.build;
                <li class="build">
                  <div class="main">
                    <a class="name" [routerLink]="['/g', guildId(), 'builds', b.id]">{{ b.name }}</a>
                    <span class="badge badge-outline">{{ b.type_acti }}</span>
                    @if (b.weapon) {
                      <span class="weapon faint" [title]="b.weapon">{{ b.weapon }}</span>
                    }
                  </div>
                  <app-gear class="gear" [items]="b.items" [spells]="b.spells" size="small" [showSwaps]="false" />
                  <div class="usage">
                    @if (b.used_by.length) {
                      <details class="used">
                        <summary class="badge" [title]="e.usedBy">
                          <app-icon name="users" [size]="12" /> {{ t().builds.usedCount(b.used_by.length) }}
                        </summary>
                        <ul class="used-list card">
                          @for (c of b.used_by; track c) {
                            <li><a [routerLink]="['/g', guildId(), 'compos']" [queryParams]="{ open: c }">{{ c }}</a></li>
                          }
                        </ul>
                      </details>
                    } @else {
                      <span class="faint unused">{{ t().builds.unused }}</span>
                    }
                  </div>
                  <span class="faint by">{{ b.created_by_name }}</span>
                  @if (canEdit()) {
                    <div class="actions">
                      <a class="btn btn-sm btn-ghost btn-icon" [routerLink]="['/g', guildId(), 'builds', b.id, 'edit']"
                         [title]="t().common.edit" [attr.aria-label]="t().common.edit + ' ' + b.name">
                        <app-icon name="edit" [size]="14" />
                      </a>
                      <button type="button" class="btn btn-sm btn-danger btn-icon" [disabled]="b.used_by.length > 0"
                              [title]="b.used_by.length ? t().builds.deleteUsed(e.usedBy) : t().common.delete"
                              [attr.aria-label]="t().common.delete + ' ' + b.name" (click)="remove(b)">
                        <app-icon name="trash" [size]="14" />
                      </button>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </section>
      }
    } @else if (entries().length) {
      <div class="empty"><app-icon name="search" [size]="32" /><p>{{ query() ? t().builds.noMatch(query()) : t().builds.noMatchFilters }}</p></div>
    } @else {
      <div class="empty"><app-icon name="sword" [size]="32" /><p>{{ t().builds.none }}</p></div>
    }
  `,
  styles: `
    code { color: var(--lilac); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px; margin-bottom: 18px; }
    .search-box { flex: 1 1 260px; }
    .search { width: 100%; }
    .count { margin: 0 0 10px; font-size: .85rem; }
    .role-chip.on { background: var(--role-color); color: #fff; }
    .row-skeleton { height: 56px; margin-bottom: 8px; }

    .group { margin-bottom: 18px; }
    .group-head { margin: 0 0 8px; font-size: 1rem; }
    .group-toggle { display: inline-flex; align-items: center; gap: 10px; padding: 4px 6px; border: 0; border-radius: 8px;
                    background: transparent; color: inherit; font: inherit; cursor: pointer; }
    .group-toggle:hover { background: var(--surface-2); }
    .chev { color: var(--text-muted); transition: transform .15s; }
    .chev.open { transform: rotate(90deg); }
    .group-count { font-size: .85rem; font-weight: 600; }

    .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    /* Une ligne par build : nom | équipement | compos | auteur | actions */
    .build { display: grid; grid-template-columns: minmax(160px, 1.1fr) minmax(0, 2fr) auto 110px auto; align-items: center;
             gap: 8px 14px; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--surface);
             border: 1px solid var(--border-soft); border-left: 3px solid var(--role-color); }
    .build:hover { border-color: var(--border); border-left-color: var(--role-color); background: var(--surface-2); }
    .main { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
    .name { color: var(--text); font-weight: 600; }
    .name:hover { color: var(--lilac); text-decoration: none; }
    .weapon { flex-basis: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .78rem; }
    .gear { min-width: 0; }
    .usage { position: relative; }
    .used summary { cursor: pointer; list-style: none; }
    .used summary::-webkit-details-marker { display: none; }
    .used-list { position: absolute; right: 0; top: calc(100% + 6px); z-index: 10; min-width: 180px; margin: 0; padding: 8px;
                 list-style: none; display: grid; gap: 2px; box-shadow: var(--shadow-lg); }
    .used-list a { display: block; padding: 5px 8px; border-radius: 6px; color: var(--text); font-size: .88rem; }
    .used-list a:hover { background: var(--lilac-soft); color: var(--lilac); text-decoration: none; }
    .unused { font-size: .78rem; white-space: nowrap; }
    .by { font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .actions { display: flex; gap: 4px; }

    @media (max-width: 760px) {
      .build { grid-template-columns: minmax(0, 1fr) auto; }
      .gear { grid-column: 1 / -1; grid-row: 2; }
      .by { display: none; }
      .actions { grid-column: 2; grid-row: 1; }
      .usage { grid-column: 1 / -1; grid-row: 3; }
      .used-list { left: 0; right: auto; }
    }
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
  /** Seulement les builds utilisés dans aucune compo (ménage). */
  protected readonly unusedOnly = signal(false);
  /** Rôles dont la section est repliée. */
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());

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
        .join(' ');
      const swapNames = describeSwaps(build.items, get).map((i) => `${i.name} ${i.name_en}`).join(' ');
      const haystack = normalize(
        [build.name, build.role, build.type_acti, build.weapon, build.created_by_name, gearNames, swapNames].join(' '),
      );
      return { build, haystack, usedBy: build.used_by.join(', ') };
    });
  });

  /** Recherche instantanée (sans accents) : tous les mots doivent correspondre. */
  protected readonly visible = computed(() => {
    const words = normalize(this.query()).split(/\s+/).filter(Boolean);
    const unused = this.unusedOnly();
    return this.entries().filter((e) =>
      (!unused || !e.build.used_by.length) && words.every((w) => e.haystack.includes(w)));
  });

  /** Builds visibles rangés par rôle (TANK, HEAL, DPS, SUPPORT, puis le reste), ordre de l'API gardé dans un rôle. */
  protected readonly groups = computed((): RoleGroup[] => {
    const byRole = new Map<string, BuildEntry[]>();
    for (const e of this.visible()) byRole.set(e.build.role, [...(byRole.get(e.build.role) ?? []), e]);
    return sortByRole([...byRole], ([role]) => role).map(([role, entries]) => ({ role, color: roleColor(role), entries }));
  });

  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));

  constructor() {
    this.items.load().catch(() => {});
  }

  setRole(role: string): void {
    this.role.set(this.role() === role ? '' : role);
  }

  toggleGroup(role: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (!next.delete(role)) next.add(role);
      return next;
    });
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
