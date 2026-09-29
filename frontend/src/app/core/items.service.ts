import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Item, Slot } from './models';

/** Image officielle d'un objet (CDN Albion Online). */
export function itemIconUrl(icon: string, size = 64): string {
  return `https://render.albiononline.com/v1/item/${icon}.png?size=${size}`;
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

/** Minuscules sans accents, pour une recherche « epee » → « Épée ». */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Objets d'un emplacement qui correspondent à la recherche (nom FR, nom EN ou famille). */
export function filterItems(items: readonly Item[], slot: Slot, query = '', category = ''): Item[] {
  const q = normalize(query);
  return items.filter(
    (i) =>
      i.slot === slot &&
      (!category || i.category === category) &&
      (!q || normalize(`${i.name} ${i.name_en} ${i.category}`).includes(q)),
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

  get(id: string | undefined | null): Item | undefined {
    return id ? this.byId().get(id) : undefined;
  }
}
