import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { debouncedSignal } from '../../core/debounce';
import { I18nService } from '../../core/i18n/i18n';
import { Payout, PayoutAdjustBody, PayoutGlobalMode } from '../../core/models';
import { errorText, lastValue } from '../../core/resource';
import { ToastService } from '../../core/toast.service';
import { fullSilver } from '../../shared/charts';
import { Icon } from '../../shared/icon';
import { opWhen } from '../bal/bal-actions';

export interface PayoutGlobal {
  mode: PayoutGlobalMode;
  amount: number;
}

/** Montant tapé (« 1 500 000 », « 1500000 ») → entier ≥ 0, ou null si illisible. */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/[\s  .,_]/g, '');
  return /^\d{1,12}$/.test(digits) ? Number(digits) : null;
}

/** `total` réparti au prorata de `current` (plus forts restes, somme exacte) — même calcul que l'API. */
function prorata(current: Record<string, number>, total: number): Record<string, number> {
  const uids = Object.keys(current);
  let weights = uids.map((u) => Math.max(0, current[u]));
  if (!weights.some(Boolean)) weights = uids.map(() => 1);
  const base = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / base);
  const shares = raw.map(Math.floor);
  const order = uids.map((_, i) => i).sort((a, b) => raw[b] - shares[b] - (raw[a] - shares[a]) || a - b);
  for (const i of order.slice(0, total - shares.reduce((a, b) => a + b, 0))) shares[i] += 1;
  return Object.fromEntries(uids.map((u, i) => [u, shares[i]]));
}

/** Nouveaux montants (aperçu) : changement global d'abord (joueurs payés), puis les montants
 *  modifiés à la main l'emportent — comme `plan_adjustment` côté API. */
export function planAdjustment(current: Record<string, number>, edits: Record<string, number>,
                               global: PayoutGlobal | null): Record<string, number> {
  const next = { ...current };
  if (global) {
    const paid = Object.fromEntries(Object.entries(current).filter(([, a]) => a > 0));
    if (Object.keys(paid).length) {
      Object.assign(next, global.mode === 'total'
        ? prorata(paid, global.amount)
        : Object.fromEntries(Object.keys(paid).map((u) => [u, global.amount])));
    }
  }
  return { ...next, ...edits };
}

/** Corps envoyé à l'API : seuls les montants édités + le changement global éventuel. */
export function adjustBody(edits: Record<string, number>, global: PayoutGlobal | null): PayoutAdjustBody {
  return { changes: Object.entries(edits).map(([uid, amount]) => ({ uid, amount })), global_change: global };
}

/** Admin → payouts de la semaine : corriger un payout (ajouter / retirer un joueur, montant par joueur
 *  ou global) ; l'API met la BAL à jour et envoie un MP à chaque joueur concerné. */
