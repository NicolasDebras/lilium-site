import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';

import { debouncedSignal } from '../../core/debounce';
import { I18nService } from '../../core/i18n/i18n';
import { itemIconUrl, useFallbackIcon } from '../../core/items.service';
import { BULK_MAX, MarketService, storedSignal } from '../../core/market.service';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';
import { TierBadge } from '../../shared/tier-badge';
import { cityLabel, itemLabel, otherLabel, percent, silver, tierText } from './market-format';
import {
  BLACK_MARKET, CATEGORIES, CATEGORY_KEYS, CITIES, Category, City, ItemFilters, MarketItem, ORIGINS, Origin, Trade,
  TradeOptions, calcTrade, desc, filterItems, hoursSince,
} from './market-logic';

type Sort = 'profit' | 'roi' | 'buy' | 'sell' | 'name' | 'tier';

interface SearchPrefs extends ItemFilters {
  buyCity: City | '';
  sellCity: City | '';
  minRoi: string;
  maxAge: string;
  only: boolean;
  sort: Sort;
}

const DEFAULTS: SearchPrefs = {
  q: '', cat: '', type: '', tiers: [6], enchs: [0], orig: '', buyCity: '', sellCity: '', minRoi: '', maxAge: '', only: false, sort: 'profit',
};
const PAGE_SIZE = 25;
/** Délai avant de charger les prix de la page affichée (on ne charge pas pendant qu'on tape). */
export const AUTOLOAD_MS = 450;

interface Row {
  it: MarketItem;
  trade: Trade;
}

const SORTS: Record<Sort, (a: Row, b: Row) => number> = {
  profit: (a, b) => desc(a.trade.profit, b.trade.profit),
  roi: (a, b) => desc(a.trade.roi, b.trade.roi),
  buy: (a, b) => (a.trade.buy?.value ?? 1e15) - (b.trade.buy?.value ?? 1e15),
  sell: (a, b) => (b.trade.sell?.value ?? -1) - (a.trade.sell?.value ?? -1),
  name: (a, b) => itemLabel(a.it).localeCompare(itemLabel(b.it)),
  tier: (a, b) => a.it.tier - b.it.tier || a.it.ench - b.it.ench || itemLabel(a.it).localeCompare(itemLabel(b.it)),
};

