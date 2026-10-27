import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { ApiService } from '../../core/api.service';
import { I18nService, locale } from '../../core/i18n/i18n';
import { BalPeriod } from '../../core/models';
import { errorText, lastValue } from '../../core/resource';
import { HBarChart, HBarRow, Heatmap, LineChart, LinePoint, longDate } from '../../shared/charts';
import { Icon } from '../../shared/icon';
import { PeriodPicker } from '../../shared/period-picker';

/** Page Admin → Activité : actis jouées, remplissage, rôles qui manquent, joueurs / callers / compos
 *  les plus présents, jour × heure. Lit l'historique activity_log écrit par le bot. */
@Component({
  selector: 'app-activity-stats',
  imports: [HBarChart, Heatmap, Icon, LineChart, PeriodPicker],
  template: `
    <section class="activity" aria-labelledby="activity-title">
      <div class="section-head">
        <div>
          <h2 id="activity-title">{{ t().admin.activityTitle }}</h2>
          @if (data(); as d) {
            <p class="muted range"><app-icon name="calendar" [size]="14" /> {{ t().admin.since(long(d.start)) }}</p>
          }
        </div>
        <app-period-picker [value]="period()" (valueChange)="setPeriod($event)" />
      </div>

      @if (error()) {
        <p class="alert">{{ error() }}</p>
      } @else if (data(); as d) {
        @if (!d.totals.activities && !d.totals.cancelled) {
          <div class="card empty">
            <app-icon name="flag" [size]="24" />
            <p>{{ t().admin.noActivity[0] }}<code>/finacti</code>{{ t().admin.noActivity[1] }}</p>
          </div>
        } @else {
          <div class="grid" [class.stale]="loading()">
            <div class="tiles">
              <div class="card tile"><span class="muted"><app-icon name="flag" [size]="14" /> {{ t().admin.played }}</span><strong>{{ d.totals.activities }}</strong></div>
              <div class="card tile"><span class="muted"><app-icon name="close" [size]="14" /> {{ t().admin.cancelled }}</span><strong>{{ d.totals.cancelled }}</strong></div>
              <div class="card tile"><span class="muted"><app-icon name="users" [size]="14" /> {{ t().admin.distinctPlayers }}</span><strong>{{ d.totals.players }}</strong></div>
              <div class="card tile"><span class="muted"><app-icon name="users" [size]="14" /> {{ t().admin.playersPerActi }}</span><strong>{{ num(d.totals.avg_players) }}</strong></div>
              <div class="card tile" [title]="t().admin.fillTitle">
                <span class="muted"><app-icon name="chart" [size]="14" /> {{ t().admin.fill }}</span>
                <strong>{{ d.totals.fill_rate === null ? '—' : d.totals.fill_rate + ' %' }}</strong>
              </div>
            </div>

            <div class="card chart wide">
              <h3>{{ t().admin.played }} <span class="muted">{{ t().bal.per(d.bucket) }}</span></h3>
              <app-line-chart [data]="timeline()" [label]="t().admin.played" />
            </div>
            <div class="card chart">
              <h3><app-icon name="alert" [size]="16" /> {{ t().admin.missingRoles }} <span class="muted">{{ t().admin.missingHint }}</span></h3>
              <app-hbar-chart [rows]="bars().missing_roles" [unit]="t().admin.emptySlots" [empty]="t().admin.allFilled" />
            </div>
            <div class="card chart">
              <h3><app-icon name="crown" [size]="16" /> {{ t().admin.mostPresent }}</h3>
              <app-hbar-chart [rows]="bars().top_players" [unit]="t().admin.actis" />
            </div>
            <div class="card chart">
              <h3><app-icon name="flag" [size]="16" /> {{ t().admin.callers }} <span class="muted">{{ t().admin.callersHint }}</span></h3>
              <app-hbar-chart [rows]="bars().top_callers" [unit]="t().admin.actis" />
            </div>
            <div class="card chart">
              <h3><app-icon name="shield" [size]="16" /> {{ t().admin.mostPlayed }}</h3>
              <app-hbar-chart [rows]="bars().top_templates" [unit]="t().admin.actis" />
            </div>
            <div class="card chart wide">
              <h3>{{ t().admin.whenTitle }} <span class="muted">{{ t().admin.whenHint }}</span></h3>
              <app-heatmap [data]="d.heatmap" />
            </div>
          </div>
        }
      } @else {
        <div class="skeleton"></div>
      }
    </section>
  `,
  styles: `
    .activity { margin-top: 0; }
    .section-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .section-head h2 { margin: 0; }
    .range { margin: 4px 0 0; display: flex; align-items: center; gap: 6px; font-size: .85rem; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; transition: opacity .15s; }
    .stale { opacity: .55; }
    .tiles { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .tile { display: grid; gap: 6px; }
    .tile .muted { display: flex; align-items: center; gap: 6px; font-size: .8rem; }
    .tile strong { font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .chart { display: grid; gap: 10px; align-content: start; }
    .chart h3 { margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .chart h3 .muted { font-weight: 400; font-size: .85rem; }
    .chart h3 app-icon { color: var(--lilac); }
    .wide { grid-column: 1 / -1; }
    .empty { display: grid; justify-items: center; gap: 8px; padding: 32px; text-align: center; color: var(--text-muted); }
    .empty p { margin: 0; max-width: 520px; }
    code { color: var(--lilac); }
    .skeleton { min-height: 260px; }
    @media (max-width: 860px) {
      .grid { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class ActivityStatsPanel {
  private readonly api = inject(ApiService);
  protected readonly t = inject(I18nService).t;
  readonly guildId = input.required<string>();

  protected readonly period = signal<BalPeriod>('30d');
  private readonly stats = rxResource({
    params: () => ({ guildId: this.guildId(), period: this.period() }),
    stream: ({ params }) => this.api.adminActivity(params.guildId, params.period),
  });
  /** Garde l'ancien rendu (estompé) pendant le rechargement d'une autre période. */
  protected readonly data = lastValue(this.stats);
  protected readonly loading = this.stats.isLoading;
  protected readonly error = errorText(this.stats);
  protected readonly long = longDate;
  /** Actis jouées (finacti + fin) par jour ou par semaine. */
  protected readonly timeline = computed((): LinePoint[] =>
    (this.data()?.timeline ?? []).map((t) => ({ date: t.start, total: t.finacti + t.fin })));
  /** Barres des classements, recalculées seulement quand les stats changent. */
  protected readonly bars = computed(() => {
    const d = this.data();
    const rows = (list: { name: string; count: number }[] = []): HBarRow[] => list.map((r) => ({ label: r.name, value: r.count }));
    return {
      missing_roles: rows(d?.missing_roles),
      top_players: rows(d?.top_players),
      top_callers: rows(d?.top_callers),
      top_templates: rows(d?.top_templates),
    };
  });

  setPeriod(period: BalPeriod): void {
    this.period.set(period);
  }

  num(n: number): string {
    return n.toLocaleString(locale());
  }
}
