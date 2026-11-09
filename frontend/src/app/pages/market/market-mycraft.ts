import { Component, computed, effect, inject } from '@angular/core';
import { FormField, applyEach, form, max, min } from '@angular/forms/signals';

import { I18nService } from '../../core/i18n/i18n';
import { MarketService, storedSignal } from '../../core/market.service';
import { CountUp } from '../../shared/count-up';
import { Icon } from '../../shared/icon';
import { cityLabel, percent, silver } from './market-format';
import { MarketItemField, PickedItem } from './market-item-field';
import { CustomCraft, CustomLine, PriceMap, Quote, RRR_OPTIONS, customCraftCalc } from './market-logic';
import { AUTOLOAD_MS } from './market-search';

const emptyLine = (): CustomLine => ({ id: '', name: '', count: null, price: null, noReturn: false });
const emptyCraft = (): CustomCraft => ({ id: '', name: '', units: 1, qty: 10, rrr: 15.2, fee: null, sell: null, lines: [emptyLine()] });

/** Mon craft : le joueur saisit sa recette (ressources, quantités, prix ou prix du marché, retour de
 *  ressources, frais d'atelier, prix de vente) et voit coût, revente, marge et seuil de rentabilité. */
@Component({
  selector: 'app-market-mycraft',
  imports: [CountUp, FormField, Icon, MarketItemField],
  template: `
    <div class="layout">
      <div>
        <section class="card block">
          <h2>{{ t().market.mine.title }}</h2>
          <div class="grid-f">
            <div class="field wide">
              <span class="lbl">{{ t().market.mine.product }}</span>
              <app-market-item-field [id]="model().id" [name]="model().name" [label]="t().market.mine.product"
                                     [placeholder]="t().market.mine.productPlaceholder" (pick)="setProduct($event)" />
              @if (recipe()) {
                <button type="button" class="btn btn-sm recipe" (click)="useRecipe()">
                  <app-icon name="book" [size]="14" /> {{ t().market.mine.useRecipe }}
                </button>
              }
            </div>
            <div class="field">
              <label for="mc-sell">{{ t().market.mine.sell }}</label>
              <input id="mc-sell" class="input" type="number" step="1" inputmode="numeric" [placeholder]="sellView().placeholder" [formField]="craft.sell" />
              <small class="faint">{{ sellView().hint }}</small>
            </div>
          </div>
          <div class="grid-f">
            <div class="field">
              <label for="mc-units">{{ t().market.mine.units }}</label>
              <input id="mc-units" class="input" type="number" step="1" inputmode="numeric" [formField]="craft.units" />
            </div>
            <div class="field">
              <label for="mc-qty">{{ t().market.mine.qty }}</label>
              <input id="mc-qty" class="input" type="number" step="1" inputmode="numeric" [formField]="craft.qty" />
            </div>
            <div class="field">
              <label for="mc-rrr">{{ t().market.mine.rrr }}</label>
              <div class="input-unit">
                <input id="mc-rrr" class="input" type="number" step="0.1" inputmode="decimal" [formField]="craft.rrr" />
                <span class="unit">%</span>
              </div>
              <div class="chips presets" role="group" [attr.aria-label]="t().market.mine.rrr">
                @for (r of rrrs; track r) {
                  <button type="button" class="chip" [attr.aria-pressed]="model().rrr === +r" [title]="t().market.craft.rrrs[r]" (click)="setRrr(+r)">
                    {{ t().market.mine.rrrShort(r) }}</button>
                }
              </div>
            </div>
            <div class="field">
              <label for="mc-fee">{{ t().market.mine.fee }}</label>
              <input id="mc-fee" class="input" type="number" step="1" inputmode="numeric" placeholder="0" [formField]="craft.fee" />
            </div>
          </div>
        </section>

        <section class="card block">
          <h2>{{ t().market.mine.resources }} <small class="faint crafts">{{ t().market.mine.crafts(calc().crafts, calc().made) }}</small></h2>
          @if (model().lines.length) {
            <div class="lines">
              <div class="line head" aria-hidden="true">
                <span>{{ t().market.mine.cols.res }}</span><span>{{ t().market.mine.cols.count }}</span><span>{{ t().market.mine.cols.price }}</span>
                <span class="r">{{ t().market.mine.cols.need }}</span><span class="r">{{ t().market.mine.cols.cost }}</span><span></span>
              </div>
              @for (field of craft.lines; track $index; let i = $index) {
                @let line = field().value();
                @let v = lineViews()[i];
                <!-- Pas de fade-up : une animation de transform ferait passer la ligne suivante sur les suggestions. -->
                <div class="line">
                  <div class="cell c-res">
                    <app-market-item-field [id]="line.id" [name]="line.name" [label]="t().market.mine.resource(i + 1)"
                                           [placeholder]="t().market.mine.resourcePlaceholder" (pick)="setLine(i, $event)" />
                    <label class="switch small" [title]="t().market.mine.noReturnHint">
                      <input type="checkbox" role="switch" [formField]="field.noReturn" /> {{ t().market.mine.noReturn }}
                    </label>
                  </div>
                  <div class="cell c-count">
                    <span class="mlbl">{{ t().market.mine.cols.count }}</span>
                    <input class="input" type="number" step="1" inputmode="numeric" [attr.aria-label]="t().market.mine.cols.count + ' · ' + v.label"
                           [formField]="field.count" />
                  </div>
                  <div class="cell c-price">
                    <span class="mlbl">{{ t().market.mine.cols.price }}</span>
                    <input class="input" type="number" step="1" inputmode="numeric" [attr.aria-label]="t().market.mine.cols.price + ' · ' + v.label"
                           [placeholder]="v.placeholder" [formField]="field.price" />
                    <small class="faint">{{ v.hint }}</small>
                  </div>
                  <div class="cell c-need out">
                    <span class="mlbl">{{ t().market.mine.cols.need }}</span>
                    <span class="num">{{ v.res.need.toLocaleString(locale()) }}</span>
                  </div>
                  <div class="cell c-cost out">
                    <span class="mlbl">{{ t().market.mine.cols.cost }}</span>
                    <span class="num" [class.missing]="v.res.cost == null">{{ v.res.cost == null ? t().market.missing : silver(v.res.cost) }}</span>
                  </div>
                  <button type="button" class="btn btn-sm btn-ghost c-del" [attr.aria-label]="t().market.mine.remove(v.label)" (click)="removeLine(i)">✕</button>
                </div>
              }
            </div>
          } @else {
            <p class="muted none">{{ t().market.mine.noLines }}</p>
          }
          <button type="button" class="btn btn-sm btn-ghost add" (click)="addLine()"><app-icon name="plus" [size]="14" /> {{ t().market.mine.add }}</button>
        </section>
      </div>

      <section class="card block result" aria-live="polite">
        <h2>{{ t().market.mine.result }}
          @if (calc().profit != null) {
            <span class="badge verdict" [class.ok]="calc().profit! >= 0">{{ t().market.mine.verdict(calc().profit! >= 0) }}</span>
          }
        </h2>
        <div class="tile main">
          <span class="lbl">{{ t().market.mine.profit }}</span>
          <strong class="profit" [class.pos]="(calc().profit ?? -1) >= 0" [class.neg]="(calc().profit ?? 0) < 0"
                  [appCountUp]="calc().profit" [countUpFormat]="silver"></strong>
          <small class="faint">{{ t().market.mine.roi(pct(calc().roi)) }}</small>
        </div>
        <div class="tile">
          <span class="lbl">{{ t().market.mine.cost }}</span>
          <strong class="cost" [appCountUp]="calc().cost" [countUpFormat]="silver"></strong>
          <small class="faint">{{ t().market.mine.costDetail(silver(calc().resources), silver(calc().fees)) }}</small>
        </div>
        <div class="tile">
          <span class="lbl">{{ t().market.mine.revenue }}</span>
          <strong class="revenue" [appCountUp]="calc().revenue" [countUpFormat]="silver"></strong>
          <small class="faint">{{ t().market.mine.revenueDetail(silver(calc().unit), market.tax()) }}</small>
        </div>
        <div class="tile">
          <span class="lbl">{{ t().market.mine.perUnit }}</span>
          <strong class="per-unit" [class.pos]="(calc().perUnit ?? -1) >= 0" [class.neg]="(calc().perUnit ?? 0) < 0"
                  [appCountUp]="calc().perUnit" [countUpFormat]="silver"></strong>
        </div>
        <div class="tile">
          <span class="lbl">{{ t().market.mine.breakEven }}</span>
          <strong class="break-even" [appCountUp]="calc().breakEven" [countUpFormat]="silver"></strong>
          <small class="faint">{{ t().market.mine.breakEvenDetail }}</small>
        </div>
        @if (missing()) { <p class="warn">{{ t().market.mine.missingPrices(missing()) }}</p> }
        @if (calc().unit == null) { <p class="warn">{{ t().market.mine.noSell }}</p> }
        <div class="actions">
          <button type="button" class="btn btn-sm" [disabled]="market.busy() || !ids()" (click)="refresh()">
            <app-icon name="clock" [size]="14" /> {{ t().market.mine.refresh }}
          </button>
          <button type="button" class="btn btn-sm reset" (click)="reset()">
            <app-icon name="reset" [size]="14" /> {{ t().market.mine.reset }}
          </button>
        </div>
      </section>
    </div>
    <p class="faint hint">{{ t().market.mine.hint }}</p>
  `,
  styles: `
    :host { display: block; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 320px); gap: 0 18px; align-items: start; }
    @media (max-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .block { display: grid; gap: 14px; padding: 16px; margin-bottom: 14px; }
    h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; font-size: 1.05rem; }
    .crafts { font-size: .8rem; font-weight: 500; }
    .grid-f { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 12px 14px; align-items: start; }
    .wide { grid-column: span 2; }
    @media (max-width: 520px) { .wide { grid-column: auto; } }
    .lbl { font-weight: 600; font-size: .85rem; color: var(--text-muted); }
    small { display: block; font-size: .75rem; }
    .recipe { justify-self: start; }
    .presets { gap: 4px; }
    .presets .chip { padding: 3px 9px; font-size: .75rem; }
    .lines { display: grid; gap: 10px; }
    .line { display: grid; grid-template-columns: minmax(170px, 2.4fr) minmax(70px, .8fr) minmax(96px, 1.1fr) minmax(60px, .7fr) minmax(80px, .9fr) 36px;
            gap: 8px 10px; align-items: start; }
    .line.head { font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-faint); }
    .r { text-align: right; }
    .cell { display: grid; gap: 5px; min-width: 0; }
    .out { justify-items: end; padding-top: 11px; white-space: nowrap; }
    .out .num { font-weight: 600; }
    .missing { color: var(--danger); font-size: .8rem; }
    .switch.small { font-size: .78rem; color: var(--text-muted); gap: 8px; }
    .c-del { margin-top: 4px; color: var(--text-faint); }
    .c-del:hover { color: var(--danger); }
    .mlbl { display: none; font-size: .72rem; font-weight: 600; color: var(--text-faint); }
    @media (max-width: 720px) {
      .line { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 36px; grid-template-areas: 'res res del' 'count price .' 'need cost .';
              padding-bottom: 12px; border-bottom: 1px solid var(--border-soft); }
      .line.head { display: none; }
      .c-res { grid-area: res; } .c-count { grid-area: count; } .c-price { grid-area: price; }
      .c-need { grid-area: need; } .c-cost { grid-area: cost; } .c-del { grid-area: del; }
      .out { justify-items: start; padding-top: 0; }
      .mlbl { display: block; }
    }
    .none { margin: 0; font-size: .9rem; }
    .add { justify-self: start; }
    .result { position: sticky; top: 16px; gap: 10px; }
    @media (max-width: 960px) { .result { position: static; } }
    .verdict { background: var(--danger-soft); color: var(--danger); }
    .verdict.ok { background: var(--success-soft); color: var(--success); }
    .tile { display: grid; gap: 2px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--surface-2); }
    .tile strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
    .tile.main { background: var(--lilac-soft); }
    .tile.main strong { font-size: 1.6rem; }
    .pos { color: var(--success); }
    .neg { color: var(--danger); }
    .warn { margin: 0; font-size: .82rem; color: var(--danger); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .reset { color: var(--text-muted); }
    .reset:hover { color: var(--text); }
    .reset app-icon { transition: transform .35s var(--ease); }
    .reset:hover app-icon { transform: rotate(-120deg); }
    .hint { font-size: .8rem; margin-top: 4px; }
  `,
})
export class MarketMyCraft {
  protected readonly market = inject(MarketService);
  protected readonly t = inject(I18nService).t;
  protected readonly locale = inject(I18nService).locale;
  protected readonly rrrs = RRR_OPTIONS;
  protected readonly silver = silver;
  protected readonly pct = percent;