@Component({
  selector: 'app-payouts-editor',
  imports: [Icon],
  template: `
    <section class="payouts" aria-labelledby="payouts-title">
      <div class="section-head">
        <div>
          <h2 id="payouts-title">{{ t().payouts.title }}</h2>
          <p class="muted">{{ t().payouts.subtitle }}</p>
        </div>
        <div class="weeks" role="group">
          <button type="button" class="chip" [class.on]="week() === 0" (click)="setWeek(0)">{{ t().payouts.thisWeek }}</button>
          <button type="button" class="chip" [class.on]="week() === -1" (click)="setWeek(-1)">{{ t().payouts.lastWeek }}</button>
        </div>
      </div>

      @if (error()) {
        <p class="alert">{{ error() }}</p>
      } @else if (payouts(); as list) {
        @if (list.length) {
          <div class="list" [class.stale]="loading()">
            @for (p of list; track p.id) {
              <article class="card payout" [class.open]="selectedId() === p.id">
                <button type="button" class="head" [attr.aria-expanded]="selectedId() === p.id" (click)="toggle(p)">
                  <span class="what">
                    <strong>{{ p.template || t().payouts.noTemplate }}</strong>
                    <small class="muted">{{ when(p.ts) }} · {{ t().payouts.by(p.by_user) }} · {{ t().payouts.players(p.players.length) }}</small>
                  </span>
                  @if (p.adjusted) {
                    <span class="badge badge-outline">{{ t().payouts.adjusted }}</span>
                  }
                  <span class="num total">{{ full(p.total) }}</span>
                  <app-icon name="chevron" [size]="14" class="chev" />
                </button>

                @if (selectedId() === p.id) {
                  <div class="editor">
                    <table>
                      <thead><tr><th>{{ t().payouts.player }}</th><th class="num">{{ t().payouts.amount }}</th><th></th></tr></thead>
                      <tbody>
                        @for (row of rows(); track row.uid) {
                          <tr [class.removed]="row.after === 0">
                            <td>
                              {{ row.name }}
                              @if (row.after === 0) { <small class="muted">· {{ t().payouts.removed }}</small> }
                            </td>
                            <td class="num">
                              <input class="input amount" inputmode="numeric" [attr.aria-label]="t().payouts.amount + ' — ' + row.name"
                                     [value]="full(row.after)" (change)="setAmount(row.uid, row.name, $any($event.target).value)" />
                              @if (row.after !== row.before) {
                                <small class="diff" [class.down]="row.after < row.before">{{ signed(row.after - row.before) }}</small>
                              }
                            </td>
                            <td>
                              @if (row.after > 0) {
                                <button type="button" class="btn btn-sm btn-ghost" [attr.aria-label]="t().payouts.remove(row.name)"
                                        (click)="setAmountValue(row.uid, row.name, 0)"><app-icon name="trash" [size]="14" /></button>
                              } @else {
                                <button type="button" class="btn btn-sm btn-ghost" (click)="restore(row.uid)">{{ t().payouts.restore }}</button>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>

                    <div class="add">
                      <h3>{{ t().payouts.addPlayer }}</h3>
                      <div class="add-row">
                        <input class="input" type="search" maxlength="100" [placeholder]="t().payouts.addPlaceholder"
                               [value]="addQuery()" (input)="addQuery.set($any($event.target).value)" />
                        <input class="input amount" inputmode="numeric" [placeholder]="t().payouts.addAmount"
                               [value]="addAmount()" (input)="addAmount.set($any($event.target).value)" />
                      </div>
                      @if (suggestions().length) {
                        <div class="suggestions">
                          @for (s of suggestions(); track s.uid) {
                            <button type="button" class="chip" [disabled]="parse(addAmount()) === null" (click)="addPlayer(s.uid, s.name)">
                              <app-icon name="plus" [size]="12" /> {{ s.name }}
                            </button>
                          }
                        </div>
                      }
                    </div>

                    <div class="global">
                      <h3>{{ t().payouts.global }}</h3>
                      <div class="add-row">
                        <select class="select" [value]="globalMode()" (change)="globalMode.set($any($event.target).value)">
                          <option value="">{{ t().payouts.globalNone }}</option>
                          <option value="total">{{ t().payouts.globalTotal }}</option>
                          <option value="per_player">{{ t().payouts.globalPerPlayer }}</option>
                        </select>
                        @if (globalMode()) {
                          <input class="input amount" inputmode="numeric" [attr.aria-label]="t().payouts.amount"
                                 [value]="globalAmount()" (input)="globalAmount.set($any($event.target).value)" />
                        }
                      </div>
                      @if (globalMode()) { <p class="faint hint">{{ t().payouts.globalHint }}</p> }
                    </div>

                    <div class="foot">
                      <span class="muted">
                        @if (changes().length) {
                          {{ t().payouts.preview }} : {{ changes().length }} · {{ full(currentTotal()) }} → <strong>{{ full(nextTotal()) }}</strong>
                        } @else {
                          {{ t().payouts.noChange }}
                        }
                      </span>
                      <button type="button" class="btn btn-sm btn-ghost" (click)="reset()">{{ t().payouts.cancel }}</button>
                      <button type="button" class="btn btn-sm btn-primary" [disabled]="!changes().length || busy()" (click)="apply(p)">
                        <app-icon name="check" [size]="14" /> {{ busy() ? t().payouts.applying : t().payouts.apply }}
                      </button>
                    </div>
                  </div>
                }
              </article>
            }
          </div>
        } @else {
          <p class="card muted empty">{{ t().payouts.none }}</p>
        }
      } @else {
        <div class="skeleton"></div>
      }
    </section>
  `,
  styles: `
    .payouts { margin-top: 32px; }
    .section-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .section-head h2 { margin: 0; }
    .section-head p { margin: 4px 0 0; }
    .weeks { display: flex; gap: 6px; }
    .chip { border: 1px solid var(--border); background: transparent; color: var(--text-muted); border-radius: 999px;
            padding: 3px 10px; font: inherit; font-size: .8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
    .chip.on { background: var(--lilac-soft); color: var(--lilac); border-color: var(--lilac-strong); }
    .chip:disabled { opacity: .45; cursor: not-allowed; }
    .list { display: grid; gap: 8px; transition: opacity .15s; }
    .stale { opacity: .55; }
    .payout { padding: 0; overflow: hidden; }
    .head { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 10px;
            padding: 12px 16px; }
    .head:focus-visible { outline: 2px solid var(--lilac-strong); }
    .what { display: grid; gap: 2px; flex: 1 1 auto; min-width: 0; }
    .what strong, .what small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .total { font-weight: 700; font-variant-numeric: tabular-nums; }
    .chev { transition: transform .15s; color: var(--text-muted); }
    .open .chev { transform: rotate(90deg); }
    .editor { display: grid; gap: 16px; padding: 0 16px 16px; border-top: 1px solid var(--border); padding-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: .88rem; }
    th { text-align: left; font-weight: 600; color: var(--text-muted); font-size: .78rem; padding: 4px 6px; }
    td { padding: 4px 6px; border-top: 1px solid var(--border); vertical-align: middle; }
    .num { text-align: right; }
    .amount { width: 140px; text-align: right; font-variant-numeric: tabular-nums; padding-block: 4px; }
    .diff { display: block; font-size: .72rem; color: var(--success, #7bd88f); }
    .diff.down { color: var(--danger, #ff7b7b); }
    tr.removed td { color: var(--text-faint); }
    h3 { margin: 0 0 6px; font-size: .9rem; }
    .add-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .add-row .input[type='search'] { flex: 1 1 200px; }
    .add-row .select { width: auto; }
    .suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .hint { margin: 6px 0 0; font-size: .78rem; }
    .foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
    .foot > span { margin-right: auto; font-size: .85rem; }
    .empty { margin: 0; }
    .skeleton { min-height: 120px; }
    @media (max-width: 600px) {
      .amount { width: 110px; }
    }
  `,
})
export class PayoutsEditor {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  readonly guildId = input.required<string>();

