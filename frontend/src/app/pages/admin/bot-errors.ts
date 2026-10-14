import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { ApiService } from '../../core/api.service';
import { errorText, lastValue } from '../../core/resource';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';

/** « 2026-10-08T09:12:44+00:00 » → « 08/10/2026 11:12 » (heure locale du navigateur). */
export function errorWhen(ts: string): string {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Page Admin → erreurs du bot sur ce serveur (équivalent web de /errors).
 *  Le traceback (détail technique) n'est chargé qu'au clic, en texte brut. */
@Component({
  selector: 'app-bot-errors',
  imports: [Icon, Pager],
  template: `
    <section class="errors" aria-labelledby="errors-title">
      <div class="section-head">
        <div>
          <h2 id="errors-title">Erreurs du bot</h2>
          <p class="muted">Équivalent de <code>/errors</code> sur Discord — 30 derniers jours.</p>
        </div>
        @if (data(); as d) {
          @if (d.commands.length) {
            <div>
              <label class="sr-only" for="errors-filter">Commande</label>
              <select id="errors-filter" class="select" [value]="command() ?? ''" (change)="setCommand($any($event.target).value)">
                <option value="">Toutes les commandes</option>
                @for (c of d.commands; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </div>
          }
        }
      </div>

      @if (error()) {
        <p class="alert">{{ error() }}</p>
      } @else if (data(); as d) {
        @if (d.items.length) {
          <ul class="card list" [class.stale]="loading()">
            @for (e of d.items; track e.id) {
              <li>
                <button type="button" class="row" [attr.aria-expanded]="openId() === e.id" (click)="toggle(e.id)">
                  <span class="id faint num">#{{ e.id }}</span>
                  <span class="main">
                    <strong><code>{{ e.command }}</code> · {{ e.error_type }}</strong>
                    <span class="muted msg">{{ e.error_message }}</span>
                  </span>
                  <span class="faint when">{{ when(e.ts) }}</span>
                  <app-icon name="chevron" [size]="14" [class.open]="openId() === e.id" />
                </button>
                @if (openId() === e.id) {
                  @if (detailError()) {
                    <p class="alert">{{ detailError() }}</p>
                  } @else if (detail(); as t) {
                    <div class="detail">
                      @if (t.user_id) {
                        <p class="muted">Utilisateur Discord : <code>{{ t.user_id }}</code></p>
                      }
                      <pre>{{ t.traceback }}</pre>
                    </div>
                  } @else {
                    <div class="skeleton small"></div>
                  }
                }
              </li>
            }
          </ul>
          <app-pager [page]="d.page" [pageSize]="d.page_size" [total]="d.total" label="erreurs" (pageChange)="page.set($event)" />
        } @else {
          <p class="muted">Aucune erreur enregistrée. 🎉</p>
        }
      } @else {
        <div class="skeleton"></div>
      }
    </section>
  `,
  styles: `
    .errors { margin-top: 32px; }
    .section-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .section-head h2 { margin: 0; }
    .section-head p { margin: 4px 0 0; }
    code { color: var(--lilac); }
    .list { list-style: none; margin: 0; padding: 4px 8px; display: grid; transition: opacity .15s; }
    .list li { border-top: 1px solid var(--border-soft); }
    .list li:first-child { border-top: 0; }
    .row { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: grid; align-items: center; gap: 12px;
           grid-template-columns: auto minmax(0, 1fr) auto auto; padding: 10px 4px; }
    .row:focus-visible { outline: 2px solid var(--lilac-strong); border-radius: var(--radius-sm); }
    .main { display: grid; min-width: 0; }
    .main strong { font-size: .9rem; font-weight: 600; }
    .msg { font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .when { font-size: .78rem; white-space: nowrap; }
    app-icon { transition: transform .15s; }
    app-icon.open { transform: rotate(90deg); }
    .detail { padding: 0 4px 12px; }
    .detail p { margin: 0 0 8px; font-size: .85rem; }
    pre { margin: 0; max-height: 320px; overflow: auto; padding: 12px; border-radius: var(--radius-sm);
          background: var(--surface-3); color: var(--text-muted); font-size: .78rem; white-space: pre-wrap; word-break: break-word; }
    .stale { opacity: .55; }
    .skeleton { min-height: 160px; }
    .skeleton.small { min-height: 60px; margin-bottom: 12px; }
    @media (max-width: 600px) {
      .row { grid-template-columns: minmax(0, 1fr) auto; }
      .id, .when { display: none; }
    }
  `,
})
export class BotErrors {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly command = signal<string | null>(null);
  /** Revient à la page 1 quand le filtre change. */
  protected readonly page = linkedSignal({ source: this.command, computation: () => 1 });
  private readonly list = rxResource({
    params: () => ({ guildId: this.guildId(), page: this.page(), command: this.command() }),
    stream: ({ params }) => this.api.botErrors(params.guildId, params.page, params.command),
  });
  /** Garde l'ancienne page (estompée) pendant le chargement de la suivante. */
  protected readonly data = lastValue(this.list);
  protected readonly loading = this.list.isLoading;
  protected readonly error = errorText(this.list);

  /** Erreur dépliée (une à la fois) ; repliée dès qu'on change de page ou de filtre. */
  protected readonly openId = linkedSignal<unknown, number | null>({ source: () => [this.page(), this.command()], computation: () => null });
  private readonly detailRes = rxResource({
    params: () => {
      const id = this.openId();
      return id === null ? undefined : { guildId: this.guildId(), id };
    },
    stream: ({ params }) => this.api.botError(params.guildId, params.id),
  });
  protected readonly detail = computed(() => (this.detailRes.hasValue() ? this.detailRes.value() : null));
  protected readonly detailError = errorText(this.detailRes);
  protected readonly when = errorWhen;

  setCommand(value: string): void {
    this.command.set(value || null);
  }

  toggle(id: number): void {
    this.openId.update((open) => (open === id ? null : id));
  }
}
