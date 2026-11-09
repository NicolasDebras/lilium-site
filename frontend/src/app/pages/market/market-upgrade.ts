import { Component, WritableSignal, computed, effect, inject } from '@angular/core';
import { FormField, applyEach, form, min } from '@angular/forms/signals';

import { I18nService } from '../../core/i18n/i18n';
import { itemIconUrl, useFallbackIcon } from '../../core/items.service';
import { MarketService, storedSignal } from '../../core/market.service';
import { CountUp } from '../../shared/count-up';
import { Icon } from '../../shared/icon';
import { cityLabel, percent, silver, tierText } from './market-format';
import { MarketItemField, PickedItem } from './market-item-field';
import { CITIES, City, MarketItem, PriceMap, Quote, UPGRADE_KINDS, UpgradeBuy, UpgradePlan, upgradeCalc } from './market-logic';
import { AUTOLOAD_MS } from './market-search';

const noPrices = () => UPGRADE_KINDS.map((): number | null => null);
const emptyPlan = (): UpgradePlan => ({
  id: '', name: '', from: 0, qty: 1, buyIn: 'best', city: 'Martlock', buy: null, mats: noPrices(), sell: noPrices(),
});

/** Saisie relue du navigateur : tableaux de prix complets (le formulaire en a besoin), valeurs inconnues remplacées. */
function sanitized(plan: WritableSignal<UpgradePlan>): WritableSignal<UpgradePlan> {
  const prices = (a: unknown) => UPGRADE_KINDS.map((_, i) => (Array.isArray(a) && typeof a[i] === 'number' ? (a[i] as number) : null));
  plan.update((p) => ({
    ...p,
    from: [0, 1, 2].includes(p.from) ? p.from : 0,
    buyIn: p.buyIn === 'city' ? 'city' : 'best',
    city: (CITIES as readonly string[]).includes(p.city) ? p.city : 'Martlock',
    mats: prices(p.mats),
    sell: prices(p.sell),
  }));
  return plan;
}

/** Upgradeur : un équipement passé en .1, .2 ou .3 avec runes, âmes et reliques (achetées dans la ville la moins
 *  chère ou une ville donnée), comparé à sa revente et à l'achat de l'objet déjà enchanté. */