  protected readonly model = storedSignal<CustomCraft>('lilium.market.mycraft', emptyCraft());
  protected readonly craft = form(this.model, (p) => {
    min(p.units, 1);
    min(p.qty, 1);
    min(p.rrr, 0);
    max(p.rrr, 100);
    min(p.fee, 0);
    min(p.sell, 0);
    applyEach(p.lines, (line) => {
      min(line.count, 0);
      min(line.price, 0);
    });
  });

  protected readonly calc = computed(() => {
    const s = this.market.settings();
    return customCraftCalc(this.model(), this.market.prices(), { mode: s.mode, tax: this.market.tax(), bm: s.bm, noBuy: s.noBuy });
  });

  /** Vue de chaque ligne : résultat, prix du marché en indice, nom pour les libellés. */
  protected readonly lineViews = computed(() => {
    const prices = this.market.prices();
    const lines = this.calc().lines;
    const m = this.t().market.mine;
    return this.model().lines.map((l, i) => ({
      res: lines[i],
      hint: this.quoteHint(l.id, lines[i].market, prices),
      placeholder: lines[i].market ? silver(lines[i].market!.value) : m.pricePh,
      label: l.name.trim() || m.resource(i + 1),
    }));
  });

  protected readonly sellView = computed(() => {
    const quote = this.calc().market;
    return {
      hint: this.quoteHint(this.model().id, quote, this.market.prices()),
      placeholder: quote ? silver(quote.value) : this.t().market.mine.pricePh,
    };
  });

