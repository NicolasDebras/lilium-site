import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';

import { ItemsService, itemIconUrl, useFallbackIcon } from '../core/items.service';
import { BuildItems, FREE_CHOICE, Item, SLOTS, SLOT_LABELS, Slot } from '../core/models';
import { tierLabel, tierText } from '../core/tiers';
import { TierBadge } from './tier-badge';

export interface GearSlot {
  slot: Slot;
  label: string;
  items: Item[];
  free: boolean;
}

/** Disposition de l'inventaire du jeu (null = case vide), lue ligne par ligne. */
export const PAPER_DOLL: (Slot | null)[] = [null, 'head', 'cape', 'mainhand', 'armor', 'offhand', 'potion', 'shoes', 'food'];

/** Objets de swap d'un build (ids inconnus ignorés). */
export function describeSwaps(items: BuildItems | undefined, get: (id: string) => Item | undefined): Item[] {
  return (items?.swaps ?? []).map(get).filter((i): i is Item => !!i);
}

/** Cases renseignées d'un build, dans l'ordre des emplacements (ids inconnus ignorés). */
export function describeGear(items: BuildItems | undefined, get: (id: string) => Item | undefined): GearSlot[] {
  return SLOTS.flatMap((slot) => describeSlot(items, slot, get) ?? []);
}

function describeSlot(items: BuildItems | undefined, slot: Slot, get: (id: string) => Item | undefined): GearSlot | null {
  const choices = items?.[slot] ?? [];
  const free = choices[0] === FREE_CHOICE;
  const found = free ? [] : choices.map(get).filter((i): i is Item => !!i);
  return free || found.length ? { slot, label: SLOT_LABELS[slot], items: found, free } : null;
}

/** « Épée large 8.1 » (nom seul si le tier est libre). */
export function choiceName(item: Item): string {
  return item.tier == null ? item.name : `${item.name} ${tierLabel(item.tier, item.enchant ?? 0)}`;
}

/** « Épée large 8.1 minimum ou équivalent (7.2, 6.3) » : pour le survol et la page détail. */
export function choiceDetail(item: Item): string {
  const tier = tierText(item);
  return tier ? `${item.name} ${tier}` : item.name;
}

export function gearTitle(g: GearSlot): string {
  return `${g.label} : ${g.free ? 'au choix du joueur' : g.items.map(choiceDetail).join(' ou ')}`;
}

/** Swaps d'un build : libellé puis rangée d'icônes (rien si aucun swap). */
@Component({
  selector: 'app-gear-swaps',
  host: { '[class.filled]': 'swaps().length > 0' },
  template: `
    @if (swaps().length) {
      <div class="swaps" [class.small]="size() === 'small'" aria-label="Swaps">
        <span class="swaps-label">Swaps</span>
        @for (s of swaps(); track s.id) {
          <span class="cell" [title]="'Swap : ' + detail(s)">
            <img [src]="icon(s)" [alt]="s.name" loading="lazy" (error)="fallback($event)" />
            <app-tier-badge [item]="s" />
          </span>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    :host(:not(.filled)) { display: none; }
    .swaps { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .swaps-label { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
                   color: var(--lilac); margin-right: 6px; }
    .cell { position: relative; width: 48px; height: 48px; border-radius: 9px; background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
            border: 1px solid var(--lilac-soft); display: grid; place-items: center; }
    .small .cell { width: 32px; height: 32px; border-radius: 7px; }
    img { width: 100%; height: 100%; }
  `,
  imports: [TierBadge],
})
export class GearSwaps {
  private readonly catalog = inject(ItemsService);
  readonly items = input<BuildItems | undefined>();
  readonly size = input<'normal' | 'small'>('normal');
  readonly swaps = computed(() => describeSwaps(this.items(), (id) => this.catalog.get(id)));

  protected detail(item: Item): string {
    return choiceDetail(item);
  }

  protected icon(item: Item): string {
    return itemIconUrl(item.icon);
  }

  protected fallback(event: Event): void {
    useFallbackIcon(event);
  }
}

/** Équipement d'un build. `layout="row"` : rangée d'icônes (1re option, « +N », « ? » au choix) ;
 *  `layout="doll"` : mini-inventaire 3×3 façon jeu, cases vides comprises. Détail au survol.
 *  Swaps à droite (row) ou en rangée sous l'inventaire (doll), sauf `[showSwaps]="false"`. */
