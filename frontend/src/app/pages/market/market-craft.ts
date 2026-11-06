import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';

import { debouncedSignal } from '../../core/debounce';
import { I18nService } from '../../core/i18n/i18n';
import { itemIconUrl, useFallbackIcon } from '../../core/items.service';
import { BULK_MAX, MarketService, storedSignal } from '../../core/market.service';
import { CountUp } from '../../shared/count-up';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';
import { cityLabel, familyLabel, perDay, percent, silver, tierText } from './market-format';
import {
  Activity, RECIPE_CATS, RRR_OPTIONS, Recipe, RecipeCat, RecipeFilters, RecipeResult, RecipeScope, SortSpec, activity, baseId, familyOf,
  filterRecipes, rawCost, recipeCalc, recipeIds, sortRows,
} from './market-logic';
import { AUTOLOAD_MS } from './market-search';

type Sort = 'profit' | 'roi' | 'cost' | 'sell' | 'volume' | 'name' | 'tier';

interface CraftPrefs extends RecipeFilters {
  qty: number;
  rrr: string;
  minRoi: string;
  /** Ventes par jour minimales de l'objet fabriqué (7 derniers jours, ville de revente). */
  minVol: string;
  only: boolean;
  sort: Sort;
  /** Sens inverse du sens naturel de la colonne (2ᵉ clic sur l'en-tête). */
  rev: boolean;
}

const DEFAULTS: CraftPrefs = {
  q: '', scope: 'both', cat: '', fam: '', ing: '', tiers: [], enchs: [0], qty: 100, rrr: '15.2', minRoi: '', minVol: '',
  only: false,
  sort: 'profit', rev: false,
};
const PAGE_SIZE = 20;

interface Row {
  recipe: Recipe;
  calc: RecipeResult;
  name: string;
  /** Ventes de l'objet fabriqué (7 derniers jours, ville de revente) ; null = pas encore chargé. */
  vol: Activity | null;
}

const SORTS: Record<Sort, SortSpec<Row>> = {
  profit: { value: (r) => r.calc.profit, desc: true },
  roi: { value: (r) => r.calc.roi, desc: true },
  cost: { value: (r) => r.calc.cost },
  sell: { value: (r) => (r.calc.sell ? r.calc.revenue : null), desc: true },
  volume: { value: (r) => r.vol?.perDay, desc: true },
  name: { value: (r) => r.name },
  tier: { value: (r) => r.recipe.tier * 10 + r.recipe.ench, then: (a, b) => a.name.localeCompare(b.name) },
};

/** Fabrication (cuisine, potions, raffinage, équipement) : coût des ressources, revente, marge et ventes par jour
 *  pour une quantité et un retour de ressources. */
