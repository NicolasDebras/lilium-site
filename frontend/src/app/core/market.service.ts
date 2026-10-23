import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  DEFAULT_TAX, MarketData, MarketItem, PriceMap, PriceRow, Recipe, SellMode, Server, baseId, expandItems, mergePrices,
} from '../pages/market/market-logic';
import { lang } from './i18n/i18n';

/** Valeur mémorisée dans le navigateur (préférence de l'utilisateur, jamais indispensable) :
 *  relue au démarrage, réécrite à chaque changement. Stockage bloqué → valeur par défaut. */
export function storedSignal<T extends object>(key: string, initial: T): WritableSignal<T> {
  let value = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = { ...initial, ...JSON.parse(raw) };
  } catch {
    /* valeur par défaut */
  }
  const state = signal(value);
  effect(() => {
    const current = state();
    try {
      localStorage.setItem(key, JSON.stringify(current));
    } catch {
      /* pas de mémorisation */
    }
  });
  return state;
}

export interface MarketSettings {
  server: Server;
  mode: SellMode;
  tax: number;
  /** 1 = normale … 5 = chef-d'œuvre */
  quality: number;
  /** Marché noir comme lieu de vente. */
  bm: boolean;
}

export type MarketStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; done: number; total: number }
  | { kind: 'done'; at: Date; count: number }
  | { kind: 'error'; network: boolean; code: number };

/** Lot d'ids par requête (longueur d'URL raisonnable). */
const CHUNK = 40;
/** « Charger les prix de tous les résultats » : plafond par clic (limite de l'API : 180 requêtes/min). */
export const BULK_MAX = 300;

/** Onglet Marché : catalogue (noms FR/EN + recettes, servi par l'API) et prix de l'Albion Online
 *  Data Project, demandés directement par le navigateur (la limite de l'API est par IP). */
@Injectable({ providedIn: 'root' })
export class MarketService {
  private readonly http = inject(HttpClient);
  private readonly data = signal<{ items: MarketItem[]; recipes: Recipe[]; names: Map<string, [string, string]> } | null>(null);
  private pending: Promise<void> | null = null;
  private tried = new Set<string>();

  readonly items = computed(() => this.data()?.items ?? []);
  readonly recipes = computed(() => this.data()?.recipes ?? []);
  readonly loaded = computed(() => this.data() !== null);
  readonly loadError = signal<unknown>(null);

  readonly settings = storedSignal<MarketSettings>('lilium.market.settings', {
    server: 'europe', mode: 'direct', tax: DEFAULT_TAX.direct, quality: 1, bm: true,
  });
  readonly prices = signal<PriceMap>({});
  readonly status = signal<MarketStatus>({ kind: 'idle' });
  readonly busy = computed(() => this.status().kind === 'busy');

  load(): Promise<void> {
    if (this.data()) return Promise.resolve();
    this.loadError.set(null);
    this.pending ??= firstValueFrom(this.http.get<MarketData>('/api/market'))
      .then(({ items, recipes }) => {
        this.data.set({
          items: expandItems(items),
          recipes,
          names: new Map(items.map(([id, fr, en]) => [id, [fr, en]])),
        });
      })
      .catch((err) => this.loadError.set(err))
      .finally(() => (this.pending = null));
    return this.pending;
  }

  /** Nom d'un id du jeu dans la langue du site (« T6_POTION_HEAL@1 » → nom de T6_POTION_HEAL). */
  nameOf(id: string): string {
    const names = this.data()?.names;
    const found = names?.get(id) ?? names?.get(id.replace(/@\d$/, '')) ?? names?.get(baseId(id));
    if (!found) return id;
    return lang() === 'en' ? found[1] || found[0] : found[0];
  }

  update(patch: Partial<MarketSettings>): void {
    const before = this.settings();
    const next = { ...before, ...patch };
    if (patch.mode && patch.tax === undefined) next.tax = DEFAULT_TAX[patch.mode];
    this.settings.set(next);
    // Prix propres à un serveur et à une qualité : on repart de zéro.
    if (next.server !== before.server || next.quality !== before.quality) this.resetPrices();
  }

  resetPrices(): void {
    this.prices.set({});
    this.tried = new Set();
  }

  /** Ids jamais demandés (le chargement automatique ne redemande pas un objet sans relevé). */
  untried(ids: readonly string[]): string[] {
    return [...new Set(ids)].filter((id) => !this.tried.has(id) && !(id in this.prices()));
  }

  /** Charge les prix par lots ; chaque lot s'affiche dès qu'il arrive. Ignoré si un chargement est en cours. */
  async fetchPrices(ids: readonly string[]): Promise<void> {
    const list = [...new Set(ids)];
    if (!list.length || this.busy()) return;
    const { server, quality } = this.settings();
    this.status.set({ kind: 'busy', done: 0, total: list.length });
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        const chunk = list.slice(i, i + CHUNK);
        const rows = await firstValueFrom(
          this.http.get<PriceRow[]>(`https://${server}.albion-online-data.com/api/v2/stats/prices/${chunk.join(',')}.json`),
        );
        // Réglage changé pendant le chargement : ces prix ne valent plus.
        if (this.settings().server !== server || this.settings().quality !== quality) return;
        chunk.forEach((id) => this.tried.add(id));
        this.prices.update((p) => mergePrices(p, chunk, rows, quality));
        this.status.set({ kind: 'busy', done: Math.min(i + CHUNK, list.length), total: list.length });
      }
      this.status.set({ kind: 'done', at: new Date(), count: list.length });
    } catch (err) {
      const code = err instanceof HttpErrorResponse ? err.status : 0;
      this.status.set({ kind: 'error', network: code === 0, code });
    } finally {
      if (this.busy()) this.status.set({ kind: 'idle' });
    }
  }
}
