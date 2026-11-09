import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { I18nService, locale } from '../../core/i18n/i18n';
import { BotError } from '../../core/models';
import { errorText, lastValue } from '../../core/resource';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';

/** Issues ouvertes par le bot pour ses erreurs (dépôt privé : lien utile au propriétaire seulement). */
export const BOT_ISSUES_URL = 'https://github.com/NicolasDebras/botDiscord/issues/';

/** « 2026-10-08T09:12:44+00:00 » → « 08/10/2026 11:12 » (heure locale du navigateur). */
export function errorWhen(ts: string): string {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
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
          <h2 id="errors-title">{{ t().admin.errorsTitle }}</h2>
          <p class="muted">{{ t().admin.errorsHelp[0] }}<code>/errors</code>{{ t().admin.errorsHelp[1] }}</p>
        </div>
        @if (data(); as d) {
          <div class="filters">
            <label class="switch">
              <input type="checkbox" class="hide-fixed" [checked]="hideFixed()" (change)="hideFixed.set($any($event.target).checked)" />
              {{ t().admin.hideFixed }}
            </label>
            @if (d.commands.length) {
              <label class="sr-only" for="errors-filter">{{ t().admin.command }}</label>
              <select id="errors-filter" class="select" [value]="command() ?? ''" (change)="setCommand($any($event.target).value)">
                <option value="">{{ t().admin.allCommands }}</option>
                @for (c of d.commands; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            }
          </div>
        }
      </div>

      @if (error()) {
        <p class="alert">{{ error() }}</p>
      } @else if (data(); as d) {
        @if (d.items.length) {
          <ul class="card list" [class.stale]="loading()">
            @for (e of d.items; track e.id) {
              <li [class.fixed]="e.is_fixed">
                <button type="button" class="row" [attr.aria-expanded]="openId() === e.id" (click)="toggle(e.id)">
                  <span class="id faint num">#{{ e.id }}</span>
                  <span class="main">
                    <strong>
                      <code>{{ e.command }}</code> · {{ e.error_type }}
                      @if (e.is_fixed) {
                        <span class="badge"><app-icon name="check" [size]="12" />{{ t().admin.fixed }}</span>
                      }
                    </strong>
                    <span class="muted msg">{{ e.error_message }}</span>
                  </span>
                  <span class="faint when">{{ when(e.ts) }}</span>
                  <app-icon name="chevron" [size]="14" [class.open]="openId() === e.id" />
                </button>
                @if (openId() === e.id) {
                  <div class="detail">
                    <div class="actions">
                      <button type="button" class="btn btn-sm mark" [class.btn-primary]="!e.is_fixed" [disabled]="busy()" (click)="setFixed(e, !e.is_fixed)">
                        <app-icon [name]="e.is_fixed ? 'reset' : 'check'" [size]="14" />
                        {{ e.is_fixed ? t().admin.markUnfixed : t().admin.markFixed(e.command, e.error_type) }}
                      </button>
                      @if (e.github_issue) {
                        <a class="btn btn-sm btn-ghost issue" [href]="issueUrl(e.github_issue)" target="_blank" rel="noopener">
                          <app-icon name="link" [size]="14" />{{ t().admin.githubIssue(e.github_issue) }}
                        </a>
                      }
                    </div>
                    @if (detailError()) {
                      <p class="alert">{{ detailError() }}</p>
                    } @else if (detail(); as tb) {
                      @if (tb.user_id) {
                        <p class="muted">{{ t().admin.discordUser }} <code>{{ tb.user_id }}</code></p>
                      }
                      <pre>{{ tb.traceback }}</pre>
                    } @else {
                      <div class="skeleton small"></div>
                    }
                  </div>
                }
              </li>
            }
          </ul>
          <app-pager [page]="d.page" [pageSize]="d.page_size" [total]="d.total" [label]="t().admin.errorsLabel" (pageChange)="page.set($event)" />
        } @else {
          <p class="muted">{{ hideFixed() ? t().admin.noUnfixedErrors : t().admin.noErrors }}</p>
        }
      } @else {
        <div class="skeleton"></div>
      }
    </section>
  `,
  styles: `
    .errors { margin-top: 0; }
    .section-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .section-head h2 { margin: 0; }
    .section-head p { margin: 4px 0 0; }
    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
    code { color: var(--lilac); }
    .main .badge { margin-left: 6px; vertical-align: middle; }
    .fixed .main, .fixed .id, .fixed .when { opacity: .6; }
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
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    pre { margin: 0; max-height: 320px; overflow: auto; padding: 12px; border-radius: var(--radius-sm);
          background: var(--surface-3); color: var(--text-muted); font-size: .78rem; white-space: pre-wrap; word-break: break-word; }
    .stale { opacity: .55; }
    .skeleton { min-height: 160px; }
    .skeleton.small { min-height: 60px; }
    @media (max-width: 600px) {
      .row { grid-template-columns: minmax(0, 1fr) auto; }
      .id, .when { display: none; }
    }
  `,
})
export class BotErrors {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  readonly guildId = input.required<string>();

  protected readonly command = signal<string | null>(null);
  protected readonly hideFixed = signal(false);
  /** Revient à la page 1 quand un filtre change. */
  protected readonly page = linkedSignal({ source: () => [this.command(), this.hideFixed()], computation: () => 1 });
  private readonly list = rxResource({
    params: () => ({ guildId: this.guildId(), page: this.page(), command: this.command(), hideFixed: this.hideFixed() }),
    stream: ({ params }) => this.api.botErrors(params.guildId, params.page, params.command, params.hideFixed),
  });
  /** Garde l'ancienne page (estompée) pendant le chargement de la suivante. */
  protected readonly data = lastValue(this.list);
  protected readonly loading = this.list.isLoading;
  protected readonly error = errorText(this.list);

  /** Erreur dépliée (une à la fois) ; repliée dès qu'on change de page ou de filtre. */
  protected readonly openId = linkedSignal<unknown, number | null>({
    source: () => [this.page(), this.command(), this.hideFixed()], computation: () => null,
  });
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
  protected readonly busy = signal(false);

  setCommand(value: string): void {
    this.command.set(value || null);
  }

  toggle(id: number): void {
    this.openId.update((open) => (open === id ? null : id));
  }

  issueUrl(n: number): string {
    return `${BOT_ISSUES_URL}${n}`;
  }

  /** Marque (ou non) corrigées cette erreur et toutes celles de même commande et même type. */
  async setFixed(e: BotError, fixed: boolean): Promise<void> {
    this.busy.set(true);
    try {
      const { updated } = await firstValueFrom(this.api.setBotErrorFixed(this.guildId(), e.id, fixed));
      this.toast.success(fixed ? this.t().admin.markedFixed(updated) : this.t().admin.markedUnfixed(updated));
      this.list.reload();
    } catch (err) {
      this.toast.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
