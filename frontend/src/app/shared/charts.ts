/* Petits graphiques SVG/HTML faits main (pas de librairie) — thème noir & lilas.
   Règles : marques fines (colonnes ≤ 24 px, bout arrondi 4 px, carré sur la ligne de base),
   ligne 2 px, grille en filets discrets, texte toujours en couleur de texte (jamais celle de
   la série), info-bulle au survol / focus, et un tableau des données à côté de chaque graphe. */
import {
  Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal,
} from '@angular/core';

// ── Formatage ────────────────────────────────────────────────────────────────

/** 174 873 783 → « 174,9 M » ; 4 016 770 211 → « 4,02 Md » ; 950 → « 950 ». */
export function compactSilver(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number, digits: number) =>
    v.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  if (abs >= 1e9) return `${fmt(n / 1e9, 2)} Md`;
  if (abs >= 1e6) return `${fmt(n / 1e6, abs >= 1e8 ? 0 : 1)} M`;
  if (abs >= 1e3) return `${fmt(n / 1e3, 0)} k`;
  return fmt(n, 0);
}

export function fullSilver(n: number): string {
  return n.toLocaleString('fr-FR');
}

/** « 2026-09-28 » → « 28/09 » */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** « 2026-09-28 » → « lun. 28 sept. » */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Pas « rond » (1, 2, 2,5, 5 × 10ⁿ) pour ~`count` graduations jusqu'à `max`. */
export function niceStep(max: number, count = 4): number {
  if (max <= 0) return 1;
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/** Colonne au bout arrondi (rayon r) et carrée sur la ligne de base. `up` = vers le haut. */
export function columnPath(x: number, base: number, end: number, w: number, r = 4): string {
  const h = Math.abs(base - end);
  if (h < 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  if (end < base) {
    return `M${x},${base}V${end + rr}Q${x},${end} ${x + rr},${end}H${x + w - rr}Q${x + w},${end} ${x + w},${end + rr}V${base}Z`;
  }
  return `M${x},${base}V${end - rr}Q${x},${end} ${x + rr},${end}H${x + w - rr}Q${x + w},${end} ${x + w},${end - rr}V${base}Z`;
}

/** Largeur du conteneur, suivie au redimensionnement (640 px par défaut, ex. en test). */
function useWidth(fallback = 640) {
  const host = inject(ElementRef<HTMLElement>);
  const width = signal(fallback);
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const el = host.nativeElement as HTMLElement;
    const measure = () => { if (el.clientWidth > 0) width.set(el.clientWidth); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    destroyRef.onDestroy(() => ro.disconnect());
  });
  return width;
}

const CHART_STYLES = `
  :host { display: block; position: relative; min-width: 0; }
  svg { display: block; overflow: visible; }
  .grid-line { stroke: var(--grid); stroke-width: 1; shape-rendering: crispEdges; }
  .baseline { stroke: var(--axis); stroke-width: 1; shape-rendering: crispEdges; }
  .tick { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .hit { fill: transparent; cursor: default; outline: none; }
  .hit:hover, .hit:focus-visible, .hit.on { fill: rgba(255, 255, 255, 0.04); }
  .tip { position: absolute; z-index: 2; pointer-events: none; min-width: 150px;
         background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
         box-shadow: var(--shadow); padding: 8px 10px; font-size: .8rem; transform: translateX(-50%); }
  .tip strong { display: block; margin-bottom: 4px; font-weight: 600; }
  .tip .line { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
  .tip .line span:first-child { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); }
  .tip .line b { font-weight: 600; font-variant-numeric: tabular-nums; }
  .key { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: none; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: .8rem; color: var(--text-muted); margin-bottom: 8px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
`;

// ── Colonnes divergentes : crédité (haut) / retiré (bas) ─────────────────────

export interface FlowPoint { start: string; credited: number; withdrawn: number }

@Component({
  selector: 'app-flow-chart',
  template: `
    <div class="legend" aria-hidden="true">
      <span><i class="key" style="background: var(--series-1)"></i>{{ creditLabel() }}</span>
      <span><i class="key" style="background: var(--series-2)"></i>{{ withdrawLabel() }}</span>
    </div>
    <svg [attr.width]="width()" [attr.height]="H" role="img" [attr.aria-label]="ariaLabel()">
      @for (t of geo().ticks; track t.v) {
        <line class="grid-line" [attr.x1]="M.left" [attr.x2]="width() - M.right" [attr.y1]="t.y" [attr.y2]="t.y" />
        <text class="tick" [attr.x]="M.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
      }
      @for (b of geo().bars; track b.start) {
        <path [attr.d]="b.up" fill="var(--series-1)" />
        <path [attr.d]="b.down" fill="var(--series-2)" />
      }
      <line class="baseline" [attr.x1]="M.left" [attr.x2]="width() - M.right" [attr.y1]="geo().zero" [attr.y2]="geo().zero" />
      @for (b of geo().bars; track b.start; let i = $index) {
        @if (b.label) {
          <text class="tick" [attr.x]="b.cx" [attr.y]="H - 6" text-anchor="middle">{{ b.label }}</text>
        }
        <rect class="hit" [class.on]="hover() === i" tabindex="0" [attr.x]="b.bandX" [attr.y]="M.top"
              [attr.width]="b.bandW" [attr.height]="plotH" [attr.aria-label]="b.aria"
              (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)" (focus)="hover.set(i)" (blur)="hover.set(null)" />
      }
    </svg>
    @if (hover() !== null) {
      @let b = geo().bars[hover()!];
      @let p = data()[hover()!];
      <div class="tip" [style.left.px]="b.cx" [style.top.px]="0">
        <strong>{{ b.title }}</strong>
        <div class="line"><span><i class="key" style="background: var(--series-1)"></i>Crédité</span><b>{{ full(p.credited) }}</b></div>
        <div class="line"><span><i class="key" style="background: var(--series-2)"></i>Retiré</span><b>{{ full(p.withdrawn) }}</b></div>
        <div class="line"><span>Net</span><b>{{ (p.credited >= p.withdrawn ? '+' : '−') + full(abs(p.credited - p.withdrawn)) }}</b></div>
      </div>
    }
  `,
  styles: CHART_STYLES,
})
export class FlowChart {
  readonly data = input.required<FlowPoint[]>();
  readonly bucket = input<'day' | 'week'>('day');
  readonly creditLabel = input('Crédité aux joueurs');
  readonly withdrawLabel = input('Retiré (BAL payée)');

  protected readonly H = 260;
  protected readonly M = { top: 10, right: 8, bottom: 26, left: 56 };
  protected readonly plotH = this.H - this.M.top - this.M.bottom;
  protected readonly width = useWidth();
  protected readonly hover = signal<number | null>(null);
  protected readonly full = fullSilver;
  protected readonly abs = Math.abs;

  protected readonly ariaLabel = computed(() =>
    `Silver crédité et retiré par ${this.bucket() === 'week' ? 'semaine' : 'jour'} — détail dans le tableau`);

  protected readonly geo = computed(() => {
    const data = this.data();
    const { top, left, right } = this.M;
    const plotW = Math.max(this.width() - left - right, 50);
    const up = Math.max(0, ...data.map((d) => d.credited));
    const down = Math.max(0, ...data.map((d) => d.withdrawn));
    const step = niceStep(up + down || 1, 4);
    const topV = Math.max(step, Math.ceil(up / step) * step);
    const botV = Math.ceil(down / step) * step;
    const y = (v: number) => top + ((topV - v) / (topV + botV)) * this.plotH;
    const ticks = [];
    for (let v = -botV; v <= topV + 1e-6; v += step) ticks.push({ v, y: y(v), label: compactSilver(Math.abs(v)) });

    const n = Math.max(data.length, 1);
    const band = plotW / n;
    const w = Math.max(2, Math.min(24, band - 2));      // ≤ 24 px, 2 px d'air entre colonnes
    const every = Math.ceil(n / Math.max(1, Math.floor(plotW / 64)));
    const week = this.bucket() === 'week';
    const zero = y(0);
    const bars = data.map((d, i) => {
      const bandX = left + i * band;
      const x = bandX + (band - w) / 2;
      const title = week ? `Semaine du ${longDate(d.start)}` : longDate(d.start);
      return {
        start: d.start, bandX, bandW: band, cx: bandX + band / 2, title,
        // 1 px d'écart avec la ligne de base ; rien n'est dessiné pour une valeur nulle.
        up: d.credited > 0 ? columnPath(x, zero - 1, Math.min(y(d.credited), zero - 2), w) : '',
        down: d.withdrawn > 0 ? columnPath(x, zero + 1, Math.max(y(-d.withdrawn), zero + 2), w) : '',
        label: (n - 1 - i) % every === 0 ? shortDate(d.start) : '',
        aria: `${title} : crédité ${fullSilver(d.credited)}, retiré ${fullSilver(d.withdrawn)} silver`,
      };
    });
    return { ticks, bars, zero };
  });
}

// ── Courbe (BAL due dans le temps) ───────────────────────────────────────────

export interface LinePoint { date: string; total: number }

@Component({
  selector: 'app-line-chart',
  template: `
    <svg [attr.width]="width()" [attr.height]="H" role="img" [attr.aria-label]="label() + ' — détail dans le tableau'"
         (mousemove)="move($event)" (mouseleave)="hover.set(null)">
      @for (t of geo().ticks; track t.v) {
        <line class="grid-line" [attr.x1]="M.left" [attr.x2]="width() - M.right" [attr.y1]="t.y" [attr.y2]="t.y" />
        <text class="tick" [attr.x]="M.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
      }
      @for (l of geo().xLabels; track l.x) {
        <text class="tick" [attr.x]="l.x" [attr.y]="H - 6" text-anchor="middle">{{ l.label }}</text>
      }
      <path [attr.d]="geo().area" fill="var(--series-1-wash)" />
      <path [attr.d]="geo().line" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      @if (geo().last; as last) {
        <circle [attr.cx]="last.x" [attr.cy]="last.y" r="5" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2" />
        <text class="end-label" [attr.x]="last.x + 10" [attr.y]="last.y + 4">{{ compact(last.v) }}</text>
      }
      @if (hover() !== null) {
        @let p = geo().points[hover()!];
        <line class="cross" [attr.x1]="p.x" [attr.x2]="p.x" [attr.y1]="M.top" [attr.y2]="H - M.bottom" />
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="5" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2" />
      }
    </svg>
    @if (hover() !== null) {
      @let p = geo().points[hover()!];
      <div class="tip" [style.left.px]="p.x" [style.top.px]="0">
        <strong>{{ long(data()[hover()!].date) }}</strong>
        <div class="line"><span><i class="key" style="background: var(--series-1)"></i>{{ label() }}</span><b>{{ full(p.v) }}</b></div>
      </div>
    }
  `,
  styles: CHART_STYLES + `
    .end-label { fill: var(--text); font-size: 12px; font-weight: 600; }
    .cross { stroke: var(--text-muted); stroke-width: 1; shape-rendering: crispEdges; }
  `,
})
export class LineChart {
  readonly data = input.required<LinePoint[]>();
  readonly label = input('Valeur');

  protected readonly H = 240;
  protected readonly M = { top: 12, right: 72, bottom: 26, left: 56 };
  protected readonly width = useWidth();
  protected readonly hover = signal<number | null>(null);
  protected readonly compact = compactSilver;
  protected readonly full = fullSilver;
  protected readonly long = longDate;

  protected readonly geo = computed(() => {
    const data = this.data();
    const { top, bottom, left, right } = this.M;
    const plotW = Math.max(this.width() - left - right, 50);
    const plotH = this.H - top - bottom;
    const max = Math.max(1, ...data.map((d) => d.total));
    const step = niceStep(max, 4);
    const topV = Math.ceil(max / step) * step;
    const minV = Math.min(0, ...data.map((d) => d.total));
    const botV = minV < 0 ? -Math.ceil(-minV / step) * step : 0;
    const y = (v: number) => top + ((topV - v) / (topV - botV)) * plotH;
    const x = (i: number) => left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW);
    const ticks = [];
    for (let v = botV; v <= topV + 1e-6; v += step) ticks.push({ v, y: y(v), label: compactSilver(v) });
    const points = data.map((d, i) => ({ x: x(i), y: y(d.total), v: d.total }));
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
    const area = points.length ? `${line}L${points[points.length - 1].x},${y(botV)}L${points[0].x},${y(botV)}Z` : '';
    const every = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 70)));
    const xLabels = data
      .map((d, i) => ({ i, x: x(i), label: shortDate(d.date) }))
      .filter(({ i }) => (data.length - 1 - i) % every === 0);
    return { ticks, points, line, area, xLabels, last: points[points.length - 1] ?? null };
  });

  move(event: MouseEvent): void {
    const pts = this.geo().points;
    if (!pts.length) return;
    const svg = event.currentTarget as SVGElement;
    const mx = event.clientX - svg.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - mx) < Math.abs(pts[best].x - mx)) best = i;
    this.hover.set(best);
  }
}

