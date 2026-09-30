import { Component, computed, inject, input, output, signal } from '@angular/core';

import { ItemsService, filterItems, itemIconUrl, useFallbackIcon } from '../core/items.service';
import { FREE_CHOICE, Item, MAX_CHOICES, SLOT_LABELS, Slot } from '../core/models';

/**
 * Case d'équipement cliquable (comme l'inventaire du jeu). Une case vaut :
 * rien, 1 à 3 objets au choix, ou « au choix du joueur ». Le clic ouvre un
 * sélecteur avec recherche, familles et images ; cliquer un objet l'ajoute ou
 * le retire de la sélection.
 */
@Component({
  selector: 'app-item-picker',
  template: `
    <button type="button" class="slot" [class.filled]="value().length" [disabled]="disabled()"
            [attr.aria-label]="label() + ' : ' + summary()"
            [title]="disabledReason() || summary()"
            (click)="open.set(true)">
      @if (isFree()) {
        <span class="free">Au choix</span>
      } @else if (items().length === 1) {
        <img [src]="icon(items()[0].icon)" [alt]="items()[0].name" width="64" height="64" (error)="fallback($event)" />
      } @else if (items().length > 1) {
        <span class="multi">
          @for (it of items(); track it.id) {
            <img [src]="icon(it.icon)" [alt]="it.name" width="34" height="34" (error)="fallback($event)" />
          }
        </span>
      } @else {
        <span class="placeholder">+</span>
      }
    </button>
    <span class="slot-label">{{ value().length ? summary() : label() }}</span>

    @if (open()) {
      <div class="overlay" (click)="close()"></div>
      <div class="panel card" role="dialog" [attr.aria-label]="'Choisir : ' + label()">
        <div class="panel-head">
          <h3>{{ label() }} <span class="muted count">{{ items().length }}/{{ max }}</span></h3>
          <button type="button" class="btn btn-sm" (click)="close()" aria-label="Fermer">✕</button>
        </div>
        <p class="muted hint">Clique jusqu'à {{ max }} objets : le joueur aura le choix entre eux.</p>
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
            <button type="button" class="result" [class.selected]="isSelected(it)" [title]="it.name + ' (' + it.name_en + ')'"
                    [disabled]="!isSelected(it) && isFull()" (click)="toggle(it)">
              <img [src]="icon(it.icon)" [alt]="" width="56" height="56" loading="lazy" (error)="fallback($event)" />
              <span>{{ it.name }}</span>
            </button>
          } @empty {
            <p class="muted">Aucun objet trouvé.</p>
          }
        </div>
        <div class="row actions">
          <button type="button" class="btn btn-sm free-btn" [class.btn-primary]="isFree()" (click)="setFree()">
            Au choix du joueur
          </button>
          @if (value().length) {
            <button type="button" class="btn btn-sm btn-danger clear" (click)="clear()">Vider la case</button>
          }
          <button type="button" class="btn btn-sm btn-primary done" (click)="close()">Valider</button>
        </div>
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
    .multi { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; }
    .multi img { width: 32px; height: 32px; }
    .free { font-size: .75rem; font-weight: 600; color: var(--lilac); background: var(--lilac-soft); border-radius: 8px; padding: 4px 6px; }
    .placeholder { font-size: 1.6rem; color: var(--text-muted); }
    .slot-label { font-size: .75rem; color: var(--text-muted); text-align: center; max-width: 100px; line-height: 1.2; }
    .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); z-index: 50; }
    .panel { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%);
             width: min(640px, calc(100vw - 2 * var(--gutter))); max-height: min(85vh, 760px);
             display: grid; grid-template-rows: auto auto auto auto 1fr auto; gap: 10px; }
    .panel-head { display: flex; justify-content: space-between; align-items: center; }
    .panel-head h3 { margin: 0; color: var(--lilac); }
    .count { font-size: .85rem; font-weight: 500; }
    .hint { margin: -6px 0 0; font-size: .8rem; }
    .chips { gap: 6px; }
    .chip { border: 1px solid var(--border); background: transparent; color: var(--text-muted); border-radius: 999px;
            padding: 3px 10px; font: inherit; font-size: .8rem; cursor: pointer; }
    .chip.on { background: var(--lilac-soft); color: var(--lilac); border-color: var(--lilac-strong); }
    .results { overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; min-height: 120px; }
    .result { display: grid; justify-items: center; gap: 2px; padding: 6px 4px; border-radius: 8px; border: 1px solid transparent;
              background: var(--surface-2); color: var(--text); font: inherit; font-size: .72rem; line-height: 1.2; cursor: pointer; text-align: center; }
    .result:hover:not(:disabled) { border-color: var(--lilac-strong); }
    .result:disabled { opacity: .4; cursor: not-allowed; }
    .result.selected { border-color: var(--lilac); background: var(--lilac-soft); }
    .done { margin-left: auto; }
  `,
})
export class ItemPicker {
  private readonly catalog = inject(ItemsService);
  protected readonly max = MAX_CHOICES;

  readonly slot = input.required<Slot>();
  /** Ids choisis (1 à 3), [FREE_CHOICE] pour « au choix du joueur », [] = rien. */
  readonly value = input<string[]>([]);
  readonly disabled = input(false);
  readonly disabledReason = input('');
  readonly valueChange = output<string[]>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly category = signal('');

  protected readonly label = computed(() => SLOT_LABELS[this.slot()]);
  readonly isFree = computed(() => this.value()[0] === FREE_CHOICE);
  readonly items = computed(() =>
    this.isFree() ? [] : this.value().map((id) => this.catalog.get(id)).filter((i): i is Item => !!i),
  );
  readonly isFull = computed(() => this.items().length >= MAX_CHOICES);
  readonly summary = computed(() =>
    this.isFree() ? 'Au choix du joueur' : this.items().map((i) => i.name).join(' / ') || 'vide',
  );
  protected readonly categories = computed(() => [
    ...new Set(filterItems(this.catalog.items(), this.slot()).map((i) => i.category)),
  ]);
  readonly results = computed(() => filterItems(this.catalog.items(), this.slot(), this.query(), this.category()));

  protected icon(icon: string): string {
    return itemIconUrl(icon);
  }

  protected fallback(event: Event): void {
    useFallbackIcon(event);
  }

  isSelected(item: Item): boolean {
    return this.value().includes(item.id);
  }

  /** Ajoute l'objet aux choix (max 3) ou le retire s'il y est déjà. */
  toggle(item: Item): void {
    const current = this.isFree() ? [] : this.value();
    if (current.includes(item.id)) {
      this.valueChange.emit(current.filter((id) => id !== item.id));
    } else if (current.length < MAX_CHOICES) {
      this.valueChange.emit([...current, item.id]);
    }
  }

  setFree(): void {
    this.valueChange.emit([FREE_CHOICE]);
    this.close();
  }

  clear(): void {
    this.valueChange.emit([]);
  }

  close(): void {
    this.open.set(false);
    this.query.set('');
    this.category.set('');
  }
}
