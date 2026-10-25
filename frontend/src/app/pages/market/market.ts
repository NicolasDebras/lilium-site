import { Component, computed, inject, signal } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n';
import { MarketService, storedSignal } from '../../core/market.service';
import { Icon } from '../../shared/icon';
import { MarketCraft } from './market-craft';
import { SellMode, Server } from './market-logic';
import { MarketSearch } from './market-search';

type View = 'search' | 'craft';

/** Onglet Marché (membres de la guilde) : recherche d'objets et marges ville par ville, rentabilité
 *  de la cuisine et des potions. Outil imaginé par Aria le papi. */
@Component({
  selector: 'app-market',
  imports: [Icon, MarketSearch, MarketCraft],
  template: `
    <div class="page-head fade-up">
      <div>
        <h1>{{ t().market.title }}</h1>
        <p class="subtitle">{{ t().market.subtitle }}</p>
      </div>
      <div class="segmented" role="group" [attr.aria-label]="t().market.viewAria">
        <button type="button" [class.on]="view() === 'search'" [attr.aria-pressed]="view() === 'search'" (click)="setView('search')">
          <app-icon name="search" [size]="14" /> {{ t().market.views.search }}
        </button>
        <button type="button" [class.on]="view() === 'craft'" [attr.aria-pressed]="view() === 'craft'" (click)="setView('craft')">
          <app-icon name="sparkles" [size]="14" /> {{ t().market.views.craft }}
        </button>
      </div>
    </div>

    <section class="card settings fade-up" style="animation-delay: 60ms">
      <div class="bar">
        <button type="button" class="btn btn-ghost btn-sm" [attr.aria-expanded]="open()" aria-controls="market-settings"
                (click)="open.set(!open())">
          <app-icon name="chevron" [size]="16" class="chev" [class.up]="open()" /> {{ t().market.settings.title }}
        </button>
        <span class="faint summary">{{ summary() }}</span>
        <p class="status" role="status" [class.error-text]="status().kind === 'error'">{{ statusText() }}</p>
      </div>
      @if (open()) {
        <div class="reveal" id="market-settings">
          <div>
            <div class="form-grid">
              <div class="field">
                <label for="m-server">{{ t().market.settings.server }}</label>
                <select id="m-server" class="select" (change)="setServer($any($event.target).value)">
                  @for (s of servers; track s) {
                    <option [value]="s" [selected]="s === settings().server">{{ t().market.settings.servers[s] }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label for="m-mode">{{ t().market.settings.mode }}</label>
                <select id="m-mode" class="select" (change)="setMode($any($event.target).value)">
                  @for (m of modes; track m) {
                    <option [value]="m" [selected]="m === settings().mode">{{ t().market.settings.modes[m] }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label for="m-tax">{{ t().market.settings.tax }}</label>
                <div class="input-unit">
                  <input id="m-tax" class="input" type="number" min="0" max="100" step="0.5" inputmode="decimal" [value]="settings().tax"
                         (change)="setTax($any($event.target).value)" />
                  <span class="unit">%</span>
                </div>
              </div>
              <div class="field">
                <label for="m-quality">{{ t().market.settings.quality }}</label>
                <select id="m-quality" class="select" (change)="market.update({ quality: +$any($event.target).value })">
                  @for (q of t().market.settings.qualities; track $index) {
                    <option [value]="$index + 1" [selected]="$index + 1 === settings().quality">{{ q }}</option>
                  }
                </select>
              </div>
              <label class="switch check">
                <input type="checkbox" [checked]="settings().bm" (change)="market.update({ bm: $any($event.target).checked })" />
                {{ t().market.settings.bm }}
              </label>
            </div>
            <p class="faint hint">{{ t().market.settings.hint }}</p>
          </div>
        </div>
      }
      <div class="progress" [class.active]="market.busy()" role="progressbar" [attr.aria-label]="t().market.progress"
           [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100">
        <span [style.transform]="'scaleX(' + progress() / 100 + ')'"></span>
      </div>
    </section>

    @if (market.loadError()) {
      <div class="alert row">{{ t().market.loadError }}
        <button type="button" class="btn btn-sm" (click)="market.load()">{{ t().market.retry }}</button>
      </div>
    } @else if (!market.loaded()) {
      <div class="card skeleton filters-skel"></div>
      @for (s of [1, 2, 3, 4, 5]; track s) { <div class="skeleton line" [style.animation-delay.ms]="s * 80"></div> }
    } @else if (view() === 'search') {
      <app-market-search class="slide-in" />
    } @else {
      <app-market-craft class="slide-in" />
    }

    <p class="credit faint">{{ t().market.credit[0] }}<strong class="gradient-text">Aria le papi</strong>{{ t().market.credit[1] }}</p>
  `,
  styles: `
    :host { display: block; }
    .settings { padding: 12px 16px; margin-bottom: 18px; overflow: hidden; }
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; }
    .chev { transition: transform .25s var(--ease); }
    .chev.up { transform: rotate(180deg); }
    .summary { font-size: .85rem; }
    .status { flex: 1 1 260px; margin: 0; text-align: right; font-size: .85rem; color: var(--text-muted); }
    .status.error-text { color: var(--danger); }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 14px; align-items: end; padding-top: 14px; }
    .check { padding-bottom: 11px; }
    .hint { font-size: .8rem; margin: 12px 0 2px; }
    .progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; opacity: 0; transition: opacity .6s .4s; overflow: hidden; }
    .progress.active { opacity: 1; transition-delay: 0s; }
    .progress span { position: absolute; inset: 0; background: var(--gradient); transform-origin: left;
                     transition: transform .35s var(--ease); box-shadow: 0 0 12px var(--lilac-glow); }
    .progress span::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%);
                            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .55), transparent); animation: shimmer 1.1s infinite; }
    .filters-skel { min-height: 150px; margin-bottom: 18px; }
    .line { min-height: 52px; margin-bottom: 8px; border-radius: var(--radius-sm); }
    .alert.row { justify-content: space-between; }
    .credit { margin: 28px 0 0; text-align: center; font-size: .85rem; }
    .credit strong { font-weight: 700; }
  `,
})
export class MarketPage {
  protected readonly market = inject(MarketService);
  protected readonly t = inject(I18nService).t;
  private readonly locale = inject(I18nService).locale;
  protected readonly settings = this.market.settings;
  protected readonly servers: Server[] = ['europe', 'west', 'east'];
  protected readonly modes: SellMode[] = ['direct', 'order'];