@Component({
  selector: 'app-market-upgrade',
  imports: [CountUp, FormField, Icon, MarketItemField],
  template: `
    @let u = t().market.upgrade;
    @let mine = t().market.mine;
    <div class="cols">
      <section class="card block">
        <h2>{{ u.title }}</h2>
        <div class="grid-f">
          <div class="field wide">
            <span class="lbl">{{ u.item }}</span>
            <app-market-item-field [id]="model().id" [name]="model().name" [label]="u.item" [placeholder]="u.itemPlaceholder"
                                   [only]="upgradable" (pick)="setItem($event)" />
          </div>
          <div class="field">
            <label for="up-qty">{{ u.qty }}</label>
            <input id="up-qty" class="input" type="number" step="1" inputmode="numeric" [formField]="plan.qty" />
          </div>
        </div>
        <div class="grid-f">
          <div class="field">
            <span class="lbl" id="up-from-lbl">{{ u.from }}</span>
            <div class="chips" role="group" aria-labelledby="up-from-lbl">
              @for (e of fromLevels(); track e) {
                <button type="button" class="chip from" [attr.aria-pressed]="calc().from === e" (click)="setFrom(e)">{{ tierLabel(e) }}</button>
              }
            </div>
          </div>
          <div class="field">
            <label for="up-buy">{{ u.buy(tierLabel(calc().from)) }}</label>
            <input id="up-buy" class="input" type="number" step="1" inputmode="numeric" [placeholder]="itemView().placeholder" [formField]="plan.buy" />
            <small class="faint">{{ itemView().hint }}</small>
          </div>
        </div>
      </section>

      <section class="card block">
        <h2>{{ u.materials }}</h2>
        <div class="grid-f">
          <div class="field">
            <span class="lbl" id="up-where-lbl">{{ u.where }}</span>
            <div class="segmented where" role="group" aria-labelledby="up-where-lbl">
              @for (w of wheres; track w) {
                <button type="button" [class.on]="model().buyIn === w" [attr.aria-pressed]="model().buyIn === w" (click)="setBuyIn(w)">
                  {{ u.wheres[w] }}</button>
              }
            </div>
          </div>
          @if (model().buyIn === 'city') {
            <div class="field">
              <label for="up-city">{{ u.city }}</label>
              <select id="up-city" class="select" (change)="setCity($any($event.target).value)">
                @for (c of cities; track c) { <option [value]="c" [selected]="c === model().city">{{ c }}</option> }
              </select>
            </div>
          }
        </div>
        @if (lineViews().length) {
          <div class="lines">
            <div class="line head" aria-hidden="true">
              <span>{{ u.cols.mat }}</span><span class="r">{{ u.cols.per }}</span><span>{{ u.cols.price }}</span>
              <span class="r">{{ u.cols.need }}</span><span class="r">{{ u.cols.cost }}</span>
            </div>
            @for (v of lineViews(); track v.line.level) {
              <div class="line">
                <div class="cell c-mat">
                  <img [src]="icon(v.line.id)" alt="" width="36" height="36" (error)="fallback($event)" />
                  <span class="txt"><strong>{{ v.kind }}</strong><small class="faint">{{ v.name }} · {{ v.step }}</small></span>
                </div>
                <div class="cell c-per out">
                  <span class="mlbl">{{ u.cols.per }}</span>
                  <span class="num">{{ v.line.per.toLocaleString(locale()) }}</span>
                </div>
                <div class="cell c-price">
                  <span class="mlbl">{{ u.cols.price }}</span>
                  <input class="input" type="number" step="1" inputmode="numeric" [attr.aria-label]="u.cols.price + ' · ' + v.kind"
                         [placeholder]="v.placeholder" [formField]="plan.mats[v.line.level - 1]" />
                  <small class="faint">{{ v.hint }}</small>
                </div>
                <div class="cell c-need out">
                  <span class="mlbl">{{ u.cols.need }}</span>
                  <span class="num">{{ v.line.need.toLocaleString(locale()) }}</span>
                </div>
                <div class="cell c-cost out">
                  <span class="mlbl">{{ u.cols.cost }}</span>
                  <span class="num" [class.missing]="v.line.cost == null">{{ v.line.cost == null ? t().market.missing : silver(v.line.cost) }}</span>
                </div>
              </div>
            }
          </div>
        } @else {
          <p class="muted none">{{ u.pick }}</p>
        }
      </section>
    </div>

    <section class="card block" aria-live="polite">
      <h2>{{ u.result }}</h2>
      @if (targetViews().length) {
        <div class="targets">
          @for (v of targetViews(); track v.t.level) {
            <article class="target" [class.best]="v.best">
              <header>
                <img [src]="icon(v.t.id)" alt="" width="40" height="40" (error)="fallback($event)" />
                <h3>{{ u.target(v.tier) }}</h3>
                @if (v.best) { <span class="badge best-badge">{{ u.best }}</span> }
                @if (v.t.profit != null) {
                  <span class="badge verdict" [class.ok]="v.t.profit >= 0">{{ mine.verdict(v.t.profit >= 0) }}</span>
                }
              </header>
              <div class="tile main">
                <span class="lbl">{{ mine.profit }}</span>
                <strong class="profit" [class.pos]="(v.t.profit ?? -1) >= 0" [class.neg]="(v.t.profit ?? 0) < 0"
                        [appCountUp]="v.t.profit" [countUpFormat]="silver"></strong>
                <small class="faint">{{ mine.roi(pct(v.t.roi)) }}</small>
              </div>
              <div class="tile">
                <span class="lbl">{{ mine.cost }}</span>
                <strong class="cost">{{ silver(v.t.cost) }}</strong>
                <small class="faint">{{ u.costDetail(silver(calc().item.cost), silver(v.t.mats)) }}</small>
              </div>
              <div class="tile">
                <span class="lbl">{{ mine.revenue }}</span>
                <strong class="revenue">{{ silver(v.t.revenue) }}</strong>
                <small class="faint">{{ mine.revenueDetail(silver(v.t.unit), market.tax()) }}</small>
              </div>
              <div class="tile">
                <span class="lbl">{{ u.perItem }}</span>
                <strong class="per-item" [class.pos]="(v.t.perItem ?? -1) >= 0" [class.neg]="(v.t.perItem ?? 0) < 0">{{ silver(v.t.perItem) }}</strong>
              </div>
              <div class="field">
                <label [for]="'up-sell-' + v.t.level">{{ u.sell }}</label>
                <input [id]="'up-sell-' + v.t.level" class="input" type="number" step="1" inputmode="numeric" [placeholder]="v.placeholder"
                       [formField]="plan.sell[v.t.level - 1]" />
                <small class="faint">{{ v.hint }}</small>
              </div>
              @if (v.direct) {
                <p class="direct faint">{{ v.direct }}@if (v.saving) {<br /><strong class="saving" [class.pos]="v.t.saving! >= 0">{{ v.saving }}</strong>}</p>
              }
              @if (v.noSell) { <p class="warn">{{ u.noSell }}</p> }
            </article>
          }
        </div>
      } @else {
        <p class="muted none">{{ u.pick }}</p>
      }
      @if (missing()) { <p class="warn">{{ u.missingPrices(missing()) }}</p> }
      <div class="actions">
        <button type="button" class="btn btn-sm" [disabled]="market.busy() || !ids()" (click)="refresh()">
          <app-icon name="clock" [size]="14" /> {{ mine.refresh }}
        </button>
        <button type="button" class="btn btn-sm reset" (click)="reset()">
          <app-icon name="reset" [size]="14" /> {{ u.reset }}
        </button>
      </div>
    </section>
    <p class="faint hint">{{ u.hint }}</p>
  `,
  styles: `
    :host { display: block; }
    .cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 0 18px; align-items: start; }
    @media (max-width: 1100px) { .cols { grid-template-columns: minmax(0, 1fr); } }
    .block { display: grid; gap: 14px; padding: 16px; margin-bottom: 14px; }
    h2 { margin: 0; font-size: 1.05rem; }
    .grid-f { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 12px 14px; align-items: start; }
    .wide { grid-column: span 2; }
    @media (max-width: 520px) { .wide { grid-column: auto; } }
    .lbl { font-weight: 600; font-size: .85rem; color: var(--text-muted); }
    small { display: block; font-size: .75rem; }
    .chips { gap: 4px; }
    .chip.from { min-width: 48px; justify-content: center; font-variant-numeric: tabular-nums; }
    .where { justify-self: start; }
    .lines { display: grid; gap: 10px; }
    .line { display: grid; grid-template-columns: minmax(150px, 2fr) minmax(56px, .6fr) minmax(100px, 1.2fr) minmax(64px, .7fr) minmax(80px, .9fr);
            gap: 8px 10px; align-items: start; }
    .line.head { font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-faint); }
    .r { text-align: right; }
    .cell { display: grid; gap: 5px; min-width: 0; }
    .c-mat { display: flex; align-items: center; gap: 10px; }
    .c-mat img { flex: none; width: 36px; height: 36px; }
    .txt { display: grid; min-width: 0; }
    .txt small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .out { justify-items: end; padding-top: 11px; white-space: nowrap; }
    .out .num { font-weight: 600; font-variant-numeric: tabular-nums; }
    .missing { color: var(--danger); font-size: .8rem; }
    .mlbl { display: none; font-size: .72rem; font-weight: 600; color: var(--text-faint); }
    @media (max-width: 720px) {
      .line { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: 'mat mat' 'per price' 'need cost';
              padding-bottom: 12px; border-bottom: 1px solid var(--border-soft); }
      .line.head { display: none; }
      .c-mat { grid-area: mat; } .c-per { grid-area: per; } .c-price { grid-area: price; }
      .c-need { grid-area: need; } .c-cost { grid-area: cost; }
      .out { justify-items: start; padding-top: 0; }
      .mlbl { display: block; }
    }
    .none { margin: 0; font-size: .9rem; }
    .targets { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px; }
    .target { display: grid; gap: 10px; align-content: start; padding: 12px; border: 1px solid var(--border-soft); border-radius: var(--radius); }
    .target.best { border-color: var(--lilac); box-shadow: 0 0 0 1px var(--lilac-soft); }
    header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
    header img { flex: none; width: 40px; height: 40px; }
    h3 { margin: 0; font-size: 1rem; flex: 1 1 auto; }
    .best-badge { background: var(--lilac-soft); color: var(--lilac); }
    .verdict { background: var(--danger-soft); color: var(--danger); }
    .verdict.ok { background: var(--success-soft); color: var(--success); }
    .tile { display: grid; gap: 2px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--surface-2); }
    .tile strong { font-size: 1.1rem; font-variant-numeric: tabular-nums; }
    .tile.main { background: var(--lilac-soft); }
    .tile.main strong { font-size: 1.5rem; }
    .pos { color: var(--success); }
    .neg { color: var(--danger); }
    .direct { margin: 0; font-size: .8rem; }
    .warn { margin: 0; font-size: .82rem; color: var(--danger); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .reset { color: var(--text-muted); }
    .reset:hover { color: var(--text); }
    .reset app-icon { transition: transform .35s var(--ease); }
    .reset:hover app-icon { transform: rotate(-120deg); }
    .hint { font-size: .8rem; margin-top: 4px; }
  `,
})
export class MarketUpgrade {
  protected readonly market = inject(MarketService);
  protected readonly t = inject(I18nService).t;
  protected readonly locale = inject(I18nService).locale;
  protected readonly cities = CITIES;
  protected readonly wheres: UpgradeBuy[] = ['best', 'city'];
  protected readonly silver = silver;
  protected readonly pct = percent;
  /** Suggestions : équipement améliorable, sans enchantement (le niveau de départ se choisit à part). */
  protected readonly upgradable = (item: MarketItem) => item.ench === 0 && item.id in this.market.upgrades();

