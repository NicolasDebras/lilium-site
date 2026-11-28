import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

import { I18nService } from './i18n/i18n';

/** Page avec un formulaire : true tant qu'il y a des modifications non enregistrées. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Quitter la page (lien, menu, retour) avec des modifications non enregistrées → confirmation. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (page) =>
  !page.hasUnsavedChanges() || confirm(inject(I18nService).t().common.unsavedLeave);

/** Fermeture / rechargement de l'onglet : le navigateur affiche sa propre alerte. */
export function warnBeforeUnload(event: BeforeUnloadEvent, page: HasUnsavedChanges): void {
  if (page.hasUnsavedChanges()) event.preventDefault();
}
