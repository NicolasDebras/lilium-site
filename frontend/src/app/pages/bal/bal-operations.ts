import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { BalAction, BalOperationsPage } from '../../core/models';
import { fullSilver } from '../../shared/charts';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';
import { BAL_ACTIONS, balAction, opWhen } from './bal-actions';

/** « Ma BAL » → historique complet : toutes les opérations (6 mois gardés par le bot),
 *  filtrables par type, paginées, exportables en CSV. */
@Component({
  selector: 'app-bal-operations',
  imports: [Icon, Pager],
  template: `
    <section class="card history" aria-labelledby="ops-title">
      <div class="head">
        <h3 id="ops-title">Historique complet</h3>
        <div class="tools">
          <label class="sr-only" for="ops-filter">Type d'opération</label>
          <select id="ops-filter" class="select" [value]="action() ?? ''" (change)="setAction($any($event.target).value)">
            <option value="">Toutes les opérations</option>
            @for (a of actions; track a.key) {
              <option [value]="a.key">{{ a.label }}</option>
            }
          </select>
          <a class="btn btn-sm" [href]="csvUrl()" download="ma-bal.csv">Exporter en CSV</a>
        </div>
      </div>

      @if (error()) {
        <p class="alert">{{ error() }}</p>
      } @else if (data(); as d) {
        @if (d.items.length) {
          <ul class="ops" [class.stale]="loading()">
            @for (op of d.items; track $index) {
              <li>
                <span class="op-icon" [class.out]="op.delta < 0"><app-icon [name]="label(op.action).icon" [size]="15" /></span>
                <div class="op-main">
                  <strong>{{ label(op.action).label }}{{ op.template ? ' · ' + op.template : '' }}</strong>
                  <span class="faint">{{ when(op.ts) }}{{ op.by ? ' · par ' + op.by : '' }}</span>
                </div>
                <div class="op-side">
                  <span class="op-delta num" [class.out]="op.delta < 0">{{ op.delta > 0 ? '+' : '−' }}{{ full(abs(op.delta)) }}</span>
                  @if (op.total !== null) {
                    <span class="faint num">solde {{ full(op.total) }}</span>
                  }
                </div>
              </li>
            }
          </ul>
          <app-pager [page]="d.page" [pageSize]="d.page_size" [total]="d.total" label="opérations" (pageChange)="go($event)" />
        } @else {
          <p class="muted">Aucune opération{{ action() ? ' de ce type' : '' }}.</p>
        }
      } @else {
        <div class="skeleton"></div>
      }
    </section>
  `,
  styles: `
    .history { display: grid; gap: 10px; margin-top: 16px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    .head h3 { margin: 0; font-size: 1rem; }
    .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .tools .select { width: auto; }
    .ops { list-style: none; margin: 0; padding: 0; display: grid; transition: opacity .15s; }
    .ops li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px;
              padding: 10px 4px; border-top: 1px solid var(--border-soft); }
    .ops li:first-child { border-top: 0; }
    .op-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px;
               background: var(--success-soft); color: var(--success); }
    .op-icon.out { background: var(--surface-3); color: var(--text-muted); }
    .op-main { display: grid; min-width: 0; }
    .op-main strong { font-size: .9rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .op-main span, .op-side span.faint { font-size: .78rem; }
    .op-side { display: grid; justify-items: end; }
    .op-delta { font-weight: 700; color: var(--success); }
    .op-delta.out { color: var(--text); }
    .stale { opacity: .55; }
    .skeleton { min-height: 160px; }
  `,
})
export class BalOperations implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly data = signal<BalOperationsPage | null>(null);
  protected readonly action = signal<BalAction | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly csvUrl = computed(() => this.api.myBalCsvUrl(this.guildId(), this.action()));
  protected readonly actions = Object.entries(BAL_ACTIONS).map(([key, a]) => ({ key, label: a.label }));
  protected readonly label = balAction;
  protected readonly when = opWhen;
  protected readonly full = fullSilver;
  protected readonly abs = Math.abs;
  private request = 0;

  ngOnInit(): void {
    void this.load(1);
  }

  setAction(value: string): void {
    this.action.set((value || null) as BalAction | null);
    void this.load(1);
  }

  go(page: number): void {
    void this.load(page);
  }

  /** Garde l'ancienne page (estompée) pendant le chargement ; ignore les réponses périmées. */
  async load(page: number): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await firstValueFrom(this.api.myBalOperations(this.guildId(), page, this.action()));
      if (request === this.request) this.data.set(d);
    } catch (err) {
      if (request === this.request) this.error.set(errorMessage(err));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