  /** Ressources utilisées sans prix (ni saisi ni relevé), séparées par des virgules. */
  protected readonly missing = computed(() =>
    this.lineViews().filter((v) => v.res.cost == null).map((v) => v.label).join(', '),
  );

  /** Recette du jeu (cuisine, potions, raffinage, équipement) de l'objet choisi, pour pré-remplir les ressources. */
  protected readonly recipe = computed(() => {
    const id = this.model().id;
    return id ? (this.market.recipes().find((r) => r.id === id) ?? null) : null;
  });

  /** Ids du catalogue dont il faut les prix (objet fabriqué et ressources). */
  protected readonly ids = computed(() => {
    const m = this.model();
    return [...new Set([m.id, ...m.lines.map((l) => l.id)].filter(Boolean))].join(',');
  });

  constructor() {
    effect((onCleanup) => {
      const ids = this.ids();
      if (!ids || this.market.busy()) return;
      const timer = setTimeout(() => this.market.fetchPrices(this.market.untried(ids.split(','))), AUTOLOAD_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  setProduct(item: PickedItem): void {
    this.model.update((m) => ({ ...m, ...item }));
  }

  setLine(index: number, item: PickedItem): void {
    this.model.update((m) => ({ ...m, lines: m.lines.map((l, i) => (i === index ? { ...l, ...item } : l)) }));
  }

  setRrr(rrr: number): void {
    this.model.update((m) => ({ ...m, rrr }));
  }

  addLine(): void {
    this.model.update((m) => ({ ...m, lines: [...m.lines, emptyLine()] }));
  }

  removeLine(index: number): void {
    this.model.update((m) => ({ ...m, lines: m.lines.filter((_, i) => i !== index) }));
  }

  /** Remplace les ressources par celles de la recette du jeu (prix du marché). */
  useRecipe(): void {
    const recipe = this.recipe();
    if (!recipe) return;
    this.model.update((m) => ({
      ...m,
      units: recipe.y,
      lines: recipe.r.map(([id, count, ret]) => ({ id, name: this.market.nameOf(id), count, price: null, noReturn: ret === 0 })),
    }));
  }

  reset(): void {
    this.model.set(emptyCraft());
  }

  refresh(): void {
    this.market.fetchPrices(this.ids().split(','));
  }

  /** « Marché : 280 · Martlock », « aucun relevé », « … » en attendant les prix ; rien en saisie libre. */
  private quoteHint(id: string, quote: Quote | null, prices: PriceMap): string {
    if (!id) return '';
    const m = this.t().market.mine;
    if (quote) return m.quote(silver(quote.value), cityLabel(quote.city));
    return id in prices ? m.noQuote : '…';
  }
}
