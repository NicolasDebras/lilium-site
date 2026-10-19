import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
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

/** Une compo et ce que la carte en affiche, calculé une fois par chargement. */
interface CompoCard {
  compo: Compo;
  /** PF1 puis PF2 : barre des rôles. */
  rows: SlotRow[];
  /** Parties non vides, lignes rangées par rôle. */
  parties: { key: 'pf1' | 'pf2'; rows: SlotRow[] }[];
  /** L'image ne montre que les rôles liés à un build : sans build, pas d'image. */
  hasBuilds: boolean;
}

function toCard(compo: Compo): CompoCard {
  const parties = [{ key: 'pf1' as const, rows: compo.pf1 }, { key: 'pf2' as const, rows: compo.pf2 }]
    .filter((pf) => pf.rows.length)
    .map((pf) => ({ key: pf.key, rows: sortByRole(pf.rows, (r) => r.role) }));
  const rows = [...compo.pf1, ...compo.pf2];
  return { compo, rows, parties, hasBuilds: rows.some((r) => r.build_id != null) };
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
        <div class="grid compos">
          @for (v of custom(); track v.compo.name; let i = $index) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: v, i: i }" />
          }
        </div>
      } @else {
        <div class="empty"><app-icon name="users" [size]="32" /><p>{{ t().compos.none }}</p></div>
      }

      @if (defaults().length) {
        <h2 class="section-title">{{ t().compos.defaults }}</h2>
        <div class="grid compos">
          @for (v of defaults(); track v.compo.name; let i = $index) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: v, i: i }" />
          }
        </div>
      }
    }

    <ng-template #card let-v let-i="i">
      @let c = v.compo;
      <article class="card card-hover compo fade-up" [style.animation-delay.ms]="i * 50">
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
          <p class="muted desc">{{ c.description }}</p>
        }
        <app-role-bar [rows]="v.rows" [emojis]="emojis()" />

        @for (pf of v.parties; track pf.key) {
            <section class="party">
              <h3>{{ pf.key === 'pf1' ? t().compos.party1 : t().compos.party2 }}</h3>
              <ul class="lines">
                @for (r of pf.rows; track $index) {
                  <li [style.--role-color]="color(r.role)">
                    <span class="role-tag">{{ emojis()[r.role] ?? '' }} {{ r.role }}</span>
                    <span class="times num">×{{ r.count }}@if (c.custom_shares && r.share != null && r.share !== 1) {<span class="share" [title]="t().compos.shareTitle"> · 💰 {{ shareLabel(r.share) }}</span>}</span>
                    @if (buildOf(r); as b) {
                      <span class="build-name">{{ b.name }}</span>
                      <app-gear [items]="b.items" size="small" />
                    } @else {
                      <span class="muted build-name">{{ r.weapon || t().compos.freeRole }}</span>
                    }
                  </li>
                }
              </ul>
            </section>
        }
        @if (c.custom && (canEdit() || v.hasBuilds)) {
          <div class="foot row">
            @if (v.hasBuilds) {
              <button type="button" class="btn btn-sm" [attr.aria-expanded]="imageOf() === c.name"
                      (click)="toggleImage(c.name)"><app-icon name="sparkles" [size]="14" /> {{ t().compos.image }}</button>
            }
            @if (canEdit()) {
              <a class="btn btn-sm btn-ghost" [routerLink]="['/g', guildId(), 'compos', c.name, 'edit']"><app-icon name="edit" [size]="14" /> {{ t().common.edit }}</a>
              <button type="button" class="btn btn-sm btn-danger" (click)="remove(c)"><app-icon name="trash" [size]="14" /> {{ t().common.delete }}</button>
              <button type="button" class="btn btn-sm btn-ghost" (click)="publish(c)"><app-icon name="book" [size]="14" /> {{ t().compos.publish }}</button>
              @if (copyTargets().length) {
                <label class="sr-only" [attr.for]="'copy-' + i">{{ t().compos.copyTo }}</label>
                <select class="select copy" [id]="'copy-' + i" (change)="copyTo(c, $any($event.target))">
                  <option value="">{{ t().compos.copyToShort }}</option>
                  @for (g of copyTargets(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
                </select>
              }
            }
          </div>
          @if (imageOf() === c.name) {
            <app-image-share [src]="imageUrl(c.name)" [alt]="t().compos.imageAlt(c.name)" [fileName]="'compo-' + slug(c.name)" />
          }
        }
      </article>
    </ng-template>
  `,
  styles: `
    code { color: var(--lilac); }
    .tall { min-height: 260px; }
    .compos { grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); }
    .compo { display: grid; gap: 14px; align-content: start; }
    .head { display: flex; gap: 14px; justify-content: space-between; align-items: flex-start; }
    .title { display: grid; gap: 8px; min-width: 0; }
    .title h2 { margin: 0; font-size: 1.25rem; }
    .thumb { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; flex: none; }
    .desc { margin: 0; white-space: pre-line; font-size: .9rem; }
    .party h3 { margin: 0 0 8px; font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); }
    .lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    /* Rôle, nombre et nom du build sur une ligne ; équipement + swaps dessous, sur toute la largeur
       (sinon le nom du build est écrasé et les swaps passent à la ligne au hasard). */
    .lines li { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 8px 10px;
                padding: 8px 10px; border-radius: 10px; background: var(--bg-2); border: 1px solid var(--border-soft);
                border-left: 3px solid var(--role-color); }
    .lines li app-gear { grid-column: 1 / -1; }
    .times { color: var(--text-muted); font-weight: 600; font-size: .85rem; white-space: nowrap; }
    .share { color: var(--lilac); }
    .build-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }
    .foot { padding-top: 12px; border-top: 1px solid var(--border-soft); flex-wrap: wrap; }
    .copy { width: auto; }
  `,
})
export class ComposList {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;

  readonly guildId = input.required<string>();

  protected readonly list = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.compos(params) });
  private readonly buildsRes = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.builds(params) });
  private readonly rolesRes = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.roles(params) });

  protected readonly custom = computed(() => (this.list.hasValue() ? this.list.value().custom.map(toCard) : []));
  protected readonly defaults = computed(() => (this.list.hasValue() ? this.list.value().defaults.map(toCard) : []));
  private readonly buildsById = computed(() => new Map((this.buildsRes.hasValue() ? this.buildsRes.value() : []).map((b) => [b.id, b])));
  protected readonly emojis = computed((): Record<string, string> =>
    Object.fromEntries((this.rolesRes.hasValue() ? this.rolesRes.value() : []).map((r) => [r.name, r.emoji])));
  private readonly actionError = signal('');
  protected readonly error = computed(() => (this.list.error() ? errorMessage(this.list.error()) : this.actionError()));
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));
  /** Mes autres serveurs où je suis staff : cibles possibles d'une copie. */
  protected readonly copyTargets = computed(() =>
    this.auth.guilds().filter((g) => g.id !== this.guildId() && hasLevel(g.level, 'staff')));

  /** Compo dont l'image est affichée (une à la fois). */
  protected readonly imageOf = signal<string | null>(null);
  protected readonly slug = fileSlug;

  constructor() {
    this.items.load().catch(() => {});
  }

  buildOf(row: SlotRow): Build | undefined {
    return row.build_id != null ? this.buildsById().get(row.build_id) : undefined;
  }

  color(role: string): string {
    return roleColor(role);
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
