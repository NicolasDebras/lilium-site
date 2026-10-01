import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AdminOverview, BalStats } from '../../core/models';
import { FlowChart, HBarChart, HBarRow, LineChart, compactSilver, longDate } from '../../shared/charts';

export const PERIODS = [
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
  { days: 180, label: '6 mois' },
] as const;

/** Page réservée aux admins du site (nommés via /webadmin sur Discord) :
 *  chiffres clés + tableau de bord de la BAL. */
@Component({
  selector: 'app-admin',
  imports: [DecimalPipe, FlowChart, LineChart, HBarChart],
  template: `
    <div class="page-head">
      <h1>Admin <span class="badge">ADMIN</span></h1>
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (overview(); as o) {
      <div class="grid stats">
        @for (s of stats(o); track s.label) {
          <div class="card stat">
            <strong class="value">{{ s.value | number: '1.0-0' : 'fr-FR' }}</strong>
            <span class="muted">{{ s.label }}</span>
          </div>
        }
      </div>
    }

    @if (!error()) {
    <section class="bal" aria-labelledby="bal-title">
      <div class="section-head">
        <h2 id="bal-title">BAL</h2>
        <div class="periods" role="group" aria-label="Période">
          @for (p of periods; track p.days) {
            <button type="button" class="btn btn-sm" [class.on]="days() === p.days"
                    [attr.aria-pressed]="days() === p.days" (click)="setDays(p.days)">{{ p.label }}</button>
          }
        </div>
      </div>

      @if (balError()) {
        <p class="alert">{{ balError() }}</p>
      }

      @if (bal(); as b) {
        <div class="dashboard" [class.stale]="balLoading()">
          <div class="card hero">
            <span class="muted">BAL due aux joueurs</span>
            <strong class="hero-value" [title]="(b.totals.due | number: '1.0-0' : 'fr-FR') + ' silver'">{{ compact(b.totals.due) }}</strong>
            <span class="muted">silver · {{ b.totals.players }} joueur{{ b.totals.players > 1 ? 's' : '' }} avec de la BAL</span>
          </div>
          <div class="tiles">
            @for (t of tiles(b); track t.label) {
              <div class="card tile">
                <span class="muted">{{ t.label }}</span>
                <strong [title]="t.title">{{ t.value }}</strong>
              </div>
            }
          </div>

          <div class="card chart wide">
            <h3>Silver crédité et payé <span class="muted">— par {{ b.bucket === 'week' ? 'semaine' : 'jour' }}</span></h3>
            <app-flow-chart [data]="b.flow" [bucket]="b.bucket" />
            <details>
              <summary>Voir les données</summary>
              <table>
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
              <table>
                <thead><tr><th>Jour</th><th>BAL due (fin de journée)</th></tr></thead>
                <tbody>
                  @for (d of b.due; track d.date) {
                    <tr><td>{{ long(d.date) }}</td><td>{{ d.total | number: '1.0-0' : 'fr-FR' }}</td></tr>
                  }
                </tbody>
              </table>
            </details>
          </div>

          <div class="card chart">
            <h3>Plus grosses BAL dues</h3>
            <app-hbar-chart [rows]="topPlayers(b)" empty="Aucun joueur n'a de BAL." />
          </div>

          <div class="card chart">
            <h3>Silver gagné par compo <span class="muted">— fins d'activité</span></h3>
            <app-hbar-chart [rows]="byTemplate(b)" />
          </div>
        </div>
      } @else if (!balError()) {
        <p class="muted">Chargement…</p>
      }
    </section>
    }
  `,
  styles: `
    h1 { display: flex; align-items: center; gap: 10px; }
    .stats { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .stat { display: grid; gap: 4px; }
    .value { font-size: 1.6rem; color: var(--text); font-weight: 600; }

    .bal { margin-top: 32px; }
    .section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .section-head h2 { margin: 0; }
    .periods { display: inline-flex; gap: 4px; padding: 3px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
    .periods .btn { border-color: transparent; background: transparent; color: var(--text-muted); }
    .periods .btn.on { background: var(--lilac-soft); color: var(--lilac); }

    .dashboard { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); transition: opacity .15s; }
    .dashboard.stale { opacity: .55; }
    .hero { display: grid; gap: 2px; align-content: center;
            background: radial-gradient(ellipse at 0% 0%, var(--lilac-soft), transparent 70%), var(--surface); }
    .hero-value { font-size: 3.2rem; line-height: 1.1; font-weight: 700; color: var(--lilac); }
    .tiles { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tile { display: grid; gap: 2px; align-content: center; }
    .tile strong { font-size: 1.35rem; font-weight: 600; }
    .chart { display: grid; gap: 8px; align-content: start; }
    .chart h3 { margin: 0 0 4px; font-size: 1rem; }
    .chart h3 .muted { font-weight: 400; font-size: .85rem; }
    .wide { grid-column: 1 / -1; }
    .note { margin: 0; font-size: .78rem; }

    details { font-size: .85rem; }
    summary { cursor: pointer; color: var(--text-muted); width: max-content; }
    summary:hover { color: var(--lilac); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-variant-numeric: tabular-nums; }
    th, td { text-align: right; padding: 4px 8px; border-bottom: 1px solid var(--border); }
    th:first-child, td:first-child { text-align: left; }
    th { color: var(--text-muted); font-weight: 500; }
    details[open] { max-height: 320px; overflow: auto; }

    @media (max-width: 760px) {
      .dashboard { grid-template-columns: minmax(0, 1fr); }
      .hero-value { font-size: 2.6rem; }
    }
  `,
})
export class AdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly periods = PERIODS;
  protected readonly overview = signal<AdminOverview | null>(null);
  protected readonly error = signal('');
  protected readonly days = signal(30);
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

  stats(o: AdminOverview): { label: string; value: number }[] {
    return [
      { label: 'Profils enregistrés (/register)', value: o.profiles },
      { label: 'Builds', value: o.builds },
      { label: 'Compos de guilde', value: o.compos },
    ];
  }

  tiles(b: BalStats): { label: string; value: string; title: string }[] {
    const full = (n: number) => `${n.toLocaleString('fr-FR')} silver`;
    return [
      { label: 'Crédité sur la période', value: compactSilver(b.totals.credited), title: full(b.totals.credited) },
      { label: 'Payé (retiré)', value: compactSilver(b.totals.withdrawn), title: full(b.totals.withdrawn) },
      { label: 'Solde net', value: this.netLabel(), title: 'Crédité − payé sur la période' },
      { label: "Fins d'activité payées", value: b.totals.activities.toLocaleString('fr-FR'), title: '/finacti et /paybal' },
    ];
  }

  topPlayers(b: BalStats): HBarRow[] {
    return b.top_players.map((p) => ({ label: p.name, value: p.amount }));
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

  setDays(days: number): void {
    if (days === this.days()) return;
    this.days.set(days);
    void this.loadBal();
  }

  /** Garde l'ancien rendu (estompé) pendant le rechargement ; ignore les réponses périmées. */
  async loadBal(): Promise<void> {
    const request = ++this.balRequest;
    this.balLoading.set(true);
    this.balError.set('');
    try {
      const stats = await firstValueFrom(this.api.adminBal(this.guildId(), this.days()));
      if (request === this.balRequest) this.bal.set(stats);
    } catch (err) {
      if (request === this.balRequest) this.balError.set(errorMessage(err));
    } finally {
      if (request === this.balRequest) this.balLoading.set(false);
    }
  }
}