  protected readonly week = signal(0);
  private readonly reload = signal(0);
  private readonly payoutsRes = rxResource({
    params: () => ({ guildId: this.guildId(), week: this.week(), reload: this.reload() }),
    stream: ({ params }) => this.api.payouts(params.guildId, params.week),
  });
  private readonly lastWeek = lastValue(this.payoutsRes);
  protected readonly payouts = computed(() => this.lastWeek()?.payouts ?? null);
  protected readonly loading = this.payoutsRes.isLoading;
  protected readonly error = errorText(this.payoutsRes);

  protected readonly selectedId = signal<number | null>(null);
  /** Montants modifiés à la main : {uid: nouveau montant} (0 = retiré) ; noms des joueurs ajoutés. */
  protected readonly edits = signal<Record<string, number>>({});
  private readonly addedNames = signal<Record<string, string>>({});
  protected readonly globalMode = signal<PayoutGlobalMode | ''>('');
  protected readonly globalAmount = signal('');
  protected readonly addQuery = signal('');
  protected readonly addAmount = signal('');
  protected readonly busy = signal(false);

  private readonly selected = computed(() => this.payouts()?.find((p) => p.id === this.selectedId()) ?? null);
  private readonly current = computed(() =>
    Object.fromEntries((this.selected()?.players ?? []).map((p) => [p.uid, p.amount])) as Record<string, number>);
  private readonly global = computed((): PayoutGlobal | null => {
    const mode = this.globalMode();
    const amount = parseAmount(this.globalAmount());
    return mode && amount !== null ? { mode, amount } : null;
  });
  private readonly next = computed(() => planAdjustment(this.current(), this.edits(), this.global()));

