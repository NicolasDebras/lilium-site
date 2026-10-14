import { Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';

/** Délai de la recherche à la frappe : on n'interroge pas l'API à chaque lettre. */
export const SEARCH_DELAY_MS = 250;

/** Valeur de `source` qui ne suit qu'après `ms` sans changement (valeur initiale tout de suite).
 *  À appeler dans un contexte d'injection (champ de composant) : s'arrête avec le composant. */
export function debouncedSignal<T>(source: Signal<T>, ms = SEARCH_DELAY_MS): Signal<T> {
  return toSignal(toObservable(source).pipe(debounceTime(ms)), { initialValue: source() });
}
