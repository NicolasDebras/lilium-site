import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { dict, lang } from './i18n/i18n';
import { Item, Slot, SpellCatalog, SpellName } from './models';
import { parseChoice } from './tiers';

/** Image officielle d'un objet (CDN Albion Online). */
export function itemIconUrl(icon: string, size = 64): string {
  return `https://render.albiononline.com/v1/item/${icon}.png?size=${size}`;
}

/** Icône officielle d'un sort (CDN Albion Online). */
export function spellIconUrl(spell: string, size = 64): string {
  return `https://render.albiononline.com/v1/spell/${spell}.png?size=${size}`;
}

/** Nom d'un sort dans la langue du site ; l'id si le sort est inconnu du catalogue. */
export function spellName(spell: string, names: Record<string, SpellName> | undefined): string {
  const n = names?.[spell];
  if (!n) return spell;
  return lang() === 'en' ? n.name_en || n.name : n.name;
}

/** Icône de secours (« ? » lilas) quand le CDN n'a pas l'image d'un objet
 *  (ex. objet trop récent). Utilisation : (error)="useFallbackIcon($event)". */
export const FALLBACK_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#1f1b29"/>' +
      '<text x="32" y="43" font-size="30" text-anchor="middle" fill="#c8a2ff" font-family="sans-serif">?</text></svg>',
  );

export function useFallbackIcon(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img.src !== FALLBACK_ICON) img.src = FALLBACK_ICON;
}

/** Nom d'un objet dans la langue du site (le catalogue a les noms FR et EN). */
export function itemName(item: Pick<Item, 'name' | 'name_en'>): string {
  return lang() === 'en' ? item.name_en || item.name : item.name;
}

/** Libellé d'une famille d'objets (la valeur du catalogue est le libellé FR). */
export function categoryLabel(category: string): string {
  return dict().categories[category] ?? category;
}

/** Minuscules sans accents ni ligatures, pour une recherche « epee » → « Épée », « oeuf » → « Œuf ». */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').trim();
}

/** Texte de recherche normalisé de chaque objet, calculé une fois (le catalogue ne change pas). */
const searchText = new WeakMap<Item, string>();

function haystack(item: Item): string {
  let text = searchText.get(item);
  if (text === undefined) {
    text = normalize(`${item.name} ${item.name_en} ${item.category}`);
    searchText.set(item, text);
  }
  return text;
}

/** Objets d'un emplacement qui correspondent à la recherche (nom FR, nom EN ou famille).
 *  `slot` null = tous les emplacements (swaps). */
export function filterItems(items: readonly Item[], slot: Slot | null, query = '', category = ''): Item[] {
  const q = normalize(query);
  return items.filter(
    (i) =>
      (slot === null || i.slot === slot) &&
      (!category || i.category === category) &&
      (!q || haystack(i).includes(q)),
  );
}

/** Catalogue des objets d'équipement, chargé une seule fois (~60 Ko) puis filtré localement. */
@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<readonly Item[]>([]);
  private pending: Promise<readonly Item[]> | null = null;

  readonly items = this.state.asReadonly();
  readonly byId = computed(() => new Map(this.state().map((i) => [i.id, i])));

  private readonly spellState = signal<SpellCatalog | null>(null);
  private spellsPending: Promise<SpellCatalog> | null = null;
  /** Noms des sorts + sorts de toutes les bottes (null tant que pas chargé). */
  readonly spells = this.spellState.asReadonly();

  loadSpells(): Promise<SpellCatalog> {
    const loaded = this.spellState();
    if (loaded) return Promise.resolve(loaded);
    this.spellsPending ??= firstValueFrom(this.http.get<SpellCatalog>('/api/spells'))
      .then((catalog) => {
        this.spellState.set(catalog);
        return catalog;
      })
      .finally(() => (this.spellsPending = null));
    return this.spellsPending;
  }

  load(): Promise<readonly Item[]> {
    if (this.state().length) return Promise.resolve(this.state());
    this.pending ??= firstValueFrom(this.http.get<Item[]>('/api/items'))
      .then((items) => {
        this.state.set(items);
        return items;
      })
      .finally(() => (this.pending = null));
    return this.pending;
  }

  /** Objet d'un choix de build. « T8_MAIN_SWORD@1 » → l'Épée large avec tier 8, enchantement 1 et
   *  l'icône de ce tier ; l'`id` reste celui du catalogue (emplacement, deux mains, sélection…). */
  get(id: string | undefined | null): Item | undefined {
    if (!id) return undefined;
    const { base, tier, enchant } = parseChoice(id);
    const item = this.byId().get(base);
    return item && tier !== null ? { ...item, icon: id, tier, enchant } : item;
  }
}
