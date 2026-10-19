import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { ApiService } from '../../core/api.service';
import { I18nService, dict } from '../../core/i18n/i18n';
import { BalPeriod } from '../../core/models';
import { errorText, lastValue } from '../../core/resource';
import { FlowChart, LineChart, compactSilver, fullSilver } from '../../shared/charts';
import { Icon } from '../../shared/icon';
import { PeriodPicker } from '../../shared/period-picker';
import { BalOperations } from './bal-operations';
import { balAction, opWhen } from './bal-actions';

/** « 1er » / « 2e » / « 13e » (« 1st », « 2nd »… en anglais) */
export function ordinal(n: number): string {
  return dict().bal.ordinal(n);
}

/** Page « Ma BAL » : solde, rang dans la guilde, courbe, gains par période et dernières opérations. */
@Component({
  selector: 'app-bal',
  imports: [BalOperations, DecimalPipe, FlowChart, Icon, LineChart, PeriodPicker],
  template: `
    <div class="page-head">
      <div>
        <h1>{{ t().bal.title }}</h1>
        <p class="subtitle">{{ t().bal.subtitle[0] }}<code>/monbal</code>{{ t().bal.subtitle[1] }}</p>
      </div>
      <app-period-picker [value]="period()" (valueChange)="setPeriod($event)" />
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    } @else if (bal(); as b) {
      <div class="top">
        <div class="card hero">
          <span class="muted label"><app-icon name="coins" [size]="16" /> {{ b.ig_name || t().bal.yourBalance }}</span>
          <strong class="amount gradient-text" [title]="(b.amount | number: '1.0-0' : locale()) + ' silver'">{{ b.amount | number: '1.0-0' : locale() }}</strong>
          <span class="muted">silver</span>
          @if (history(); as h) {
            @if (h.rank) {
              <span class="rank"><app-icon name="crown" [size]="15" /> {{ t().bal.rank(ordinal(h.rank)) }}
                <span class="muted">{{ t().bal.of(h.players) }}</span></span>
            }
          }
        </div>

        @if (history(); as h) {
          <div class="tiles" [class.stale]="loading()">
            <div class="card tile">
              <span class="muted"><app-icon name="trend" [size]="14" /> {{ t().bal.earned }}</span>
              <strong class="plus" [title]="full(h.totals.credited) + ' silver'">+{{ compact(h.totals.credited) }}</strong>
            </div>
            <div class="card tile">
              <span class="muted"><app-icon name="coins" [size]="14" /> {{ t().bal.withdrawn }}</span>
              <strong [title]="full(h.totals.withdrawn) + ' silver'">−{{ compact(h.totals.withdrawn) }}</strong>
            </div>
            <div class="card tile">
              <span class="muted"><app-icon name="flag" [size]="14" /> {{ t().bal.paidActivities }}</span>
              <strong>{{ h.totals.activities }}</strong>
            </div>
          </div>
        }
      </div>

      @if (history(); as h) {
        <div class="charts" [class.stale]="loading()">
          <div class="card chart">
            <h3>{{ t().bal.myBalance }}</h3>
            <app-line-chart [data]="h.curve" [label]="t().bal.myBalance" />
          </div>
          <div class="card chart">
            <h3>{{ t().bal.flowTitle }} <span class="muted">{{ t().bal.per(h.bucket) }}</span></h3>
            <app-flow-chart [data]="h.flow" [bucket]="h.bucket" [creditLabel]="t().bal.earned" [withdrawLabel]="t().bal.withdrawn" />
          </div>
          <div class="card chart ops">
            <h3>{{ t().bal.recent }}</h3>
            @if (h.recent.length) {
              <ul class="recent">
                @for (op of h.recent; track $index) {
                  <li>
                    <span class="op-icon" [class.out]="op.delta < 0"><app-icon [name]="action(op.action).icon" [size]="15" /></span>
                    <div class="op-main">
                      <strong>{{ action(op.action).label }}{{ op.template ? ' · ' + op.template : '' }}</strong>
                      <span class="faint">{{ when(op.ts) }}{{ op.by ? t().bal.by(op.by) : '' }}</span>
                    </div>
                    <span class="op-delta num" [class.out]="op.delta < 0">{{ op.delta > 0 ? '+' : '−' }}{{ full(abs(op.delta)) }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted">{{ t().bal.noOpPeriod }}</p>
            }
          </div>
        </div>
      } @else if (!historyError()) {
        <div class="charts"><div class="skeleton"></div><div class="skeleton"></div></div>
      }
      @if (historyError()) {
        <p class="alert">{{ historyError() }}</p>
      }

      <app-bal-operations [guildId]="guildId()" />
    } @else {
      <div class="top"><div class="skeleton hero-sk"></div></div>
    }
  `,
  styles: `
    code { color: var(--lilac); }
    .top { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 16px; margin-bottom: 16px; }
    .hero { display: grid; gap: 2px; align-content: center;
            background: radial-gradient(ellipse at 0% 0%, rgba(167, 123, 243, .28), transparent 65%), var(--surface); }
    .label { display: flex; align-items: center; gap: 6px; }
    .amount { font-size: clamp(2.4rem, 5.5vw, 3.4rem); font-weight: 800; letter-spacing: -.03em; line-height: 1.1; }
    .rank { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: .9rem; }
    .rank app-icon { color: #f5c96b; }
    .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; transition: opacity .15s; }
    .tile { display: grid; gap: 6px; align-content: center; }
    .tile .muted { display: flex; align-items: center; gap: 6px; font-size: .8rem; }
    .tile strong { font-size: 1.5rem; font-weight: 700; }
    .plus { color: var(--success); }
    .charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; transition: opacity .15s; }
    .stale { opacity: .55; }
    .chart { display: grid; gap: 10px; align-content: start; }
    .chart h3 { margin: 0; font-size: 1rem; }
    .chart h3 .muted { font-weight: 400; font-size: .85rem; }
    .ops { grid-column: 1 / -1; }
    .recent { list-style: none; margin: 0; padding: 0; display: grid; }
    .recent li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px;
                 padding: 10px 4px; border-top: 1px solid var(--border-soft); }
    .recent li:first-child { border-top: 0; }
    .op-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px;
               background: var(--success-soft); color: var(--success); }
    .op-icon.out { background: var(--surface-3); color: var(--text-muted); }
    .op-main { display: grid; min-width: 0; }
    .op-main strong { font-size: .9rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .op-main span { font-size: .78rem; }
    .op-delta { font-weight: 700; color: var(--success); }
    .op-delta.out { color: var(--text); }
    .skeleton { min-height: 240px; }
    .hero-sk { min-height: 180px; }
    @media (max-width: 900px) {
      .top, .charts { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 480px) {
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class BalPage {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly locale = this.i18n.locale;
  readonly guildId = input.required<string>();

  private readonly balRes = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.myBal(params) });
  protected readonly bal = computed(() => (this.balRes.hasValue() ? this.balRes.value() : null));
  protected readonly error = errorText(this.balRes);

  protected readonly period = signal<BalPeriod>('30d');
  private readonly historyRes = rxResource({
    params: () => ({ guildId: this.guildId(), period: this.period() }),
    stream: ({ params }) => this.api.myBalHistory(params.guildId, params.period),
  });
  /** Garde l'ancien rendu (estompé) pendant le rechargement d'une autre période. */
  protected readonly history = lastValue(this.historyRes);
  protected readonly loading = this.historyRes.isLoading;
  protected readonly historyError = errorText(this.historyRes);

  protected readonly compact = compactSilver;
  protected readonly full = fullSilver;
  protected readonly abs = Math.abs;
  protected readonly ordinal = ordinal;
  protected readonly action = balAction;
  protected readonly when = opWhen;

  setPeriod(period: BalPeriod): void {
    this.period.set(period);
  }
}