// ── Barres horizontales (classements) ────────────────────────────────────────

export interface HBarRow { label: string; value: number; sub?: string }

@Component({
  selector: 'app-hbar-chart',
  template: `
    @if (rows().length) {
      <ol class="bars">
        @for (r of rows(); track r.label) {
          <li [title]="r.label + ' : ' + full(r.value) + ' ' + unit() + (r.sub ? ' · ' + r.sub : '')">
            <div class="name">
              <span class="label">{{ r.label }}</span>
              @if (r.sub) { <span class="sub">{{ r.sub }}</span> }
            </div>
            <div class="track">
              <div class="bar" [style.width.%]="pct(r.value)"></div>
              <span class="value" [style.left]="'calc(' + pct(r.value) + '% + 8px)'">{{ compact(r.value) }}</span>
            </div>
          </li>
        }
      </ol>
    } @else {
      <p class="muted empty-chart">{{ empty() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    li { display: grid; grid-template-columns: minmax(90px, 38%) 1fr; align-items: center; gap: 10px;
         padding: 3px 4px; border-radius: 6px; }
    li:hover { background: rgba(255, 255, 255, 0.04); }
    .name { min-width: 0; display: grid; }
    .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .85rem; }
    .sub { color: var(--text-muted); font-size: .72rem; }
    /* La zone des barres laisse 64 px à droite pour la valeur de la plus grande. */
    .track { position: relative; height: 14px; width: calc(100% - 64px); min-width: 0; }
    .bar { height: 100%; min-width: 2px; background: var(--series-1); border-radius: 0 4px 4px 0; }
    .value { position: absolute; top: 50%; transform: translateY(-50%); font-size: .8rem; font-weight: 600;
             font-variant-numeric: tabular-nums; white-space: nowrap; }
    .empty-chart { margin: 0; font-size: .85rem; }
  `,
})
export class HBarChart {
  readonly rows = input.required<HBarRow[]>();
  readonly empty = input('Aucune donnée sur la période.');
  /** Unité affichée au survol (« silver » par défaut, « actis », « places »…). */
  readonly unit = input('silver');
  protected readonly compact = compactSilver;
  protected readonly full = fullSilver;
  private readonly max = computed(() => Math.max(1, ...this.rows().map((r) => r.value)));
  pct(v: number): number {
    return (v / this.max()) * 100;
  }
}