  protected readonly model = sanitized(storedSignal<UpgradePlan>('lilium.market.upgrade', emptyPlan()));
  protected readonly plan = form(this.model, (p) => {
    min(p.qty, 1);
    min(p.buy, 0);
    applyEach(p.mats, (m) => {
      min(m, 0);
    });
    applyEach(p.sell, (s) => {
      min(s, 0);
    });
  });

  private readonly counts = computed(() => this.market.upgrades()[this.model().id] ?? []);

  protected readonly calc = computed(() => {
    const s = this.market.settings();
    return upgradeCalc(this.model(), this.counts(), this.market.prices(), { mode: s.mode, tax: this.market.tax(), bm: s.bm, noBuy: s.noBuy });
  });

  /** Enchantements de départ possibles (.0 à .2 tant qu'aucun objet n'est choisi). */
  protected readonly fromLevels = computed(() => {
    const n = this.model().id ? this.counts().length : UPGRADE_KINDS.length;
    return Array.from({ length: Math.max(1, n) }, (_, i) => i);
  });

  protected readonly itemView = computed(() => {
    const item = this.calc().item;
    return {
      hint: this.quoteHint(this.model().id && item.id, item.market, this.market.prices()),
      placeholder: item.market ? silver(item.market.value) : this.t().market.mine.pricePh,
    };
  });

