import { Component, OnInit, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { BotErrorDetail, BotErrorsPage } from '../../core/models';
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
          <app-pager [page]="d.page" [pageSize]="d.page_size" [total]="d.total" label="erreurs" (pageChange)="load($event)" />
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
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
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
export class BotErrors implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly data = signal<BotErrorsPage | null>(null);
  protected readonly command = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly openId = signal<number | null>(null);
  protected readonly detail = signal<BotErrorDetail | null>(null);
  protected readonly detailError = signal('');
  protected readonly when = errorWhen;
  private request = 0;

  ngOnInit(): void {
    void this.load(1);
  }

  setCommand(value: string): void {
    this.command.set(value || null);
    void this.load(1);
  }

  async load(page: number): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.openId.set(null);
    try {
      const d = await firstValueFrom(this.api.botErrors(this.guildId(), page, this.command()));
      if (request === this.request) this.data.set(d);
    } catch (err) {
      if (request === this.request) this.error.set(errorMessage(err));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  async toggle(id: number): Promise<void> {
    if (this.openId() === id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(id);
    this.detail.set(null);
    this.detailError.set('');
    try {
      const d = await firstValueFrom(this.api.botError(this.guildId(), id));
      if (this.openId() === id) this.detail.set(d);
    } catch (err) {
      if (this.openId() === id) this.detailError.set(errorMessage(err));
    }
  }
}
