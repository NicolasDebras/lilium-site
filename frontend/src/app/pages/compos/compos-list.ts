import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, afterRenderEffect, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService, dict } from '../../core/i18n/i18n';
import { ItemsService } from '../../core/items.service';
import { Build, Compo, SlotRow, hasLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { ImageShare, fileSlug } from '../../shared/image-share';
import { RoleBar } from '../../shared/role-bar';
import { roleColor, sortByRole } from '../../shared/roles';

/** Une ligne de compo avec ses builds résolus (principal + au choix). */
interface CardRow {
  row: SlotRow;
  color: string;
  build?: Build;
  alts: Build[];
  /** Résumé de la carte repliée : « Tank Masse », « Ardent / Aria », « DPS · Arc » (ligne libre). */
  label: string;
}

/** Une compo et ce que la carte en affiche, calculé une fois par chargement. */
interface CompoCard {
  compo: Compo;
  /** Ancre de la carte (lien « ?open= » depuis un build). */
  anchor: string;
  /** PF1 puis PF2 : barre des rôles. */
  rows: SlotRow[];
  /** Parties non vides, lignes rangées par rôle. */
  parties: { key: 'pf1' | 'pf2'; rows: CardRow[] }[];
  /** L'image ne montre que les rôles liés à un build : sans build, pas d'image. */
  hasBuilds: boolean;
}

function toCard(compo: Compo, builds: Map<number, Build>): CompoCard {
  const t = dict().compos;
  const resolve = (row: SlotRow): CardRow => {
    const build = row.build_id != null ? builds.get(row.build_id) : undefined;
    const alts = (row.alt_build_ids ?? []).map((id) => builds.get(id)).filter((b): b is Build => !!b);
    const label = row.build_id != null
      ? (build ? [build, ...alts].map((b) => b.name).join(' / ') : row.weapon)
      : row.weapon ? `${row.role} · ${row.weapon}` : t.freeRow(row.role);
    return { row, color: roleColor(row.role), build, alts, label };
  };
  const parties = [{ key: 'pf1' as const, rows: compo.pf1 }, { key: 'pf2' as const, rows: compo.pf2 }]
    .filter((pf) => pf.rows.length)
    .map((pf) => ({ key: pf.key, rows: sortByRole(pf.rows, (r) => r.role).map(resolve) }));
  const rows = [...compo.pf1, ...compo.pf2];
  return { compo, anchor: anchorOf(compo.name), rows, parties, hasBuilds: rows.some((r) => r.build_id != null) };
}

function anchorOf(name: string): string {
  return `compo-${fileSlug(name)}`;
}

/** Parts de paie d'une ligne : « 0,5 part », « 2 parts » (« 0.5 shares » en anglais). */
export function shareLabel(share: number): string {
  return dict().compos.shares(share);
}

@Component({
  selector: 'app-compos-list',
  imports: [NgTemplateOutlet, RouterLink, Gear, Icon, ImageShare, RoleBar],
  template: `
    <div class="page-head">
      <div>
        <h1>{{ t().compos.title }}</h1>
        <p class="subtitle">{{ t().compos.subtitle[0] }}<code>/acti</code>{{ t().compos.subtitle[1] }}</p>
      </div>
      @if (canEdit()) {
        <a class="btn btn-primary" [routerLink]="['/g', guildId(), 'compos', 'new']"><app-icon name="plus" /> {{ t().compos.new }}</a>
      }
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (list.isLoading() && !list.hasValue()) {
      <div class="grid">
        @for (s of [1, 2]; track s) { <div class="skeleton tall"></div> }
      </div>
    } @else {
      @if (custom().length) {
        <div class="compos">
          @for (v of custom(); track v.compo.name; let i = $index) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: v, i: i }" />
          }
        </div>
      } @else {
        <div class="empty"><app-icon name="users" [size]="32" /><p>{{ t().compos.none }}</p></div>
      }

      @if (defaults().length) {
        <h2 class="section-title">{{ t().compos.defaults }}</h2>
        <div class="compos">
          @for (v of defaults(); track v.compo.name; let i = $index) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: v, i: i }" />
          }
        </div>
      }
    }

    <ng-template #card let-v let-i="i">
      @let c = v.compo;
      @let open = expanded().has(c.name);
      <article class="card compo fade-up" [id]="v.anchor" [class.open]="open" [style.animation-delay.ms]="i * 50"
               (click)="cardClick(c.name, $event)">
        <header class="head">
          <div class="title">
            <h2>{{ c.name }}</h2>
            <div class="row">
              <span class="badge badge-outline">{{ c.type_acti }}</span>
              <span class="badge"><app-icon name="users" [size]="12" /> {{ t().common.players(c.total) }}</span>
            </div>
          </div>
          @if (c.image) {
            <img [src]="c.image" alt="" class="thumb" />
          }
        </header>
        @if (c.description) {
          <p class="muted desc" [class.clamp]="!open">{{ c.description }}</p>
        }
        <app-role-bar [rows]="v.rows" [emojis]="emojis()" />

        @if (!open) {
          <ul class="summary">
            @for (pf of v.parties; track pf.key) {
              @for (r of pf.rows; track $index) {
                <li [style.--role-color]="r.color">
                  @if (r.build) {
                    <a class="sum-name" [routerLink]="['/g', guildId(), 'builds', r.build.id]">{{ r.label }}</a>
                  } @else {
                    <span class="sum-name muted">{{ r.label }}</span>
                  }
                  <span class="times num">×{{ r.row.count }}</span>
                </li>
              }
            }
          </ul>
        } @else {
          @for (pf of v.parties; track pf.key) {
            <section class="party">
              <h3>{{ pf.key === 'pf1' ? t().compos.party1 : t().compos.party2 }}</h3>
              <ul class="lines">
                @for (r of pf.rows; track $index) {
                  <li [style.--role-color]="r.color">
                    <span class="role-tag">{{ emojis()[r.row.role] ?? '' }} {{ r.row.role }}</span>
                    <span class="times num">×{{ r.row.count }}@if (c.custom_shares && r.row.share != null && r.row.share !== 1) {<span class="share" [title]="t().compos.shareTitle"> · 💰 {{ shareLabel(r.row.share) }}</span>}</span>
                    @if (r.build; as b) {
                      <a class="build-name" [routerLink]="['/g', guildId(), 'builds', b.id]">{{ b.name }}</a>
                      <app-gear [items]="b.items" [spells]="b.spells" size="small" />
                      @for (alt of r.alts; track alt.id) {
                        <span class="alt-or muted">{{ t().compos.or }}</span>
                        <a class="build-name" [routerLink]="['/g', guildId(), 'builds', alt.id]">{{ alt.name }}</a>
                        <app-gear [items]="alt.items" [spells]="alt.spells" size="small" />
                      }
                    } @else {
                      <span class="muted build-name">{{ r.row.weapon || t().compos.freeRole }}</span>
                    }
                  </li>
                }
              </ul>
            </section>
          }
        }

        <div class="foot row">
          <button type="button" class="btn btn-sm btn-ghost toggle" [attr.aria-expanded]="open" (click)="toggle(c.name)">
            <app-icon name="chevron" [size]="14" class="chev" [class.open]="open" /> {{ open ? t().compos.hide : t().compos.details }}
          </button>
          @if (c.custom) {
            @if (v.hasBuilds) {
              <button type="button" class="btn btn-sm" [attr.aria-expanded]="imageOf() === c.name"
                      (click)="toggleImage(c.name)"><app-icon name="sparkles" [size]="14" /> {{ t().compos.image }}</button>
            }
            @if (canEdit()) {
              <a class="btn btn-sm btn-ghost" [routerLink]="['/g', guildId(), 'compos', c.name, 'edit']"><app-icon name="edit" [size]="14" /> {{ t().common.edit }}</a>
              <a class="btn btn-sm btn-ghost duplicate" [routerLink]="['/g', guildId(), 'compos', 'new']" [queryParams]="{ from: c.name }"
                 [title]="t().compos.duplicateHint"><app-icon name="plus" [size]="14" /> {{ t().compos.duplicate }}</a>
              @if (open) {
                <button type="button" class="btn btn-sm btn-ghost" (click)="publish(c)"><app-icon name="book" [size]="14" /> {{ t().compos.publish }}</button>
                @if (copyTargets().length) {
                  <label class="sr-only" [attr.for]="'copy-' + v.anchor">{{ t().compos.copyTo }}</label>
                  <select class="select copy" [id]="'copy-' + v.anchor" (change)="copyTo(c, $any($event.target))">
                    <option value="">{{ t().compos.copyToShort }}</option>
                    @for (g of copyTargets(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
                  </select>
                }
                <button type="button" class="btn btn-sm btn-danger" (click)="remove(c)"><app-icon name="trash" [size]="14" /> {{ t().common.delete }}</button>
              }
            }
          }
        </div>
        @if (c.custom && imageOf() === c.name) {
          <app-image-share [src]="imageUrl(c.name)" [alt]="t().compos.imageAlt(c.name)" [fileName]="'compo-' + slug(c.name)" />
        }
      </article>
    </ng-template>
  `,
  styles: `
    code { color: var(--lilac); }
    .tall { min-height: 200px; }
    /* Colonnes « masonry » : chaque carte garde sa hauteur (une compo dépliée n'étire pas ses voisines). */
    .compos { columns: auto 420px; column-gap: 18px; }
    .compos > .compo { break-inside: avoid; margin-bottom: 18px; }
    .compo { display: grid; gap: 12px; align-content: start; scroll-margin-top: 80px; transition: border-color .2s, box-shadow .2s; }
    .compo.open { border-color: var(--lilac-deep); box-shadow: var(--shadow-glow); }
    /* Repliée : toute la carte se clique pour déplier ; dépliée : l'en-tête se clique pour replier */
    .compo:not(.open) { cursor: pointer; }
    .compo:not(.open):hover { border-color: var(--lilac-strong); }
    .compo.open .head { cursor: pointer; }
    .head { display: flex; gap: 14px; justify-content: space-between; align-items: flex-start; }
    .title { display: grid; gap: 8px; min-width: 0; }
    .title h2 { margin: 0; font-size: 1.2rem; }
    .thumb { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; flex: none; }
    .desc { margin: 0; white-space: pre-line; font-size: .9rem; }
    .desc.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    /* Carte repliée : une pastille par ligne (pastille de couleur du rôle + build + nombre) */
    .summary { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .summary li { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 9px 3px 7px;
                  border-radius: 999px; background: var(--bg-2); border: 1px solid var(--border-soft); font-size: .82rem; }
    .summary li::before { content: ''; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--role-color); }
    .sum-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
    a.sum-name:hover { color: var(--lilac); text-decoration: none; }

    .party h3 { margin: 0 0 8px; font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); }
    .lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    /* Rôle, nombre et nom du build sur une ligne ; équipement + swaps dessous, sur toute la largeur */
    .lines li { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 8px 10px;
                padding: 8px 10px; border-radius: 10px; background: var(--bg-2); border: 1px solid var(--border-soft);
                border-left: 3px solid var(--role-color); }
    .lines li app-gear { grid-column: 1 / -1; }
    .times { color: var(--text-muted); font-weight: 600; font-size: .85rem; white-space: nowrap; }
    .share { color: var(--lilac); }
    .build-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }
    a.build-name { color: var(--text); }
    a.build-name:hover { color: var(--lilac); text-decoration: none; }
    .alt-or { font-size: .8rem; font-style: italic; }
    .foot { padding-top: 10px; border-top: 1px solid var(--border-soft); flex-wrap: wrap; }
    .chev { transition: transform .15s; }
    .chev.open { transform: rotate(90deg); }
    .copy { width: auto; }
  `,
})
export class ComposList {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = inject(I18nService).t;

  readonly guildId = input.required<string>();
  /** `?open=Nom` (lien depuis un build) : compo dépliée et amenée à l'écran. */
  readonly open = input<string>();

  protected readonly list = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.compos(params) });
  private readonly buildsRes = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.builds(params) });
  private readonly rolesRes = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.roles(params) });

  private readonly buildsById = computed(() => new Map((this.buildsRes.hasValue() ? this.buildsRes.value() : []).map((b) => [b.id, b])));
  protected readonly custom = computed(() =>
    (this.list.hasValue() ? this.list.value().custom.map((c) => toCard(c, this.buildsById())) : []));
  protected readonly defaults = computed(() =>
    (this.list.hasValue() ? this.list.value().defaults.map((c) => toCard(c, this.buildsById())) : []));
  protected readonly emojis = computed((): Record<string, string> =>
    Object.fromEntries((this.rolesRes.hasValue() ? this.rolesRes.value() : []).map((r) => [r.name, r.emoji])));
  private readonly actionError = signal('');
  protected readonly error = computed(() => (this.list.error() ? errorMessage(this.list.error()) : this.actionError()));
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));
  /** Mes autres serveurs où je suis staff : cibles possibles d'une copie. */
  protected readonly copyTargets = computed(() =>
    this.auth.guilds().filter((g) => g.id !== this.guildId() && hasLevel(g.level, 'staff')));

  /** Compos dépliées (repliées par défaut, sauf celle de `?open=`). */
  protected readonly expanded = linkedSignal<ReadonlySet<string>>(() => {
    const name = this.open();
    return new Set(name ? [name] : []);
  });
  /** Compo dont l'image est affichée (une à la fois). */
  protected readonly imageOf = signal<string | null>(null);
  protected readonly slug = fileSlug;
  /** `?open=` déjà amenée à l'écran (une seule fois, pas à chaque rendu). */
  private scrolledTo: string | null = null;

  constructor() {
    this.items.load().catch(() => {});
    afterRenderEffect(() => {
      const name = this.open();
      if (!name || !this.list.hasValue() || this.scrolledTo === name) return;
      const card = this.host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(anchorOf(name))}`);
      if (!card) return;
      this.scrolledTo = name;
      card.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  }

  toggle(name: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  /** Clic sur la carte : repliée → dépliée ; dépliée → repliée seulement par l'en-tête
   *  (cliquer dans le détail ne la referme pas). Les liens, boutons et menus gardent leur action. */
  cardClick(name: string, event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, select, input, label, app-image-share')) return;
    if (!this.expanded().has(name) || target.closest('.head')) this.toggle(name);
  }

  protected readonly shareLabel = shareLabel;

  async copyTo(c: Compo, select: HTMLSelectElement): Promise<void> {
    const target = this.copyTargets().find((g) => g.id === select.value);
    select.value = '';
    if (!target) return;
    try {
      const { name } = await firstValueFrom(this.api.copyCompo(target.id, this.guildId(), c.name));
      this.toast.success(this.t().compos.copied(name, target.name));
    } catch (err) {
      this.toast.error(errorMessage(err));
    }
  }

  async publish(c: Compo): Promise<void> {
    if (!confirm(this.t().compos.confirmPublish(c.name))) return;
    try {
      await firstValueFrom(this.api.publishCompo(this.guildId(), c.name));
      this.toast.success(this.t().compos.published);
    } catch (err) {
      this.toast.error(errorMessage(err));
    }
  }

  toggleImage(name: string): void {
    this.imageOf.update((open) => (open === name ? null : name));
  }

  imageUrl(name: string): string {
    return this.api.compoImageUrl(this.guildId(), name);
  }

  async remove(compo: Compo): Promise<void> {
    if (!confirm(this.t().compos.confirmDelete(compo.name))) return;
    try {
      await firstValueFrom(this.api.deleteCompo(this.guildId(), compo.name));
      this.list.update((list) => list && { ...list, custom: list.custom.filter((c) => c.name !== compo.name) });
      this.toast.success(this.t().compos.deleted(compo.name));
    } catch (err) {
      this.actionError.set(errorMessage(err));
    }
  }
}