// ── Donut (part de chaque élément dans un total) ─────────────────────────────

export interface DonutSlice { label: string; value: number; other?: boolean }

/** 7 couleurs catégorielles au plus (palette validée daltonisme sur fond sombre) :
 *  au-delà, le reste est replié dans une part « Autres » neutre — jamais de 8e teinte générée. */
export const DONUT_MAX_SLICES = 7;

/** Les `max` plus grosses valeurs + « Autres » (total − leur somme) si > 0. */
export function donutSlices(rows: { label: string; value: number }[], total: number, max = DONUT_MAX_SLICES): DonutSlice[] {
  const top = rows.filter((r) => r.value > 0).slice(0, max).map((r) => ({ label: r.label, value: r.value }));
  const rest = total - top.reduce((s, r) => s + r.value, 0);
  return rest > 0 ? [...top, { label: 'Autres', value: rest, other: true }] : top;
}

/** Secteur d'anneau entre les angles a0 et a1 (radians, 0 = midi, sens horaire). */
export function arcPath(cx: number, cy: number, r: number, ri: number, a0: number, a1: number): string {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  if (full) a1 = a0 + Math.PI * 2 - 1e-4; // un seul secteur : anneau complet
  const pt = (rad: number, a: number) => `${(cx + rad * Math.sin(a)).toFixed(2)},${(cy - rad * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(r, a0)}A${r},${r} 0 ${large} 1 ${pt(r, a1)}L${pt(ri, a1)}A${ri},${ri} 0 ${large} 0 ${pt(ri, a0)}Z`;
}

