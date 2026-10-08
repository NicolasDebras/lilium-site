import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';

import { ItemsService, itemIconUrl, useFallbackIcon } from '../core/items.service';
import { BuildItems, FREE_CHOICE, Item, SLOTS, SLOT_LABELS, Slot } from '../core/models';

export interface GearSlot {
  slot: Slot;
  label: string;
  items: Item[];
  free: boolean;
}

/** Disposition de l'inventaire du jeu (null = case vide), lue ligne par ligne. */
export const PAPER_DOLL: (Slot | null)[] = [null, 'head', 'cape', 'mainhand', 'armor', 'offhand', 'potion', 'shoes', 'food'];

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

export function gearTitle(g: GearSlot): string {
  return `${g.label} : ${g.free ? 'au choix du joueur' : g.items.map((i) => i.name).join(' ou ')}`;
}

/** Équipement d'un build. `layout="row"` : rangée d'icônes (1re option, « +N », « ? » au choix) ;
 *  `layout="doll"` : mini-inventaire 3×3 façon jeu, cases vides comprises. Détail au survol. */
@Component({
  selector: 'app-gear',
  template: `
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
            <span class="cell empty" [title]="cell?.label + ' : non précisé'"></span>
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

    <ng-template #content let-g>
      @if (g.free) {
        <span class="free">?</span>
      } @else {
        <img [src]="icon(g.items[0])" [alt]="g.items[0].name" loading="lazy" (error)="fallback($event)" />
        @if (g.items.length > 1) {
          <span class="more">+{{ g.items.length - 1 }}</span>
        }
      }
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
  styles: `
    .gear { display: flex; flex-wrap: wrap; gap: 4px; }
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
    .doll .empty { background: var(--surface); border-style: dashed; border-color: var(--border); }
  `,
})
export class Gear {
  private readonly catalog = inject(ItemsService);
  readonly items = input<BuildItems | undefined>();
  readonly size = input<'normal' | 'small'>('normal');
  readonly layout = input<'row' | 'doll'>('row');

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