/** Recherche d'objets : filtres, marge achat/revente par objet, prix ville par ville. */
@Component({
  selector: 'app-market-search',
  imports: [Icon, Pager, TierBadge],
  template: `
    <section class="card filters">
      <label class="input-icon">
        <app-icon name="search" />
        <input class="input" type="search" autocomplete="off" [placeholder]="t().market.search.placeholder"
               [attr.aria-label]="t().market.search.label" [value]="f().q" (input)="patch({ q: $any($event.target).value })" />
      </label>
      <div class="grid-f">
        <div class="field">
          <label for="s-cat">{{ t().market.search.category }}</label>
          <select id="s-cat" class="select" (change)="setCategory($any($event.target).value)">
            <option value="" [selected]="!f().cat">{{ t().market.search.allCategories }}</option>
            @for (c of categories(); track c.key) {
              <option [value]="c.key" [selected]="c.key === f().cat">{{ t().market.cats[c.key] }} ({{ c.count }})</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="s-type">{{ t().market.search.type }}</label>
          <select id="s-type" class="select" [disabled]="!f().cat" (change)="patch({ type: $any($event.target).value })">
            <option value="" [selected]="!f().type">{{ f().cat ? t().market.search.allTypes : t().market.search.pickCategory }}</option>
            @for (ty of types(); track ty) {
              <option [value]="ty" [selected]="ty === f().type">{{ t().market.types[ty] }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="s-orig">{{ t().market.search.origin }}</label>
          <select id="s-orig" class="select" (change)="patch({ orig: $any($event.target).value })">
            <option value="" [selected]="!f().orig">{{ t().market.search.allOrigins }}</option>
            @for (o of origins; track o) {
              <option [value]="o" [selected]="o === f().orig">{{ t().market.search.origins[o] }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="s-buy">{{ t().market.search.buyAt }}</label>
          <select id="s-buy" class="select" (change)="patch({ buyCity: $any($event.target).value })">
            <option value="" [selected]="!f().buyCity">{{ t().market.search.allCities }}</option>
            @for (c of cities; track c) { <option [value]="c" [selected]="c === f().buyCity">{{ c }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="s-sell">{{ t().market.search.sellAt }}</label>
          <select id="s-sell" class="select" (change)="patch({ sellCity: $any($event.target).value })">
            <option value="" [selected]="!f().sellCity">{{ t().market.search.allCities }}</option>
            @for (c of sellCities; track c) { <option [value]="c" [selected]="c === f().sellCity">{{ city(c) }}</option> }
          </select>
        </div>
      </div>
      <div class="grid-f">
        <div class="field">
          <span class="lbl">{{ t().market.tier }}</span>
          <div class="chips" role="group" [attr.aria-label]="t().market.tier">
            @for (v of tiers; track v) {
              <button type="button" class="chip" [attr.aria-pressed]="f().tiers.includes(v)" (click)="toggle('tiers', v)">T{{ v }}</button>
            }
          </div>
        </div>
        <div class="field">
          <span class="lbl">{{ t().market.enchant }}</span>
          <div class="chips" role="group" [attr.aria-label]="t().market.enchant">
            @for (v of enchs; track v) {
              <button type="button" class="chip" [attr.aria-pressed]="f().enchs.includes(v)" (click)="toggle('enchs', v)">.{{ v }}</button>
            }
          </div>
        </div>
        <div class="field">
          <label for="s-roi">{{ t().market.minRoi }}</label>
          <input id="s-roi" class="input" type="number" min="0" step="1" [placeholder]="t().market.noMin" [value]="f().minRoi"
                 (change)="patch({ minRoi: $any($event.target).value })" />
        </div>
        <div class="field">
          <label for="s-age">{{ t().market.search.freshness }}</label>
          <select id="s-age" class="select" (change)="patch({ maxAge: $any($event.target).value })">
            <option value="" [selected]="!f().maxAge">{{ t().market.search.freshAll }}</option>
            @for (h of ages; track h) { <option [value]="h" [selected]="h === f().maxAge">{{ t().market.search.fresh[h] }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="s-sort">{{ t().market.sortBy }}</label>
          <select id="s-sort" class="select" (change)="patch({ sort: $any($event.target).value })">
            @for (s of sorts; track s) { <option [value]="s" [selected]="s === f().sort">{{ t().market.search.sorts[s] }}</option> }
          </select>
        </div>
        <div class="field end">
          <label class="check"><input type="checkbox" [checked]="f().only" (change)="patch({ only: $any($event.target).checked })" />
            {{ t().market.onlyPriced }}</label>
          <button type="button" class="btn btn-ghost btn-sm" (click)="reset()">{{ t().market.reset }}</button>
        </div>
      </div>
    </section>

    <div class="actions">
      <p class="muted count">{{ t().market.search.count(rows().length, matching().length) }}</p>
      <button type="button" class="btn btn-primary btn-sm" [disabled]="market.busy() || !pageRows().length" (click)="refresh()">
        <app-icon name="clock" [size]="14" /> {{ t().market.refresh }}
      </button>
      <button type="button" class="btn btn-sm" [disabled]="market.busy() || !matching().length" (click)="loadAll()">
        <app-icon name="trend" [size]="14" /> {{ t().market.loadAll(bulk) }}
      </button>
    </div>

    @if (pageRows().length) {
      <div class="card table-card">
        <div class="scroll">
          <table class="table">
            <thead><tr>
              <th>{{ t().market.search.cols.item }}</th><th>{{ t().market.search.cols.buy }}</th><th>{{ t().market.search.cols.sell }}</th>
              <th class="r">{{ t().market.search.cols.profit }}</th><th class="r">{{ t().market.search.cols.roi }}</th>
              <th class="r">{{ t().market.search.cols.age }}</th>
            </tr></thead>
            <tbody>
              @for (r of pageRows(); track r.it.id; let i = $index) {
                <tr class="fade-up" [class.best]="r.best" [class.open]="openId() === r.it.id" [style.animation-delay.ms]="delay(i)">
                  <td>
                    <button type="button" class="item" [attr.aria-expanded]="openId() === r.it.id" (click)="toggleOpen(r.it.id)">
                      <span class="ico"><img [src]="icon(r.it.id)" alt="" loading="lazy" width="40" height="40" (error)="fallback($event)" />
                        <app-tier-badge [item]="r.badge" /></span>
                      <span class="txt"><span class="name">{{ r.name }}
                        @if (r.best) { <span class="badge deal glow-pulse"><app-icon name="sparkles" [size]="11" /> {{ t().market.bestDeal }}</span> }</span>
                        <small class="faint">{{ r.tier }} · {{ r.it.id }}@if (r.other) { · {{ r.other }} }</small></span>
                      <app-icon name="chevron" [size]="14" class="chev" />
                    </button>
                  </td>
                  <td>@if (r.trade.buy; as b) { <span class="flash cell">{{ city(b.city) }}<small class="num">{{ silver(b.value) }}</small></span> } @else { <span class="faint">{{ r.loaded ? '–' : '…' }}</span> }</td>
                  <td>@if (r.trade.sell; as s) { <span class="flash cell">{{ city(s.city) }}<small class="num">{{ silver(s.value) }}</small></span> } @else { <span class="faint">{{ r.loaded ? '–' : '…' }}</span> }</td>
                  <td class="r num">@if (r.trade.profit != null) { <span class="flash" [class.gain]="r.trade.profit >= 0" [class.pos]="r.trade.profit >= 0" [class.neg]="r.trade.profit < 0">{{ silver(r.trade.profit) }}</span> } @else { – }</td>
                  <td class="r num" [class.pos]="(r.trade.roi ?? -1) >= 0" [class.neg]="(r.trade.roi ?? 0) < 0">{{ pct(r.trade.roi) }}</td>
                  <td class="r num" [class.neg]="r.stale" [class.faint]="!r.stale">{{ r.loaded ? r.age : '…' }}</td>
                </tr>
                @if (openId() === r.it.id) {
                  <tr class="detail"><td colspan="6">
                    <div class="reveal"><div>
                      <table class="table cities" [attr.aria-label]="t().market.search.details(r.name)">
                        <thead><tr><th>{{ t().market.search.detail.city }}</th><th class="r">{{ t().market.search.detail.sell }}</th>
                          <th class="r">{{ t().market.search.detail.buy }}</th></tr></thead>
                        <tbody>
                          @for (c of detail(); track c.city; let j = $index) {
                            <tr class="fade-up" [style.animation-delay.ms]="j * 35">
                              <td>{{ city(c.city) }}</td>
                              <td class="r num"><span [class.hl-buy]="c.bestBuy" [class.hl-sell]="c.bestSellS">{{ silver(c.s) }}<small class="faint">{{ c.sAge }}</small></span></td>
                              <td class="r num"><span [class.hl-sell]="c.bestSellB">{{ silver(c.b) }}<small class="faint">{{ c.bAge }}</small></span></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                      <p class="faint legend"><span class="pos">{{ t().market.search.legend[0] }}</span><span class="lilac">{{ t().market.search.legend[1] }}</span></p>
                    </div></div>
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>
      <app-pager [page]="page()" [pageSize]="pageSize" [total]="rows().length" [label]="t().market.search.pagerLabel" (pageChange)="page.set($event)" />
      <p class="faint hint">{{ t().market.search.hint }}</p>
    } @else {
      <div class="empty"><app-icon name="search" [size]="32" /><p>{{ t().market.search.empty(f().only || f().minRoi !== '') }}</p></div>
    }
  `,
  styles: `
    :host { display: block; }
    .filters { display: grid; gap: 14px; padding: 16px; margin-bottom: 14px; }
    .grid-f { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 12px 14px; align-items: end; }
    .lbl { font-weight: 600; font-size: .85rem; color: var(--text-muted); }
    .end { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .check { display: flex; align-items: center; gap: 8px; font-size: .9rem; cursor: pointer; color: var(--text) !important; font-weight: 500 !important; }
    .check input { accent-color: var(--lilac); width: 16px; height: 16px; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 12px; }
    .count { flex: 1 1 220px; margin: 0; font-size: .9rem; }
    .table-card { padding: 6px 4px; }
    .scroll { overflow-x: auto; }
    .table { min-width: 720px; }
    .table td { vertical-align: middle; white-space: nowrap; }
    .r { text-align: right !important; }
    .item { display: flex; align-items: center; gap: 12px; background: none; border: 0; padding: 2px 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .ico { position: relative; flex: none; width: 40px; height: 40px; border-radius: 9px; background: var(--surface-2);
           transition: transform .2s var(--ease), box-shadow .2s; }
    .ico img { width: 40px; height: 40px; display: block; }
    tbody tr:hover .ico, .item:focus-visible .ico { transform: scale(1.08); box-shadow: 0 0 0 1px var(--lilac-strong), 0 0 16px var(--lilac-glow); }
    .txt { display: grid; gap: 2px; }
    .name { font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .item:hover .name { color: var(--lilac); }
    small { display: block; font-size: .75rem; }
    .chev { color: var(--text-faint); transition: transform .25s var(--ease); }
    .open .chev { transform: rotate(180deg); color: var(--lilac); }
    .cell { display: inline-block; padding: 1px 4px; margin: -1px -4px; }
    .pos { color: var(--success); font-weight: 600; }
    .neg { color: var(--danger); font-weight: 600; }
    .flash.pos, .flash.neg { padding: 1px 4px; }
    tr.best { background: linear-gradient(90deg, var(--lilac-soft), transparent 60%); }
    .deal { background: var(--gradient); color: var(--on-lilac); }
    .detail > td { padding: 0 10px 12px 64px; background: var(--bg-2); }
    .cities { min-width: 0; max-width: 560px; margin-top: 8px; }
    .hl-buy, .hl-sell { display: inline-block; padding: 2px 8px; border-radius: 8px; }
    .hl-buy { background: var(--success-soft); box-shadow: inset 0 0 0 1px var(--success); }
    .hl-sell { background: var(--lilac-soft); box-shadow: inset 0 0 0 1px var(--lilac); }
    .legend { font-size: .8rem; margin: 8px 0 0; }
    .lilac { color: var(--lilac); }
    .hint { font-size: .8rem; margin-top: 10px; }
  `,
})
export class MarketSearch {
  protected readonly market = inject(MarketService);
  protected readonly t = inject(I18nService).t;
  protected readonly f = storedSignal<SearchPrefs>('lilium.market.search', DEFAULTS);
  protected readonly cities = CITIES;
  protected readonly sellCities: City[] = [...CITIES, BLACK_MARKET];
  protected readonly origins: Origin[] = ORIGINS;
  protected readonly tiers = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly enchs = [0, 1, 2, 3, 4];
  protected readonly ages = ['1', '6', '24'];
  protected readonly sorts: Sort[] = ['profit', 'roi', 'buy', 'sell', 'name', 'tier'];
  protected readonly pageSize = PAGE_SIZE;
  protected readonly bulk = BULK_MAX;
  protected readonly silver = silver;
  protected readonly pct = percent;
  protected readonly city = cityLabel;