  protected readonly lineViews = computed(() => {
    const prices = this.market.prices();
    const u = this.t().market.upgrade;
    return this.calc().lines.map((line) => ({
      line,
      kind: u.kinds[line.level - 1],
      name: this.market.nameOf(line.id),
      step: u.step(this.tierLabel(line.level)),
      hint: this.quoteHint(line.id, line.market, prices),
      placeholder: line.market ? silver(line.market.value) : this.t().market.mine.pricePh,
    }));
  });

  protected readonly targetViews = computed(() => {
    const res = this.calc();
    const prices = this.market.prices();
    const u = this.t().market.upgrade;
    return res.targets.map((t) => {
      const tier = this.tierLabel(t.level);
      return {
        t,
        tier,
        best: res.best === t.level && res.targets.length > 1,
        hint: this.quoteHint(t.id, t.market, prices),
        placeholder: t.market ? silver(t.market.value) : this.t().market.mine.pricePh,
        direct: t.direct ? u.direct(tier, silver(t.direct.value), cityLabel(t.direct.city)) : '',
        saving: t.saving != null ? u.saving(silver(Math.abs(t.saving)), t.saving >= 0) : '',
        noSell: t.unit == null && t.id in prices,
      };
    });
  });

  /** Ce qui n'a ni prix saisi ni relevé une fois les prix chargés (objet de départ, matériaux). */
  protected readonly missing = computed(() => {
    const res = this.calc();
    const prices = this.market.prices();
    const names = res.item.unit == null && res.item.id in prices ? [`${this.model().name} ${this.tierLabel(res.from)}`] : [];
    for (const v of this.lineViews()) if (v.line.cost == null && v.line.id in prices) names.push(v.name);
    return names.join(', ');
  });