@Component({
  selector: 'app-gear',
  template: `
    <div class="with-swaps" [class.stacked]="layout() === 'doll'">
    @if (layout() === 'doll') {
      <div class="doll" [class.small]="size() === 'small'">
        @for (cell of doll(); track $index) {
          @if (cell === null) {
            <span class="cell blank"></span>
          } @else if (cell?.gear; as g) {
            <span class="cell" [title]="title(g)">
              <ng-container *ngTemplateOutlet="content; context: { $implicit: g }" />
            </span>
          } @else {
            <span class="cell unset" [title]="cell?.label + ' : non précisé'"></span>
          }
        }
      </div>
    } @else if (gear().length) {
      <div class="gear" [class.small]="size() === 'small'">
        @for (g of gear(); track g.slot) {
          <span class="cell" [title]="title(g)">
            <ng-container *ngTemplateOutlet="content; context: { $implicit: g }" />
          </span>
        }
      </div>
    }
    @if (showSwaps()) {
      <app-gear-swaps class="swaps" [class.under]="layout() === 'doll'" [items]="items()" [size]="size()" />
    }
    </div>

    <ng-template #content let-g>
      @if (g.free) {
        <span class="free">?</span>
      } @else {
        <img [src]="icon(g.items[0])" [alt]="g.items[0].name" loading="lazy" (error)="fallback($event)" />
        <app-tier-badge [item]="g.items[0]" />
        @if (g.items.length > 1) {
          <span class="more">+{{ g.items.length - 1 }}</span>
        }
      }
    </ng-template>
  `,
  imports: [NgTemplateOutlet, GearSwaps, TierBadge],
  styles: `
    .with-swaps { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
    .with-swaps.stacked { flex-direction: column; flex-wrap: nowrap; }
    .gear { display: flex; flex-wrap: wrap; gap: 4px; }
    /* Swaps à droite de l'équipement (trait lilas à gauche), ou dessous en mode inventaire (trait au-dessus) */
    .swaps.filled { padding-left: 10px; border-left: 2px solid var(--lilac-strong); }
    .swaps.under.filled { padding: 8px 0 0; border-left: 0; border-top: 1px solid var(--lilac-strong); align-self: stretch; }
    .cell { position: relative; width: 48px; height: 48px; border-radius: 9px; background: var(--surface-2);
            border: 1px solid var(--border-soft); display: grid; place-items: center; }
    .small .cell { width: 32px; height: 32px; border-radius: 7px; }
    img { width: 100%; height: 100%; }
    .free { color: var(--lilac); font-weight: 700; font-size: 1.1rem; }
    .more { position: absolute; right: -4px; bottom: -4px; background: var(--lilac); color: var(--on-lilac);
            font-size: .65rem; font-weight: 700; border-radius: 999px; padding: 0 5px; line-height: 1.5; }

    .doll { display: grid; grid-template-columns: repeat(3, 56px); gap: 6px; padding: 10px; border-radius: 14px;
            background: radial-gradient(circle at 50% 30%, rgba(167, 123, 243, .12), transparent 70%), var(--bg-2);
            border: 1px solid var(--border-soft); width: max-content; }
    .doll .cell { width: 56px; height: 56px; background: linear-gradient(180deg, var(--surface-3), var(--surface-2)); }
    .doll.small { grid-template-columns: repeat(3, 40px); gap: 4px; padding: 7px; }
    .doll.small .cell { width: 40px; height: 40px; }
    .doll .blank { background: transparent; border-color: transparent; }
    /* Pas « .empty » : la classe globale (état vide des pages) ajoute 44px de padding et étire la grille */
    .doll .unset { background: var(--surface); border-style: dashed; border-color: var(--border); }
  `,
})
export class Gear {
  private readonly catalog = inject(ItemsService);
  readonly items = input<BuildItems | undefined>();
  readonly size = input<'normal' | 'small'>('normal');
  readonly layout = input<'row' | 'doll'>('row');
  readonly showSwaps = input(true);

  readonly gear = computed(() => describeGear(this.items(), (id) => this.catalog.get(id)));
  readonly doll = computed(() =>
    PAPER_DOLL.map((slot) =>
      slot === null
        ? null
        : { label: SLOT_LABELS[slot], gear: describeSlot(this.items(), slot, (id) => this.catalog.get(id)) },
    ),
  );

  protected title(g: GearSlot): string {
    return gearTitle(g);
  }

  protected icon(item: Item): string {
    return itemIconUrl(item.icon);
  }

  protected fallback(event: Event): void {
    useFallbackIcon(event);
  }
}