  protected readonly categories = computed(() => {
    const counts = new Map<Category, number>();
    for (const it of this.market.items()) counts.set(it.cat, (counts.get(it.cat) ?? 0) + 1);
    return CATEGORY_KEYS.map((key) => ({ key, count: counts.get(key) ?? 0 }));
  });
  protected readonly types = computed<readonly string[]>(() => (this.f().cat ? CATEGORIES[this.f().cat as Category] : []));

  private readonly query = debouncedSignal(computed(() => this.f().q));
  protected readonly matching = computed(() => filterItems(this.market.items(), { ...this.f(), q: this.query() }));
  private readonly options = computed<TradeOptions>(() => {
    const s = this.market.settings();
    const f = this.f();
    return { mode: s.mode, tax: s.tax, bm: s.bm, buyCity: f.buyCity, sellCity: f.sellCity, maxAge: f.maxAge === '' ? null : +f.maxAge };
  });

  protected readonly rows = computed(() => {
    const prices = this.market.prices();
    const o = { ...this.options(), now: Date.now() };
    const f = this.f();
    let rows: Row[] = this.matching().map((it) => ({ it, trade: calcTrade(prices[it.id], o) }));
    if (f.only) rows = rows.filter((r) => r.trade.buy || r.trade.sell);
    if (f.minRoi !== '') rows = rows.filter((r) => r.trade.roi != null && r.trade.roi >= +f.minRoi);
    return rows.sort(SORTS[f.sort] ?? SORTS.profit);
  });

