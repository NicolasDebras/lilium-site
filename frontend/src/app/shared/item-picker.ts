import { Component, computed, inject, input, output, signal } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';
import { ItemsService, categoryLabel, filterItems, itemIconUrl, itemName, useFallbackIcon } from '../core/items.service';
import { FREE_CHOICE, Item, MAX_CHOICES, SWAPS_MAX, Slot } from '../core/models';
import { allowedTiers, makeChoice, maxEnchant, parseChoice } from '../core/tiers';
import { choiceName } from './gear';
import { TierBadge } from './tier-badge';

/** Dernier tier/enchantement choisi (partagé par toutes les cases, le temps de la session) :
 *  appliqué aux objets cliqués ensuite. Exporté pour les tests. */
export const lastPick = signal<{ tier: number | null; enchant: number }>({ tier: 8, enchant: 0 });

/**
 * Case d'équipement cliquable (comme l'inventaire du jeu). Une case vaut :
 * rien, 1 à 3 objets au choix, ou « au choix du joueur ». Le clic ouvre un
 * sélecteur avec recherche, familles et images ; cliquer un objet l'ajoute ou
 * le retire de la sélection. Chaque objet choisi a son tier minimum (T4–T8,
 * ou libre) et son enchantement, réglables dans la liste « Sélection ».
 */
