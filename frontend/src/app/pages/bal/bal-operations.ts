import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n/i18n';
import { BalAction } from '../../core/models';
import { errorText, lastValue } from '../../core/resource';
import { fullSilver } from '../../shared/charts';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';
import { BAL_ACTIONS, balAction, opWhen } from './bal-actions';

/** Historique complet d'un joueur : toutes les opérations (6 mois gardés par le bot),
 *  filtrables par type, paginées, exportables en CSV. Sans `userId` : le joueur connecté
 *  (« Ma BAL ») ; avec `userId` : un joueur choisi par un admin (Admin → BAL par joueur). */
@Component({
  selector: 'app-bal-operations',
  imports: [Icon, Pager],
  template: `
    <section class="card history" aria-labelledby="ops-title">
      <div class="head">
        <h3 id="ops-title">{{ title() || t().bal.fullHistory }}</h3>
        <div class="tools">
          <label class="sr-only" for="ops-filter">{{ t().bal.opType }}</label>
          <select id="ops-filter" class="select" [value]="action() ?? ''" (change)="setAction($any($event.target).value)">
            <option value="">{{ t().bal.allOps }}</option>
            @for (a of actions; track a) {
              <option [value]="a">{{ label(a).label }}</option>
            }
          </select>
          <a class="btn btn-sm" [href]="csvUrl()" download>{{ t().bal.exportCsv }}</a>
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
                  <span class="faint">{{ when(op.ts) }}{{ op.by ? t().bal.by(op.by) : '' }}</span>
                </div>
                <div class="op-side">
                  <span class="op-delta num" [class.out]="op.delta < 0">{{ op.delta > 0 ? '+' : '−' }}{{ full(abs(op.delta)) }}</span>
                  @if (op.total !== null) {
                    <span class="faint num">{{ t().bal.balanceAfter(full(op.total)) }}</span>
                  }
                </div>
              </li>
            }
          </ul>
          <app-pager [page]="d.page" [pageSize]="d.page_size" [total]="d.total" [label]="t().bal.opsLabel" (pageChange)="go($event)" />
        } @else {
          <p class="muted">{{ t().bal.noOp(!!action()) }}</p>
        }
      } @else {
        <div class="skeleton"></div>
      }
    </section>
  `,
  styles: `
    .history { display: grid; gap: 10px; margin-top: 16px; }
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
export class BalOperations {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();
  /** Joueur dont on affiche l'historique (page Admin) ; null = le joueur connecté. */
  readonly userId = input<string | null>(null);
  protected readonly t = inject(I18nService).t;
  /** Titre de la section ; vide = « Historique complet ». */
  readonly title = input('');

  protected readonly action = signal<BalAction | null>(null);
  /** Revient à la page 1 quand le joueur ou le filtre change. */
  protected readonly page = linkedSignal({ source: () => [this.userId(), this.action()], computation: () => 1 });
  private readonly ops = rxResource({
    params: () => ({ guildId: this.guildId(), uid: this.userId(), page: this.page(), action: this.action() }),
    stream: ({ params: { guildId, uid, page, action } }) => (uid
      ? this.api.playerBalOperations(guildId, uid, page, action)
      : this.api.myBalOperations(guildId, page, action)),
  });
  /** Garde l'ancienne page (estompée) pendant le chargement de la suivante. */
  protected readonly data = lastValue(this.ops);
  protected readonly loading = this.ops.isLoading;
  protected readonly error = errorText(this.ops);
  protected readonly csvUrl = computed(() => {
    const uid = this.userId();
    return uid ? this.api.playerBalCsvUrl(this.guildId(), uid, this.action()) : this.api.myBalCsvUrl(this.guildId(), this.action());
  });
  protected readonly actions = Object.keys(BAL_ACTIONS);
  protected readonly label = balAction;
  protected readonly when = opWhen;
  protected readonly full = fullSilver;
  protected readonly abs = Math.abs;

  setAction(value: string): void {
    this.action.set((value || null) as BalAction | null);
  }

  go(page: number): void {
    this.page.set(page);
  }
}