  private readonly prefs = storedSignal<{ view: View }>('lilium.market.view', { view: 'search' });
  protected readonly view = computed(() => this.prefs().view);
  protected readonly open = signal(false);
  protected readonly status = this.market.status;

  protected readonly summary = computed(() => {
    const s = this.settings();
    const m = this.t().market.settings;
    return m.summary(m.servers[s.server], m.modesShort[s.mode], s.tax, m.qualities[s.quality - 1] ?? '');
  });

  protected readonly progress = computed(() => {
    const s = this.status();
    if (s.kind === 'busy') return s.total ? Math.round((s.done / s.total) * 100) : 0;
    return s.kind === 'done' ? 100 : 0;
  });

  protected readonly statusText = computed(() => {
    const s = this.status();
    const st = this.t().market.status;
    switch (s.kind) {
      case 'busy': return st.loading(s.done, s.total);
      case 'done': return st.loaded(s.at.toLocaleTimeString(this.locale(), { hour: '2-digit', minute: '2-digit' }), s.count);
      case 'error': return s.network ? st.network : st.http(s.code);
      default: return this.market.loaded() ? st.ready(this.market.items().length) : this.t().common.loading;
    }
  });

  constructor() {
    this.market.load();
  }

  setView(view: View): void {
    this.prefs.set({ view });
  }

  setServer(server: Server): void {
    this.market.update({ server });
  }

  setMode(mode: SellMode): void {
    this.market.update({ mode });
  }

  setTax(value: string): void {
    const tax = Math.min(100, Math.max(0, +value || 0));
    this.market.update({ tax });
  }
}