const DONUT_SIZE = 180;

@Component({
  selector: 'app-donut-chart',
  template: `
    @if (arcs().length) {
      <div class="donut">
        <div class="ring">
          <svg [attr.width]="size" [attr.height]="size" [attr.viewBox]="'0 0 ' + size + ' ' + size" role="img"
               [attr.aria-label]="label() + ' : ' + compact(sum()) + ' silver au total'">
            @for (a of arcs(); track a.label; let i = $index) {
              <path class="slice" [attr.d]="a.d" [style.fill]="a.color" [class.dim]="hover() !== null && hover() !== i"
                    tabindex="0" (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)"
                    (focus)="hover.set(i)" (blur)="hover.set(null)" />
            }
          </svg>
          <div class="center">
            @if (hover() !== null) {
              <strong class="num">{{ pct(arcs()[hover()!].value) }} %</strong>
              <span class="muted">{{ arcs()[hover()!].label }}</span>
            } @else {
              <strong class="num">{{ compact(sum()) }}</strong>
              <span class="muted">{{ centerLabel() }}</span>
            }
          </div>
        </div>
        <ul class="keys">
          @for (a of arcs(); track a.label; let i = $index) {
            <li [class.on]="hover() === i" (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)"
                [title]="a.label + ' : ' + full(a.value) + ' silver'">
              <span class="key" [style.background]="a.color"></span>
              <span class="name">{{ a.label }}</span>
              <span class="val num">{{ compact(a.value) }}</span>
              <span class="pct num muted">{{ pct(a.value) }} %</span>
            </li>
          }
        </ul>
      </div>
      <details>
        <summary>Voir les données</summary>
        <table class="table">
          <thead><tr><th>Joueur</th><th>Silver</th><th>Part</th></tr></thead>
          <tbody>
            @for (a of arcs(); track a.label) {
              <tr><td>{{ a.label }}</td><td>{{ full(a.value) }}</td><td>{{ pct(a.value) }} %</td></tr>
            }
          </tbody>
        </table>
      </details>
    } @else {
      <p class="muted empty-chart">{{ empty() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .donut { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; }
    .ring { position: relative; flex: none; }
    svg { display: block; }
    /* 2 px de fond entre les secteurs : chaque part reste lisible même à couleurs proches. */
    .slice { stroke: var(--surface); stroke-width: 2; outline: none; transition: opacity .15s; cursor: default; }
    .slice.dim { opacity: .35; }
    .slice:focus-visible { stroke: var(--text); }
    .center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; pointer-events: none; }
    .center strong { font-size: 1.25rem; font-weight: 700; }
    .center span { font-size: .72rem; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .keys { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; flex: 1; min-width: 200px; }
    .keys li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto 3.5em; align-items: center; gap: 8px;
               padding: 3px 6px; border-radius: 6px; font-size: .85rem; }
    .keys li.on, .keys li:hover { background: rgba(255, 255, 255, 0.04); }
    .key { width: 10px; height: 10px; border-radius: 3px; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .val { font-weight: 600; }
    .pct { text-align: right; font-size: .78rem; }
    .num { font-variant-numeric: tabular-nums; }
    details { font-size: .85rem; margin-top: 10px; }
    summary { cursor: pointer; color: var(--text-muted); width: max-content; }
    summary:hover { color: var(--lilac); }
    details .table { margin-top: 8px; }
    details .table th:not(:first-child), details .table td:not(:first-child) { text-align: right; }
    .empty-chart { margin: 0; font-size: .85rem; }
  `,
})
export class DonutChart {
  readonly slices = input.required<DonutSlice[]>();
  readonly label = input('Répartition');
  readonly centerLabel = input('au total');
  readonly empty = input('Aucune donnée.');
  protected readonly size = DONUT_SIZE;
  protected readonly hover = signal<number | null>(null);
  protected readonly compact = compactSilver;
  protected readonly full = fullSilver;
  protected readonly sum = computed(() => this.slices().reduce((s, x) => s + x.value, 0));

