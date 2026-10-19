import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n/i18n';
import { BalPeriod, BalStats } from '../../core/models';
import { errorText, lastValue } from '../../core/resource';
import {
  Delta, DonutChart, DonutSlice, FlowChart, HBarChart, HBarRow, Heatmap, LineChart, compactSilver, donutSlices,
  fullSilver, longDate,
} from '../../shared/charts';
import { Icon, IconName } from '../../shared/icon';
import { PeriodPicker } from '../../shared/period-picker';
import { ActivityStatsPanel } from './activity-stats';
import { BalPlayers } from './bal-players';
import { BotErrors } from './bot-errors';

interface Tile {
  label: string;
  value: string;
  title: string;
  icon: IconName;
  current?: number;
  previous?: number;
  upIsGood?: boolean | null;
}

/** Page réservée aux admins du site (nommés via /webadmin sur Discord) :
 *  chiffres clés + tableau de bord complet de la BAL. */
@Component({
  selector: 'app-admin',
  imports: [ActivityStatsPanel, BalPlayers, BotErrors, DecimalPipe, Delta, DonutChart, FlowChart, HBarChart, Heatmap, Icon, LineChart, PeriodPicker],
  template: `
    <div class="page-head">
      <div>
        <h1>Admin <span class="badge">ADMIN</span></h1>
        <p class="subtitle">{{ t().admin.subtitle }}</p>
      </div>
      @if (overview(); as o) {
        <div class="overview">
          @for (s of stats(); track s.label) {
            <div class="stat">
              <app-icon [name]="s.icon" [size]="16" />
              <strong class="value">{{ s.value | number: '1.0-0' : locale() }}</strong>
              <span class="muted">{{ s.label }}</span>
            </div>
          }
        </div>
      }
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (!error()) {
    <section class="bal" aria-labelledby="bal-title">
      <div class="section-head">
        <div>
          <h2 id="bal-title">{{ t().admin.balTitle }}</h2>
          @if (bal(); as b) {
            <p class="muted range"><app-icon name="calendar" [size]="14" /> {{ t().admin.since(long(b.start)) }}{{ t().admin.compared }}</p>
          }
        </div>
        <app-period-picker [value]="period()" (valueChange)="setPeriod($event)" />
      </div>

      @if (balError()) {
        <p class="alert">{{ balError() }}</p>
      }

      @if (bal(); as b) {
        <div class="dashboard" [class.stale]="balLoading()">
          <div class="card hero">
            <span class="muted label"><app-icon name="coins" [size]="16" /> {{ t().admin.due }}</span>
            <strong class="hero-value gradient-text" [title]="(b.totals.due | number: '1.0-0' : locale()) + ' silver'">{{ compact(b.totals.due) }}</strong>
            <span class="muted">{{ t().admin.duePlayers(b.totals.players) }}</span>
          </div>
          <div class="tiles">
            @for (tile of tiles(); track tile.label) {
              <div class="card tile">
                <span class="muted tile-label"><app-icon [name]="tile.icon" [size]="14" /> {{ tile.label }}</span>
                <div class="tile-value">
                  <strong [title]="tile.title">{{ tile.value }}</strong>
                  @if (tile.previous !== undefined) {
                    <app-delta [current]="tile.current!" [previous]="tile.previous" [upIsGood]="tile.upIsGood === undefined ? true : tile.upIsGood" />
                  }
                </div>
              </div>
            }
          </div>

          <div class="card chart wide">
            <h3>{{ t().admin.flowTitle }} <span class="muted">{{ t().bal.per(b.bucket) }}</span></h3>
            <app-flow-chart [data]="b.flow" [bucket]="b.bucket" />
            <details>
              <summary>{{ t().admin.showData }}</summary>
              <table class="table">
                <thead><tr><th>{{ b.bucket === 'week' ? t().admin.weekOf : t().admin.day }}</th><th>{{ t().admin.credited }}</th><th>{{ t().admin.withdrawn }}</th></tr></thead>
                <tbody>
                  @for (f of b.flow; track f.start) {
                    <tr><td>{{ long(f.start) }}</td>
                      <td>{{ f.credited | number: '1.0-0' : locale() }}</td>
                      <td>{{ f.withdrawn | number: '1.0-0' : locale() }}</td></tr>
                  }
                </tbody>
              </table>
            </details>
          </div>

          <div class="card chart wide">
            <h3>{{ t().admin.dueTitle }}</h3>
            <app-line-chart [data]="b.due" [label]="t().admin.dueLabel" />
            <p class="muted note">{{ t().admin.dueNote }}</p>
            <details>
              <summary>{{ t().admin.showData }}</summary>
              <table class="table">
                <thead><tr><th>{{ t().admin.day }}</th><th>{{ t().admin.dueEndOfDay }}</th></tr></thead>
                <tbody>
                  @for (d of b.due; track d.date) {
                    <tr><td>{{ long(d.date) }}</td><td>{{ d.total | number: '1.0-0' : locale() }}</td></tr>
                  }
                </tbody>
              </table>
            </details>
          </div>

          <div class="card chart span-7">
            <h3>{{ t().admin.whenTitle }} <span class="muted">{{ t().admin.whenHint }}</span></h3>
            <app-heatmap [data]="b.heatmap" />
          </div>

          <div class="card chart span-5">
            <h3><app-icon name="flag" [size]="16" /> {{ t().admin.topCallers }} <span class="muted">{{ t().admin.topCallersHint }}</span></h3>
            <app-hbar-chart [rows]="callers()" [empty]="t().admin.noActivityEnd" />
          </div>

          <div class="card chart span-6">
            <h3><app-icon name="trend" [size]="16" /> {{ t().admin.topEarners }} <span class="muted">{{ t().admin.topEarnersHint }}</span></h3>
            <app-hbar-chart [rows]="earners()" />
          </div>

          <div class="card chart span-6">
            <h3><app-icon name="crown" [size]="16" /> {{ t().admin.biggestDue }} <span class="muted">{{ t().admin.biggestDueHint }}</span></h3>
            <app-donut-chart [slices]="topPlayers()" [label]="t().admin.duePerPlayer" [centerLabel]="t().admin.dueLabel"
                             [empty]="t().admin.noBal" />
          </div>

          <div class="card chart wide">
            <h3>{{ t().admin.byCompo }} <span class="muted">{{ t().admin.byCompoHint }}</span></h3>
            <app-hbar-chart [rows]="byTemplate()" />
          </div>
        </div>
      } @else if (!balError()) {
        <div class="dashboard">
          <div class="skeleton hero-sk"></div><div class="skeleton hero-sk"></div>
          <div class="skeleton wide chart-sk"></div>
        </div>
      }
    </section>

    <app-activity-stats [guildId]="guildId()" />
    <app-bal-players [guildId]="guildId()" />
    <app-bot-errors [guildId]="guildId()" />
    }
  `,
  styles: `
    h1 { display: flex; align-items: center; gap: 10px; }
    .overview { display: flex; flex-wrap: wrap; gap: 10px; }
    .stat { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 12px;
            background: var(--surface); border: 1px solid var(--border); font-size: .85rem; }
    .stat app-icon { color: var(--lilac); }
    .value { font-size: 1.05rem; font-weight: 700; }

    .bal { margin-top: 8px; }
    .section-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .section-head h2 { margin: 0; font-size: 1.35rem; }
    .range { margin: 6px 0 0; font-size: .85rem; display: flex; align-items: center; gap: 6px; }

    .dashboard { display: grid; gap: 16px; grid-template-columns: repeat(12, minmax(0, 1fr)); transition: opacity .15s; }
    .dashboard.stale { opacity: .55; }
    .hero { grid-column: span 5; display: grid; gap: 4px; align-content: center; overflow: hidden;
            background: radial-gradient(ellipse at 0% 0%, rgba(167, 123, 243, .28), transparent 65%), var(--surface); }
    .label { display: flex; align-items: center; gap: 6px; }
    .hero-value { font-size: clamp(2.8rem, 6vw, 4rem); line-height: 1.05; font-weight: 800; letter-spacing: -.03em; }
    .tiles { grid-column: span 7; display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .tile { display: grid; gap: 6px; align-content: center; padding: 16px; }
    .tile-label { display: flex; align-items: center; gap: 6px; font-size: .8rem; }
    .tile-value { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
    .tile strong { font-size: 1.4rem; font-weight: 700; }
    .chart { grid-column: span 6; display: grid; gap: 10px; align-content: start; }
    .chart h3 { margin: 0 0 4px; font-size: 1rem; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .chart h3 .muted { font-weight: 400; font-size: .85rem; }
    .chart h3 app-icon { color: var(--lilac); }
    .chart.wide, .skeleton.wide { grid-column: 1 / -1; }
    .chart.span-7 { grid-column: span 7; }
    .chart.span-5 { grid-column: span 5; }
    .hero-sk { grid-column: span 6; }
    .note { margin: 0; font-size: .78rem; }
    .hero-sk { min-height: 190px; }
    .chart-sk { min-height: 300px; }

    details { font-size: .85rem; }
    summary { cursor: pointer; color: var(--text-muted); width: max-content; }
    summary:hover { color: var(--lilac); }
    details .table { margin-top: 8px; font-variant-numeric: tabular-nums; }
    details .table th, details .table td { text-align: right; }
    details .table th:first-child, details .table td:first-child { text-align: left; }
    details[open] { max-height: 320px; overflow: auto; }

    @media (max-width: 1000px) {
      .hero, .tiles, .chart.span-7, .chart.span-5 { grid-column: 1 / -1; }
    }
    @media (max-width: 760px) {
      .chart, .hero-sk { grid-column: 1 / -1; }
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class AdminPage {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly locale = this.i18n.locale;
  readonly guildId = input.required<string>();

  private readonly overviewRes = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.adminOverview(params) });
  protected readonly overview = computed(() => (this.overviewRes.hasValue() ? this.overviewRes.value() : null));
  protected readonly error = errorText(this.overviewRes);

  protected readonly period = signal<BalPeriod>('30d');
  private readonly balRes = rxResource({
    params: () => ({ guildId: this.guildId(), period: this.period() }),
    stream: ({ params }) => this.api.adminBal(params.guildId, params.period),
  });
  /** Garde l'ancien rendu (estompé) pendant le rechargement d'une autre période. */
  protected readonly bal = lastValue(this.balRes);
  protected readonly balLoading = this.balRes.isLoading;
  protected readonly balError = errorText(this.balRes);
  protected readonly compact = compactSilver;
  protected readonly long = longDate;

  protected readonly netLabel = computed(() => {
    const b = this.bal();
    if (!b) return '';
    const net = b.totals.credited - b.totals.withdrawn;
    return `${net >= 0 ? '+' : '−'}${compactSilver(Math.abs(net))}`;
  });

  protected readonly stats = computed((): { label: string; value: number; icon: IconName }[] => {
    const o = this.overview();
    return o ? [
      { label: this.t().admin.profiles, value: o.profiles, icon: 'users' },
      { label: this.t().admin.builds, value: o.builds, icon: 'sword' },
      { label: this.t().admin.compos, value: o.compos, icon: 'shield' },
    ] : [];
  });

  // Données des graphiques : recalculées seulement quand les stats changent (pas à chaque rendu).
  protected readonly tiles = computed(() => this.withBal((b) => this.makeTiles(b)));
  /** 7 plus grosses BAL dues + « Autres » (reste de la BAL due totale). */
  protected readonly topPlayers = computed((): DonutSlice[] =>
    this.withBal((b) => donutSlices(b.top_players.map((p) => ({ label: p.name, value: p.amount })), b.totals.due)));
  protected readonly earners = computed((): HBarRow[] =>
    this.withBal((b) => b.top_earners.map((p) => ({ label: p.name, value: p.amount }))));
  protected readonly callers = computed((): HBarRow[] => this.withBal((b) => b.top_callers.map((c) => ({
    label: c.name, value: c.silver, sub: this.t().admin.activities(c.activities),
  }))));
  protected readonly byTemplate = computed((): HBarRow[] => this.withBal((b) => b.by_template.map((t) => ({
    label: t.template, value: t.silver, sub: this.t().admin.activities(t.activities),
  }))));

  setPeriod(period: BalPeriod): void {
    this.period.set(period);
  }

  private withBal<T>(make: (b: BalStats) => T[]): T[] {
    const b = this.bal();
    return b ? make(b) : [];
  }

  private makeTiles(b: BalStats): Tile[] {
    const full = (n: number) => `${fullSilver(n)} silver`;
    const t = b.totals;
    const l = this.t().admin;
    return [
      { label: l.tileCredited, value: compactSilver(t.credited), title: full(t.credited), icon: 'trend',
        current: t.credited, previous: b.previous.credited },
      { label: l.tilePaid, value: compactSilver(t.withdrawn), title: full(t.withdrawn), icon: 'coins',
        current: t.withdrawn, previous: b.previous.withdrawn, upIsGood: null },
      { label: l.tileNet, value: this.netLabel(), title: l.tileNetTitle, icon: 'chart' },
      { label: l.tileEnds, value: t.activities.toLocaleString(this.locale()), title: '/finacti et /paybal', icon: 'flag',
        current: t.activities, previous: b.previous.activities },
      { label: l.tileAvg, value: compactSilver(t.avg_per_activity), title: full(t.avg_per_activity), icon: 'sparkles' },
      { label: l.tileAvgPlayers, value: t.avg_players_per_activity.toLocaleString(this.locale()), title: l.tileAvgPlayersTitle, icon: 'users' },
    ];
  }
}
