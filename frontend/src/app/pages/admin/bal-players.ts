import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { BalPeriod, BalPlayer } from '../../core/models';
import { fullSilver } from '../../shared/charts';
import { Icon } from '../../shared/icon';
import { PeriodPicker } from '../../shared/period-picker';
import { BalOperations } from '../bal/bal-operations';

const SEARCH_DELAY_MS = 250;

/** Page Admin → BAL par joueur : recherche, historique complet d'un joueur (réutilise
 *  le composant de « Ma BAL ») et export CSV de toute la BAL de la guilde. */
@Component({
  selector: 'app-bal-players',
  imports: [BalOperations, Icon, PeriodPicker],
  template: `
    <section class="players" aria-labelledby="players-title">
      <div class="section-head">
        <div>
          <h2 id="players-title">BAL par joueur</h2>
          <p class="muted">Cherche un joueur pour voir tout son historique, ou exporte toute la BAL de la guilde.</p>
        </div>
        <div class="export">
          <app-period-picker [value]="period()" (valueChange)="period.set($event)" />
          <a class="btn btn-sm" [href]="guildCsvUrl()" download>Exporter la guilde (CSV)</a>
        </div>
      </div>

      <div class="layout">
        <div class="card list-card">
          <label class="sr-only" for="player-search">Chercher un joueur</label>
          <input id="player-search" class="input" type="search" placeholder="Pseudo ou id Discord…" maxlength="100"
                 [value]="query()" (input)="search($any($event.target).value)" />
          @if (error()) {
            <p class="alert">{{ error() }}</p>
          } @else if (players(); as list) {
            @if (list.length) {
              <ul class="list" [class.stale]="loading()">
                @for (p of list; track p.uid) {
                  <li>
                    <button type="button" class="row" [class.on]="selected()?.uid === p.uid"
                            [attr.aria-pressed]="selected()?.uid === p.uid" (click)="selected.set(p)">
                      <span class="name">{{ p.name }}</span>
                      <span class="num amount" [class.zero]="!p.amount">{{ full(p.amount) }}</span>
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted">Aucun joueur trouvé.</p>
            }
          } @else {
            <div class="skeleton"></div>
          }
        </div>

        <div class="detail">
          @if (selected(); as p) {
            @for (s of [p]; track s.uid) {
              <app-bal-operations [guildId]="guildId()" [userId]="s.uid" [title]="'Historique de ' + s.name" />
            }
          } @else {
            <div class="card empty"><app-icon name="search" [size]="22" /><p class="muted">Choisis un joueur dans la liste.</p></div>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .players { margin-top: 32px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .section-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .section-head h2 { margin: 0; }
    .section-head p { margin: 4px 0 0; }
    .export { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .layout { display: grid; grid-template-columns: minmax(220px, 4fr) minmax(0, 8fr); gap: 16px; align-items: start; }
    .list-card { display: grid; gap: 10px; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; max-height: 520px; overflow: auto; transition: opacity .15s; }
    .row { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; justify-content: space-between;
           gap: 10px; padding: 8px 8px; border-radius: var(--radius-sm); font-size: .9rem; }
    .row:hover { background: rgba(255, 255, 255, 0.04); }
    .row.on { background: var(--lilac-soft); color: var(--lilac); }
    .row:focus-visible { outline: 2px solid var(--lilac-strong); }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .amount { font-weight: 600; font-variant-numeric: tabular-nums; }
    .amount.zero { color: var(--text-faint); font-weight: 400; }
    .stale { opacity: .55; }
    .detail ::ng-deep .history { margin-top: 0; }
    .empty { display: grid; justify-items: center; gap: 6px; padding: 40px 16px; color: var(--text-muted); }
    .empty p { margin: 0; }
    .skeleton { min-height: 200px; }
    @media (max-width: 800px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class BalPlayers implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly query = signal('');
  protected readonly players = signal<BalPlayer[] | null>(null);
  protected readonly selected = signal<BalPlayer | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly period = signal<BalPeriod>('30d');
  protected readonly guildCsvUrl = computed(() => this.api.guildBalCsvUrl(this.guildId(), this.period()));
  protected readonly full = fullSilver;
  private request = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    void this.load();
  }

  /** Recherche à la frappe, avec un court délai pour ne pas interroger l'API à chaque lettre. */
  search(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), SEARCH_DELAY_MS);
  }

  async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const list = await firstValueFrom(this.api.balPlayers(this.guildId(), this.query().trim()));
      if (request === this.request) this.players.set(list);
    } catch (err) {
      if (request === this.request) this.error.set(errorMessage(err));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