  /** Couleur fixe par rang (jamais recyclée), « Autres » en gris neutre. */
  protected readonly arcs = computed(() => {
    const total = this.sum();
    if (total <= 0) return [];
    const c = DONUT_SIZE / 2;
    let angle = 0;
    let rank = 0;
    return this.slices().filter((s) => s.value > 0).map((s) => {
      const a0 = angle;
      angle += (s.value / total) * Math.PI * 2;
      const color = s.other ? 'var(--text-faint)' : `var(--cat-${++rank})`;
      return { ...s, color, d: arcPath(c, c, c - 2, c * 0.62, a0, angle) };
    });
  });

  pct(v: number): string {
    const p = (v / this.sum()) * 100;
    return p.toLocaleString('fr-FR', { maximumFractionDigits: p < 10 ? 1 : 0 });
  }
}

// ── Variation vs période précédente ──────────────────────────────────────────

/** Variation en % (arrondie) ; null si la période précédente est vide (pas de base de comparaison). */
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** « ▲ 12 % » / « ▼ 30 % » / « = » / « nouveau » — `upIsGood` choisit la couleur (une hausse des
 *  retraits n'est ni bonne ni mauvaise : neutre). La flèche et le texte portent le sens, pas la couleur seule. */
@Component({
  selector: 'app-delta',
  template: `
    @if (pct() === null) {
      @if (current() > 0) { <span class="delta neutral" title="Rien sur la période précédente">nouveau</span> }
    } @else {
      <span class="delta" [class.good]="tone() === 'good'" [class.bad]="tone() === 'bad'" [class.neutral]="tone() === 'neutral'"
            [title]="'vs période précédente : ' + previousLabel()">
        {{ pct()! > 0 ? '▲' : pct()! < 0 ? '▼' : '=' }} {{ pct() === 0 ? '' : abs(pct()!) + ' %' }}
      </span>
    }
  `,
  styles: `
    .delta { display: inline-flex; align-items: center; gap: 3px; padding: 1px 7px; border-radius: 999px; font-size: .72rem;
             font-weight: 700; font-variant-numeric: tabular-nums; background: var(--surface-3); color: var(--text-muted); }
    .good { background: var(--success-soft); color: var(--success); }
    .bad { background: var(--danger-soft); color: var(--danger); }
  `,
})
export class Delta {
  readonly current = input.required<number>();
  readonly previous = input.required<number>();
  readonly upIsGood = input<boolean | null>(true);
  readonly format = input<(n: number) => string>(compactSilver);
  protected readonly abs = Math.abs;
  protected readonly pct = computed(() => deltaPct(this.current(), this.previous()));
  protected readonly previousLabel = computed(() => this.format()(this.previous()));
  protected readonly tone = computed(() => {
    const p = this.pct();
    if (!p || this.upIsGood() === null) return 'neutral';
    return (p > 0) === this.upIsGood() ? 'good' : 'bad';
  });
}

// ── Carte jour × heure ───────────────────────────────────────────────────────

export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Niveau 0 (vide) à 5 d'une case, relatif au maximum de la carte. */
export function heatLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((value / max) * 5));
}

