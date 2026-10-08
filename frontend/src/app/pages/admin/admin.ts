import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AdminOverview, BalPeriod, BalStats } from '../../core/models';
import {
  Delta, DonutChart, DonutSlice, FlowChart, HBarChart, HBarRow, Heatmap, LineChart, compactSilver, donutSlices,
  fullSilver, longDate,
} from '../../shared/charts';
import { Icon, IconName } from '../../shared/icon';
import { PeriodPicker } from '../../shared/period-picker';
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
  imports: [BotErrors, DecimalPipe, Delta, DonutChart, FlowChart, HBarChart, Heatmap, Icon, LineChart, PeriodPicker],
  template: `
    <div class="page-head">
      <div>
        <h1>Admin <span class="badge">ADMIN</span></h1>
        <p class="subtitle">Vue d'ensemble de la guilde et de sa BAL.</p>
      </div>
      @if (overview(); as o) {
        <div class="overview">
          @for (s of stats(o); track s.label) {
            <div class="stat">
              <app-icon [name]="s.icon" [size]="16" />
              <strong class="value">{{ s.value | number: '1.0-0' : 'fr-FR' }}</strong>
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
          <h2 id="bal-title">Tableau de bord BAL</h2>
          @if (bal(); as b) {
            <p class="muted range"><app-icon name="calendar" [size]="14" /> Du {{ long(b.start) }} à aujourd'hui
              · comparé à la période précédente</p>
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
            <span class="muted label"><app-icon name="coins" [size]="16" /> BAL due aux joueurs</span>
            <strong class="hero-value gradient-text" [title]="(b.totals.due | number: '1.0-0' : 'fr-FR') + ' silver'">{{ compact(b.totals.due) }}</strong>
            <span class="muted">silver · {{ b.totals.players }} joueur{{ b.totals.players > 1 ? 's' : '' }} avec de la BAL</span>
          </div>
          <div class="tiles">
            @for (t of tiles(b); track t.label) {
              <div class="card tile">
                <span class="muted tile-label"><app-icon [name]="t.icon" [size]="14" /> {{ t.label }}</span>
                <div class="tile-value">
                  <strong [title]="t.title">{{ t.value }}</strong>
                  @if (t.previous !== undefined) {
                    <app-delta [current]="t.current!" [previous]="t.previous" [upIsGood]="t.upIsGood === undefined ? true : t.upIsGood" />
                  }
                </div>
              </div>
            }
          </div>

          <div class="card chart wide">
            <h3>Silver crédité et payé <span class="muted">— par {{ b.bucket === 'week' ? 'semaine' : 'jour' }}</span></h3>
            <app-flow-chart [data]="b.flow" [bucket]="b.bucket" />
            <details>
              <summary>Voir les données</summary>
              <table class="table">
                <thead><tr><th>{{ b.bucket === 'week' ? 'Semaine du' : 'Jour' }}</th><th>Crédité</th><th>Retiré</th></tr></thead>
                <tbody>
                  @for (f of b.flow; track f.start) {
                    <tr><td>{{ long(f.start) }}</td>
                      <td>{{ f.credited | number: '1.0-0' : 'fr-FR' }}</td>
                      <td>{{ f.withdrawn | number: '1.0-0' : 'fr-FR' }}</td></tr>
                  }
                </tbody>
              </table>
            </details>
          </div>

          <div class="card chart wide">
            <h3>Évolution de la BAL due</h3>
            <app-line-chart [data]="b.due" label="BAL due" />
            <p class="muted note">Reconstituée à partir de l'historique des opérations (conservé 6 mois par le bot).</p>
            <details>
              <summary>Voir les données</summary>
              <table class="table">
                <thead><tr><th>Jour</th><th>BAL due (fin de journée)</th></tr></thead>
                <tbody>
                  @for (d of b.due; track d.date) {
                    <tr><td>{{ long(d.date) }}</td><td>{{ d.total | number: '1.0-0' : 'fr-FR' }}</td></tr>
                  }
                </tbody>
              </table>
            </details>
          </div>

          <div class="card chart span-7">
            <h3>Quand la guilde joue <span class="muted">— fins d'activité par jour et heure</span></h3>
            <app-heatmap [data]="b.heatmap" />
          </div>

          <div class="card chart span-5">
            <h3><app-icon name="flag" [size]="16" /> Top callers <span class="muted">— silver distribué</span></h3>
            <app-hbar-chart [rows]="callers(b)" empty="Aucune fin d'activité sur la période." />
          </div>

          <div class="card chart span-6">
            <h3><app-icon name="trend" [size]="16" /> Top gagnants <span class="muted">— sur la période</span></h3>
            <app-hbar-chart [rows]="earners(b)" />
          </div>

          <div class="card chart span-6">
            <h3><app-icon name="crown" [size]="16" /> Plus grosses BAL dues <span class="muted">— part de la BAL due</span></h3>
            <app-donut-chart [slices]="topPlayers(b)" label="BAL due par joueur" centerLabel="BAL due"
                             empty="Aucun joueur n'a de BAL." />
          </div>

          <div class="card chart wide">
            <h3>Silver gagné par compo <span class="muted">— fins d'activité</span></h3>
            <app-hbar-chart [rows]="byTemplate(b)" />
          </div>
        </div>
      } @else if (!balError()) {
        <div class="dashboard">
          <div class="skeleton hero-sk"></div><div class="skeleton hero-sk"></div>
          <div class="skeleton wide chart-sk"></div>
        </div>
      }
    </section>

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
export class AdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly overview = signal<AdminOverview | null>(null);
  protected readonly error = signal('');
  protected readonly period = signal<BalPeriod>('30d');
  protected readonly bal = signal<BalStats | null>(null);
  protected readonly balLoading = signal(false);
  protected readonly balError = signal('');
  protected readonly compact = compactSilver;
  protected readonly long = longDate;
  private balRequest = 0;

  protected readonly netLabel = computed(() => {
    const b = this.bal();
    if (!b) return '';
    const net = b.totals.credited - b.totals.withdrawn;
    return `${net >= 0 ? '+' : '−'}${compactSilver(Math.abs(net))}`;
  });

  stats(o: AdminOverview): { label: string; value: number; icon: IconName }[] {
    return [
      { label: 'profils (/register)', value: o.profiles, icon: 'users' },
      { label: 'builds', value: o.builds, icon: 'sword' },
      { label: 'compos', value: o.compos, icon: 'shield' },
    ];
  }

  tiles(b: BalStats): Tile[] {
    const full = (n: number) => `${fullSilver(n)} silver`;
    const t = b.totals;
    return [
      { label: 'Crédité', value: compactSilver(t.credited), title: full(t.credited), icon: 'trend',
        current: t.credited, previous: b.previous.credited },
      { label: 'Payé (retiré)', value: compactSilver(t.withdrawn), title: full(t.withdrawn), icon: 'coins',
        current: t.withdrawn, previous: b.previous.withdrawn, upIsGood: null },
      { label: 'Solde net', value: this.netLabel(), title: 'Crédité − payé sur la période', icon: 'chart' },
      { label: "Fins d'activité", value: t.activities.toLocaleString('fr-FR'), title: '/finacti et /paybal', icon: 'flag',
        current: t.activities, previous: b.previous.activities },
      { label: 'Gain moyen / acti', value: compactSilver(t.avg_per_activity), title: full(t.avg_per_activity), icon: 'sparkles' },
      { label: 'Joueurs moyens / acti', value: t.avg_players_per_activity.toLocaleString('fr-FR'), title: 'Joueurs payés par fin d’activité', icon: 'users' },
    ];
  }

  /** 7 plus grosses BAL dues + « Autres » (reste de la BAL due totale). */
  topPlayers(b: BalStats): DonutSlice[] {
    return donutSlices(b.top_players.map((p) => ({ label: p.name, value: p.amount })), b.totals.due);
  }

  earners(b: BalStats): HBarRow[] {
    return b.top_earners.map((p) => ({ label: p.name, value: p.amount }));
  }

  callers(b: BalStats): HBarRow[] {
    return b.top_callers.map((c) => ({
      label: c.name, value: c.silver, sub: `${c.activities} activité${c.activities > 1 ? 's' : ''}`,
    }));
  }

  byTemplate(b: BalStats): HBarRow[] {
    return b.by_template.map((t) => ({
      label: t.template, value: t.silver, sub: `${t.activities} activité${t.activities > 1 ? 's' : ''}`,
    }));
  }

  async ngOnInit(): Promise<void> {
    void this.loadBal();
    try {
      this.overview.set(await firstValueFrom(this.api.adminOverview(this.guildId())));
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  setPeriod(period: BalPeriod): void {
    if (period === this.period()) return;
    this.period.set(period);
    void this.loadBal();
  }

  /** Garde l'ancien rendu (estompé) pendant le rechargement ; ignore les réponses périmées. */
  async loadBal(): Promise<void> {
    const request = ++this.balRequest;
    this.balLoading.set(true);
    this.balError.set('');
    try {
      const stats = await firstValueFrom(this.api.adminBal(this.guildId(), this.period()));
      if (request === this.balRequest) this.bal.set(stats);
    } catch (err) {
      if (request === this.balRequest) this.balError.set(errorMessage(err));
    } finally {
      if (request === this.balRequest) this.balLoading.set(false);
    }
  }
}