@Component({
  selector: 'app-market-craft',
  imports: [CountUp, Icon, Pager],
  template: `
    <section class="card filters">
      <div class="grid-f">
        <label class="input-icon wide">
          <app-icon name="search" />
          <input class="input" type="search" autocomplete="off" [placeholder]="t().market.craft.placeholder"
                 [attr.aria-label]="t().market.craft.label" [value]="f().q" (input)="patch({ q: $any($event.target).value })" />
        </label>
        <div class="field">
          <label for="c-scope">{{ t().market.craft.scope }}</label>
          <select id="c-scope" class="select" (change)="patch({ scope: $any($event.target).value })">
            @for (s of scopes; track s) { <option [value]="s" [selected]="s === f().scope">{{ t().market.craft.scopes[s] }}</option> }
          </select>
        </div>
      </div>
      <div class="grid-f">
        <div class="field">
          <label for="c-cat">{{ t().market.craft.type }}</label>
          <select id="c-cat" class="select" (change)="patch({ cat: $any($event.target).value, fam: '', ing: '' })">
            <option value="" [selected]="!f().cat">{{ t().market.craft.allTypes }}</option>
            @for (c of cats; track c) { <option [value]="c" [selected]="c === f().cat">{{ t().market.craft.cats[c] }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="c-fam">{{ t().market.craft.family }}</label>
          <select id="c-fam" class="select" (change)="patch({ fam: $any($event.target).value })">
            <option value="" [selected]="!f().fam">{{ t().market.craft.allFamilies }}</option>
            @for (fa of families(); track fa.key) { <option [value]="fa.key" [selected]="fa.key === f().fam">{{ fa.label }}</option> }
          </select>
        </div>
        @if (f().cat === 'meal') {
        <div class="field">
          <label for="c-ing">{{ t().market.craft.ingredient }}</label>
          <select id="c-ing" class="select" (change)="patch({ ing: $any($event.target).value })">
            <option value="" [selected]="!f().ing">{{ t().market.craft.allIngredients }}</option>
            @for (i of ingredients(); track i.id) { <option [value]="i.id" [selected]="i.id === f().ing">{{ i.name }}</option> }
          </select>
        </div>
        }
        <div class="field">
          <label for="c-roi">{{ t().market.minRoi }}</label>
          <div class="input-unit">
            <input id="c-roi" class="input" type="number" min="0" step="1" inputmode="numeric" [placeholder]="t().market.noMin" [value]="f().minRoi"
                   (change)="patch({ minRoi: $any($event.target).value })" />
            <span class="unit">%</span>
          </div>
        </div>
        <div class="field">
          <label for="c-vol">{{ t().market.search.minVolume }}</label>
          <div class="input-unit">
            <input id="c-vol" class="input" type="number" min="0" step="1" inputmode="numeric" [placeholder]="t().market.noMin" [value]="f().minVol"
                   (change)="patch({ minVol: $any($event.target).value })" />
            <span class="unit">{{ t().market.search.perDayUnit }}</span>
          </div>
        </div>
        <div class="field">
          <label for="c-sort">{{ t().market.sortBy }}</label>
          <select id="c-sort" class="select" (change)="patch({ sort: $any($event.target).value, rev: false })">
            @for (s of sorts; track s) { <option [value]="s" [selected]="s === f().sort">{{ t().market.craft.sorts[s] }}</option> }
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
          <label for="c-qty">{{ t().market.craft.qty }}</label>
          <input id="c-qty" class="input" type="number" min="1" step="1" inputmode="numeric" [value]="f().qty" (change)="setQty($any($event.target).value)" />
        </div>
        <div class="field">
          <label for="c-rrr">{{ t().market.craft.rrr }}</label>
          <select id="c-rrr" class="select" (change)="patch({ rrr: $any($event.target).value })">
            @for (r of rrrs; track r) { <option [value]="r" [selected]="r === f().rrr">{{ t().market.craft.rrrs[r] }}</option> }
          </select>
        </div>
        <div class="field end">
          <label class="switch"><input type="checkbox" [checked]="f().only" (change)="patch({ only: $any($event.target).checked })" />
            {{ t().market.onlyPriced }}</label>
          <button type="button" class="btn btn-sm reset" (click)="reset()">
            <app-icon name="reset" [size]="14" /> {{ t().market.reset }}
          </button>
        </div>
      </div>
    </section>

    <div class="actions">
      <p class="muted count">{{ t().market.craft.count(rows().length, matching().length, qty()) }}</p>
      <button type="button" class="btn btn-primary btn-sm" [disabled]="market.busy() || !pageRows().length" (click)="refresh()">
        <app-icon name="clock" [size]="14" /> {{ t().market.refresh }}
      </button>
      <button type="button" class="btn btn-sm bulk" [disabled]="market.busy() || !matching().length" [attr.aria-busy]="bulking()" (click)="loadAll()">
        @if (bulking()) { <span class="spinner" aria-hidden="true"></span> {{ t().market.loadingAll(market.progress().done, market.progress().total) }} }
        @else { <app-icon name="trend" [size]="14" /> {{ t().market.loadAll(bulk) }} }
      </button>
    </div>

    @if (pageRows().length) {
      <div class="card table-card">
        <div class="scroll">
          <table class="table">
            <thead><tr>
              @for (c of columns; track c.col) {
                @if (c.sort; as s) {
                  <th [class.r]="c.right" [attr.aria-sort]="ariaSort(s)">
                    <button type="button" class="sort-h" [class.on]="f().sort === s" [title]="t().market.sortHint" (click)="sortBy(s)">
                      {{ t().market.craft.cols[c.col] }}
                      <app-icon name="chevron" [size]="12" class="dir" [class.up]="up(s)" />
                    </button>
                  </th>
                } @else {
                  <th>{{ t().market.craft.cols[c.col] }}</th>
                }
              }
            </tr></thead>
            <tbody>
              @for (r of pageRows(); track r.recipe.id; let i = $index) {
                <tr class="fade-up" [class.best]="r.best" [class.open]="openId() === r.recipe.id" [style.animation-delay.ms]="delay(i)">
                  <td>
                    <button type="button" class="item" [attr.aria-expanded]="openId() === r.recipe.id" (click)="toggleOpen(r.recipe.id)">
                      <span class="ico"><img [src]="icon(r.recipe.id)" alt="" loading="lazy" width="40" height="40" (error)="fallback($event)" /></span>
                      <span class="txt"><span class="name">{{ r.name }}
                        @if (r.best) { <span class="badge deal glow-pulse"><app-icon name="sparkles" [size]="11" /> {{ t().market.bestDeal }}</span> }</span>
                        <small class="faint">{{ r.tier }} · {{ r.family }} · {{ r.recipe.id }}</small></span>
                      <app-icon name="chevron" [size]="14" class="chev" />
                    </button>
                  </td>
                  <td class="formula">
                    @for (x of r.formula; track x.id; let last = $last) { <span><b>{{ x.count }}×</b> {{ x.name }}</span>@if (!last) { <span class="faint"> + </span> } }
                    <span class="yield">→ <b>{{ r.recipe.y }}</b> {{ t().market.craft.produces(r.recipe.y, r.recipe.cat) }}</span>
                  </td>
                  <td class="r num">@if (r.calc.cost != null) { <span class="flash cell">{{ silver(r.calc.cost) }}<small class="faint">{{ t().market.perUnit(silver(r.calc.cost / r.calc.made)) }}</small></span> }
                    @else { <span class="faint">{{ r.loaded ? t().market.missing : '…' }}</span> }</td>
                  <td class="r num">@if (r.calc.sell; as s) { <span class="flash cell">{{ silver(r.calc.revenue) }}<small class="faint">{{ city(s.city) }} · {{ t().market.perUnit(silver(s.value)) }}</small></span> } @else { – }</td>
                  <td class="r num">@if (r.calc.profit != null) { <span class="flash" [class.gain]="r.calc.profit >= 0" [class.pos]="r.calc.profit >= 0" [class.neg]="r.calc.profit < 0">{{ silver(r.calc.profit) }}</span> } @else { – }</td>
                  <td class="r num" [class.pos]="(r.calc.roi ?? -1) >= 0" [class.neg]="(r.calc.roi ?? 0) < 0">{{ pct(r.calc.roi) }}</td>
                  <td class="r num" [class.faint]="!r.vol?.perDay">{{ r.volText }}</td>
                </tr>
                @if (openId() === r.recipe.id) {
                  <tr class="detail"><td colspan="7">
                    <div class="reveal"><div>
                      <p class="muted crafts">{{ t().market.craft.crafts(r.calc.crafts, r.calc.made, f().rrr) }}</p>
                      @if (r.vol) { <p class="muted crafts">{{ r.sellOut }}</p> }
                      <table class="table lines">
                        <thead><tr><th>{{ t().market.craft.lines.res }}</th><th class="r">{{ t().market.craft.lines.qty }}</th>
                          <th>{{ t().market.craft.lines.city }}</th><th class="r">{{ t().market.craft.lines.unit }}</th><th class="r">{{ t().market.craft.lines.cost }}</th></tr></thead>
                        <tbody>
                          @for (l of r.calc.lines; track l.id; let j = $index) {
                            <tr class="fade-up" [style.animation-delay.ms]="j * 50">
                              <td>{{ name(l.id) }}<small class="faint">{{ t().market.craft.perCraft(l.count) }}@if (l.noReturn) { · <span class="no-return">{{ t().market.craft.noReturn }}</span> }</small></td>
                              <td class="r num">{{ silver(l.need) }}</td>
                              <td>{{ l.buy ? city(l.buy.city) : '–' }}</td>
                              <td class="r num">{{ silver(l.buy?.value) }}</td>
                              <td class="r num">{{ silver(l.cost) }}</td>
                            </tr>
                          }
                        </tbody>
                        <tfoot>
                          <tr><td colspan="4">{{ t().market.craft.total }}</td><td class="r num" [appCountUp]="r.calc.cost" [countUpFormat]="silver"></td></tr>
                          <tr><td colspan="4">{{ t().market.craft.revenue }}@if (r.calc.sell; as s) { ({{ city(s.city) }}) }</td>
                            <td class="r num" [appCountUp]="r.calc.revenue" [countUpFormat]="silver"></td></tr>
                          <tr class="total"><td colspan="4">{{ t().market.craft.margin }}</td>
                            <td class="r num" [class.pos]="(r.calc.profit ?? -1) >= 0" [class.neg]="(r.calc.profit ?? 0) < 0"
                                [appCountUp]="r.calc.profit" [countUpFormat]="silver"></td></tr>
                        </tfoot>
                      </table>
                      @if (openRaw(); as raw) {
                        <p class="muted crafts raw-title"><app-icon name="sparkles" [size]="13" /> {{ t().market.craft.raw.title(f().rrr) }}</p>
                        <table class="table lines raw">
                          <thead><tr><th>{{ t().market.craft.raw.res }}</th><th class="r">{{ t().market.craft.lines.qty }}</th>
                            <th>{{ t().market.craft.lines.city }}</th><th class="r">{{ t().market.craft.lines.unit }}</th><th class="r">{{ t().market.craft.lines.cost }}</th></tr></thead>
                          <tbody>
                            @for (l of raw.lines; track l.id) {
                              <tr><td>{{ name(l.id) }}</td><td class="r num">{{ silver(l.need) }}</td><td>{{ l.buy ? city(l.buy.city) : '–' }}</td>
                                <td class="r num">{{ silver(l.buy?.value) }}</td><td class="r num">{{ silver(l.cost) }}</td></tr>
                            }
                          </tbody>
                          <tfoot><tr class="total"><td colspan="4">{{ t().market.craft.raw.total }}
                            @if (raw.cost != null && r.calc.cost != null) { <small class="faint" [class.pos]="raw.cost < r.calc.cost">{{ t().market.craft.raw.diff(silver(Math.abs(r.calc.cost - raw.cost)), raw.cost < r.calc.cost) }}</small> }</td>
                            <td class="r num">{{ raw.cost != null ? silver(raw.cost) : t().market.missing }}</td></tr></tfoot>
                        </table>
                      }
                    </div></div>
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>
      <app-pager [page]="page()" [pageSize]="pageSize" [total]="rows().length" [label]="t().market.craft.pagerLabel" (pageChange)="page.set($event)" />
      <p class="faint hint">{{ t().market.craft.hint }}</p>
    } @else {
      <div class="empty"><app-icon name="sparkles" [size]="32" /><p>{{ t().market.craft.empty(f().only || f().minRoi !== '') }}</p></div>
    }
  `,
  styles: `
    :host { display: block; }
    .filters { display: grid; gap: 14px; padding: 16px; margin-bottom: 14px; }
    .grid-f { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 12px 14px; align-items: end; }
    .wide { grid-column: span 2; }
    @media (max-width: 520px) { .wide { grid-column: auto; } }
    .lbl { font-weight: 600; font-size: .85rem; color: var(--text-muted); }
    .end { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; min-height: 44px; }
    .reset { color: var(--text-muted); }
    .reset:hover { color: var(--text); }
    .reset app-icon { transition: transform .35s var(--ease); }
    .reset:hover app-icon { transform: rotate(-120deg); }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 12px; }
    .count { flex: 1 1 220px; margin: 0; font-size: .9rem; }
    .table-card { padding: 6px 4px; }
    .scroll { overflow-x: auto; }
    .table { min-width: 940px; }
    .table td { vertical-align: middle; }
    .r { text-align: right !important; white-space: nowrap; }
    .sort-h { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none;
              color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; }
    .sort-h:hover, .sort-h.on { color: var(--text); }
    .dir { opacity: 0; transition: transform .2s var(--ease), opacity .15s; }
    .sort-h:hover .dir { opacity: .5; }
    .sort-h.on .dir { opacity: 1; color: var(--lilac); }
    .dir.up { transform: rotate(180deg); }
    .item { display: flex; align-items: center; gap: 12px; background: none; border: 0; padding: 2px 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .ico { flex: none; width: 40px; height: 40px; border-radius: 9px; background: var(--surface-2); transition: transform .2s var(--ease), box-shadow .2s; }
    .ico img { width: 40px; height: 40px; display: block; }
    tbody tr:hover .ico, .item:focus-visible .ico { transform: scale(1.08); box-shadow: 0 0 0 1px var(--lilac-strong), 0 0 16px var(--lilac-glow); }
    .txt { display: grid; gap: 2px; }
    .name { font-weight: 600; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .item:hover .name { color: var(--lilac); }
    small { display: block; font-size: .75rem; }
    .chev { color: var(--text-faint); transition: transform .25s var(--ease); }
    .open .chev { transform: rotate(180deg); color: var(--lilac); }
    .formula { font-size: .85rem; line-height: 1.5; min-width: 240px; }
    .formula b { color: var(--lilac); }
    .yield { color: var(--text-muted); margin-left: 4px; }
    .cell { display: inline-block; padding: 1px 4px; margin: -1px -4px; }
    .pos { color: var(--success); font-weight: 600; }
    .neg { color: var(--danger); font-weight: 600; }
    .flash.pos, .flash.neg { padding: 1px 4px; }
    tr.best { background: linear-gradient(90deg, var(--lilac-soft), transparent 60%); }
    .deal { background: var(--gradient); color: var(--on-lilac); }
    .detail > td { padding: 4px 10px 14px 64px; background: var(--bg-2); }
    .crafts { font-size: .85rem; margin: 8px 0; }
    .no-return { color: var(--lilac); }
    .lines { min-width: 0; max-width: 720px; }
    .lines td { white-space: nowrap; }
    tfoot td { font-weight: 600; border-top: 1px solid var(--border); }
    tfoot .total td { font-size: 1.05rem; }
    .hint { font-size: .8rem; margin-top: 10px; }
    .raw-title { display: flex; align-items: center; gap: 6px; margin-top: 16px; color: var(--lilac); }
    .raw tfoot small { font-weight: 400; margin-top: 2px; }
    .raw tfoot small.pos { color: var(--success); }
  `,
})
export class MarketCraft {
  protected readonly market = inject(MarketService);
  protected readonly t = inject(I18nService).t;
  protected readonly f = storedSignal<CraftPrefs>('lilium.market.craft', DEFAULTS);
  protected readonly scopes: RecipeScope[] = ['both', 'name', 'ing'];
  protected readonly cats: RecipeCat[] = RECIPE_CATS;
  protected readonly tiers = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly enchs = [0, 1, 2, 3, 4];
  protected readonly rrrs = RRR_OPTIONS;
  protected readonly sorts: Sort[] = ['profit', 'roi', 'cost', 'sell', 'volume', 'name', 'tier'];
  /** En-têtes du tableau : un clic trie sur la colonne, un 2ᵉ inverse le sens (la formule ne se trie pas). */
  protected readonly columns: { col: 'recipe' | 'formula' | 'cost' | 'sell' | 'profit' | 'roi' | 'volume'; sort: Sort | null; right: boolean }[] = [
    { col: 'recipe', sort: 'name', right: false },
    { col: 'formula', sort: null, right: false },
    { col: 'cost', sort: 'cost', right: true },
    { col: 'sell', sort: 'sell', right: true },
    { col: 'profit', sort: 'profit', right: true },
    { col: 'roi', sort: 'roi', right: true },
    { col: 'volume', sort: 'volume', right: true },
  ];
  protected readonly pageSize = PAGE_SIZE;
  protected readonly bulk = BULK_MAX;
  protected readonly silver = silver;
  protected readonly pct = percent;
  protected readonly city = cityLabel;
  protected readonly Math = Math;
  /** « Charger tous les résultats » en cours (loader sur le bouton). */
  protected readonly bulking = signal(false);
  protected readonly qty = computed(() => Math.max(1, Math.floor(+this.f().qty) || 1));