  /** Revient à la page 1 quand les filtres changent (pas quand des prix arrivent). */
  protected readonly page = linkedSignal({ source: () => [this.matching(), this.f()], computation: () => 1 });

  protected readonly pageRows = computed(() => {
    const prices = this.market.prices();
    const start = (this.page() - 1) * PAGE_SIZE;
    const firstPage = this.page() === 1 && this.f().sort === 'profit';
    return this.rows().slice(start, start + PAGE_SIZE).map((r, i) => ({
      ...r,
      name: itemLabel(r.it),
      other: otherLabel(r.it),
      tier: tierText(r.it.tier, r.it.ench),
      // pastille du tier (comme une potion : « 6.1 », sans équivalences de build)
      badge: { slot: 'potion' as const, tier: r.it.tier, enchant: r.it.ench },
      loaded: r.it.id in prices,
      age: this.t().market.age(r.trade.age),
      stale: (r.trade.age ?? 0) > 24,
      best: firstPage && i === 0 && (r.trade.profit ?? 0) > 0,
    }));
  });

  protected readonly openId = signal<string | null>(null);

  /** Prix ville par ville de l'objet ouvert ; meilleur achat (vert) et meilleure revente (lilas) surlignés. */
  protected readonly detail = computed(() => {
    const id = this.openId();
    const p = id ? this.market.prices()[id] ?? {} : {};
    const { mode, bm } = this.market.settings();
    const now = Date.now();
    const all: City[] = bm ? [...CITIES, BLACK_MARKET] : [...CITIES];
    const minS = Math.min(...CITIES.map((c) => p[c]?.s || Infinity));
    const key = mode === 'direct' ? 'b' : 's';
    const maxV = Math.max(0, ...all.map((c) => p[c]?.[key] || 0));
    return all.map((city) => {
      const e = p[city];
      const age = (d: string | null | undefined) => this.t().market.age(hoursSince(d, now));
      return {
        city,
        s: e?.s || null,
        b: e?.b || null,
        sAge: e?.s ? age(e.sd) : '',
        bAge: e?.b ? age(e.bd) : '',
        bestBuy: !!e?.s && city !== BLACK_MARKET && e.s === minS,
        bestSellS: key === 's' && !!e?.s && e.s === maxV,
        bestSellB: key === 'b' && !!e?.b && e.b === maxV,
      };
    });
  });

