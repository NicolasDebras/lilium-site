import { Resource, Signal, computed, linkedSignal } from '@angular/core';

import { errorMessage } from './api.service';

/** Dernière valeur reçue par la ressource (null avant la première) : reste affichée pendant le
 *  chargement suivant ou après une erreur, au lieu de vider la liste à chaque recherche. */
export function lastValue<T>(res: Resource<T | undefined>): Signal<T | null> {
  return linkedSignal<T | undefined, T | null>({
    source: () => (res.hasValue() ? res.value() : undefined),
    computation: (value, previous) => value ?? previous?.value ?? null,
  });
}

/** Message lisible de l'erreur de la ressource ('' sans erreur). */
export function errorText(res: Resource<unknown>): Signal<string> {
  return computed(() => {
    const err = res.error();
    return err ? errorMessage(err) : '';
  });
}
