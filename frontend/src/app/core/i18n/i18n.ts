import { Injectable, computed, signal } from '@angular/core';

import { en } from './en';
import { fr } from './fr';

/** Langues du site. Le français est la langue source (fr.ts) ; en.ts a le même type (clé manquante = erreur de build). */
export type Lang = 'fr' | 'en';
export const LANGS: readonly Lang[] = ['fr', 'en'];

/** Texte d'un contenu de données (guide…) dans chaque langue. */
export type L10n = Record<Lang, string>;

export const LANG_KEY = 'lilium.lang';
const DICTS = { fr, en } as const;

/** Choix mémorisé > langue du navigateur (fr* → fr) > anglais. */
export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
  } catch {
    /* stockage bloqué : on suit le navigateur */
  }
  return globalThis.navigator?.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

const current = signal<Lang>(detectLang());

/** Langue courante (signal : réactif dans un template ou un computed). */
export const lang = current.asReadonly();

/** Locale des nombres et dates (« 1 500 000 » / « 1,500,000 »). */
export function locale(): string {
  return current() === 'fr' ? 'fr-FR' : 'en-US';
}

/** Dictionnaire de la langue courante, pour les helpers hors composants. */
export function dict(): typeof fr {
  return DICTS[current()];
}

export function setLang(value: Lang): void {
  current.set(value);
  try {
    localStorage.setItem(LANG_KEY, value);
  } catch {
    /* pas de mémorisation : le choix vaut pour la session */
  }
  document.documentElement.lang = value;
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = lang;
  readonly t = computed(() => DICTS[current()]);
  readonly locale = computed(() => locale());

  constructor() {
    document.documentElement.lang = current();
  }

  set(value: Lang): void {
    setLang(value);
  }
}
