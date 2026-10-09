import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { ActivityStats, BalPeriod } from '../../core/models';
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
          <h2 id="activity-title">Activité de la guilde</h2>
          @if (data(); as d) {
            <p class="muted range"><app-icon name="calendar" [size]="14" /> Du {{ long(d.start) }} à aujourd'hui</p>
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
            <p>Aucune activité terminée sur la période. L'historique se remplit à chaque fin d'acti (<code>/finacti</code>, fin, annulation) depuis la mise à jour du bot.</p>
          </div>
        } @else {
          <div class="grid" [class.stale]="loading()">
            <div class="tiles">
              <div class="card tile"><span class="muted"><app-icon name="flag" [size]="14" /> Actis jouées</span><strong>{{ d.totals.activities }}</strong></div>
              <div class="card tile"><span class="muted"><app-icon name="close" [size]="14" /> Annulées</span><strong>{{ d.totals.cancelled }}</strong></div>
              <div class="card tile"><span class="muted"><app-icon name="users" [size]="14" /> Joueurs différents</span><strong>{{ d.totals.players }}</strong></div>
              <div class="card tile"><span class="muted"><app-icon name="users" [size]="14" /> Joueurs / acti</span><strong>{{ fr(d.totals.avg_players) }}</strong></div>
              <div class="card tile" title="Places prises ÷ places prévues par les compos (actis jouées)">
                <span class="muted"><app-icon name="chart" [size]="14" /> Remplissage</span>
                <strong>{{ d.totals.fill_rate === null ? '—' : d.totals.fill_rate + ' %' }}</strong>
              </div>
            </div>

            <div class="card chart wide">
              <h3>Actis jouées <span class="muted">— par {{ d.bucket === 'week' ? 'semaine' : 'jour' }}</span></h3>
              <app-line-chart [data]="timeline()" label="Actis jouées" />
            </div>
            <div class="card chart">
              <h3><app-icon name="alert" [size]="16" /> Rôles qui manquent le plus <span class="muted">— places vides</span></h3>
              <app-hbar-chart [rows]="rows(d.missing_roles)" unit="places vides" empty="Toutes les compos ont été remplies." />
            </div>
            <div class="card chart">
              <h3><app-icon name="crown" [size]="16" /> Joueurs les plus présents</h3>
              <app-hbar-chart [rows]="rows(d.top_players)" unit="actis" />
            </div>
            <div class="card chart">
              <h3><app-icon name="flag" [size]="16" /> Callers <span class="muted">— actis lancées</span></h3>
              <app-hbar-chart [rows]="rows(d.top_callers)" unit="actis" />
            </div>
            <div class="card chart">
              <h3><app-icon name="shield" [size]="16" /> Compos les plus jouées</h3>
              <app-hbar-chart [rows]="rows(d.top_templates)" unit="actis" />
            </div>
            <div class="card chart wide">
              <h3>Quand la guilde joue <span class="muted">— fins d'activité par jour et heure</span></h3>
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
    .activity { margin-top: 32px; }
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
export class ActivityStatsPanel implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly data = signal<ActivityStats | null>(null);
  protected readonly period = signal<BalPeriod>('30d');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly long = longDate;
  /** Actis jouées (finacti + fin) par jour ou par semaine. */
  protected readonly timeline = computed((): LinePoint[] =>
    (this.data()?.timeline ?? []).map((t) => ({ date: t.start, total: t.finacti + t.fin })));
  private request = 0;

  ngOnInit(): void {
    void this.load();
  }

  setPeriod(period: BalPeriod): void {
    if (period === this.period()) return;
    this.period.set(period);
    void this.load();
  }

  rows(list: { name: string; count: number }[]): HBarRow[] {
    return list.map((r) => ({ label: r.name, value: r.count }));
  }

  fr(n: number): string {
    return n.toLocaleString('fr-FR');
  }

  async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await firstValueFrom(this.api.adminActivity(this.guildId(), this.period()));
      if (request === this.request) this.data.set(d);
    } catch (err) {
      if (request === this.request) this.error.set(errorMessage(err));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
