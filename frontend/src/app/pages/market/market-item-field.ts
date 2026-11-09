import { Component, computed, inject, input, output, signal } from '@angular/core';

import { itemIconUrl, useFallbackIcon } from '../../core/items.service';
import { MarketService } from '../../core/market.service';
import { itemLabel, tierText } from './market-format';
import { MarketItem, matchTokens } from './market-logic';

/** Suggestions affichées au plus. */
const MAX_SUGGESTIONS = 8;
let nextId = 0;

export interface PickedItem {
  /** Id du catalogue, vide = texte libre. */
  id: string;
  name: string;
}

/** Champ « objet » de Mon craft et de l'upgradeur : texte libre, ou objet du catalogue choisi dans les suggestions
 *  (le prix du marché suit alors). Retaper le nom revient au texte libre. `only` restreint les suggestions. */
@Component({
  selector: 'app-market-item-field',
  template: `
    <div class="wrap">
      @if (id()) { <img class="ico" [src]="icon(id())" alt="" width="28" height="28" (error)="fallback($event)" /> }
      <input class="input" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" [class.picked]="id()"
             [attr.aria-label]="label()" [attr.aria-expanded]="open()" [attr.aria-controls]="listId"
             [attr.aria-activedescendant]="open() && active() >= 0 ? listId + '-' + active() : null"
             [placeholder]="placeholder()" [value]="name()" [title]="id()"
             (input)="type($any($event.target).value)" (keydown)="key($event)" (focus)="focused.set(true)" (blur)="focused.set(false)" />
    </div>
    @if (open()) {
      <ul class="list card" role="listbox" [id]="listId" [attr.aria-label]="label()">
        @for (s of suggestions(); track s.id; let i = $index) {
          <li role="option" [id]="listId + '-' + i" [attr.aria-selected]="i === active()" [class.on]="i === active()"
              (mousedown)="$event.preventDefault()" (click)="choose(s)">
            <img [src]="icon(s.id)" alt="" width="32" height="32" loading="lazy" (error)="fallback($event)" />
            <span class="txt"><span class="name">{{ s.name }}</span><small class="faint">{{ s.tier }} · {{ s.id }}</small></span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; position: relative; min-width: 0; }
    .wrap { position: relative; display: flex; align-items: center; }
    .ico { position: absolute; left: 7px; width: 28px; height: 28px; border-radius: 6px; pointer-events: none; }
    .input.picked { padding-left: 42px; }
    .list { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px; list-style: none;
            max-height: 320px; overflow-y: auto; box-shadow: var(--shadow-lg); min-width: min(320px, 90vw); }
    li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: var(--radius-sm); cursor: pointer; }
    li:hover, li.on { background: var(--lilac-soft); }
    li img { flex: none; width: 32px; height: 32px; }
    .txt { display: grid; min-width: 0; }
    .name { font-weight: 600; font-size: .9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    small { font-size: .72rem; }
  `,
})
export class MarketItemField {
  private readonly market = inject(MarketService);
  readonly id = input('');
  readonly name = input('');
  readonly label = input('');
  readonly placeholder = input('');
  readonly only = input<((item: MarketItem) => boolean) | null>(null);
  readonly pick = output<PickedItem>();

  protected readonly listId = `item-field-${nextId++}`;
  protected readonly focused = signal(false);
  /** Texte tapé depuis le dernier choix (vide = liste fermée). */
  private readonly query = signal('');
  protected readonly active = signal(-1);

  protected readonly suggestions = computed(() => {
    const q = this.query().trim();
    if (q.length < 2) return [];
    const only = this.only();
    const out: { id: string; name: string; tier: string }[] = [];
    for (const item of this.market.items()) {
      if ((only && !only(item)) || !matchTokens(item.search, q)) continue;
      out.push({ id: item.id, name: itemLabel(item), tier: tierText(item.tier, item.ench) });
      if (out.length >= MAX_SUGGESTIONS) break;
    }
    return out;
  });
  protected readonly open = computed(() => this.focused() && this.suggestions().length > 0);

  type(text: string): void {
    this.query.set(text);
    this.active.set(-1);
    this.pick.emit({ id: '', name: text });
  }

  choose(s: { id: string; name: string }): void {
    this.query.set('');
    this.pick.emit({ id: s.id, name: s.name });
  }

  key(event: KeyboardEvent): void {
    const n = this.suggestions().length;
    if (!this.open()) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const down = event.key === 'ArrowDown';
      const i = this.active();
      this.active.set(i < 0 ? (down ? 0 : n - 1) : (i + (down ? 1 : -1) + n) % n);
    } else if (event.key === 'Enter' && this.active() >= 0) {
      event.preventDefault();
      this.choose(this.suggestions()[this.active()]);
    } else if (event.key === 'Escape') {
      this.query.set('');
    }
  }

  icon(id: string): string {
    return itemIconUrl(id, 64);
  }

  fallback(event: Event): void {
    useFallbackIcon(event);
  }
}
