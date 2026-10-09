import { Component, computed, input } from '@angular/core';

import { Item } from '../core/models';
import { tierLabel, tierText } from '../core/tiers';

/** Pastille « 8.1 » au coin bas-gauche d'une case (le parent doit être en position: relative).
 *  Bord coloré selon l'enchantement, comme en jeu. Rien si le tier est libre. */
@Component({
  selector: 'app-tier-badge',
  host: { '[class.hidden]': 'item().tier == null', '[attr.title]': 'text() || null', '[attr.data-enchant]': 'item().enchant ?? 0' },
  template: `{{ label() }}`,
  styles: `
    :host { position: absolute; left: -4px; bottom: -4px; z-index: 1; padding: 0 4px; border-radius: 999px;
            font-size: .62rem; font-weight: 700; line-height: 1.45; font-variant-numeric: tabular-nums;
            background: var(--bg); color: var(--text); border: 1px solid var(--ench-0); pointer-events: none; }
    :host(.hidden) { display: none; }
    :host([data-enchant='1']) { border-color: var(--ench-1); }
    :host([data-enchant='2']) { border-color: var(--ench-2); }
    :host([data-enchant='3']) { border-color: var(--ench-3); }
    :host([data-enchant='4']) { border-color: var(--ench-4); }
  `,
})
export class TierBadge {
  readonly item = input.required<Pick<Item, 'slot' | 'tier' | 'enchant'>>();
  protected readonly label = computed(() => {
    const { tier, enchant } = this.item();
    return tier == null ? '' : tierLabel(tier, enchant ?? 0);
  });
  protected readonly text = computed(() => tierText(this.item()));
}