  /** Lignes du tableau : joueurs du payout puis joueurs ajoutés, montant avant / après. */
  protected readonly rows = computed(() => {
    const names: Record<string, string> = { ...this.addedNames() };
    for (const p of this.selected()?.players ?? []) names[p.uid] = p.name;
    const current = this.current();
    return Object.entries(this.next()).map(([uid, after]) => ({ uid, name: names[uid] ?? uid, before: current[uid] ?? 0, after }));
  });
  protected readonly changes = computed(() => this.rows().filter((r) => r.after !== r.before));
  protected readonly currentTotal = computed(() => Object.values(this.current()).reduce((a, b) => a + b, 0));
  protected readonly nextTotal = computed(() => Object.values(this.next()).reduce((a, b) => a + b, 0));

  /** Joueurs à ajouter : recherche dans la BAL du serveur, ou un ID Discord tapé tel quel. */
  private readonly debouncedQuery = debouncedSignal(computed(() => this.addQuery().trim()));
  private readonly searchRes = rxResource({
    params: () => (this.selectedId() !== null && this.debouncedQuery()
      ? { guildId: this.guildId(), q: this.debouncedQuery() } : undefined),
    stream: ({ params }) => this.api.balPlayers(params.guildId, params.q),
  });
  protected readonly suggestions = computed(() => {
    const q = this.addQuery().trim();
    if (!q) return [];
    const taken = new Set(this.rows().filter((r) => r.after > 0).map((r) => r.uid));
    const found = (this.searchRes.hasValue() ? this.searchRes.value() : []).map((p) => ({ uid: p.uid, name: p.name }));
    if (/^\d{15,20}$/.test(q) && !found.some((p) => p.uid === q)) found.unshift({ uid: q, name: q });
    return found.filter((p) => !taken.has(p.uid)).slice(0, 6);
  });

  protected readonly full = fullSilver;
  protected readonly parse = parseAmount;

  protected when(ts: string): string {
    return opWhen(ts);
  }

  protected signed(n: number): string {
    return `${n > 0 ? '+' : '−'}${fullSilver(Math.abs(n))}`;
  }

  setWeek(week: number): void {
    this.week.set(week);
    this.selectedId.set(null);
    this.reset();
  }

  toggle(p: Payout): void {
    this.selectedId.set(this.selectedId() === p.id ? null : p.id);
    this.reset();
  }

  reset(): void {
    this.edits.set({});
    this.addedNames.set({});
    this.globalMode.set('');
    this.globalAmount.set('');
    this.addQuery.set('');
    this.addAmount.set('');
  }

  setAmount(uid: string, name: string, text: string): void {
    const amount = parseAmount(text);
    if (amount !== null) this.setAmountValue(uid, name, amount);
  }

  setAmountValue(uid: string, name: string, amount: number): void {
    this.edits.update((e) => ({ ...e, [uid]: amount }));
    if (!(uid in this.current())) this.addedNames.update((n) => ({ ...n, [uid]: name }));
  }

  restore(uid: string): void {
    this.edits.update(({ [uid]: _, ...rest }) => rest);
  }

  addPlayer(uid: string, name: string): void {
    const amount = parseAmount(this.addAmount());
    if (amount === null) return;
    this.setAmountValue(uid, name, amount);
    this.addQuery.set('');
  }

  async apply(p: Payout): Promise<void> {
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.api.adjustPayout(this.guildId(), p.id, adjustBody(this.edits(), this.global())));
      this.toast.success(this.t().payouts.applied(result.dm_sent));
      if (result.dm_failed.length) this.toast.error(this.t().payouts.dmFailed(result.dm_failed.join(', ')));
      this.reset();
      this.reload.update((n) => n + 1);
    } catch (err) {
      this.toast.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