@Component({
  selector: 'app-item-picker',
  imports: [TierBadge],
  template: `
    <button type="button" class="slot" [class.filled]="value().length" [disabled]="disabled()"
            [attr.aria-label]="label() + ' : ' + summary()"
            [title]="disabledReason() || summary()"
            (click)="open.set(true)">
      @if (isFree()) {
        <span class="free">{{ t().picker.free }}</span>
      } @else if (items().length === 1) {
        <img [src]="icon(items()[0].icon)" [alt]="name(items()[0])" width="64" height="64" (error)="fallback($event)" />
        <app-tier-badge [item]="items()[0]" />
      } @else if (items().length > 1) {
        <span class="multi">
          @for (it of items(); track it.id) {
            <img [src]="icon(it.icon)" [alt]="name(it)" width="34" height="34" (error)="fallback($event)" />
          }
        </span>
      } @else {
        <span class="placeholder">+</span>
      }
    </button>
    <span class="slot-label">{{ value().length ? summary() : (placeholder() || label()) }}</span>

    @if (open()) {
      <div class="overlay" (click)="close()"></div>
      <div class="panel card" role="dialog" [attr.aria-label]="t().picker.choose(label())">
        <div class="panel-head">
          <h3>{{ label() }} <span class="muted count">{{ items().length }}/{{ max() }}</span></h3>
          <button type="button" class="btn btn-sm" (click)="close()" [attr.aria-label]="t().common.close">✕</button>
        </div>
        <p class="muted hint">{{ hint() }}</p>
        @if (selection().length) {
          <ul class="selection" [attr.aria-label]="t().picker.selection">
            @for (s of selection(); track s.index) {
              <li>
                <span class="sel-icon">
                  <img [src]="icon(s.item.icon)" alt="" width="36" height="36" (error)="fallback($event)" />
                  <app-tier-badge [item]="s.item" />
                </span>
                <span class="sel-name">{{ name(s.item) }}</span>
                <select class="select tier" [attr.aria-label]="t().picker.minTier(name(s.item))"
                        (change)="setTier(s.index, $any($event.target).value)">
                  <option value="" [selected]="s.item.tier == null">{{ t().picker.freeTier }}</option>
                  @for (t of tiersOf(s.item); track t) {
                    <option [value]="t" [selected]="s.item.tier === t">T{{ t }}</option>
                  }
                </select>
                <select class="select ench" [attr.aria-label]="t().picker.enchant(name(s.item))" [disabled]="s.item.tier == null"
                        (change)="setEnchant(s.index, +$any($event.target).value)">
                  @for (e of enchantsOf(s.item); track e) {
                    <option [value]="e" [selected]="(s.item.enchant ?? 0) === e">.{{ e }}</option>
                  }
                </select>
                <button type="button" class="btn btn-sm remove" [attr.aria-label]="t().picker.remove(name(s.item))"
                        (click)="removeAt(s.index)">✕</button>
              </li>
            }
          </ul>
          <p class="faint tiers-hint">{{ t().picker.tiersHint }}</p>
        }
        <input class="input search" type="search" [placeholder]="t().picker.searchPlaceholder"
               [attr.aria-label]="t().picker.searchAria" [value]="query()" (input)="query.set($any($event.target).value)" />
        @if (categories().length > 1) {
          <div class="row chips">
            <button type="button" class="chip" [class.on]="!category()" (click)="category.set('')">{{ t().common.all }}</button>
            @for (c of categories(); track c) {
              <button type="button" class="chip" [class.on]="category() === c" (click)="category.set(c)">{{ catLabel(c) }}</button>
            }
          </div>
        }
        <div class="results">
          @for (it of results(); track it.id) {
            <button type="button" class="result" [class.selected]="isSelected(it)" [title]="name(it) + ' (' + (lang() === 'en' ? it.name : it.name_en) + ')'"
                    [disabled]="!isSelected(it) && isFull()" (click)="toggle(it)">
              <img [src]="icon(it.icon)" [alt]="" width="56" height="56" loading="lazy" (error)="fallback($event)" />
              <span>{{ name(it) }}</span>
            </button>
          } @empty {
            <p class="muted">{{ t().picker.noResult }}</p>
          }
        </div>
        <div class="row actions">
          @if (!swaps()) {
            <button type="button" class="btn btn-sm free-btn" [class.btn-primary]="isFree()" (click)="setFree()">
              {{ t().picker.playerChoice }}
            </button>
          }
          @if (value().length) {
            <button type="button" class="btn btn-sm btn-danger clear" (click)="clear()">{{ t().picker.clear }}</button>
          }
          <button type="button" class="btn btn-sm btn-primary done" (click)="close()">{{ t().picker.done }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: grid; justify-items: center; gap: 4px; position: relative; }
    .slot { position: relative; width: 76px; height: 76px; border-radius: 12px; border: 1px dashed var(--border); background: var(--surface-2);
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
             display: flex; flex-direction: column; gap: 10px; }
    .panel-head { display: flex; justify-content: space-between; align-items: center; }
    .panel-head h3 { margin: 0; color: var(--lilac); }
    .count { font-size: .85rem; font-weight: 500; }
    .hint { margin: -6px 0 0; font-size: .8rem; }
    .chips { gap: 6px; }
    .chip { border: 1px solid var(--border); background: transparent; color: var(--text-muted); border-radius: 999px;
            padding: 3px 10px; font: inherit; font-size: .8rem; cursor: pointer; }
    .chip.on { background: var(--lilac-soft); color: var(--lilac); border-color: var(--lilac-strong); }
    /* Sélection : une ligne par objet choisi, avec son tier minimum et son enchantement */
    .selection { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .selection li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 10px;
                    background: var(--surface-2); border: 1px solid var(--lilac-soft); }
    .sel-icon { position: relative; flex: none; width: 36px; height: 36px; }
    .sel-icon img { width: 36px; height: 36px; }
    .sel-name { flex: 1 1 auto; min-width: 0; font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .selection .select { width: auto; flex: none; padding-block: 4px; font-size: .82rem; }
    .tiers-hint { margin: -4px 0 0; font-size: .75rem; }
    .results { flex: 1 1 auto; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; min-height: 120px; }
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
  private readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly lang = this.i18n.lang;
  /** Un emplacement, ou 'swaps' : objets de rechange de tous emplacements (6 max, jamais « au choix »). */
  readonly slot = input.required<Slot | 'swaps'>();
  protected readonly swaps = computed(() => this.slot() === 'swaps');
  /** Nombre d'objets max imposé (ex. 1 pour une case de swap) ; sinon 6 (swaps) ou 3. */
  readonly limit = input<number>();
  /** Libellé sous la case vide (par défaut : nom de l'emplacement). */
  readonly placeholder = input('');
  protected readonly max = computed(() => this.limit() ?? (this.swaps() ? SWAPS_MAX : MAX_CHOICES));
  protected readonly hint = computed(() => {
    const t = this.t().picker;
    if (this.max() === 1) return this.swaps() ? t.hintSwapOne : t.hintOne;
    return this.swaps() ? t.hintSwaps(this.max()) : t.hintMany(this.max());
  });
  private readonly slotFilter = computed(() => (this.swaps() ? null : (this.slot() as Slot)));
  /** Ids choisis (1 à 3), [FREE_CHOICE] pour « au choix du joueur », [] = rien. */
  readonly value = input<string[]>([]);
  readonly disabled = input(false);
  readonly disabledReason = input('');
  readonly valueChange = output<string[]>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly category = signal('');

  protected readonly label = computed(() => (this.swaps() ? this.t().gear.swaps : this.t().slots[this.slot() as Slot]));
  readonly isFree = computed(() => this.value()[0] === FREE_CHOICE);
  /** Objets choisis avec leur position dans `value` (ids inconnus ignorés). */
  protected readonly selection = computed(() =>
    this.isFree()
      ? []
      : this.value().flatMap((id, index) => {
          const item = this.catalog.get(id);
          return item ? [{ index, item }] : [];
        }),
  );
  readonly items = computed(() => this.selection().map((s) => s.item));
  /** Plus de place pour un objet de plus (une case à 1 objet n'est jamais « pleine » : on remplace). */
  readonly isFull = computed(() => this.max() > 1 && this.items().length >= this.max());
  readonly summary = computed(() =>
    this.isFree() ? this.t().picker.playerChoice : this.items().map(choiceName).join(' / ') || this.t().picker.empty,
  );
  protected readonly categories = computed(() => [
    ...new Set(filterItems(this.catalog.items(), this.slotFilter()).map((i) => i.category)),
  ]);
  readonly results = computed(() => filterItems(this.catalog.items(), this.slotFilter(), this.query(), this.category()));

  protected icon(icon: string): string {
    return itemIconUrl(icon);
  }

  protected fallback(event: Event): void {
    useFallbackIcon(event);
  }

  protected name(item: Item): string {
    return itemName(item);
  }

  protected catLabel(category: string): string {
    return categoryLabel(category);
  }

  /** Sélectionné quel que soit son tier (« T8_MAIN_SWORD@1 » sélectionne l'Épée large). */
  isSelected(item: Item): boolean {
    return this.value().some((id) => parseChoice(id).base === item.id);
  }

  /** Du plus haut au plus bas : T8 en premier. */
  protected tiersOf(item: Item): number[] {
    return [...allowedTiers(item)].reverse();
  }

  protected enchantsOf(item: Item): number[] {
    return Array.from({ length: maxEnchant(item) + 1 }, (_, i) => i);
  }

  /** Ajoute l'objet (au dernier tier/enchantement utilisé) ou le retire s'il y est déjà ;
   *  case à 1 objet : le nouvel objet remplace l'ancien. */
  toggle(item: Item): void {
    const current = this.isFree() ? [] : this.value();
    if (this.isSelected(item)) {
      this.valueChange.emit(current.filter((id) => parseChoice(id).base !== item.id));
      return;
    }
    const choice = this.defaultChoice(item);
    if (this.max() === 1) {
      this.valueChange.emit([choice]);
    } else if (current.length < this.max()) {
      this.valueChange.emit([...current, choice]);
    }
  }

  /** Tier choisi dans la liste (« » = libre) ; l'enchantement est gardé s'il reste possible. */
  setTier(index: number, raw: string): void {
    const tier = raw === '' ? null : Number(raw);
    this.replaceAt(index, tier, tier === null ? 0 : parseChoice(this.value()[index]).enchant);
  }

  setEnchant(index: number, enchant: number): void {
    this.replaceAt(index, parseChoice(this.value()[index]).tier, enchant);
  }

  removeAt(index: number): void {
    this.valueChange.emit(this.value().filter((_, i) => i !== index));
  }

  /** Remplace le tier/enchantement d'un choix ; devient la valeur par défaut des prochains clics. */
  private replaceAt(index: number, tier: number | null, enchant: number): void {
    const { base } = parseChoice(this.value()[index]);
    const item = this.catalog.get(base);
    const ench = item ? Math.min(enchant, maxEnchant(item)) : enchant;
    lastPick.set({ tier, enchant: ench });
    this.valueChange.emit(this.value().map((id, i) => (i === index ? makeChoice(base, tier, ench) : id)));
  }

  /** Choix d'un objet cliqué : dernier tier utilisé (T8.0 au départ), ramené à un tier qui existe pour l'objet. */
  private defaultChoice(item: Item): string {
    const { tier, enchant } = lastPick();
    if (tier === null) return item.id;
    const tiers = allowedTiers(item);
    if (!tiers.length) return item.id;
    const t = tiers.includes(tier) ? tier : tiers[tiers.length - 1];
    return makeChoice(item.id, t, Math.min(enchant, maxEnchant(item)));
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