@Component({
  selector: 'app-heatmap',
  template: `
    <div class="heat" role="img" [attr.aria-label]="summary()">
      <span></span>
      @for (h of hours; track h) {
        <span class="hour">{{ h % 3 === 0 ? h + 'h' : '' }}</span>
      }
      @for (row of data(); track $index; let d = $index) {
        <span class="day">{{ days[d].slice(0, 3) }}</span>
        @for (v of row; track $index; let h = $index) {
          <span class="cell" [attr.data-level]="level(v)" [title]="days[d] + ' ' + h + 'h : ' + v + ' ' + unit() + (v > 1 ? 's' : '')"></span>
        }
      }
    </div>
    <div class="scale">
      <span>moins</span>
      @for (l of [1, 2, 3, 4, 5]; track l) { <i class="cell" [attr.data-level]="l"></i> }
      <span>plus</span>
      @if (peak(); as p) { <span class="peak">Créneau le plus actif : <b>{{ p }}</b></span> }
    </div>
  `,
  styles: `
    :host { display: grid; gap: 10px; min-width: 0; }
    .heat { display: grid; grid-template-columns: 34px repeat(24, minmax(0, 1fr)); gap: 3px; align-items: center; }
    .hour { font-size: .62rem; color: var(--text-faint); text-align: left; white-space: nowrap; }
    .day { font-size: .72rem; color: var(--text-muted); }
    .cell { aspect-ratio: 1; border-radius: 3px; background: var(--surface-2); min-width: 0; }
    .cell[data-level='1'] { background: var(--heat-1); }
    .cell[data-level='2'] { background: var(--heat-2); }
    .cell[data-level='3'] { background: var(--heat-3); }
    .cell[data-level='4'] { background: var(--heat-4); }
    .cell[data-level='5'] { background: var(--heat-5); }
    .heat .cell:hover { outline: 2px solid var(--text); outline-offset: 1px; }
    .scale { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: .72rem; color: var(--text-muted); }
    .scale .cell { width: 12px; display: inline-block; }
    .peak { margin-left: auto; }
    .peak b { color: var(--text); }
  `,
})
export class Heatmap {
  readonly data = input.required<number[][]>();
  readonly unit = input('activité');
  protected readonly days = WEEKDAYS;
  protected readonly hours = Array.from({ length: 24 }, (_, h) => h);
  private readonly max = computed(() => Math.max(0, ...this.data().flat()));
  protected readonly peak = computed(() => {
    let best: [number, number, number] | null = null;
    this.data().forEach((row, d) => row.forEach((v, h) => { if (v > 0 && (!best || v > best[2])) best = [d, h, v]; }));
    const b = best as [number, number, number] | null;
    return b ? `${WEEKDAYS[b[0]].toLowerCase()} ${b[1]}h–${b[1] + 1}h (${b[2]})` : '';
  });
  protected readonly summary = computed(() =>
    `Fins d'activité par jour et par heure. ${this.peak() ? 'Créneau le plus actif : ' + this.peak() : 'Aucune activité.'}`);

  protected level(v: number): number {
    return heatLevel(v, this.max());
  }
}