  private readonly pageIds = computed(() => this.pageRows().map((r) => r.it.id).join(','));

  constructor() {
    // Prix de la page affichée : chargés tout seuls, une fois, après un court délai.
    effect((onCleanup) => {
      const ids = this.pageIds();
      if (!ids || this.market.busy()) return;
      const timer = setTimeout(() => this.market.fetchPrices(this.market.untried(ids.split(','))), AUTOLOAD_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  patch(change: Partial<SearchPrefs>): void {
    this.f.update((f) => ({ ...f, ...change }));
  }

  setCategory(cat: Category | ''): void {
    this.patch({ cat, type: '' });
  }

  toggle(key: 'tiers' | 'enchs', value: number): void {
    const list = this.f()[key];
    this.patch({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  }

  reset(): void {
    this.f.set({ ...DEFAULTS, tiers: [], enchs: [], sort: this.f().sort });
  }

  toggleOpen(id: string): void {
    this.openId.update((open) => (open === id ? null : id));
  }

  refresh(): void {
    this.market.fetchPrices(this.pageRows().map((r) => r.it.id));
  }

  loadAll(): void {
    this.market.fetchPrices(this.matching().slice(0, BULK_MAX).map((it) => it.id));
  }

  delay(i: number): number {
    return Math.min(i * 25, 400);
  }

  icon(id: string): string {
    return itemIconUrl(id, 64);
  }

  fallback(event: Event): void {
    useFallbackIcon(event);
  }
}
