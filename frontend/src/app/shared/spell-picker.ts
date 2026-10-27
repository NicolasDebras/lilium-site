import { Component, computed, inject, input, output, signal } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';
import { ItemsService, categoryLabel, spellIconUrl, spellName, useFallbackIcon } from '../core/items.service';

/** Sort proposé ; `category` (Plaque / Cuir / Tissu) groupe les sorts de « bottes au choix ». */
export interface SpellOption {
  id: string;
  category?: string;
}

/**
 * Case de sort cliquable (Q, W, E, actif d'armure, passif). Vide = au choix du joueur.
 * Le clic ouvre la liste des sorts possibles (icône + nom), groupés par famille s'il y en a.
 */
@Component({
  selector: 'app-spell-picker',
  template: `
    <button type="button" class="slot" [class.filled]="value()" [attr.aria-label]="label() + ' : ' + summary()"
            [title]="summary()" (click)="open.set(true)">
      @if (value()) {
        <img [src]="icon(value())" [alt]="summary()" width="44" height="44" (error)="fallback($event)" />
      } @else {
        <span class="placeholder">?</span>
      }
    </button>
    <span class="key">{{ label() }}</span>

    @if (open()) {
      <div class="overlay" (click)="open.set(false)"></div>
      <div class="panel card" role="dialog" [attr.aria-label]="t().spells.choose(label(), title())">
        <div class="panel-head">
          <h3>{{ title() }} <span class="muted">· {{ label() }}</span></h3>
          <button type="button" class="btn btn-sm" (click)="open.set(false)" [attr.aria-label]="t().common.close">✕</button>
        </div>
        @for (group of groups(); track group.category) {
          @if (group.category) {
            <h4 class="group">{{ catLabel(group.category) }}</h4>
          }
          <div class="results">
            @for (s of group.spells; track s) {
              <button type="button" class="result" [class.selected]="s === value()" (click)="pick(s)">
                <img [src]="icon(s)" alt="" width="48" height="48" loading="lazy" (error)="fallback($event)" />
                <span>{{ name(s) }}</span>
              </button>
            }
          </div>
        } @empty {
          <p class="muted">{{ t().spells.none }}</p>
        }
        <div class="row actions">
          <button type="button" class="btn btn-sm free-btn" [class.btn-primary]="!value()" (click)="pick('')">
            {{ t().spells.free }}
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: grid; justify-items: center; gap: 2px; }
    .slot { width: 52px; height: 52px; border-radius: 10px; border: 1px dashed var(--border); background: var(--surface-2);
            display: grid; place-items: center; cursor: pointer; padding: 3px; transition: border-color .15s, background .15s; }
    .slot:hover { border-color: var(--lilac); background: var(--lilac-soft); }
    .slot.filled { border-style: solid; border-color: var(--lilac-strong); }
    .slot img { width: 44px; height: 44px; border-radius: 50%; }
    .placeholder { font-size: 1.2rem; color: var(--text-muted); }
    .key { font-size: .72rem; font-weight: 600; color: var(--text-muted); }
    .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); z-index: 50; }
    .panel { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%);
             width: min(560px, calc(100vw - 2 * var(--gutter)));
             max-height: min(85vh, 700px); max-height: min(85dvh, 700px);
             display: flex; flex-direction: column; gap: 10px; overflow-y: auto; overscroll-behavior: contain; }
    .panel > * { flex: none; }
    .panel-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .panel-head h3 { margin: 0; color: var(--lilac); font-size: 1rem; }
    .group { margin: 4px 0 0; font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--lilac); }
    .results { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
    .result { display: grid; justify-items: center; gap: 4px; padding: 8px 4px; border-radius: 8px; border: 1px solid transparent;
              background: var(--surface-2); color: var(--text); font: inherit; font-size: .74rem; line-height: 1.2;
              cursor: pointer; text-align: center; }
    .result img { border-radius: 50%; }
    .result:hover { border-color: var(--lilac-strong); }
    .result.selected { border-color: var(--lilac); background: var(--lilac-soft); }
    .actions { justify-content: flex-end; }
  `,
})
export class SpellPicker {
  private readonly catalog = inject(ItemsService);
  protected readonly t = inject(I18nService).t;

  /** Touche affichée sous la case (« Q », « R », « Passif »…). */
  readonly label = input.required<string>();
  /** Objet concerné, en titre du panneau (« Arc long », « Bottes au choix »). */
  readonly title = input('');
  readonly options = input<readonly SpellOption[]>([]);
  /** Id du sort choisi, '' = au choix du joueur. */
  readonly value = input('');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);

  /** Sorts groupés par famille, dans l'ordre d'arrivée (un seul groupe sans titre s'il n'y a pas de famille). */
  protected readonly groups = computed(() => {
    const out: { category: string; spells: string[] }[] = [];
    for (const o of this.options()) {
      const category = o.category ?? '';
      let group = out.find((g) => g.category === category);
      if (!group) out.push((group = { category, spells: [] }));
      group.spells.push(o.id);
    }
    return out;
  });

  protected readonly summary = computed(() => (this.value() ? this.name(this.value()) : this.t().spells.free));

  protected name(spell: string): string {
    return spellName(spell, this.catalog.spells()?.names);
  }

  protected icon(spell: string): string {
    return spellIconUrl(spell);
  }

  protected catLabel(category: string): string {
    return categoryLabel(category);
  }

  protected fallback(event: Event): void {
    useFallbackIcon(event);
  }

  pick(spell: string): void {
    this.valueChange.emit(spell);
    this.open.set(false);
  }
}
