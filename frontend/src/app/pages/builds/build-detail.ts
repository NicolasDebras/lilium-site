import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { errorText } from '../../core/resource';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n';
import { ItemsService, itemName, spellIconUrl, spellName, useFallbackIcon } from '../../core/items.service';
import { SHOES_ANY, SPELL_KEYS, Slot, hasLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear, choiceName, describeGear, describeSwaps } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { roleColor } from '../../shared/roles';

/** Page d'un build, en lecture seule, à partager sur Discord : équipement en grand,
 *  image identique au MP de /massup (télécharger / copier), compos qui l'utilisent, dupliquer. */
@Component({
  selector: 'app-build-detail',
  imports: [Gear, Icon, RouterLink],
  template: `
    <a class="back muted" [routerLink]="['/g', guildId(), 'builds']"><app-icon name="chevron" [size]="14" class="flip" /> {{ t().builds.allBuilds }}</a>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    } @else if (build(); as b) {
      <div class="page-head">
        <div>
          <div class="row tags">
            <span class="role-tag" [style.--role-color]="color(b.role)">{{ b.role }}</span>
            <span class="badge badge-outline">{{ b.type_acti }}</span>
          </div>
          <h1>{{ b.name }}</h1>
          <p class="subtitle">{{ t().builds.by(b.created_by_name) }}</p>
        </div>
        <div class="row actions">
          <button type="button" class="btn btn-sm" (click)="copyLink()"><app-icon name="swap" [size]="14" /> {{ t().builds.copyLink }}</button>
          @if (canEdit()) {
            <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="duplicate()"><app-icon name="plus" [size]="14" /> {{ t().builds.duplicate }}</button>
            <a class="btn btn-sm btn-primary" [routerLink]="['/g', guildId(), 'builds', b.id, 'edit']"><app-icon name="edit" [size]="14" /> {{ t().common.edit }}</a>
          }
        </div>
      </div>

      <div class="layout">
        <div class="card gear-card">
          <app-gear [items]="b.items" [spells]="b.spells" layout="doll" />
          @if (gearNames(); as names) {
            <p class="muted names">{{ names }}</p>
          }
          @if (hasTiers()) {
            <p class="tiers-hint faint">{{ t().builds.tiersHint }}</p>
          }
          @if (b.weapon) {
            <p class="weapon"><app-icon name="info" [size]="14" /> {{ b.weapon }}</p>
          }
          @if (spellLines().length) {
            <div class="spells">
              <h3>{{ t().builds.spellsTitle }}</h3>
              @for (line of spellLines(); track line.key) {
                <div class="spell-line">
                  <span class="spell-item">{{ line.title }}</span>
                  <ul>
                    @for (s of line.spells; track s.key) {
                      <li [title]="s.name">
                        <img [src]="s.icon" alt="" width="32" height="32" (error)="fallback($event)" />
                        <span><small>{{ s.label }}</small> {{ s.name }}</span>
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
          <div class="used">
            <h3>{{ t().builds.usedIn }}</h3>
            @if (b.used_by.length) {
              <ul>
                @for (c of b.used_by; track c) { <li><span class="badge">{{ c }}</span></li> }
              </ul>
            } @else {
              <p class="muted">{{ t().builds.noCompo }}</p>
            }
          </div>
        </div>

        <div class="card image-card">
          <h3>{{ t().builds.imageTitle }} <span class="muted">{{ t().builds.imageHint }}</span></h3>
          <img [src]="imageUrl()" [alt]="t().builds.imageAlt(b.name)" class="preview" loading="lazy" />
          <div class="row">
            <a class="btn btn-sm" [href]="imageUrl()" [download]="fileName()">{{ t().imageShare.download }}</a>
            <button type="button" class="btn btn-sm" (click)="copyImage()">{{ t().imageShare.copy }}</button>
          </div>
        </div>
      </div>
    } @else {
      <div class="skeleton"></div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; font-size: .85rem; margin-bottom: 12px; }
    .flip { transform: rotate(180deg); }
    .tags { gap: 6px; margin-bottom: 6px; }
    .role-tag { color: var(--role-color); font-weight: 700; font-size: .8rem; }
    .actions { flex-wrap: wrap; gap: 8px; }
    .layout { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 16px; align-items: start; }
    .gear-card { display: grid; gap: 12px; justify-items: start; }
    .names { margin: 0; font-size: .85rem; }
    .tiers-hint { margin: -6px 0 0; font-size: .78rem; }
    .weapon { margin: 0; display: flex; align-items: center; gap: 6px; }
    .spells { display: grid; gap: 8px; width: 100%; }
    .spell-line { display: grid; gap: 4px; }
    .spell-item { font-size: .85rem; font-weight: 600; }
    .spell-line ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 12px; }
    .spell-line li { display: flex; align-items: center; gap: 6px; font-size: .82rem; }
    .spell-line img { border-radius: 50%; }
    .spell-line small { font-weight: 700; color: var(--lilac); }
    .used h3, .spells h3, .image-card h3 { margin: 0 0 8px; font-size: 1rem; }
    .image-card h3 .muted { font-weight: 400; font-size: .85rem; }
    .used ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .used p { margin: 0; }
    .image-card { display: grid; gap: 12px; }
    .preview { width: 100%; max-width: 460px; border-radius: var(--radius-sm); background: var(--surface-2); min-height: 200px; }
    .skeleton { min-height: 320px; }
    @media (max-width: 860px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class BuildDetailPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly t = inject(I18nService).t;
  readonly guildId = input.required<string>();
  readonly buildId = input.required<string>();

  private readonly detail = rxResource({
    params: () => ({ guildId: this.guildId(), id: Number(this.buildId()) }),
    stream: ({ params }) => this.api.buildDetail(params.guildId, params.id),
  });
  protected readonly build = computed(() => (this.detail.hasValue() ? this.detail.value() : null));
  protected readonly error = errorText(this.detail);
  protected readonly busy = signal(false);
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));
  protected readonly imageUrl = computed(() => this.api.buildImageUrl(this.guildId(), Number(this.buildId())));
  protected readonly fileName = computed(() => `build-${(this.build()?.name ?? 'lilium').replace(/[^\p{L}\p{N}-]+/gu, '-')}.png`);

  /** « Épée large 8.1 ou Hallebarde · Bouclier · Cape au choix » */
  protected readonly gearNames = computed(() => {
    const b = this.build();
    if (!b) return '';
    return describeGear(b.items, (id) => this.items.get(id))
      .map((g) => (g.free ? this.t().builds.slotFree(g.label) : g.items.map(choiceName).join(this.t().gear.or)))
      .join(' · ');
  });

  /** Au moins un équipement (hors bouffe/potion) avec un tier imposé → rappel « minimum ou équivalent ». */
  protected readonly hasTiers = computed(() => {
    const b = this.build();
    const get = (id: string) => this.items.get(id);
    return !!b && [...describeGear(b.items, get).flatMap((g) => g.items), ...describeSwaps(b.items, get)]
      .some((i) => i.tier != null && i.slot !== 'food' && i.slot !== 'potion');
  });

  /** Sorts imposés : une ligne par objet (dans l'ordre du build), les bottes au choix en dernier. */
  protected readonly spellLines = computed(() => {
    const b = this.build();
    if (!b?.spells) return [];
    const t = this.t().builds;
    const names = this.items.spells()?.names;
    return Object.entries(b.spells)
      .sort(([a], [z]) => Number(a === SHOES_ANY) - Number(z === SHOES_ANY))
      .map(([key, chosen]) => {
        const item = key === SHOES_ANY ? undefined : this.items.get(key);
        const slot: Slot = item?.slot ?? 'shoes';
        return {
          key,
          title: key === SHOES_ANY ? t.shoesAny : item ? itemName(item) : key,
          spells: SPELL_KEYS.filter((k) => chosen[k]).map((k) => ({
            key: k,
            label: (k === 'a' ? t.activeKeys[slot] : t.spellKeys[k]) ?? k,
            name: spellName(chosen[k]!, names),
            icon: spellIconUrl(chosen[k]!),
          })),
        };
      });
  });

  constructor() {
    this.items.load().catch(() => {});
    this.items.loadSpells().catch(() => {});
  }

  protected fallback(event: Event): void {
    useFallbackIcon(event);
  }

  color(role: string): string {
    return roleColor(role);
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.toast.success(this.t().builds.linkCopied);
    } catch {
      this.toast.error(this.t().builds.linkFailed);
    }
  }

  async copyImage(): Promise<void> {
    try {
      const blob = await (await fetch(this.imageUrl())).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.toast.success(this.t().imageShare.copied);
    } catch {
      this.toast.error(this.t().imageShare.copyFailed);
    }
  }

  async duplicate(): Promise<void> {
    this.busy.set(true);
    try {
      const { id } = await firstValueFrom(this.api.duplicateBuild(this.guildId(), Number(this.buildId())));
      this.toast.success(this.t().builds.duplicated);
      await this.router.navigate(['/g', this.guildId(), 'builds', id, 'edit']);
    } catch (err) {
      this.toast.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
