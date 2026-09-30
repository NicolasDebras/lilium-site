import { Component, computed, inject, input } from '@angular/core';

import { ItemsService, itemIconUrl, useFallbackIcon } from '../core/items.service';
import { BuildItems, FREE_CHOICE, Item, SLOTS, SLOT_LABELS, Slot } from '../core/models';

export interface GearSlot {
  slot: Slot;
  label: string;
  items: Item[];
  free: boolean;
}

/** Cases renseignées d'un build, dans l'ordre des emplacements (ids inconnus ignorés). */
export function describeGear(items: BuildItems | undefined, get: (id: string) => Item | undefined): GearSlot[] {
  return SLOTS.flatMap((slot) => {
    const choices = items?.[slot] ?? [];
    const free = choices[0] === FREE_CHOICE;
    const found = free ? [] : choices.map(get).filter((i): i is Item => !!i);
    return free || found.length ? [{ slot, label: SLOT_LABELS[slot], items: found, free }] : [];
  });
}

export function gearTitle(g: GearSlot): string {
  return `${g.label} : ${g.free ? 'au choix du joueur' : g.items.map((i) => i.name).join(' ou ')}`;
}

/** Rangée d'icônes d'un build : 1re option de chaque case, « +N » s'il y a
 *  des alternatives, « au choix » pour une case libre. Détail au survol. */
@Component({
  selector: 'app-gear',
  template: `
    @if (gear().length) {
      <div class="gear" [class.small]="size() === 'small'">
        @for (g of gear(); track g.slot) {
          <span class="cell" [title]="title(g)">
            @if (g.free) {
              <span class="free">?</span>
            } @else {
              <img [src]="icon(g.items[0])" [alt]="g.items[0].name" loading="lazy" (error)="fallback($event)" />
              @if (g.items.length > 1) {
                <span class="more">+{{ g.items.length - 1 }}</span>
              }
            }
          </span>
        }
      </div>
    }
  `,
  styles: `
    .gear { display: flex; flex-wrap: wrap; gap: 4px; }
    .cell { position: relative; width: 48px; height: 48px; border-radius: 8px; background: var(--surface-2); display: grid; place-items: center; }
    .small .cell { width: 32px; height: 32px; }
    img { width: 100%; height: 100%; }
    .free { color: var(--lilac); font-weight: 700; font-size: 1.1rem; }
    .more { position: absolute; right: -4px; bottom: -4px; background: var(--lilac); color: var(--on-lilac);
            font-size: .65rem; font-weight: 700; border-radius: 999px; padding: 0 5px; line-height: 1.5; }
  `,
})
export class Gear {
  private readonly catalog = inject(ItemsService);
  readonly items = input<BuildItems | undefined>();
  readonly size = input<'normal' | 'small'>('normal');

  readonly gear = computed(() => describeGear(this.items(), (id) => this.catalog.get(id)));

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