  protected readonly families = computed(() => {
    const cat = this.f().cat;
    const keys = new Set(this.market.recipes().filter((r) => !cat || r.cat === cat).map(familyOf));
    return [...keys].map((key) => ({ key, label: familyLabel(key) })).sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Ingrédients des recettes du type et de la famille choisis (la liste complète compterait des milliers d'entrées). */
  protected readonly ingredients = computed(() => {
    const { cat, fam } = this.f();
    const recipes = this.market.recipes().filter((r) => (!cat || r.cat === cat) && (!fam || familyOf(r) === fam));
    const ids = new Set(recipes.flatMap((r) => r.r.map((x) => baseId(x[0]))));
    return [...ids].map((id) => ({ id, name: this.market.nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
  });

  private readonly query = debouncedSignal(computed(() => this.f().q));
  protected readonly matching = computed(() =>
    filterRecipes(this.market.recipes(), { ...this.f(), q: this.query(), ing: this.f().cat === 'meal' ? this.f().ing : '' },
      (id) => this.market.nameOf(id)),
  );

  protected readonly rows = computed(() => {
    const prices = this.market.prices();
    const history = this.market.history();
    const s = this.market.settings();
    const f = this.f();
    const o = { mode: s.mode, tax: this.market.tax(), bm: s.bm, noBuy: s.noBuy };
    const now = Date.now();
    let rows: Row[] = this.matching().map((recipe) => {
      const calc = recipeCalc(recipe, prices, this.qty(), +f.rrr, o);
      return { recipe, calc, name: this.market.nameOf(recipe.id), vol: activity(history[recipe.id], calc.sell?.city ?? '', now) };
    });
    if (f.only) rows = rows.filter((r) => r.calc.cost != null || r.calc.sell);
    if (f.minRoi !== '') rows = rows.filter((r) => r.calc.roi != null && r.calc.roi >= +f.minRoi);
    if (f.minVol !== '' && +f.minVol > 0) rows = rows.filter((r) => r.vol != null && r.vol.perDay >= +f.minVol);
    return sortRows(rows, SORTS[f.sort] ?? SORTS.profit, f.rev);
  });

  protected readonly page = linkedSignal({ source: () => [this.matching(), this.f()], computation: () => 1 });

  protected readonly pageRows = computed(() => {
    const prices = this.market.prices();
    const start = (this.page() - 1) * PAGE_SIZE;
    const firstPage = this.page() === 1 && this.f().sort === 'profit' && !this.f().rev;
    return this.rows().slice(start, start + PAGE_SIZE).map((r, i) => ({
      ...r,
      tier: tierText(r.recipe.tier, r.recipe.ench),
      family: familyLabel(familyOf(r.recipe)),
      formula: r.recipe.r.map(([id, count]) => ({ id, count, name: this.market.nameOf(id) })),
      loaded: r.recipe.id in prices,
      best: firstPage && i === 0 && (r.calc.profit ?? 0) > 0,
      volText: r.vol ? perDay(r.vol.perDay) : '…',
      sellOut: r.vol ? this.t().market.craft.sellOut(r.vol.perDay, r.calc.made, r.calc.sell ? cityLabel(r.calc.sell.city) : '') : '',
    }));
  });

  protected readonly openId = signal<string | null>(null);

  /** Recettes de raffinage par id de ressource raffinée. */
  private readonly refines = computed(() => new Map(this.market.recipes().filter((r) => r.cat === 'refine').map((r) => [r.id, r])));

  /** Détail ouvert : coût en matériaux bruts (ressources raffinées remplacées par leur recette), en indication. */
  protected readonly openRaw = computed(() => {
    const row = this.rows().find((r) => r.recipe.id === this.openId());
    return row ? rawCost(row.calc.lines, this.refines(), this.market.prices(), +this.f().rrr, this.market.settings().noBuy) : null;
  });
  private readonly pageIds = computed(() =>
    [...this.pageRows().flatMap((r) => recipeIds(r.recipe)), ...(this.openRaw()?.lines.map((l) => l.id) ?? [])].join(','));
  private readonly pageMade = computed(() => this.pageRows().map((r) => r.recipe.id).join(','));

  constructor() {
    effect((onCleanup) => {
      const ids = this.pageIds();
      if (!ids || this.market.busy()) return;
      const list = ids.split(',');
      // Historique des ventes : seulement pour les objets fabriqués (pas les ressources).
      const made = this.pageMade().split(',');
      const timer = setTimeout(() => this.market.fetchPrices(this.market.untried(list), made), AUTOLOAD_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  patch(change: Partial<CraftPrefs>): void {
    this.f.update((f) => ({ ...f, ...change }));
  }

  setQty(value: string): void {
    this.patch({ qty: Math.max(1, Math.floor(+value) || 1) });
  }

  toggle(key: 'tiers' | 'enchs', value: number): void {
    const list = this.f()[key];
    this.patch({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  }

  reset(): void {
    this.f.set({ ...DEFAULTS, enchs: [], qty: this.f().qty, rrr: this.f().rrr, sort: this.f().sort, rev: this.f().rev });
  }

  /** Clic sur un en-tête : trie sur cette colonne (sens naturel), ou inverse le sens si c'est déjà elle. */
  sortBy(sort: Sort): void {
    this.patch(sort === this.f().sort ? { rev: !this.f().rev } : { sort, rev: false });
  }

  /** Flèche vers le haut = ordre croissant. */
  up(sort: Sort): boolean {
    return sort === this.f().sort && !SORTS[sort].desc !== this.f().rev;
  }

  ariaSort(sort: Sort): 'ascending' | 'descending' | null {
    if (sort !== this.f().sort) return null;
    return this.up(sort) ? 'ascending' : 'descending';
  }

  toggleOpen(id: string): void {
    this.openId.update((open) => (open === id ? null : id));
  }

  refresh(): void {
    this.market.fetchPrices(this.pageRows().flatMap((r) => recipeIds(r.recipe)), this.pageRows().map((r) => r.recipe.id));
  }

  /** Prix des recettes filtrées et de leurs ressources, jusqu'à BULK_MAX ids. */
  loadAll(): void {
    const ids = new Set<string>();
    const made: string[] = [];
    for (const recipe of this.matching()) {
      recipeIds(recipe).forEach((id) => ids.add(id));
      made.push(recipe.id);
      if (ids.size >= BULK_MAX) break;
    }
    if (this.market.busy()) return;
    this.bulking.set(true);
    void this.market.fetchPrices([...ids], made).finally(() => this.bulking.set(false));
  }

  name(id: string): string {
    return this.market.nameOf(id);
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