  /** Ids dont il faut les prix : objet de départ, objet à chaque niveau visé, runes/âmes/reliques. */
  protected readonly ids = computed(() => {
    const res = this.calc();
    if (!this.model().id) return '';
    return [res.item.id, ...res.targets.map((t) => t.id), ...res.lines.map((l) => l.id)].join(',');
  });

  constructor() {
    effect((onCleanup) => {
      const ids = this.ids();
      if (!ids || this.market.busy()) return;
      const timer = setTimeout(() => this.market.fetchPrices(this.market.untried(ids.split(','))), AUTOLOAD_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /** « 6.1 » une fois l'objet choisi, sinon « .1 ». */
  tierLabel(level: number): string {
    const tier = this.calc().tier;
    return tier ? tierText(tier, level) : `.${level}`;
  }

  /** Autre objet : les prix saisis pour l'ancien ne valent plus. */
  setItem(item: PickedItem): void {
    this.model.update((m) => (item.id === m.id ? { ...m, name: item.name } : { ...m, ...item, buy: null, mats: noPrices(), sell: noPrices() }));
  }

  /** Autre enchantement de départ : autre objet acheté, son prix saisi ne vaut plus. */
  setFrom(from: number): void {
    this.model.update((m) => ({ ...m, from, buy: m.from === from ? m.buy : null }));
  }

  setBuyIn(buyIn: UpgradeBuy): void {
    this.model.update((m) => ({ ...m, buyIn }));
  }

  setCity(city: City): void {
    this.model.update((m) => ({ ...m, city }));
  }

  reset(): void {
    this.model.set(emptyPlan());
  }

  refresh(): void {
    this.market.fetchPrices(this.ids().split(','));
  }

  icon(id: string): string {
    return itemIconUrl(id, 64);
  }

  fallback(event: Event): void {
    useFallbackIcon(event);
  }

  /** « Marché : 280 · Martlock », « aucun relevé », « … » en attendant les prix. */
  private quoteHint(id: string, quote: Quote | null, prices: PriceMap): string {
    if (!id) return '';
    const m = this.t().market.mine;
    if (quote) return m.quote(silver(quote.value), cityLabel(quote.city));
    return id in prices ? m.noQuote : '…';
  }
}
