import { Component, computed, inject, input, output, signal } from '@angular/core';

import { ItemsService, filterItems, itemIconUrl, useFallbackIcon } from '../core/items.service';
import { Item, SLOT_LABELS, Slot } from '../core/models';

/**
 * Case d'équipement cliquable (comme l'inventaire du jeu) : affiche l'objet
 * choisi et ouvre un sélecteur avec recherche, familles et images.
 */
@Component({
  selector: 'app-item-picker',
  template: `
    <button type="button" class="slot" [class.filled]="item()" [disabled]="disabled()"
            [attr.aria-label]="label() + ' : ' + (item()?.name ?? 'vide')"
            [title]="disabledReason() || item()?.name || 'Choisir : ' + label()"
            (click)="open.set(true)">
      @if (item(); as it) {
        <img [src]="icon(it.icon)" [alt]="it.name" width="64" height="64" (error)="fallback($event)" />
      } @else {
        <span class="placeholder">+</span>
      }
    </button>
    <span class="slot-label">{{ item()?.name || label() }}</span>

    @if (open()) {
      <div class="overlay" (click)="close()"></div>
      <div class="panel card" role="dialog" [attr.aria-label]="'Choisir : ' + label()">
        <div class="panel-head">
          <h3>{{ label() }}</h3>
          <button type="button" class="btn btn-sm" (click)="close()" aria-label="Fermer">✕</button>
        </div>
        <input class="input search" type="search" placeholder="Rechercher (ex : épée, holy, cuir…)"
               aria-label="Rechercher un objet" [value]="query()" (input)="query.set($any($event.target).value)" />
        @if (categories().length > 1) {
          <div class="row chips">
            <button type="button" class="chip" [class.on]="!category()" (click)="category.set('')">Tout</button>
            @for (c of categories(); track c) {
              <button type="button" class="chip" [class.on]="category() === c" (click)="category.set(c)">{{ c }}</button>
            }
          </div>
        }
        <div class="results">
          @for (it of results(); track it.id) {
            <button type="button" class="result" [class.selected]="it.id === value()" [title]="it.name + ' (' + it.name_en + ')'"
                    (click)="pick(it)">
              <img [src]="icon(it.icon)" [alt]="" width="56" height="56" loading="lazy" (error)="fallback($event)" />
              <span>{{ it.name }}</span>
            </button>
          } @empty {
            <p class="muted">Aucun objet trouvé.</p>
          }
        </div>
        @if (value()) {
          <button type="button" class="btn btn-sm btn-danger clear" (click)="pick(null)">Retirer l'objet</button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: grid; justify-items: center; gap: 4px; position: relative; }
    .slot { width: 76px; height: 76px; border-radius: 12px; border: 1px dashed var(--border); background: var(--surface-2);
            display: grid; place-items: center; cursor: pointer; padding: 4px; transition: border-color .15s, background .15s; }
    .slot:hover:not(:disabled) { border-color: var(--lilac); background: var(--lilac-soft); }
    .slot.filled { border-style: solid; border-color: var(--lilac-strong); }
    .slot:disabled { opacity: .35; cursor: not-allowed; }
    .slot img { width: 64px; height: 64px; }
    .placeholder { font-size: 1.6rem; color: var(--text-muted); }
    .slot-label { font-size: .75rem; color: var(--text-muted); text-align: center; max-width: 96px; line-height: 1.2; }
    .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); z-index: 50; }
    .panel { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%);
             width: min(640px, calc(100vw - 2 * var(--gutter))); max-height: min(80vh, 720px);
             display: grid; grid-template-rows: auto auto auto 1fr auto; gap: 10px; }
    .panel-head { display: flex; justify-content: space-between; align-items: center; }
    .panel-head h3 { margin: 0; color: var(--lilac); }
    .chips { gap: 6px; }
    .chip { border: 1px solid var(--border); background: transparent; color: var(--text-muted); border-radius: 999px;
            padding: 3px 10px; font: inherit; font-size: .8rem; cursor: pointer; }
    .chip.on { background: var(--lilac-soft); color: var(--lilac); border-color: var(--lilac-strong); }
    .results { overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; min-height: 120px; }
    .result { display: grid; justify-items: center; gap: 2px; padding: 6px 4px; border-radius: 8px; border: 1px solid transparent;
              background: var(--surface-2); color: var(--text); font: inherit; font-size: .72rem; line-height: 1.2; cursor: pointer; text-align: center; }
    .result:hover { border-color: var(--lilac-strong); }
    .result.selected { border-color: var(--lilac); background: var(--lilac-soft); }
    .clear { justify-self: start; }
  `,
})
export class ItemPicker {
  private readonly items = inject(ItemsService);

  readonly slot = input.required<Slot>();
  /** Id de l'objet choisi (catalogue /api/items), ou vide. */
  readonly value = input<string | undefined>();
  readonly disabled = input(false);
  readonly disabledReason = input('');
  readonly valueChange = output<string | null>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly category = signal('');

  protected readonly label = computed(() => SLOT_LABELS[this.slot()]);
  protected readonly item = computed(() => this.items.get(this.value()));
  protected readonly categories = computed(() => [
    ...new Set(filterItems(this.items.items(), this.slot()).map((i) => i.category)),
  ]);
  readonly results = computed(() => filterItems(this.items.items(), this.slot(), this.query(), this.category()));

  protected icon(icon: string): string {
    return itemIconUrl(icon);
  }

  protected fallback(event: Event): void {
    useFallbackIcon(event);
  }

  pick(item: Item | null): void {
    this.valueChange.emit(item?.id ?? null);
    this.close();
  }

  close(): void {
    this.open.set(false);
    this.query.set('');
    this.category.set('');
  }
}
