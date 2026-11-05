import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  HISTORY_DAYS, HistoryMap, HistoryRow, MarketData, MarketItem, PriceMap, PriceRow, Recipe, SellMode, Server, baseId, expandItems,
  mergeHistory, mergePrices, taxRate,
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
  /** Compte Premium : taxe de vente de 4 % au lieu de 8 %. */
  premium: boolean;
  /** 1 = normale … 5 = chef-d'œuvre */
  quality: number;
  /** Marché noir comme lieu de vente. */
  bm: boolean;
}

export type MarketStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; done: number; total: number }
  /** `history` faux = l'historique des ventes n'a pas pu être chargé (les prix, si). */
  | { kind: 'done'; at: Date; count: number; history: boolean }
  | { kind: 'error'; network: boolean; code: number };

/** Lot d'ids par requête (longueur d'URL raisonnable). */
const CHUNK = 40;
/** Lot d'ids pour l'historique (réponse bien plus lourde : un point par jour et par ville). */
const HISTORY_CHUNK = 20;

/** Date de début de l'historique au format de l'API (« 10-22-2026 », mois-jour-année). */
export function historyStart(now: number, days = HISTORY_DAYS): string {
  const d = new Date(now - days * 864e5);
  return `${d.getUTCMonth() + 1}-${d.getUTCDate()}-${d.getUTCFullYear()}`;
}
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
  private triedHistory = new Set<string>();

  readonly items = computed(() => this.data()?.items ?? []);
  readonly recipes = computed(() => this.data()?.recipes ?? []);
  readonly loaded = computed(() => this.data() !== null);
  readonly loadError = signal<unknown>(null);

  readonly settings = storedSignal<MarketSettings>('lilium.market.settings', {
    server: 'europe', mode: 'direct', premium: true, quality: 1, bm: true,
  });
  /** Taxe totale d'une vente (%) selon le mode et le Premium. */
  readonly tax = computed(() => taxRate(this.settings().mode, this.settings().premium));
  readonly prices = signal<PriceMap>({});
  /** Ventes jour par jour (14 derniers jours), par objet et par ville. */
  readonly history = signal<HistoryMap>({});
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
    const { server, mode, premium, quality, bm } = { ...before, ...patch };
    // Réglage d'une ancienne version (taxe saisie à la main) : abandonné.
    const next = { server, mode, premium, quality, bm };
    this.settings.set(next);
    // Prix propres à un serveur et à une qualité : on repart de zéro.
    if (next.server !== before.server || next.quality !== before.quality) this.resetPrices();
  }

  resetPrices(): void {
    this.prices.set({});
    this.tried = new Set();
    this.history.set({});
    this.triedHistory = new Set();
  }

  /** Ids jamais demandés (le chargement automatique ne redemande pas un objet sans relevé). */
  untried(ids: readonly string[]): string[] {
    return [...new Set(ids)].filter((id) => !this.tried.has(id) && !(id in this.prices()));
  }

  /** Charge les prix par lots, puis l'historique des ventes des ids `historyIds` jamais demandés ; chaque lot
   *  s'affiche dès qu'il arrive. Ignoré si un chargement est en cours. Un échec de l'historique ne gâche pas
   *  les prix (statut « done » avec `history: false`). */
  async fetchPrices(ids: readonly string[], historyIds: readonly string[] = []): Promise<void> {
    const list = [...new Set(ids)];
    const hist = [...new Set(historyIds)].filter((id) => !this.triedHistory.has(id));
    if ((!list.length && !hist.length) || this.busy()) return;
    const { server, quality } = this.settings();
    const total = list.length + hist.length;
    const changed = () => this.settings().server !== server || this.settings().quality !== quality;
    let historyOk = true;
    this.status.set({ kind: 'busy', done: 0, total });
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        const chunk = list.slice(i, i + CHUNK);
        const rows = await firstValueFrom(
          this.http.get<PriceRow[]>(`https://${server}.albion-online-data.com/api/v2/stats/prices/${chunk.join(',')}.json`),
        );
        // Réglage changé pendant le chargement : ces prix ne valent plus.
        if (changed()) return;
        chunk.forEach((id) => this.tried.add(id));
        this.prices.update((p) => mergePrices(p, chunk, rows, quality));
        this.status.set({ kind: 'busy', done: Math.min(i + CHUNK, list.length), total });
      }
      const start = historyStart(Date.now());
      for (let i = 0; i < hist.length; i += HISTORY_CHUNK) {
        const chunk = hist.slice(i, i + HISTORY_CHUNK);
        let rows: HistoryRow[];
        try {
          rows = await firstValueFrom(this.http.get<HistoryRow[]>(
            `https://${server}.albion-online-data.com/api/v2/stats/history/${chunk.join(',')}.json`,
            { params: { 'time-scale': 24, qualities: quality, date: start } },
          ));
        } catch {
          historyOk = false;
          break;
        }
        if (changed()) return;
        chunk.forEach((id) => this.triedHistory.add(id));
        this.history.update((h) => mergeHistory(h, chunk, rows, quality));
        this.status.set({ kind: 'busy', done: list.length + Math.min(i + HISTORY_CHUNK, hist.length), total });
      }
      this.status.set({ kind: 'done', at: new Date(), count: list.length || hist.length, history: historyOk });
    } catch (err) {
      const code = err instanceof HttpErrorResponse ? err.status : 0;
      this.status.set({ kind: 'error', network: code === 0, code });
    } finally {
      if (this.busy()) this.status.set({ kind: 'idle' });
    }
  }
}
